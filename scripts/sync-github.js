#!/usr/bin/env node
// Sync github-sourced tutorials. Each `{ source: "github" }` entry in TUTORIALS
// points at a directory inside a public repo:
//
//   repo   git URL (cloned over HTTPS)                            (required)
//   dir    subdirectory within the repo (default "" = repo root)  (optional)
//   ref    branch/tag/SHA to sync (default the remote's HEAD)      (optional)
//   files  per-language main markdown file                        (optional)
//          default { [DEFAULT_LANG]: "README.md" }
//
// For each entry+language we read the main markdown file, copy its sibling
// images into `sources/github/tutorial/screens/` (named `<slug>__<file>` to
// avoid clashes in the shared screens namespace), rewrite the image links to
// `../screens/<slug>__<file>`, and write the result to
// `sources/github/tutorial/<lang>/<slug>.md`. That `../screens/` form is what
// build.js's image rule rewrites into dist/screens/github/ (build.js:90-97).
//
// `sources/github/.synced-sha` records the checked-out commit SHA per
// `<repo>@<ref>`, so build.js's requireSyncedSha gate is satisfied and
// deploy.sh can detect changes. Re-running wipes and rebuilds sources/github/
// to stay hermetic. Requires the system `git` binary.
//
// Limitations: only inline markdown images `![alt](path)` and HTML `<img src>`
// are rewritten (not reference-style images). Remote/absolute image URLs are
// left untouched — they are not downloaded.

import {
  copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

import { SOURCES, TUTORIALS, DEFAULT_LANG } from "../tutorials.config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const srcCfg = SOURCES.github;
if (!srcCfg) {
  console.error("github: no SOURCES.github entry in tutorials.config.js");
  process.exit(1);
}
const outRoot = resolve(root, srcCfg.root);
const shaPath = resolve(outRoot, "..", ".synced-sha");
const wipeDir = resolve(outRoot, "..");
const screensDir = resolve(outRoot, "screens");

rmSync(wipeDir, { recursive: true, force: true });
mkdirSync(outRoot, { recursive: true });
mkdirSync(screensDir, { recursive: true });

const entries = TUTORIALS.filter((t) => t.source === "github");
if (entries.length === 0) {
  writeFileSync(shaPath, "{}\n");
  console.log("github: no entries in TUTORIALS — wrote empty .synced-sha");
  process.exit(0);
}

const shaMap = {};
const cloneCache = new Map(); // "<repo>\0<ref>" -> { dir, sha }
const tmpDirs = [];
const failures = [];

try {
  for (const entry of entries) {
    const { slug, repo } = entry;
    if (!repo) {
      console.warn(`github: ${slug} has no repo — skipping`);
      failures.push({ slug, err: new Error("missing repo") });
      continue;
    }
    const ref = entry.ref || "";
    const files = entry.files || { [DEFAULT_LANG]: "README.md" };

    let clone;
    try {
      clone = getClone(repo, ref);
    } catch (err) {
      console.error(`  ✗ ${slug}: clone failed: ${err.message}`);
      failures.push({ slug, err });
      continue;
    }
    shaMap[`${repo}@${ref || "HEAD"}`] = clone.sha;

    for (const [lang, file] of Object.entries(files)) {
      const tag = `${slug}/${lang}`;
      try {
        const mdPath = resolve(clone.dir, entry.dir || "", file);
        if (!mdPath.startsWith(clone.dir)) {
          throw new Error(`main file escapes repo: ${file}`);
        }
        if (!existsSync(mdPath)) {
          throw new Error(`main file not found: ${entry.dir ? entry.dir + "/" : ""}${file}`);
        }
        const raw = readFileSync(mdPath, "utf8");
        const { md: rewritten, copied } = rewriteImages(raw, dirname(mdPath), clone.dir, slug);
        const md = cleanup(rewritten);

        const outDir = resolve(outRoot, lang);
        mkdirSync(outDir, { recursive: true });
        writeFileSync(resolve(outDir, `${slug}.md`), md);
        console.log(`  ✓ ${lang}/${slug}.md  (${copied} image(s))`);
      } catch (err) {
        console.error(`  ✗ ${tag}: ${err.message}`);
        failures.push({ slug: tag, err });
      }
    }
  }
} finally {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
}

writeFileSync(shaPath, JSON.stringify(shaMap, null, 2) + "\n");

if (failures.length > 0) {
  console.error(`github: ${failures.length} failure(s) — see above`);
  process.exit(1);
}
console.log(`✓ github synced ${entries.length} tutorial(s) → ${outRoot}`);

// ---------- clone ----------

// Clone (once per repo+ref) with a blob filter so only the blobs we actually
// check out are fetched. No --depth so an arbitrary `ref` (branch/tag/SHA) can
// be checked out.
function getClone(repo, ref) {
  const key = `${repo}\0${ref}`;
  const cached = cloneCache.get(key);
  if (cached) return cached;

  const dir = mkdtempSync(join(tmpdir(), "github-sync-"));
  tmpDirs.push(dir);
  console.log(`→ cloning ${repo}${ref ? ` @ ${ref}` : ""}`);
  git(["clone", "--filter=blob:none", "--quiet", repo, dir]);
  if (ref) git(["-C", dir, "checkout", "--quiet", ref]);
  const sha = git(["-C", dir, "rev-parse", "HEAD"], "utf8").trim();

  const result = { dir, sha };
  cloneCache.set(key, result);
  return result;
}

function git(args, encoding) {
  try {
    return execFileSync("git", args, {
      encoding,
      stdio: encoding ? ["ignore", "pipe", "pipe"] : ["ignore", "ignore", "pipe"],
    });
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error("`git` not found — install git");
    }
    throw new Error(err.stderr?.toString().trim() || err.message);
  }
}

// ---------- image rewriting ----------

// Rewrite local image references to ../screens/<slug>__<file> and copy the
// files into screensDir. Handles inline markdown images and HTML <img>.
function rewriteImages(md, mdDir, cloneDir, slug) {
  const copies = new Map(); // absSrc -> destFilename

  const rewriteSrc = (rawSrc) => {
    let src = rawSrc.trim();
    if (src.startsWith("<") && src.endsWith(">")) src = src.slice(1, -1).trim();
    if (!isLocalRelative(src)) return null;

    const pathOnly = src.replace(/[?#].*$/, "");
    let abs;
    try {
      abs = resolve(mdDir, decodeURIComponent(pathOnly));
    } catch {
      abs = resolve(mdDir, pathOnly);
    }
    if (!abs.startsWith(cloneDir)) {
      console.warn(`    ! ${slug}: image escapes repo, left as-is: ${src}`);
      return null;
    }
    if (!existsSync(abs)) {
      console.warn(`    ! ${slug}: image not found, left as-is: ${src}`);
      return null;
    }

    let dest = copies.get(abs);
    if (!dest) {
      dest = `${slug}__${sanitizeName(basename(pathOnly))}`;
      copies.set(abs, dest);
      copyFileSync(abs, join(screensDir, dest));
    }
    return `../screens/${dest}`;
  };

  // Inline markdown images: ![alt](src "title") — src may be <bracketed>.
  let out = md.replace(
    /(!\[[^\]]*\]\(\s*)(<[^>]*>|[^\s)]+)((?:\s+"[^"]*"|\s+'[^']*'|\s+\([^)]*\))?\s*\))/g,
    (match, pre, srcToken, post) => {
      const newSrc = rewriteSrc(srcToken);
      return newSrc === null ? match : `${pre}${newSrc}${post}`;
    },
  );

  // HTML <img src="...">.
  out = out.replace(
    /(<img\b[^>]*?\bsrc\s*=\s*)(["'])(.*?)\2/gi,
    (match, pre, quote, srcToken) => {
      const newSrc = rewriteSrc(srcToken);
      return newSrc === null ? match : `${pre}${quote}${newSrc}${quote}`;
    },
  );

  return { md: out, copied: copies.size };
}

// ---------- markdown cleanup ----------

// Strip pandoc/LaTeX pagination directives that these docs use for their PDF
// export (`\pagebreak`, `\newpage`). markdown-it would otherwise render them as
// visible `\pagebreak` paragraphs. Same intent as the gdrive sync's drop-hr
// rule. Collapse the blank lines left behind.
function cleanup(md) {
  return md
    .replace(/^[ \t]*\\(pagebreak|newpage|clearpage)[ \t]*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "\n");
}

function isLocalRelative(src) {
  if (!src) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(src)) return false; // has scheme (http:, data:, …)
  if (src.startsWith("//")) return false; // protocol-relative
  if (src.startsWith("/")) return false; // absolute path
  if (src.startsWith("#")) return false; // anchor
  return true;
}

function sanitizeName(name) {
  return name.replace(/[^A-Za-z0-9._-]+/g, "-");
}
