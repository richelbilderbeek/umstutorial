#!/usr/bin/env node
// Sync gdrive-sourced tutorials. For each `{ source: "gdrive" }` entry in
// TUTORIALS, for each language in its `docs` map, fetch the Google Doc as
// markdown, extract inline base64 images, flatten tables (Google Docs is
// commonly used as a layout grid that doesn't survive mobile), clean up
// heading quirks, strip trailing version-history sections/tables, and write
// `sources/gdrive/<lang>/<slug>.md` + screens. Pure Node, no new deps.
//
// `sources/gdrive/.synced-sha` records sha256(raw_export) per slug-lang, so
// build.js's requireSyncedSha gate is satisfied. Re-running the sync wipes
// and rebuilds sources/gdrive/ to stay hermetic.

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";

import { SOURCES, TUTORIALS } from "../tutorials.config.js";

const META_TOKEN =
  /\b(ändring(ar)?|change(s|log)?|revision|version(s?historik)?|history|datum|date|namn|notes|metadata)\b/i;

// Author convention in Drive docs: a subheading saying who owns the tutorial
// (e.g. `## Uppsala Makerspace`). Belongs in a footer/byline, not as a body
// heading. Stripped during sync.
const ORG_SUBTITLE = /^(uppsala\s*makerspace)$/i;

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const srcCfg = SOURCES.gdrive;
if (!srcCfg) {
  console.error("gdrive: no SOURCES.gdrive entry in tutorials.config.js");
  process.exit(1);
}
const outRoot = resolve(root, srcCfg.root);
// build.js reads `.synced-sha` from one level above `src.root` (the same
// convention sync-umsme.sh follows). Keep our wipe scoped to the root parent
// so we don't trash sibling source directories.
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
  `https://docs.google.com/document/d/${id}/export?format=md`;

const shaMap = {};
const failures = [];

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
      const raw = await fetchExport(docId);
      shaMap[`${slug}-${lang}`] = sha256(raw);
      const cleaned = transform(raw, slug);
      const outDir = resolve(outRoot, lang);
      mkdirSync(outDir, { recursive: true });
      writeFileSync(resolve(outDir, `${slug}.md`), cleaned);
      console.log(`  ✓ ${lang}/${slug}.md`);
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

// ---------- pipeline ----------

async function fetchExport(id) {
  const res = await fetch(exportUrl(id), { redirect: "follow" });
  if (!res.ok) {
    throw new Error(
      `failed to fetch (${res.status}) — is link-share enabled (Anyone with the link → Viewer)?`,
    );
  }
  return await res.text();
}

function sha256(s) {
  return createHash("sha256").update(s).digest("hex");
}

function transform(raw, slug) {
  const { text: t1, imageMap } = extractImages(raw, slug);
  let t = rewriteImageRefs(t1, imageMap);
  t = cleanHeadings(t);

  let segments = parseSegments(t);
  segments = dropTrailingMetaTable(segments);
  t = flattenTables(segments);

  t = dropTrailingMetaSections(t);
  t = tidyWhitespace(t);
  return t;
}

// ---------- images ----------

// Reference defs in the export look like:
//   [image1]: <data:image/png;base64,iVBOR...>
// One per line. We decode each base64 payload to a real file in screens/, build
// a `imageN → ../screens/<slug>-N.<ext>` map, and strip the ref-def lines from
// the body. Image *references* (`![alt][imageN]`) are rewritten in a second
// pass so we don't depend on ordering between the body and the ref-def block.
function extractImages(text, slug) {
  const imageMap = {};
  const refRe =
    /^\[image(\d+)\]:\s*<data:image\/(png|jpe?g|gif|webp);base64,([^>]+)>\s*$/gim;
  const screensDir = resolve(outRoot, "screens");

  const cleaned = text.replace(refRe, (_m, n, mime, b64) => {
    const ext = mime === "jpeg" ? "jpg" : mime;
    const filename = `${slug}-${n}.${ext}`;
    const bytes = Buffer.from(b64, "base64");
    writeFileSync(resolve(screensDir, filename), bytes);
    imageMap[`image${n}`] = `../screens/${filename}`;
    return "";
  });

  return { text: cleaned, imageMap };
}

function rewriteImageRefs(text, imageMap) {
  return text.replace(
    /!\[([^\]]*)\]\s*\[(image\d+)\]/gi,
    (m, alt, key) => {
      const path = imageMap[key.toLowerCase()];
      if (!path) return m;
      return `![${cleanAltText(alt)}](${path})`;
    },
  );
}

function cleanAltText(alt) {
  let a = alt;
  // Strip the Google AI auto-caption suffix.
  a = a.replace(/AI-genererat innehåll kan vara felaktigt\.?\s*$/i, "");
  a = a.replace(/AI-generated content may be incorrect\.?\s*$/i, "");
  a = a.replace(/[,\s]+$/, "");
  return a.trim();
}

// ---------- headings ----------

// Cleanup passes (per-line, no AST):
// - drop empty headings (`## ` with nothing after)
// - unwrap whole-string bold/italic in heading text
// - image-only heading → plain image paragraph
// - drop initial Google-Docs-Tabs label H1 (`# Flik 1` / `# Tab 1`)
// - keep the first remaining H1 as the title; demote later H1s to H2 so they
//   don't break parseMarkdown's "first H1 is the title" assumption.
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
// grid where text rows and image rows alternate by column (text1 | text2 →
// img1 | img2 means img1 belongs to text1 and img2 to text2). For that
// shape we walk column-major so step+screenshot pairs stay adjacent. For
// anything else (mixed rows, wider tables) we fall back to row-major.
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
    if (m[1] === "#") break; // never drop the title
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
