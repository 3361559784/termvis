import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  ANIME_CHARACTER_ART,
  ANIME_EMOTIONS,
  ANIME_ART_SIZES,
  ART_DIMENSIONS,
  getAnimeArt,
  chooseEmotionFromMood,
  chooseSizeForTerminal,
  getArtDimensions
} from "../../src/life/anime-art.js";
import { cellWidth } from "../../src/core/width.js";

describe("Anime art", () => {
  test("all emotions present in all sizes", () => {
    for (const size of ANIME_ART_SIZES) {
      for (const emotion of ANIME_EMOTIONS) {
        const lines = ANIME_CHARACTER_ART[size][emotion];
        assert.ok(Array.isArray(lines), `${size}/${emotion} must be array`);
        assert.ok(lines.length > 0, `${size}/${emotion} must not be empty`);
      }
    }
  });

  test("each size yields the canonical row count", () => {
    for (const size of ANIME_ART_SIZES) {
      const expected = ART_DIMENSIONS[size].height;
      for (const emotion of ANIME_EMOTIONS) {
        const lines = ANIME_CHARACTER_ART[size][emotion];
        assert.equal(
          lines.length,
          expected,
          `${size}/${emotion}: line count ${lines.length} != ${expected}`
        );
      }
    }
  });

  test("all lines in a single emotion+size have equal cell width", () => {
    for (const size of ANIME_ART_SIZES) {
      for (const emotion of ANIME_EMOTIONS) {
        const lines = ANIME_CHARACTER_ART[size][emotion];
        const widths = lines.map(cellWidth);
        const first = widths[0];
        for (const w of widths) {
          assert.equal(
            w,
            first,
            `${size}/${emotion}: line widths differ ${widths.join(",")}`
          );
        }
      }
    }
  });

  test("each size renders at the canonical width", () => {
    for (const size of ANIME_ART_SIZES) {
      const target = ART_DIMENSIONS[size].width;
      for (const emotion of ANIME_EMOTIONS) {
        const lines = ANIME_CHARACTER_ART[size][emotion];
        for (let i = 0; i < lines.length; i++) {
          assert.equal(
            cellWidth(lines[i]),
            target,
            `${size}/${emotion} line ${i} width != ${target}: ${JSON.stringify(lines[i])}`
          );
        }
      }
    }
  });

  test("art lines never embed ANSI escape sequences", () => {
    const ansi = /\u001b\[/;
    for (const size of ANIME_ART_SIZES) {
      for (const emotion of ANIME_EMOTIONS) {
        for (const line of ANIME_CHARACTER_ART[size][emotion]) {
          assert.equal(
            ansi.test(line),
            false,
            `${size}/${emotion} contains ANSI escape: ${JSON.stringify(line)}`
          );
        }
      }
    }
  });

  test("getAnimeArt returns blink when blinkPhase=true", () => {
    const blink = getAnimeArt({ emotion: "idle", size: "medium", blinkPhase: true });
    const baseBlink = ANIME_CHARACTER_ART.medium.blink;
    assert.deepEqual(blink, [...baseBlink]);
  });

  test("getAnimeArt does NOT blink for sleepy/tired", () => {
    const sleepy = getAnimeArt({ emotion: "sleepy", size: "medium", blinkPhase: true });
    assert.deepEqual(sleepy, [...ANIME_CHARACTER_ART.medium.sleepy]);
    const tired = getAnimeArt({ emotion: "tired", size: "large", blinkPhase: true });
    assert.deepEqual(tired, [...ANIME_CHARACTER_ART.large.tired]);
  });

  test("getAnimeArt fallbacks gracefully on unknown inputs", () => {
    const bad = getAnimeArt({ emotion: "unknown", size: "weird" });
    assert.ok(Array.isArray(bad));
    assert.ok(bad.length > 0);
    assert.deepEqual(bad, [...ANIME_CHARACTER_ART.medium.idle]);
  });

  test("getAnimeArt returns a fresh array each call", () => {
    const a = getAnimeArt({ emotion: "idle", size: "mini" });
    const b = getAnimeArt({ emotion: "idle", size: "mini" });
    assert.notStrictEqual(a, b);
    assert.deepEqual(a, b);
    a.push("MUTATED");
    const c = getAnimeArt({ emotion: "idle", size: "mini" });
    assert.notDeepEqual(a, c);
  });

  test("chooseEmotionFromMood prioritizes guarded > tired > delighted", () => {
    assert.equal(chooseEmotionFromMood({ tags: ["calm", "guarded"] }), "guarded");
    assert.equal(chooseEmotionFromMood({ tags: ["focused", "tired"] }), "tired");
    assert.equal(chooseEmotionFromMood({ tags: ["delighted"] }), "delighted");
    assert.equal(chooseEmotionFromMood({ tags: ["curious"] }), "curious");
    assert.equal(chooseEmotionFromMood({ tags: ["focused"] }), "focused");
    assert.equal(chooseEmotionFromMood({}), "idle");
    assert.equal(chooseEmotionFromMood(null), "idle");
    assert.equal(chooseEmotionFromMood({ tags: ["guarded", "delighted"] }), "guarded");
    assert.equal(chooseEmotionFromMood({ discrete: "tired" }), "tired");
  });

  test("chooseSizeForTerminal returns appropriate size", () => {
    assert.equal(chooseSizeForTerminal(60), "mini");
    assert.equal(chooseSizeForTerminal(79), "mini");
    assert.equal(chooseSizeForTerminal(80), "medium");
    assert.equal(chooseSizeForTerminal(100), "medium");
    assert.equal(chooseSizeForTerminal(119), "medium");
    assert.equal(chooseSizeForTerminal(120), "large");
    assert.equal(chooseSizeForTerminal(140), "large");
    assert.equal(chooseSizeForTerminal(NaN), "mini");
  });

  test("getArtDimensions returns canonical width/height per size", () => {
    assert.deepEqual(getArtDimensions("mini"), { width: 12, height: 3 });
    assert.deepEqual(getArtDimensions("medium"), { width: 18, height: 6 });
    assert.deepEqual(getArtDimensions("large"), { width: 24, height: 9 });
    assert.deepEqual(getArtDimensions("unknown"), { width: 18, height: 6 });
  });

  test("ANIME_CHARACTER_ART is deeply frozen", () => {
    assert.ok(Object.isFrozen(ANIME_CHARACTER_ART));
    for (const size of ANIME_ART_SIZES) {
      assert.ok(Object.isFrozen(ANIME_CHARACTER_ART[size]), `${size} not frozen`);
      for (const emotion of ANIME_EMOTIONS) {
        assert.ok(
          Object.isFrozen(ANIME_CHARACTER_ART[size][emotion]),
          `${size}/${emotion} not frozen`
        );
      }
    }
  });
});
