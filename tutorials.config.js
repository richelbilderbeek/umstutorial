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
};

export const TAGS = {
  app: { en: "App", sv: "App" },
};

export const TUTORIALS = [
  { source: "umsme", slug: "installApp",      tag: "app" },
  { source: "umsme", slug: "existingMembers", tag: "app" },
  { source: "umsme", slug: "newMembers",      tag: "app" },
  { source: "umsme", slug: "renewMembership", tag: "app" },
  { source: "umsme", slug: "manageFamily",    tag: "app" },
];
