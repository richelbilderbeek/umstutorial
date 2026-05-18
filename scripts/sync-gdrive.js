#!/usr/bin/env node
// Sync gdrive-sourced tutorials. For each `{ source: "gdrive" }` entry in
// TUTORIALS, for each language in its `docs` map, fetch the Google Doc as a
// zip (`?format=zip`) — that gives us the HTML rendering plus the original
// image files in an `images/` subdir. We then convert the HTML to markdown
// via turndown (with custom rules for Google's quirks) and run the existing
// cleanup heuristics: heading cleanup, table flatten, version-history removal,
// whitespace tidy.
//
// We dropped the `?format=md` export entirely because Google silently omits
// images that sit alone in table cells — see Bordssåg's Förberedelser table
// where the 2nd row's images were lost. The HTML export is the authoritative
// representation; everything we need is in it.
//
// Each `<img>` in the HTML body is numbered K = 1, 2, … in document order
// and copied to `sources/gdrive/tutorial/screens/<slug>-K.<ext>`, then
// referenced as `![alt](../screens/<slug>-K.<ext>)`. Requires the system
// `unzip` binary.
//
// `sources/gdrive/.synced-sha` records sha256(zip) per slug-lang, so
// build.js's requireSyncedSha gate is satisfied. Re-running the sync wipes
// and rebuilds sources/gdrive/ to stay hermetic.

import {
  copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

import TurndownService from "turndown";

import { SOURCES, TUTORIALS } from "../tutorials.config.js";

const META_TOKEN =
  /\b(ändring(ar)?|change(s|log)?|revision|version(s?historik)?|history|datum|date|namn|notes|metadata)\b/i;

// Author convention in Drive docs: a subheading saying who owns the tutorial
// (e.g. `## Uppsala Makerspace`). Belongs in a footer/byline, not as a body
// heading. Stripped during sync.
const ORG_SUBTITLE = /^(uppsala\s*makerspace)$/i;

// Internal markers used to split row/cell content inside the table rule.
// Picked to be unlikely to appear in real document content.
const CELL_MARKER = " CELL ";
const ROW_MARKER = " ROW ";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const srcCfg = SOURCES.gdrive;
if (!srcCfg) {
  console.error("gdrive: no SOURCES.gdrive entry in tutorials.config.js");
  process.exit(1);
}
const outRoot = resolve(root, srcCfg.root);
const shaPath = resolve(outRoot, "..", ".synced-sha");
const wipeDir = resolve(outRoot, "..");

rmSync(wipeDir, { recursive: true, force: true });
mkdirSync(outRoot, { recursive: true });
mkdirSync(resolve(outRoot, "screens"), { recursive: true });

const entries = TUTORIALS.filter((t) => t.source === "gdrive");
if (entries.length === 0) {
  writeFileSync(shaPath, "{}\n");
  console.log("gdrive: no entries in TUTORIALS — wrote empty .synced-sha");
  process.exit(0);
}

const exportUrl = (id) =>
  `https://docs.google.com/document/d/${id}/export?format=zip`;

const shaMap = {};
const failures = [];

// State the turndown rules read from per-conversion. Reset before each doc.
let currentSlug = null;
let imageCounter = 0;
let imageCopyOps = [];

const turndown = makeTurndownService();

for (const entry of entries) {
  const { slug, docs } = entry;
  if (!docs || Object.keys(docs).length === 0) {
    console.warn(`gdrive: ${slug} has no docs map — skipping`);
    continue;
  }
  for (const [lang, docId] of Object.entries(docs)) {
    const tag = `${slug}/${lang}`;
    try {
      console.log(`→ ${tag}  (doc ${docId})`);
      const rawZip = await fetchZip(docId);
      shaMap[`${slug}-${lang}`] = sha256(rawZip);

      const { html, tmpDir } = extractZip(rawZip, slug);
      const md = convertHtmlToMarkdown(html, slug);
      // Image rule recorded what to copy; do it now while tmpDir still exists.
      const screensDir = resolve(outRoot, "screens");
      for (const { zipFilename, destFilename } of imageCopyOps) {
        const src = join(tmpDir, "images", zipFilename);
        if (existsSync(src)) {
          copyFileSync(src, join(screensDir, destFilename));
        }
      }
      rmSync(tmpDir, { recursive: true, force: true });

      const cleaned = cleanup(md);
      const outDir = resolve(outRoot, lang);
      mkdirSync(outDir, { recursive: true });
      writeFileSync(resolve(outDir, `${slug}.md`), cleaned);
      console.log(`  ✓ ${lang}/${slug}.md  (${imageCopyOps.length} image(s))`);
    } catch (err) {
      console.error(`  ✗ ${tag}: ${err.message}`);
      failures.push({ tag, err });
    }
  }
}

writeFileSync(shaPath, JSON.stringify(shaMap, null, 2) + "\n");

if (failures.length > 0) {
  console.error(`gdrive: ${failures.length} failure(s) — see above`);
  process.exit(1);
}
console.log(`✓ gdrive synced ${Object.keys(shaMap).length} doc(s) → ${outRoot}`);

// ---------- fetch & zip ----------

async function fetchZip(id) {
  const res = await fetch(exportUrl(id), { redirect: "follow" });
  if (!res.ok) {
    throw new Error(
      `failed to fetch zip (${res.status}) — is link-share enabled (Anyone with the link → Viewer)?`,
    );
  }
  return Buffer.from(await res.arrayBuffer());
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function extractZip(zipBuf, slug) {
  const tmpDir = mkdtempSync(join(tmpdir(), `gdrive-${slug}-`));
  const zipFile = join(tmpDir, "doc.zip");
  writeFileSync(zipFile, zipBuf);
  try {
    execFileSync(
      "unzip",
      ["-q", "-o", zipFile, "-d", tmpDir],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
  } catch (err) {
    rmSync(tmpDir, { recursive: true, force: true });
    if (err.code === "ENOENT") {
      throw new Error("`unzip` not found — install with `apt install unzip`");
    }
    throw new Error(
      `unzip failed (exit ${err.status}): ${err.stderr?.toString() || err.message}`,
    );
  }
  const htmlName = readdirSync(tmpDir).find((f) => f.toLowerCase().endsWith(".html"));
  if (!htmlName) {
    rmSync(tmpDir, { recursive: true, force: true });
    throw new Error("zip has no .html file — unexpected export shape");
  }
  const html = readFileSync(join(tmpDir, htmlName), "utf8");
  return { html, tmpDir };
}

// ---------- HTML → markdown ----------

function makeTurndownService() {
  const td = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "*",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    strongDelimiter: "**",
  });

  // The HTML export includes a <style> block in <head> with hundreds of lines
  // of Google's internal CSS. turndown's default behavior emits the inner text
  // of unrecognized tags, so without this rule the CSS lands at the top of the
  // markdown output. Same for <script> (defensive — Google doesn't emit one).
  td.addRule("drop-style-script", {
    filter: ["style", "script"],
    replacement: () => "",
  });

  // Inline comment anchor refs like <a href="#cmnt1" id="cmnt_ref1">[a]</a>.
  // They surface as `[\[a\]](#cmnt1)` in MD and add no value to the tutorial.
  td.addRule("drop-comment-ref", {
    filter: (node) =>
      node.nodeName === "A" &&
      (node.getAttribute("href") || "").startsWith("#cmnt"),
    replacement: () => "",
  });

  // Trailing comment-definition blocks: a <div> whose first child is
  // <a id="cmntN" href="#cmnt_refN">[a]</a> followed by the comment body.
  // These appear after the document content; dropping them removes the
  // whole stale-feedback footer.
  td.addRule("drop-comment-def", {
    filter: (node) => {
      if (node.nodeName !== "DIV") return false;
      const a = node.querySelector && node.querySelector("a[id]");
      return !!(a && /^cmnt\d+$/.test(a.getAttribute("id") || ""));
    },
    replacement: () => "",
  });

  // Google Docs exports the doc title as <p class="title">, not <h1>.
  td.addRule("title-as-h1", {
    filter: (node) =>
      node.nodeName === "P" && hasClass(node, "title"),
    replacement: (content) => `\n\n# ${content.trim()}\n\n`,
  });

  // <p class="subtitle"> is typically the author's org tag ("Uppsala Makerspace").
  // Drop it — same intent as the existing ORG_SUBTITLE heading-text strip.
  td.addRule("drop-subtitle", {
    filter: (node) =>
      node.nodeName === "P" && hasClass(node, "subtitle"),
    replacement: () => "",
  });

  // Google emits <hr style="page-break-before:always;display:none;"> as a
  // print-pagination artifact. Don't surface these as MD horizontal rules.
  td.addRule("drop-hr", {
    filter: "hr",
    replacement: () => "",
  });

  // Walk images in document order, copy from the unzipped tree into screens/,
  // and emit a ../screens/<slug>-K.<ext> reference. The counter increments as
  // turndown walks the DOM, including images that sit inside table cells.
  td.addRule("image-renumber", {
    filter: "img",
    replacement: (_content, node) => {
      const src = node.getAttribute("src") || "";
      const alt = cleanAltText(node.getAttribute("alt") || "");
      if (!src.startsWith("images/")) return `![${alt}](${src})`;
      imageCounter += 1;
      const zipFilename = src.slice("images/".length);
      const rawExt = zipFilename.split(".").pop().toLowerCase();
      const ext = rawExt === "jpeg" ? "jpg" : rawExt;
      const destFilename = `${currentSlug}-${imageCounter}.${ext}`;
      imageCopyOps.push({ zipFilename, destFilename });
      return `![${alt}](../screens/${destFilename})`;
    },
  });

  // Tables: emit markers on cell/row boundaries so the table rule can split
  // the already-converted content back into a grid. This avoids re-running
  // turndown on cell.innerHTML (which would double-count images).
  td.addRule("table-cell", {
    filter: ["td", "th"],
    replacement: (content) =>
      content.trim().replace(/\s+/g, " ").replace(/\|/g, "\\|") + CELL_MARKER,
  });
  td.addRule("table-row", {
    filter: "tr",
    replacement: (content) => content + ROW_MARKER,
  });
  td.addRule("table-passthrough", {
    filter: ["thead", "tbody", "tfoot"],
    replacement: (content) => content,
  });
  td.addRule("table", {
    filter: "table",
    replacement: (content) => {
      const rows = content
        .split(ROW_MARKER)
        .map((r) => r.split(CELL_MARKER).slice(0, -1))
        .filter((cells) => cells.length > 0);
      if (rows.length === 0) return "";
      const ncols = Math.max(...rows.map((r) => r.length));
      const pad = (r) => {
        const c = r.slice();
        while (c.length < ncols) c.push("");
        return c;
      };
      const lines = [];
      lines.push("| " + pad(rows[0]).join(" | ") + " |");
      lines.push("| " + Array(ncols).fill("---").join(" | ") + " |");
      for (let i = 1; i < rows.length; i++) {
        lines.push("| " + pad(rows[i]).join(" | ") + " |");
      }
      return "\n\n" + lines.join("\n") + "\n\n";
    },
  });

  return td;
}

function hasClass(node, cls) {
  const raw = node.getAttribute && node.getAttribute("class");
  if (!raw) return false;
  return raw.split(/\s+/).includes(cls);
}

function convertHtmlToMarkdown(html, slug) {
  currentSlug = slug;
  imageCounter = 0;
  imageCopyOps = [];
  return turndown.turndown(html);
}

function cleanAltText(alt) {
  let a = alt;
  a = a.replace(/AI-genererat innehåll kan vara felaktigt\.?\s*$/i, "");
  a = a.replace(/AI-generated content may be incorrect\.?\s*$/i, "");
  a = a.replace(/[,\s]+$/, "");
  return a.trim();
}

// ---------- markdown cleanup pipeline ----------

function cleanup(md) {
  let t = cleanHeadings(md);
  t = dropPreTitleContent(t);

  let segments = parseSegments(t);
  segments = dropTrailingMetaTable(segments);
  t = flattenTables(segments);

  t = dropTrailingMetaSections(t);
  t = tidyWhitespace(t);
  return t;
}

// Drop anything that appears before the first H1. Google's HTML export often
// includes a doc-level header div with version/update metadata (`Uppdaterades:
// 2026-04-17`, `Bandslip … version 1.1 sida …`). If the doc has no H1, keep
// everything — the author hasn't applied the Heading 1 style yet and we still
// want the body to surface so they notice.
function dropPreTitleContent(text) {
  const lines = text.split("\n");
  const h1Idx = lines.findIndex((l) => /^#\s+/.test(l));
  if (h1Idx <= 0) return text;
  return lines.slice(h1Idx).join("\n");
}

// ---------- headings ----------

// Cleanup passes (per-line):
// - drop empty headings (`## ` with nothing after)
// - unwrap whole-string bold/italic in heading text
// - image-only heading → plain image paragraph
// - drop the Uppsala Makerspace org subtitle if it slipped through as a heading
// - drop initial Google-Docs-Tabs label H1 (`# Flik 1` / `# Tab 1`)
// - keep the first remaining H1 as the title; demote later H1s to H2 so they
//   don't break build.js's "first H1 is the title" assumption.
function cleanHeadings(text) {
  const lines = text.split("\n");
  const out = [];
  let firstH1Seen = false;

  for (const line of lines) {
    if (/^#{1,6}\s*$/.test(line)) continue;

    const m = /^(#{1,6})\s+(.*?)\s*$/.exec(line);
    if (!m) {
      out.push(line);
      continue;
    }
    let [, hashes, content] = m;
    content = content.trim();

    content = content.replace(/^\*\*(.+)\*\*$/, "$1").trim();
    content = content.replace(/^__(.+)__$/, "$1").trim();
    content = content.replace(/^\*(.+)\*$/, "$1").trim();
    content = content.replace(/^_(.+)_$/, "$1").trim();

    if (content === "") continue;
    if (ORG_SUBTITLE.test(content)) continue;

    if (/^!\[[^\]]*\]\([^)]+\)\s*$/.test(content)) {
      out.push(content);
      continue;
    }

    if (hashes === "#" && !firstH1Seen && /^(Flik|Tab)\s+\d+$/i.test(content)) {
      continue;
    }

    if (hashes === "#") {
      if (firstH1Seen) hashes = "##";
      else firstH1Seen = true;
    }

    out.push(`${hashes} ${content}`);
  }

  return out.join("\n");
}

// ---------- tables ----------

function dropTrailingMetaTable(segments) {
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (seg.type === "text" && seg.lines.every((l) => l.trim() === "")) continue;
    if (seg.type === "table") {
      const headerJoined = seg.header.join(" | ");
      if (META_TOKEN.test(headerJoined)) {
        segments.splice(i, 1);
      }
    }
    break;
  }
  return segments;
}

function flattenTables(segments) {
  return segments
    .map((seg) => {
      if (seg.type === "text") return seg.lines.join("\n");
      if (!tableHasImages(seg)) return serializeTable(seg);
      return flattenTable(seg);
    })
    .join("\n");
}

// All-text tables (no embedded images) are genuine data tables, not Google-Docs
// layout grids — preserve them as proper markdown so markdown-it renders them
// as <table>. Layout grids (any cell contains an image) get flattened.
function tableHasImages(seg) {
  const allCells = [...seg.header, ...seg.rows.flat()];
  return allCells.some((c) => /!\[[^\]]*\]\(/.test(c));
}

function serializeTable(seg) {
  const ncols = Math.max(seg.header.length, ...seg.rows.map((r) => r.length));
  const pad = (r) => {
    const c = r.slice();
    while (c.length < ncols) c.push("");
    return c;
  };
  const headerLine = "| " + pad(seg.header).join(" | ") + " |";
  const alignLine = "| " + Array(ncols).fill("---").join(" | ") + " |";
  const rowLines = seg.rows.map((r) => "| " + pad(r).join(" | ") + " |");
  return "\n" + [headerLine, alignLine, ...rowLines].join("\n") + "\n";
}

// Flatten one pipe table. The common Google-Docs-as-layout case is a 2-col
// grid where text rows and image rows alternate by column. For that shape
// we walk column-major so step+screenshot pairs stay adjacent. For anything
// else (mixed rows, wider tables) we fall back to row-major.
function flattenTable(seg) {
  const rows = [seg.header, ...seg.rows];
  const ncols = Math.max(...rows.map((r) => r.length));
  const padded = rows.map((r) => {
    const c = r.slice();
    while (c.length < ncols) c.push("");
    return c;
  });

  const kinds = padded.map(classifyRow);
  const uniform = kinds.every((k) => k === "text" || k === "image" || k === "empty");

  const cells = [];
  if (ncols >= 2 && uniform) {
    for (let c = 0; c < ncols; c++) {
      for (let r = 0; r < padded.length; r++) {
        const cell = padded[r][c].trim();
        if (cell) cells.push(cell);
      }
    }
  } else {
    for (const row of padded) {
      for (const cell of row) {
        const t = cell.trim();
        if (t) cells.push(t);
      }
    }
  }
  return "\n" + cells.join("\n\n") + "\n";
}

function classifyRow(row) {
  const nonEmpty = row.map((c) => c.trim()).filter((c) => c.length > 0);
  if (nonEmpty.length === 0) return "empty";
  const onlyImage = (c) => /^(!\[[^\]]*\]\([^)]+\)\s*)+$/.test(c);
  const anyImage = (c) => /!\[[^\]]*\]\(/.test(c);
  if (nonEmpty.every(onlyImage)) return "image";
  if (nonEmpty.every((c) => !anyImage(c))) return "text";
  return "mixed";
}

// ---------- trailing sections ----------

function dropTrailingMetaSections(text) {
  let lines = text.split("\n");
  for (;;) {
    let lastIdx = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (/^#{1,3}\s+/.test(lines[i])) {
        lastIdx = i;
        break;
      }
    }
    if (lastIdx === -1) break;
    const m = /^(#{1,3})\s+(.*)$/.exec(lines[lastIdx]);
    if (m[1] === "#") break;
    const heading = m[2].trim();
    if (META_TOKEN.test(heading)) {
      lines = lines.slice(0, lastIdx);
      continue;
    }
    break;
  }
  return lines.join("\n");
}

// ---------- segment parser ----------

function parseSegments(text) {
  const lines = text.split("\n");
  const out = [];
  let buf = [];
  let i = 0;
  while (i < lines.length) {
    if (
      lines[i].trimStart().startsWith("|") &&
      i + 1 < lines.length &&
      isAlignmentRow(lines[i + 1])
    ) {
      if (buf.length) {
        out.push({ type: "text", lines: buf });
        buf = [];
      }
      const header = parseRow(lines[i]);
      const rows = [];
      let j = i + 2;
      while (j < lines.length && lines[j].trimStart().startsWith("|")) {
        rows.push(parseRow(lines[j]));
        j++;
      }
      out.push({ type: "table", header, rows });
      i = j;
    } else {
      buf.push(lines[i]);
      i++;
    }
  }
  if (buf.length) out.push({ type: "text", lines: buf });
  return out;
}

function isAlignmentRow(s) {
  return /^\s*\|[\s:|\-]+\|\s*$/.test(s) && s.includes("-");
}

function parseRow(line) {
  let t = line.trim();
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|")) t = t.slice(0, -1);
  return t.split("|").map((c) => c.trim());
}

// ---------- whitespace ----------

function tidyWhitespace(text) {
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "\n");
}
