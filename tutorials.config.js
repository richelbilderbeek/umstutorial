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
  courses: { en: "Courses",   sv: "Kurser" },
  wood:    { en: "Wood workshop", sv: "Träverkstad" },
  "3D": { en: "3D Workshop",  sv: "3D-verkstad" },
  electronics: { en: "Electronics workshop", sv: "Elektronikverkstad" }
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
  { source: "gdrive", slug: "punktsvets",      tag: "electronics",
    docs: { sv: "1GmmMhldnfo36J7JAJD0tFhjkG2T_MtZHYNRyHuAf8bs" } },
  { source: "gdrive", slug: "co2-laser",      tag: "3D",
    docs: { sv: "1Rys1KglTHSOFX4FKyP0mjbPVi05lBwM4otG0yGBpiM8" } },
  //===========================================================================
  // 3D printer workshop
  //===========================================================================
  { source: "github", slug: "prusa-install", tag: "3D",
    repo: "https://github.com/uppsala-makerspace/3d_skrivningskurs.git",
    dir: "docs/chapters/0_install_and_setup_prusa_slicer", files: { en: "generated_en.md", sv: "generated_sv.md" } },
  { source: "github", slug: "prusa-print", tag: "3D",
    repo: "https://github.com/uppsala-makerspace/3d_skrivningskurs.git",
    dir: "docs/chapters/1_print", files: { en: "generated_en.md", sv: "generated_sv.md" } },
  //===========================================================================
  // Electronics workshop
  //===========================================================================
  // Electronics workshop: Arduino
  { source: "github", slug: "arduino-install", tag: "electronics",
    repo: "https://github.com/richelbilderbeek/arduino_foer_ungdomar.git",
    dir: "docs/kapitel/00_installera_arduino_iden", files: { sv: "generated_sv.md"} },
  { source: "github", slug: "arduino-first-use", tag: "electronics",
    repo: "https://github.com/richelbilderbeek/arduino_foer_ungdomar.git",
    dir: "docs/kapitel/01_anvaendning_av_den_inbyggda_lysdioden", files: { sv: "generated_sv.md"} },
  // Electronics workshop: Music installation
  { source: "github", slug: "start-music", tag: "electronics",
    repo: "https://github.com/uppsala-makerspace/loedningskurs.git",
    dir: "docs/chapters/0_setup_music", files: {sv: "generated_sv.md"} },
  // Electronics workshop: Soldering
  { source: "github", slug: "start-soldering", tag: "electronics",
    repo: "https://github.com/uppsala-makerspace/loedningskurs.git",
    dir: "docs/chapters/0_setup", files: { sv: "generated_sv.md"} },
  { source: "github", slug: "your-first-soldering", tag: "electronics",
    repo: "https://github.com/uppsala-makerspace/loedningskurs.git",
    dir: "docs/chapters/1_first_solder", files: { sv: "generated_sv.md"} },
  //===========================================================================
  // Saturday courses
  //===========================================================================
  //----------------------------------------------------------------------------
  // Saturday courses, the courses
  //----------------------------------------------------------------------------
  // Saturday courses, courses
  { source: "github", slug: "loerdagskurser-overview", tag: "courses",
    repo: "https://github.com/uppsala-makerspace/loerdagskurser.git",
    dir: "docs/kurserna", files: {en: "generated_en.md", sv: "generated_sv.md"} },
  // Saturday courses, courses, 3D printing
  { source: "github", slug: "about-3d-printing-course", tag: "courses",
    repo: "https://github.com/uppsala-makerspace/loerdagskurser.git",
    dir: "docs/kurserna", files: {en: "om_3d_skrivningskursen_generated_en.md", sv: "om_3d_skrivningskursen_generated_sv.md"} },
  // Saturday courses, courses, Arduino
  { source: "github", slug: "about-arduino-course", tag: "courses",
    repo: "https://github.com/uppsala-makerspace/loerdagskurser.git",
    dir: "docs/kurserna", files: {en: "om_arduinokursen_generated_en.md", sv: "om_arduinokursen_generated_sv.md"} },
  // Saturday courses, courses, Blender
  { source: "github", slug: "about-blender-course", tag: "courses",
    repo: "https://github.com/uppsala-makerspace/loerdagskurser.git",
    dir: "docs/kurserna", files: {en: "om_blenderkursen_generated_en.md", sv: "om_blenderkursen_generated_sv.md"} },
  // Saturday courses, courses, Matlagning
  { source: "github", slug: "about-cooking-course", tag: "courses",
    repo: "https://github.com/uppsala-makerspace/loerdagskurser.git",
    dir: "docs/kurserna", files: {en: "om_matlagningskursen_generated_en.md", sv: "om_matlagningskursen_generated_sv.md"} },
  // Saturday courses, courses, OpenSCAD
  { source: "github", slug: "about-openscad-course", tag: "courses",
    repo: "https://github.com/uppsala-makerspace/loerdagskurser.git",
    dir: "docs/kurserna", files: {en: "om_openscad_kursen_generated_en.md", sv: "om_openscad_kursen_generated_sv.md"} },
  // Saturday courses, courses, Programming
  { source: "github", slug: "about-programming-course", tag: "courses",
    repo: "https://github.com/uppsala-makerspace/loerdagskurser.git",
    dir: "docs/kurserna", files: {en: "om_programmeringskursen_generated_en.md", sv: "om_programmeringskursen_generated_sv.md"} },
  //----------------------------------------------------------------------------
  // Saturday courses, the volunteers
  //----------------------------------------------------------------------------
  // Saturday courses, volunteers, general
  { source: "github", slug: "loerdagskurser-volunteers", tag: "courses",
    repo: "https://github.com/uppsala-makerspace/loerdagskurser.git",
    dir: "docs/volontaerer", files: {en: "readme_generated_en.md", sv: "readme_generated_sv.md"} },
  // Saturday courses, volunteers, host
  { source: "github", slug: "loerdagskurser-become-host", tag: "courses",
    repo: "https://github.com/uppsala-makerspace/loerdagskurser.git",
    dir: "docs/volontaerer", files: {en: "bli_entreevaerd_generated_en.md", sv: "bli_entreevaerd_generated_sv.md"} },
  // Saturday courses, volunteers, course leader
  { source: "github", slug: "loerdagskurser-become-course-leader", tag: "courses",
    repo: "https://github.com/uppsala-makerspace/loerdagskurser.git",
    dir: "docs/volontaerer", files: {en: "bli_kursledare_generated_en.md", sv: "bli_kursledare_generated_sv.md"} },
  // Saturday courses, volunteers, course teacher
  { source: "github", slug: "loerdagskurser-become-teacher", tag: "courses",
    repo: "https://github.com/uppsala-makerspace/loerdagskurser.git",
    dir: "docs/volontaerer", files: {en: "bli_laerare_generated_en.md", sv: "bli_laerare_generated_sv.md"} },
  // Saturday courses, volunteers, course coordinator
  { source: "github", slug: "loerdagskurser-become-coordinator", tag: "courses",
    repo: "https://github.com/uppsala-makerspace/loerdagskurser.git",
    dir: "docs/volontaerer", files: {en: "bli_samordnare_generated_en.md", sv: "bli_samordnare_generated_sv.md"} },
];
