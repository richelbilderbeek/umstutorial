# Authoring tutorials in Google Docs

This guide is for tutorial authors. Keep working in Google Docs as you normally would — follow the rules below so the export converts cleanly to the published tutorial page.

## Sharing

File → Share → General access → **Anyone with the link** → Viewer.

No sign-in is required; the sync script fetches the public export.

## Title and summary

- The **title** is the first Heading 1 with non-empty text. Use Format → Paragraph styles → Heading 1.
- The **summary** is the first normal paragraph after the title. It's what shows on the listing card on the index page, so keep it to one or two sentences that say what the tutorial is about.
- Don't put a "tab name" Heading 1 above the title — `# Flik 1` / `# Tab 1` is automatically dropped, but anything else (e.g. `# Verkstaden`) will become the title.

## Sections

- Use **Heading 2** for section titles, **Heading 3** for subsections. They populate the right-side table of contents and become anchor links.
- The heading style is already bold visually — don't also bold the heading text. (Whole-string bold wrappers like `**Säkerhet**` are stripped automatically; partial bold inside headings is kept.)
- Don't use multiple Heading 1s. The first H1 is the title; any extra H1s are automatically demoted to H2.

## Images

- **Insert as in-line images** (Image options → Text wrapping → **In line**). Wrap-text and behind-text floats don't survive the export.
- Place each image where you want it to appear in flow — directly after the step it illustrates.
- **Set alt text** via Image options → Alt text. Don't rely on the auto-generated "AI-generated content may be incorrect" caption — it's stripped, but the auto-suggested description before it stays.
- Don't use Google Drawings (`Insert → Drawing`). Drawings don't export. Take a screenshot and insert as an image instead.

## Tables

Tables are **flattened** by the sync — they don't survive on mobile as a layout.

- **Step + screenshot grids** (a common 2-column layout where one row is text-text and the next row is image-image): flattened *by column*, so each step's text stays adjacent to its image. This shape is fine to use.
- **Data tables** (no images, e.g. a speed/RPM reference): preserved as a real table. Markdown tables render fine in the browser.

The simplest authoring style is to skip tables entirely and just write each step as a paragraph followed by its screenshot.

## End-of-document marker

To keep an author-internal "Version history" section out of the published page:

- End the document with a Heading 2 literally `Version history` (or `Ändringar`, `Revision history`, `Changelog`). Everything from that heading onward is stripped.
- A trailing **table** whose header row contains tokens like `Ändringar | Datum` is also stripped automatically — you don't need to wrap it in a heading.

## Avoid

- Comments and footnotes — they don't export.
- Custom fonts, font sizes, text colors — they're discarded.
- Page breaks — meaningless in a web tutorial.
- Section breaks / two-column page layout.

## How it shows up on the site

After your doc is in `tutorials.config.js`, run `npm run sync:gdrive` to pull the latest version, then `npm run build` to regenerate the site. The synced markdown lives at `sources/gdrive/tutorial/<lang>/<slug>.md` if you want to see exactly what was extracted from your doc.
