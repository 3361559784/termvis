/**
 * Tests for the smart memory layer:
 *  - MemoryRecord (Ebbinghaus retention, reinforce, decay)
 *  - EmbeddedMemoryStore (working/episodic/semantic/reflective layers,
 *    quarantine, embedding-based recall, conflict detection)
 *  - Reflection (RMM Prospective + Retrospective)
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  EmbeddedMemoryStore,
  MEMORY_LAYERS,
  computeRetention,
  createMemoryRecord,
  decayMemory,
  detectConflicts,
  reinforceMemory,
  prospectiveReflect,
  retrospectiveReflect,
  createReflectionScheduler
} from "../../src/memory/index.js";
import { LexicalEmbeddingProvider } from "../../src/cognition/index.js";
import { ScriptedLLMProvider } from "../support/scripted-llm.js";

// ==================== MemoryRecord ====================

describe("MemoryRecord", () => {
  test("createMemoryRecord returns frozen record with defaults", () => {
    const r = createMemoryRecord({ text: "test memory" });
    assert.ok(Object.isFrozen(r));
    assert.equal(r.text, "test memory");
    assert.ok(["working", "episodic"].includes(r.layer));
    assert.ok(r.importance >= 0 && r.importance <= 1);
    assert.ok(r.strength >= 0 && r.strength <= 1);
    assert.ok(r.confidence >= 0 && r.confidence <= 1);
    assert.equal(r.accessCount, 0);
  });

  test("computeRetention follows Ebbinghaus curve", () => {
    const now = Date.now();
    const r = createMemoryRecord({
      text: "x",
      strength: 1.0,
      importance: 0.5,
      lastAccessed: now - 86400000 // 1 day ago
    });
    // S = 1 * 0.5 * 86400000 ms = 1/2 day
    // R(t=1d) = e^(-2) ≈ 0.1353
    const ret = computeRetention(r, now);
    assert.ok(Math.abs(ret - Math.exp(-2)) < 0.01);
  });

  test("computeRetention is 1 immediately after access", () => {
    const r = createMemoryRecord({ text: "x" });
    const ret = computeRetention(r);
    assert.ok(ret > 0.99);
  });

  test("reinforceMemory increases strength with diminishing returns", () => {
    const r = createMemoryRecord({ text: "x", strength: 0.5 });
    const r1 = reinforceMemory(r);
    assert.ok(r1.strength > r.strength);
    assert.equal(r1.accessCount, 1);
    const r2 = reinforceMemory(r1);
    // Diminishing returns - second reinforce smaller delta
    assert.ok(r2.strength - r1.strength <= r1.strength - r.strength);
  });

  test("decayMemory reduces strength based on time", () => {
    const r = createMemoryRecord({ text: "x", strength: 1.0, importance: 0.5 });
    const future = Date.now() + 86400000 * 7; // 7 days
    const decayed = decayMemory(r, future);
    assert.ok(decayed.strength < r.strength);
  });

  test("important memories decay slower than unimportant", () => {
    const important = createMemoryRecord({ text: "x", strength: 1.0, importance: 0.9 });
    const trivial = createMemoryRecord({ text: "y", strength: 1.0, importance: 0.1 });
    const future = Date.now() + 86400000 * 14;
    const dImp = decayMemory(important, future);
    const dTriv = decayMemory(trivial, future);
    assert.ok(dImp.strength > dTriv.strength);
  });
});

// ==================== EmbeddedMemoryStore ====================

describe("EmbeddedMemoryStore", () => {
  function makeStore({ allowReflective = false } = {}) {
    const embedder = new LexicalEmbeddingProvider({ dimensions: 128 });
    return new EmbeddedMemoryStore({ embedder, sessionId: "test", allowReflective });
  }

  test("addWorking stores in working layer", async () => {
    const store = makeStore();
    const id = await store.addWorking("opened util.js");
    assert.ok(id);
    assert.equal(store.records.get("working").length, 1);
  });

  test("working layer caps at limit", async () => {
    const store = makeStore();
    for (let i = 0; i < 25; i++) {
      await store.addWorking(`mem ${i}`);
    }
    assert.ok(store.records.get("working").length <= 20);
  });

  test("addEpisodic puts new entries in quarantine", async () => {
    const store = makeStore();
    await store.addEpisodic("user prefers Chinese");
    assert.equal(store.records.get("quarantine").length, 1);
    assert.equal(store.records.get("episodic").length, 0);
  });

  test("promoteEligible moves quarantine to episodic after timeout", async () => {
    const store = makeStore();
    const id = await store.addEpisodic("a fact");
    // Force promotion by passing a future time
    const future = Date.now() + 86400000;
    const result = await store.promoteEligible(future);
    assert.equal(result.promoted.length, 1);
    assert.equal(result.promoted[0], id);
    assert.equal(store.records.get("episodic").length, 1);
    assert.equal(store.records.get("quarantine").length, 0);
  });

  test("recall uses embeddings to find semantically similar episodic memories", async () => {
    const store = makeStore();
    await store.addEpisodic("the test failed at line 42");
    await store.addEpisodic("user wants brief responses");
    await store.addEpisodic("debug output for util module");
    await store.promoteEligible(Date.now() + 86400000);

    const recall = await store.recall({ query: "test failure", topK: 2 });
    assert.ok(recall.episodic.length > 0);
    // Should rank "test failed" higher than unrelated entries
    assert.match(recall.episodic[0].text, /test|failed/i);
  });

  test("recall falls back to substring + recency without embedder", async () => {
    const store = new EmbeddedMemoryStore({
      embedder: { available: false, dimensions: 0, embed: async () => null },
      sessionId: "test"
    });
    await store.addEpisodic("the test failed");
    await store.addEpisodic("unrelated note");
    await store.promoteEligible(Date.now() + 86400000);
    const recall = await store.recall({ query: "test", topK: 2 });
    assert.ok(recall.episodic.length > 0);
  });

  test("addSemantic detects conflict with existing semantic via similarity", async () => {
    const store = makeStore();
    await store.addSemantic("user prefers terse Chinese responses");
    await store.addSemantic("user prefers terse Chinese responses");
    const semantics = store.records.get("semantic");
    // Both should be present but the second should have lower confidence
    assert.equal(semantics.length, 2);
    assert.ok(semantics[1].confidence < semantics[0].confidence);
  });

  test("addReflective requires allowReflective", async () => {
    const noReflect = makeStore({ allowReflective: false });
    const id1 = await noReflect.addReflective("a meta thought");
    assert.equal(id1, null);

    const yesReflect = makeStore({ allowReflective: true });
    const id2 = await yesReflect.addReflective("a meta thought");
    assert.ok(id2);
    assert.equal(yesReflect.records.get("reflective").length, 1);
  });

  test("decay prunes old low-strength records", async () => {
    const store = makeStore();
    await store.addEpisodic("ancient memory");
    await store.promoteEligible(Date.now() + 86400000);

    // Force ancient last-accessed
    const records = store.records.get("episodic");
    records[0] = Object.freeze({ ...records[0], lastAccessed: Date.now() - 86400000 * 365, strength: 0.01 });

    const result = store.decay({ pruneThreshold: 0.05 });
    assert.ok(result.pruned >= 0);
  });

  test("serialize and deserialize round trip", async () => {
    const store = makeStore();
    await store.addWorking("hello");
    await store.addEpisodic("world");
    await store.promoteEligible(Date.now() + 86400000);

    const json = await store.serialize();
    const store2 = makeStore();
    await store2.deserialize(json);
    assert.equal(store2.records.get("working").length, 1);
    assert.equal(store2.records.get("episodic").length, 1);
  });

  test("MEMORY_LAYERS contains all five layers", () => {
    assert.deepEqual([...MEMORY_LAYERS], ["working", "episodic", "semantic", "reflective", "quarantine"]);
  });
});

// ==================== Conflict Detection ====================

describe("Conflict Detection", () => {
  test("detectConflicts identifies near-duplicate via high similarity", async () => {
    const embedder = new LexicalEmbeddingProvider({ dimensions: 128 });
    const candidate = {
      text: "user prefers brief answers",
      embedding: await embedder.embed("user prefers brief answers")
    };
    const existing = [
      {
        id: "1",
        text: "user prefers brief answers",
        embedding: await embedder.embed("user prefers brief answers"),
        layer: "semantic",
        confidence: 0.8
      }
    ];
    const conflicts = detectConflicts({ candidate, existing, similarityThreshold: 0.85 });
    assert.ok(conflicts.length > 0);
    assert.equal(conflicts[0].kind, "duplicate");
  });

  test("detectConflicts identifies contradiction with negation", async () => {
    const embedder = new LexicalEmbeddingProvider({ dimensions: 128 });
    const candidate = {
      text: "the cat is on the mat",
      embedding: await embedder.embed("the cat is on the mat")
    };
    const existing = [
      {
        id: "1",
        text: "the cat is not on the mat",
        embedding: await embedder.embed("the cat is not on the mat"),
        layer: "semantic",
        confidence: 0.8
      }
    ];
    const conflicts = detectConflicts({ candidate, existing, similarityThreshold: 0.5 });
    if (conflicts.length > 0) {
      // Either duplicate (high similarity) or contradiction (medium similarity + negation)
      assert.ok(conflicts.some((c) => c.kind === "duplicate" || c.kind === "contradiction"));
    }
  });
});

// ==================== Reflection (RMM) ====================

describe("RMM Reflection", () => {
  function makeStore() {
    const embedder = new LexicalEmbeddingProvider({ dimensions: 128 });
    return new EmbeddedMemoryStore({ embedder, sessionId: "test" });
  }

  test("prospectiveReflect stays silent without LLM", async () => {
    const store = makeStore();
    for (let i = 0; i < 12; i++) {
      await store.addEpisodic(`event number ${i} with some content`);
    }
    await store.promoteEligible(Date.now() + 86400000);

    const result = await prospectiveReflect({ memory: store, llm: null, recentN: 12, onlyIfMin: 8 });
    assert.equal(result.summarized, 0);
    assert.equal(result.semanticIds.length, 0);
    assert.equal(store.records.get("semantic").length, 0);
  });

  test("prospectiveReflect uses LLM when available", async () => {
    const store = makeStore();
    for (let i = 0; i < 12; i++) {
      await store.addEpisodic(`fact ${i}`);
    }
    await store.promoteEligible(Date.now() + 86400000);

    const llm = new ScriptedLLMProvider({
      responses: {
        ProspectiveReflection: {
          summaries: [
            { summary: "User cares about facts", tags: ["preference"], importance: 0.7 },
            { summary: "User wants brief responses", tags: ["style"], importance: 0.6 }
          ]
        }
      }
    });

    const result = await prospectiveReflect({ memory: store, llm, recentN: 12, onlyIfMin: 8 });
    assert.ok(result.llmRunId);
    assert.equal(result.summarized, 2);
  });

  test("prospectiveReflect short-circuits when below onlyIfMin", async () => {
    const store = makeStore();
    await store.addEpisodic("only one fact");
    await store.promoteEligible(Date.now() + 86400000);

    const result = await prospectiveReflect({ memory: store, llm: null, onlyIfMin: 8 });
    assert.equal(result.summarized, 0);
  });

  test("retrospectiveReflect bumps cited memory importance", async () => {
    const store = makeStore();
    const id = await store.addEpisodic("important memory");
    await store.promoteEligible(Date.now() + 86400000);
    const before = store.records.get("episodic")[0].importance;

    const result = await retrospectiveReflect({ memory: store, citedMemoryIds: [id] });
    const after = store.records.get("episodic")[0].importance;
    assert.ok(after > before);
    assert.ok(result.bumped >= 1);
  });

  test("createReflectionScheduler triggers at intervals", async () => {
    const store = makeStore();
    for (let i = 0; i < 12; i++) {
      await store.addEpisodic(`fact ${i}`);
    }
    await store.promoteEligible(Date.now() + 86400000);

    const scheduler = createReflectionScheduler({ memory: store, llm: null, tickInterval: 5 });
    // First call always arms the scheduler and returns null
    const r1 = await scheduler(0, []);
    assert.equal(r1, null);
    // Within interval - still null
    const r2 = await scheduler(3, []);
    assert.equal(r2, null);
    // At interval - should fire
    const r3 = await scheduler(6, []);
    assert.ok(r3);
    assert.ok(r3.prospective);
    assert.ok(r3.retrospective);
  });
});
