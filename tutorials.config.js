// Declares where tutorial content comes from, how it's grouped, and which
// language sits at the site root (others get a `/<lang>/` prefix).
//
// SOURCES: keyed by source name. `root` is where the source's tutorial tree
// lives relative to the repo root; `screensDirs` are layered into
// dist/screens/<source>/ in order (later overlays earlier); `forceManual`
// names files that must come from the manual dir even when generated.
//
// TAGS: keyed by tag slug, with per-language display labels.
//
// TUTORIALS: ordered list. Each entry pulls {slug}.md from
// SOURCES[source].root/{lang}/ and is grouped under `tag`.

export const DEFAULT_LANG = "sv";

export const SOURCES = {
  umsme: {
    root: "sources/umsme/tutorial",
    screensDirs: ["screens-manual", "screens-generated"],
    forceManual: ["doors-en.png", "doors-sv.png"],
    requireSyncedSha: true,
  },
  local: {
    root: "content",
    screensDirs: ["screens"],
  },
  gdrive: {
    root: "sources/gdrive/tutorial",
    screensDirs: ["screens"],
    requireSyncedSha: true,
  },
  github: {
    root: "sources/github/tutorial",
    screensDirs: ["screens"],
    requireSyncedSha: true,
  },
};

export const TAGS = {
  app:     { en: "Member app",   sv: "Medlemsapp" },
  wood:    { en: "Wood workshop", sv: "Träverkstad" },
  print3d: { en: "3D printing",  sv: "3D-skrivare" },
};

// gdrive entries carry a `docs` map of Google Doc IDs per language. Either
// `en`, `sv`, or both may be present — gdrive tutorials are allowed to ship
// in a single language.
//
// github entries point at a directory inside a public repo:
//   repo   git URL, cloned over HTTPS (required)
//   dir    subdirectory within the repo (optional, default "" = repo root)
//   ref    branch/tag/SHA to sync (optional, default the remote's HEAD)
//   files  per-language main markdown file (optional, default
//          { [DEFAULT_LANG]: "README.md" }); e.g. { sv: "README.md",
//          en: "README.en.md" }. sync-github.js copies sibling images and
//          rewrites their links to ../screens/. build.js reads only
//          source/slug/tag; the rest is consumed by the sync script.
export const TUTORIALS = [
  { source: "umsme",  slug: "installApp",      tag: "app" },
  { source: "umsme",  slug: "existingMembers", tag: "app" },
  { source: "umsme",  slug: "newMembers",      tag: "app" },
  { source: "umsme",  slug: "renewMembership", tag: "app" },
  { source: "umsme",  slug: "manageFamily",    tag: "app" },
  { source: "gdrive", slug: "bordsfras",       tag: "wood",
    docs: { sv: "1ZKIZjf7V9i8bYpIoVCvN7bWZWBTNNh3uSqt3Y2GoHdw" } },
  { source: "gdrive", slug: "bandslipen",      tag: "wood",
    docs: { sv: "1iaDMeP2SLS92Z3N5Bexv51c_tZeQYJwaSVquJPmFxvY" } },
  { source: "gdrive", slug: "bordssag",      tag: "wood",
    docs: { sv: "1tl-2MF4t7SjDfPqiCY4RUoeawATpwx_Nu7nJAMGkodA" } },
  { source: "gdrive", slug: "bandssag-liten",      tag: "wood",
    docs: { sv: "1l9_gzDCnJWv599O2cOS3L0Om5aXipxYNI9xdnBqv-ww" } },
  { source: "gdrive", slug: "bandssag-stor",      tag: "wood",
    docs: { sv: "1m8AyFN5he_tnVZrfX3Vr3gfaZcIx9XbUizodK6NT1bg" } },
  { source: "gdrive", slug: "bordssag-liten",      tag: "wood",
    docs: { sv: "1rko_Itm3ctTaY380f2kkIQU-rDqZ4IIdgO2qA2Zl-lM" } },
  { source: "gdrive", slug: "kap-och-gersag",      tag: "wood",
    docs: { sv: "1IKfLPYiFgGwTZGgOBVXARnNbYc88R_-VMWXMeQpqEe8" } },
  { source: "gdrive", slug: "figursag",      tag: "wood",
    docs: { sv: "1tngfynJiae7yydLWVCVApQBAfY807-RSBb34gSADN9U" } },
  { source: "gdrive", slug: "pelarborr",      tag: "wood",
    docs: { sv: "1ravwP4H55TGArYpeTDqDQv6elldbfn6nPcRVQm_yCC0" } },
  { source: "gdrive", slug: "trumslip",      tag: "wood",
    docs: { sv: "1DWbM3UpMNX9zHnlnkc41-tg75ep3nHb5NqU42xRA_xk" } },
  { source: "gdrive", slug: "svarv",      tag: "wood",
    docs: { sv: "1xoyZ1sTCcVq-5w3SE9bZ1awssWszyOEIMX4l-TTP9YY" } },
  { source: "github", slug: "prusa-install", tag: "print3d",
    repo: "https://github.com/uppsala-makerspace/3d_skrivningskurs.git",
    dir: "docs/chapters/0_install_and_setup_prusa_slicer" },
  { source: "github", slug: "prusa-print", tag: "print3d",
    repo: "https://github.com/uppsala-makerspace/3d_skrivningskurs.git",
    dir: "docs/chapters/1_print" },
];
