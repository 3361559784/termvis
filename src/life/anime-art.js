import { cellWidth, padCells } from "../core/width.js";

/** @typedef {"mini"|"medium"|"large"} ArtSize */
/** @typedef {"idle"|"blink"|"thinking"|"speaking"|"delighted"|"focused"|"curious"|"guarded"|"tired"|"sleepy"} ArtEmotion */

/**
 * Canonical list of emotions, in priority order for renderers.
 */
export const ANIME_EMOTIONS = Object.freeze([
  "idle",
  "blink",
  "thinking",
  "speaking",
  "delighted",
  "focused",
  "curious",
  "guarded",
  "tired",
  "sleepy"
]);

/**
 * Target cell dimensions per art size. Lines below the target are
 * right-padded with spaces; lines above the target throw at module
 * load (a design bug — fix the art instead of truncating).
 */
export const ART_DIMENSIONS = Object.freeze({
  mini: Object.freeze({ width: 12, height: 3 }),
  medium: Object.freeze({ width: 18, height: 6 }),
  large: Object.freeze({ width: 24, height: 9 })
});

const SIZE_ORDER = Object.freeze(["mini", "medium", "large"]);

/* ------------------------------------------------------------------ */
/* Raw character art for "Mika" — a cute anime-style girl drawn in     */
/* width-1 ASCII + box-drawing + geometric/star/heart glyphs.          */
/*                                                                     */
/* Forbidden glyphs (because they render width-2 in `cellWidth`):      */
/*   ♥ U+2665, ・ U+30FB, 一 U+4E00, ﹏ U+FE4F, ︿ U+FE3F.              */
/* Use width-1 substitutes: ♡ ─ ━ ⌒ ̄ etc.                              */
/*                                                                     */
/* Each line below targets exactly the canonical width for its size.   */
/* Slight asymmetric inner padding is intentional: it's the only way   */
/* to centre an odd-cell mouth/eye expression inside an even-cell      */
/* face frame.                                                         */
/* ------------------------------------------------------------------ */

/* Mika reuses the same hair / face frame / shoulder lines across most       */
/* emotions; only the eye / mouth / decoration lines change. The shared       */
/* lines are listed below for documentation, but every emotion spells them    */
/* out explicitly so the art table reads top-to-bottom.                       */
/*                                                                            */
/* mini top:        "  ╭──────╮  "                                            */
/* mini bottom ♡:   "  ╰──♡♡──╯  "                                            */
/* medium face top: "  ╱╲╭────────╮╱╲  "                                      */
/* medium shoulder: "    ╲┬──────┬╱    "                                      */
/* large hair top:  "     ╱╲╲────────╱╱╲     "                                */
/* large face top:  "    ╱╲╭──────────╮╱╲    "                                */
/* large bangs:     "   ╱╲│  ────────  │╱╲   "                                */
/* large face bot.: "    ╱╲╰──────────╯╱╲    "                                */
/* large shoulders: "     ╲┬──────────┬╱     "                                */

const RAW_ART = {
  /* ============================== MINI (3 x 12) ============================== */
  mini: {
    idle: [
      "  ╭──────╮  ",
      "  │ ◕‿◕  │ ",
      "  ╰──♡♡──╯  "
    ],
    blink: [
      "  ╭──────╮  ",
      "  │ -‿-  │ ",
      "  ╰──♡♡──╯  "
    ],
    thinking: [
      " ?╭──────╮ ",
      "  │ ·_·  │ ",
      "  ╰──……──╯  "
    ],
    speaking: [
      " ♪╭──────╮♪",
      "  │ ◕▽◕  │ ",
      "  ╰─♪♡♪──╯  "
    ],
    delighted: [
      " ✧╭──────╮✧",
      "  │ ★‿★  │ ",
      "  ╰─♡♡♡♡─╯  "
    ],
    focused: [
      "  ╭──────╮  ",
      "  │ ━ ━  │ ",
      "  ╰──♡♡──╯  "
    ],
    curious: [
      "  ╭──?───╮  ",
      "  │ ◕◇◕  │ ",
      "  ╰──♡♡──╯  "
    ],
    guarded: [
      " !╭──────╮!",
      "  │ ◣_◢  │ ",
      "  ╰──!!──╯  "
    ],
    tired: [
      " z╭──────╮ ",
      "  │ ×_×  │ ",
      "  ╰──~~──╯  "
    ],
    sleepy: [
      " z╭──────╮Z",
      "  │ ‿_‿  │ ",
      "  ╰──~~──╯  "
    ]
  },

  /* ============================ MEDIUM (6 x 18) ============================== */
  /*                                                                              */
  /*   col 1234 5 67890123456 7 89                                                */
  /*       OOOO H FFFFFFFFFFFF H OO                                               */
  /*       outer hair  face    hair outer                                         */
  /*                                                                              */
  /*   wide row (with hair locks):  2 + 2 + 1 + 8 + 1 + 2 + 2 = 18                */
  /*   narrow row (no hair):        4 + 1 + 8 + 1 + 4 = 18                        */
  /*                                                                              */
  /* ---------------------------------------------------------------------------- */
  medium: {
    idle: [
      "     ✧  ♡  ✧      ",
      "  ╱╲╭────────╮╱╲  ",
      "    │  ◕‿◕   │    ",
      "    │   ω    │    ",
      "  ╱╲╰────♡♡──╯╱╲  ",
      "    ╲┬──────┬╱    "
    ],
    blink: [
      "     ✧  ♡  ✧      ",
      "  ╱╲╭────────╮╱╲  ",
      "    │  -‿-   │    ",
      "    │   ω    │    ",
      "  ╱╲╰────♡♡──╯╱╲  ",
      "    ╲┬──────┬╱    "
    ],
    thinking: [
      "     ?     …      ",
      "  ╱╲╭────────╮╱╲  ",
      "    │  ·_·   │    ",
      "    │   ……   │    ",
      "  ╱╲╰────  ──╯╱╲  ",
      "    ╲┬──────┬╱    "
    ],
    speaking: [
      "    ♪   ♡   ♪     ",
      "  ╱╲╭────────╮╱╲  ",
      "    │  ◕▽◕   │    ",
      "    │   ▽    │    ",
      "  ╱╲╰──♪♡♪♡♪─╯╱╲  ",
      "    ╲┬──────┬╱    "
    ],
    delighted: [
      "   ✧ ★ ✦ ★ ✧      ",
      "  ╱╲╭────────╮╱╲  ",
      "    │  ★‿★   │    ",
      "    │  ▽▽▽   │    ",
      "  ╱╲╰──♡♡♡♡♡─╯╱╲  ",
      "    ╲┬──♡♡──┬╱    "
    ],
    focused: [
      "    ━━━━━━━━━━    ",
      "  ╱╲╭────────╮╱╲  ",
      "    │  ━ ━   │    ",
      "    │   ─    │    ",
      "  ╱╲╰────♡♡──╯╱╲  ",
      "    ╲┬──────┬╱    "
    ],
    curious: [
      "      ?     ¿     ",
      "  ╱╲╭────────╮╱╲  ",
      "    │  ◕◇◕   │    ",
      "    │   ⌒    │    ",
      "  ╱╲╰────♡  ──╯╱╲ ",
      "    ╲┬──────┬╱    "
    ],
    guarded: [
      "     !!!  !!!     ",
      "  ╱╲╭────────╮╱╲  ",
      "    │  ◣_◢   │    ",
      "    │   ╳    │    ",
      "  ╱╲╰────!!──╯╱╲  ",
      "    ╲┬──────┬╱    "
    ],
    tired: [
      "    z   Z   z     ",
      "  ╱╲╭────────╮╱╲  ",
      "    │  ×_×   │    ",
      "    │  ~~~   │    ",
      "  ╱╲╰────~~──╯╱╲  ",
      "    ╲┬──────┬╱    "
    ],
    sleepy: [
      "    z   z   Z     ",
      "  ╱╲╭────────╮╱╲  ",
      "    │  ‿_‿   │    ",
      "    │  ___   │    ",
      "  ╱╲╰────zZ──╯╱╲  ",
      "    ╲┬──────┬╱    "
    ]
  },

  /* ============================= LARGE (9 x 24) ============================== */
  /*                                                                              */
  /*   col 1234 5 67890123 45678 9 01234                                          */
  /*       OOOO H FFFFFFFFFFFFFF H OOOO                                           */
  /*                                                                              */
  /*   wide row (with hair locks): 3 + 2 + 1 + 14 + 1 + 2 + 3 = 26 — too wide.    */
  /*   We use 12-cell inner instead:                                              */
  /*       wide row: 4 + 2 + 1 + 10 + 1 + 2 + 4 = 24                              */
  /*       narrow row (face only): 5 + 1 + 12 + 1 + 5 = 24                        */
  /*                                                                              */
  /*   Eye/mouth lines are "narrow" (12-cell inner, no hair on sides).           */
  /*   Frame lines (face top/bottom, bangs) are "wide" (10-cell inner +          */
  /*   hair locks ╱╲ on each side).                                              */
  /* ---------------------------------------------------------------------------- */
  large: {
    idle: [
      "        ✧   ♡   ✧       ",
      "     ╱╲╲────────╱╱╲     ",
      "    ╱╲╭──────────╮╱╲    ",
      "   ╱╲│  ────────  │╱╲   ",
      "     │   ◕  ‿  ◕  │     ",
      "     │      ω     │     ",
      "    ╱╲╰──────────╯╱╲    ",
      "      ╱╭──╲╱──╮╲       ",
      "      ╰╯  ╰╯  ╰╯       "
    ],
    blink: [
      "        ✧   ♡   ✧       ",
      "     ╱╲╲────────╱╱╲     ",
      "    ╱╲╭──────────╮╱╲    ",
      "   ╱╲│  ────────  │╱╲   ",
      "     │   -  ‿  -  │     ",
      "     │      ω     │     ",
      "    ╱╲╰──────────╯╱╲    ",
      "      ╱╭──╲╱──╮╲       ",
      "      ╰╯  ╰╯  ╰╯       "
    ],
    thinking: [
      "       ?     ?     …    ",
      "     ╱╲╲────────╱╱╲     ",
      "    ╱╲╭──────────╮╱╲    ",
      "   ╱╲│  ─ ─── ─  │╱╲    ",
      "     │   ·  _  ·  │     ",
      "     │     ……     │     ",
      "    ╱╲╰──────────╯╱╲    ",
      "      ╱╭─?╲╱?─╮╲       ",
      "      ╰╯  ╰╯  ╰╯       "
    ],
    speaking: [
      "      ♪    ♡    ♪       ",
      "     ╱╲╲────────╱╱╲     ",
      "    ╱╲╭──────────╮╱╲    ",
      "   ╱╲│  ────────  │╱╲   ",
      "     │   ◕  ▽  ◕  │     ",
      "     │     ▽▽▽    │     ",
      "    ╱╲╰──────────╯╱╲    ",
      "      ╱╭─♪╲╱♪─╮╲       ",
      "      ╰╯  ╰╯  ╰╯       "
    ],
    delighted: [
      "      ✦  ✧  ★  ✧  ✦     ",
      "     ╱╲╲──♡♡♡♡──╱╱╲     ",
      "    ╱╲╭──────────╮╱╲    ",
      "   ╱╲│  ✦──────✦  │╱╲   ",
      "     │   ★  ‿  ★  │     ",
      "     │     ▽▽▽    │     ",
      "    ╱╲╰──────────╯╱╲    ",
      "      ╱╭─♡╲╱♡─╮╲       ",
      "      ╰╯  ╰╯  ╰╯       "
    ],
    focused: [
      "        ━━━━━━━━        ",
      "     ╱╲╲────────╱╱╲     ",
      "    ╱╲╭──────────╮╱╲    ",
      "   ╱╲│  ━━━━━━━━  │╱╲   ",
      "     │   ━     ━  │     ",
      "     │      ─     │     ",
      "    ╱╲╰──────────╯╱╲    ",
      "      ╱╭─━╲╱━─╮╲       ",
      "      ╰╯  ╰╯  ╰╯       "
    ],
    curious: [
      "         ?     ¿        ",
      "     ╱╲╲────────╱╱╲     ",
      "    ╱╲╭──────────╮╱╲    ",
      "   ╱╲│  ────────  │╱╲   ",
      "     │   ◕  ◇  ?  │     ",
      "     │      ⌒     │     ",
      "    ╱╲╰──────────╯╱╲    ",
      "      ╱╭─?╲╱¿─╮╲       ",
      "      ╰╯  ╰╯  ╰╯       "
    ],
    guarded: [
      "      !!!   !   !!!     ",
      "     ╱╲╲────────╱╱╲     ",
      "    ╱╲╭──────────╮╱╲    ",
      "   ╱╲│  ╳╳╳╳╳╳╳╳  │╱╲   ",
      "     │   ◣  _  ◢  │     ",
      "     │      ╳     │     ",
      "    ╱╲╰──────────╯╱╲    ",
      "      ╱╭─!╲╱!─╮╲       ",
      "      ╰╯  ╰╯  ╰╯       "
    ],
    tired: [
      "      z   Z   z   Z     ",
      "     ╱╲╲────────╱╱╲     ",
      "    ╱╲╭──────────╮╱╲    ",
      "   ╱╲│  ~~~~~~~~  │╱╲   ",
      "     │   ×  _  ×  │     ",
      "     │     ~~~    │     ",
      "    ╱╲╰──────────╯╱╲    ",
      "      ╱╭─~╲╱~─╮╲       ",
      "      ╰╯  ╰╯  ╰╯       "
    ],
    sleepy: [
      "       z   Z   z   Z    ",
      "     ╱╲╲────────╱╱╲     ",
      "    ╱╲╭──────────╮╱╲    ",
      "   ╱╲│  ────────  │╱╲   ",
      "     │   ‿  _  ‿  │     ",
      "     │     ___    │     ",
      "    ╱╲╰──────────╯╱╲    ",
      "      ╱╭─z╲╱Z─╮╲       ",
      "      ╰╯  ╰╯  ╰╯       "
    ]
  }
};

function normalizeArtSet(rawSet, size) {
  const { width, height } = ART_DIMENSIONS[size];
  /** @type {Record<ArtEmotion, readonly string[]>} */
  const out = {};
  for (const emotion of ANIME_EMOTIONS) {
    const lines = rawSet[emotion];
    if (!Array.isArray(lines)) {
      throw new Error(`anime-art: missing ${size}/${emotion}`);
    }
    if (lines.length !== height) {
      throw new Error(
        `anime-art: ${size}/${emotion} has ${lines.length} lines, expected ${height}`
      );
    }
    const normalized = lines.map((line, idx) => {
      const w = cellWidth(line);
      if (w > width) {
        throw new Error(
          `anime-art: ${size}/${emotion} line ${idx} width ${w} exceeds target ${width}: ${JSON.stringify(line)}`
        );
      }
      return padCells(line, width);
    });
    out[emotion] = Object.freeze(normalized);
  }
  return Object.freeze(out);
}

/**
 * The frozen, normalized character art table. All lines in a given
 * `[size][emotion]` entry have identical `cellWidth()`.
 *
 * @type {Readonly<Record<ArtSize, Readonly<Record<ArtEmotion, readonly string[]>>>>}
 */
export const ANIME_CHARACTER_ART = Object.freeze({
  mini: normalizeArtSet(RAW_ART.mini, "mini"),
  medium: normalizeArtSet(RAW_ART.medium, "medium"),
  large: normalizeArtSet(RAW_ART.large, "large")
});

const NON_BLINKABLE = new Set(["sleepy", "tired", "blink"]);

function resolveSize(size) {
  return ART_DIMENSIONS[size] ? size : "medium";
}

function resolveEmotion(emotion) {
  return ANIME_EMOTIONS.includes(emotion) ? emotion : "idle";
}

/**
 * Pick an art frame for the given emotion/size. When `blinkPhase` is
 * true, returns the "blink" frame at the same size — except for
 * emotions like `sleepy` and `tired` whose eyes are already closed.
 *
 * Always returns a fresh array of strings (a clone of the frozen
 * canonical lines) so callers may safely concat / mutate.
 *
 * @param {object} [options]
 * @param {ArtEmotion} [options.emotion]
 * @param {ArtSize} [options.size]
 * @param {boolean} [options.blinkPhase]
 * @returns {string[]}
 */
export function getAnimeArt({ emotion = "idle", size = "medium", blinkPhase = false } = {}) {
  const safeSize = resolveSize(size);
  const safeEmotion = resolveEmotion(emotion);
  const setForSize = ANIME_CHARACTER_ART[safeSize];
  const useBlink = blinkPhase && !NON_BLINKABLE.has(safeEmotion);
  const key = useBlink ? "blink" : safeEmotion;
  const frame = setForSize[key] ?? setForSize.idle;
  return frame.slice();
}

/**
 * Choose the most expressive emotion that fits a soul-bios mood state.
 *
 * Priority: guarded > tired > delighted > curious > focused > calm/idle.
 *
 * @param {{ tags?: string[], discrete?: string }} [mood]
 * @returns {ArtEmotion}
 */
export function chooseEmotionFromMood(mood = {}) {
  if (!mood || typeof mood !== "object") return "idle";
  const tags = Array.isArray(mood.tags) ? mood.tags : [];
  const tagSet = new Set(tags.map((t) => String(t).toLowerCase()));
  if (typeof mood.discrete === "string") tagSet.add(mood.discrete.toLowerCase());

  if (tagSet.has("guarded") || tagSet.has("cautious") || tagSet.has("vigilant") || tagSet.has("alarmed")) return "guarded";
  if (tagSet.has("tired") || tagSet.has("weary") || tagSet.has("strained") || tagSet.has("frustrated") || tagSet.has("blocked") || tagSet.has("recovering")) return "tired";
  if (tagSet.has("sleepy") || tagSet.has("resting") || tagSet.has("dormant")) return "sleepy";
  if (tagSet.has("delighted") || tagSet.has("celebrate") || tagSet.has("celebratory") || tagSet.has("proud") || tagSet.has("satisfied") || tagSet.has("relieved") || tagSet.has("hopeful") || tagSet.has("confident") || tagSet.has("warm")) return "delighted";
  if (tagSet.has("curious") || tagSet.has("exploratory") || tagSet.has("observant")) return "curious";
  if (tagSet.has("focused") || tagSet.has("thinking") || tagSet.has("attentive") || tagSet.has("absorbed") || tagSet.has("analytical") || tagSet.has("organized") || tagSet.has("determined") || tagSet.has("orchestrating")) return "focused";
  if (tagSet.has("speaking")) return "speaking";
  if (tagSet.has("content") || tagSet.has("supportive")) return "delighted";
  if (tagSet.has("uneasy") || tagSet.has("reflective") || tagSet.has("apologetic") || tagSet.has("humbled")) return "thinking";
  return "idle";
}

/**
 * Choose an art size that fits the available terminal column count.
 *
 * Boundaries: <80 → mini, [80, 120) → medium, ≥120 → large.
 *
 * @param {number} cols
 * @returns {ArtSize}
 */
export function chooseSizeForTerminal(cols) {
  const n = Number.isFinite(cols) ? Math.floor(cols) : 0;
  if (n < 80) return "mini";
  if (n < 120) return "medium";
  return "large";
}

/**
 * Return the canonical pixel-cell dimensions for an art size.
 *
 * @param {ArtSize} [size]
 * @returns {{ width: number, height: number }}
 */
export function getArtDimensions(size = "medium") {
  const safe = resolveSize(size);
  const dim = ART_DIMENSIONS[safe];
  return { width: dim.width, height: dim.height };
}

export const ANIME_ART_SIZES = SIZE_ORDER;
