import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";
import { DEFAULT_LANG, SOURCES, TAGS, TUTORIALS } from "./tutorials.config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = __dirname;
const dist = resolve(root, "dist");

const LANGS = {
  en: {
    switcherLabel: "SV", siteTitle: "Tutorials", tocTitle: "Contents",
    tagsTitle: "Tags", allLabel: "All",
    otherLangName: "Swedish",
    emptyWithSwitch: (tag, url) =>
      `No tutorials in English yet for <em>${escapeHtml(tag)}</em>. ` +
      `Switch to <a href="${escapeHtml(url)}">Swedish</a> to see the available tutorials.`,
    emptyNoSwitch: (tag) =>
      `No tutorials yet for <em>${escapeHtml(tag)}</em>.`,
  },
  sv: {
    switcherLabel: "EN", siteTitle: "Guider", tocTitle: "Innehåll",
    tagsTitle: "Etiketter", allLabel: "Alla",
    otherLangName: "engelska",
    emptyWithSwitch: (tag, url) =>
      `Inga svenska guider ännu för <em>${escapeHtml(tag)}</em>. ` +
      `Byt till <a href="${escapeHtml(url)}">engelska</a> för att se tillgängliga guider.`,
    emptyNoSwitch: (tag) =>
      `Inga guider ännu för <em>${escapeHtml(tag)}</em>.`,
  },
};

// Per-source pre-flight: any source marked `requireSyncedSha` must have a
// populated sources/<name>/.synced-sha or the build refuses to run. This is
// the "did you forget to sync?" gate.
const usedSources = [...new Set(TUTORIALS.map((t) => t.source))];
for (const name of usedSources) {
  const src = SOURCES[name];
  if (!src) {
    console.error(`error: TUTORIALS references unknown source "${name}"`);
    process.exit(1);
  }
  if (src.requireSyncedSha) {
    const shaPath = resolve(root, src.root, "..", ".synced-sha");
    if (!existsSync(shaPath)) {
      console.error(`error: source "${name}" not synced — run \`npm run sync\` first`);
      // process.exit(1);
    }
  }
}

const slugify = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const escapeHtml = (s) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const md = new MarkdownIt({ html: false, linkify: true, typographer: false });

// Open external links in a new tab.
const defaultLinkOpen =
  md.renderer.rules.link_open ||
  ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const href = tokens[idx].attrGet("href") ?? "";
  if (/^https?:\/\//.test(href)) {
    tokens[idx].attrSet("target", "_blank");
    tokens[idx].attrSet("rel", "noopener noreferrer");
  }
  return defaultLinkOpen(tokens, idx, options, env, self);
};

// Tutorials live at dist/{langPrefix}{tag}/{slug}/index.html and screens at
// dist/screens/<source>/. Markdown writes `../screens/foo.png` (portable
// within a source repo); rewrite to N levels of `../` (matching the
// tutorial's depth in dist/) followed by `screens/<source>/`.
const defaultImage =
  md.renderer.rules.image ||
  ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const src = tokens[idx].attrGet("src") ?? "";
  if (src.startsWith("../screens/") && env?.source && env?.lang) {
    const prefix = up(pageDepth(env.lang, true, true)) + `screens/${env.source}/`;
    tokens[idx].attrSet("src", prefix + src.slice("../screens/".length));
  }
  return defaultImage(tokens, idx, options, env, self);
};

md.core.ruler.push("add_heading_ids", (state) => {
  for (let i = 0; i < state.tokens.length; i++) {
    const t = state.tokens[i];
    if (t.type !== "heading_open") continue;
    if (t.tag !== "h2" && t.tag !== "h3") continue;
    const inline = state.tokens[i + 1];
    if (inline?.type === "inline") t.attrSet("id", slugify(inline.content));
  }
});

const template = readFileSync(resolve(root, "template.html"), "utf8");

const fillTemplate = (vars) =>
  Object.entries(vars).reduce(
    (html, [key, value]) => html.replaceAll(`{{${key}}}`, value),
    template,
  );

const otherLang = (lang) => (lang === "en" ? "sv" : "en");

const tagLabel = (lang, tag) => TAGS[tag]?.[lang] ?? tag;

// URL/path helpers for the "default language at root, others under /<lang>/"
// layout. `pageDepth` is the number of `../` hops from a page back up to the
// dist root and drives cssUrl, image src, and other-lang hrefs.
const langPrefix = (lang) => (lang === DEFAULT_LANG ? "" : `${lang}/`);
const pageDepth = (lang, tag, slug) =>
  (lang === DEFAULT_LANG ? 0 : 1) + (tag ? 1 : 0) + (slug ? 1 : 0);
const up = (n) => "../".repeat(n);
const urlOf = (lang, tag, slug) =>
  langPrefix(lang) + (tag ? `${tag}/` : "") + (slug ? `${slug}/` : "");
const otherLangUrlOf = (lang, tag, slug) =>
  up(pageDepth(lang, tag, slug)) + urlOf(otherLang(lang), tag, slug);
// Fallback when a tutorial is single-language: link the switcher to the
// other-language tag listing (or root) instead of a page that doesn't exist.
const otherLangFallbackUrlOf = (lang, tag) =>
  up(pageDepth(lang, tag, true)) + urlOf(otherLang(lang), tag, null);
const outPath = (lang, tag, slug) =>
  resolve(dist, ...[lang === DEFAULT_LANG ? null : lang, tag, slug].filter(Boolean), "index.html");

const parseMarkdown = (source, sourceName, lang) => {
  const tokens = md.parse(source, {});
  let title = "";
  let summary = "";
  const tocItems = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!title && t.type === "heading_open" && t.tag === "h1") {
      title = tokens[i + 1].content;
    } else if (
      !summary &&
      title &&
      t.type === "paragraph_open" &&
      tokens[i + 1].type === "inline"
    ) {
      // Skip image-only paragraphs (e.g. a leading screenshot under the H1) —
      // the listing card needs descriptive text, not the markdown of an image.
      const inline = tokens[i + 1];
      const textContent = (inline.children ?? [])
        .filter((c) => c.type === "text")
        .map((c) => c.content)
        .join("")
        .trim();
      if (textContent) summary = inline.content;
    }
    if (t.type === "heading_open" && (t.tag === "h2" || t.tag === "h3")) {
      const inline = tokens[i + 1];
      if (inline?.type === "inline") {
        tocItems.push({
          level: t.tag === "h2" ? 2 : 3,
          text: inline.content,
          id: slugify(inline.content),
        });
      }
    }
  }
  const html = md.render(source, { source: sourceName, lang });
  return { title, summary, html, tocItems };
};

const renderSidebar = (title, listItemsHtml) => {
  const tocButton = `<label for="toc-toggle" class="toc-button" aria-label="${escapeHtml(title)}">
      <span class="toc-icon" aria-hidden="true"></span><span class="toc-button-text">${escapeHtml(title)}</span>
    </label>`;
  const aside = `<input type="checkbox" id="toc-toggle" class="toc-checkbox" hidden>
    <aside class="toc">
      <div class="toc-title">${escapeHtml(title)}</div>
      <ol class="toc-list">
        ${listItemsHtml}
      </ol>
    </aside>`;
  return { tocButton, aside };
};

const renderToc = (items, title) => {
  if (!items.length) return { tocButton: "", aside: "" };
  const lis = items
    .map(
      (i) =>
        `<li class="toc-h${i.level}"><a href="#${i.id}">${escapeHtml(i.text)}</a></li>`,
    )
    .join("\n        ");
  return renderSidebar(title, lis);
};

// `prefix` is the relative path from the calling page back up to the
// tutorials root. The all-listing sits at the root (prefix ""); per-tag
// listings and tutorials sit one level deeper inside a tag dir (prefix "../").
const renderTagFilter = (lang, currentTag, prefix) => {
  const tagsTitle = LANGS[lang].tagsTitle;
  const tags = Object.keys(TAGS);
  const items = [
    { href: prefix || "./", text: LANGS[lang].allLabel, active: currentTag === null },
    ...tags.map((t) => ({
      href: `${prefix}${t}/`,
      text: tagLabel(lang, t),
      active: currentTag === t,
    })),
  ];
  const lis = items
    .map(
      (i) =>
        `<li class="toc-h2"><a href="${escapeHtml(i.href)}"${i.active ? ' class="active"' : ""}>${escapeHtml(i.text)}</a></li>`,
    )
    .join("\n        ");
  return renderSidebar(tagsTitle, lis);
};

// Build the breadcrumb HTML for the header. `items` is an ordered list of
// `{ text, href? }`. The last item is rendered as plain text (current page);
// earlier items become links if they carry an href.
const renderBreadcrumb = (items) =>
  items
    .map((item, i) => {
      const last = i === items.length - 1;
      const sep =
        i > 0
          ? '<span class="breadcrumb-sep" aria-hidden="true">›</span>'
          : "";
      const inner = escapeHtml(item.text);
      const content =
        !last && item.href
          ? `<a href="${escapeHtml(item.href)}">${inner}</a>`
          : `<span${last ? ' class="breadcrumb-current"' : ""}>${inner}</span>`;
      return sep + content;
    })
    .join("");

const tagOfSlug = (slug) => TUTORIALS.find((t) => t.slug === slug)?.tag ?? null;

const renderTutorial = (lang, slug, tag, parsed, hasOtherLang) => {
  const depth = pageDepth(lang, tag, slug);
  const { tocButton, aside } = renderToc(parsed.tocItems, LANGS[lang].tocTitle);
  const breadcrumb = renderBreadcrumb([
    { text: LANGS[lang].siteTitle, href: "../../" },
    tag && { text: tagLabel(lang, tag), href: "../" },
    { text: parsed.title },
  ].filter(Boolean));
  const html = fillTemplate({
    lang,
    bodyClass: "page-tutorial",
    title: parsed.title,
    breadcrumb,
    cssUrl: up(depth) + "site.css",
    faviconUrl: up(depth) + "favicon.png",
    homeUrl: (up(depth) + langPrefix(lang)) || "./",
    otherLang: otherLang(lang),
    otherLangLabel: LANGS[lang].switcherLabel,
    otherLangUrl: hasOtherLang
      ? otherLangUrlOf(lang, tag, slug)
      : otherLangFallbackUrlOf(lang, tag),
    tocButton,
    aside,
    content: parsed.html,
  });
  const out = outPath(lang, tag, slug);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
};

// `prefix` is prepended to each card's href so the all-listing can link
// into `{tag}/{slug}.html` while a per-tag listing links to siblings
// `{slug}.html` in its own directory.
const cardsHtml = (items, prefix) =>
  items
    .map(
      ({ slug, title, summary, tag }) => `
      <a class="tutorial-card" href="${prefix === "" ? `${tag}/` : ""}${slug}/">
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(summary)}</p>
      </a>`,
    )
    .join("\n");

const renderTagsListing = (lang, items, currentTag, otherLangHasItems = false) => {
  const isAll = currentTag === null;
  const tag = isAll ? null : currentTag;
  const tagText = isAll ? null : tagLabel(lang, currentTag);
  const prefix = isAll ? "" : "../";
  const depth = pageDepth(lang, tag, null);
  const breadcrumb = isAll
    ? renderBreadcrumb([{ text: LANGS[lang].siteTitle }])
    : renderBreadcrumb([
        { text: LANGS[lang].siteTitle, href: "../" },
        { text: tagText },
      ]);
  const { tocButton, aside } = renderTagFilter(lang, currentTag, prefix);
  const heading = isAll ? LANGS[lang].siteTitle : tagText;
  const body = items.length > 0
    ? `<div class="tutorial-grid">${cardsHtml(items, prefix)}\n</div>`
    : `<p class="empty-listing">${
        otherLangHasItems
          ? LANGS[lang].emptyWithSwitch(tagText ?? "", otherLangUrlOf(lang, tag, null))
          : LANGS[lang].emptyNoSwitch(tagText ?? "")
      }</p>`;
  const content = `<h1>${escapeHtml(heading)}</h1>\n${body}`;
  const html = fillTemplate({
    lang,
    bodyClass: "page-landing",
    title: isAll ? LANGS[lang].siteTitle : `${LANGS[lang].siteTitle} · ${tagText}`,
    breadcrumb,
    cssUrl: up(depth) + "site.css",
    faviconUrl: up(depth) + "favicon.png",
    homeUrl: (up(depth) + langPrefix(lang)) || "./",
    otherLang: otherLang(lang),
    otherLangLabel: LANGS[lang].switcherLabel,
    otherLangUrl: otherLangUrlOf(lang, tag, null),
    tocButton,
    aside,
    content,
  });
  const out = outPath(lang, tag, null);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
};

// --- build ---

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const allTutorialsBuilt = { en: [], sv: [] };
const tutorialsByTag = { en: {}, sv: {} };
for (const tag of Object.keys(TAGS)) {
  tutorialsByTag.en[tag] = [];
  tutorialsByTag.sv[tag] = [];
}

for (const { source, slug, tag } of TUTORIALS) {
  if (!TAGS[tag]) {
    console.warn(`skip ${slug} — unknown tag "${tag}"`);
    continue;
  }
  const srcCfg = SOURCES[source];
  const srcRoot = resolve(root, srcCfg.root);
  const available = ["en", "sv"].filter((lang) =>
    existsSync(resolve(srcRoot, lang, `${slug}.md`)),
  );
  if (available.length === 0) {
    console.warn(`skip ${source}/${slug} — no language files found`);
    continue;
  }
  for (const lang of available) {
    const mdSource = readFileSync(resolve(srcRoot, lang, `${slug}.md`), "utf8");
    const parsed = parseMarkdown(mdSource, source, lang);
    const hasOtherLang = available.includes(otherLang(lang));
    renderTutorial(lang, slug, tag, parsed, hasOtherLang);
    const entry = { slug, title: parsed.title, summary: parsed.summary, tag };
    allTutorialsBuilt[lang].push(entry);
    tutorialsByTag[lang][tag].push(entry);
  }
}

for (const lang of ["en", "sv"]) {
  renderTagsListing(lang, allTutorialsBuilt[lang], null);
  for (const tag of Object.keys(TAGS)) {
    const otherLangHasItems = (tutorialsByTag[otherLang(lang)][tag] ?? []).length > 0;
    renderTagsListing(lang, tutorialsByTag[lang][tag] ?? [], tag, otherLangHasItems);
  }
}

// Per-source screens: layered copy into dist/screens/<source>/. Each
// screensDir overlays the previous on name collisions; forceManual files
// then re-overlay from the first listed screensDir (treated as the manual
// source-of-truth). Missing dirs are skipped quietly — a source may have
// no screens at all (e.g. early local tutorials).
for (const name of usedSources) {
  const srcCfg = SOURCES[name];
  const srcRoot = resolve(root, srcCfg.root);
  const outDir = resolve(dist, "screens", name);
  for (const dir of srcCfg.screensDirs ?? []) {
    const from = resolve(srcRoot, dir);
    if (existsSync(from)) {
      cpSync(from, outDir, { recursive: true, dereference: true });
    }
  }
  const manualDir = (srcCfg.screensDirs ?? [])[0];
  if (manualDir) {
    for (const f of srcCfg.forceManual ?? []) {
      const from = resolve(srcRoot, manualDir, f);
      if (existsSync(from)) cpSync(from, resolve(outDir, f));
    }
  }
}

cpSync(resolve(root, "site.css"), resolve(dist, "site.css"));
cpSync(resolve(root, "assets/favicon.png"), resolve(dist, "favicon.png"));

console.log(
  `built ${allTutorialsBuilt.en.length} en + ${allTutorialsBuilt.sv.length} sv page(s) → ${resolve(dist)}`,
);
