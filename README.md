# umstutorials

Tutorials webb that aggregates content from multiple sources into a single bilingual (EN/SV) site with tag-based navigation.

## Sources

- **umsme** — markdown and auto-generated screens pulled from the [`umsme`](https://github.com/uppsala-makerspace/umsme) app repo's `tutorial/` directory. Screens are produced by the app's Storybook (`tutorial/screenshot.js` inside umsme) and must stay there.
- **local** — tutorials authored directly in this repo under `content/`.
- **gdrive** — planned: tutorials exported from Google Drive documents.

## First-time setup

```sh
npm install
npm run sync     # populates gitignored sources/umsme/ via shallow + sparse clone
npm run build    # writes dist/
npm run serve    # serves dist/ at http://localhost:8000
```

Or run all three in order:

```sh
npm run dev
```

## Syncing umsme

`npm run sync` (= `scripts/sync-umsme.sh`) does a shallow + sparse checkout of the umsme repo into `sources/umsme/`, limited to the `tutorial/` directory. The synced commit SHA is recorded in `sources/umsme/.synced-sha`.

- Re-running the sync updates to the latest `master`.
- `scripts/sync-umsme.sh --ref <branch|tag|sha>` syncs a specific ref instead of `master`.

`sources/` is gitignored — upstream content never enters this repo's history.

## URLs

Swedish is the default language and lives at the site root: `/`, `/app/`, `/app/installApp/`. English is mirrored one level deeper under `/en/`: `/en/`, `/en/app/`, `/en/app/installApp/`. The language switcher on every page links to the paired URL in the other language, so each tutorial is deep-linkable in either language.

The default language is set by `DEFAULT_LANG` in `tutorials.config.js`.

## Authoring tutorials locally

1. Create `content/en/<slug>.md` and `content/sv/<slug>.md`.
2. Reference screens (if any) as `../screens/<name>.png`, with the actual file at `content/screens/<name>.png`.
3. Add an entry to `TUTORIALS` in `tutorials.config.js`:
   ```js
   { source: "local", slug: "<slug>", tag: "<tag>" }
   ```
4. `npm run build`.

## Layout

```
build.js              # build pipeline
template.html         # page shell
site.css              # styles
tutorials.config.js   # SOURCES, TAGS, TUTORIALS
scripts/sync-umsme.sh # umsme source loader
content/              # locally-authored tutorials
sources/              # gitignored — populated by sync scripts
dist/                 # gitignored — build output
```
