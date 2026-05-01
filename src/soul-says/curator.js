import { createSayCandidate } from "./types.js";

const recentHashes = new Set();
const MAX_RECENT = 40;

function textHash(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  }
  return String(h);
}

export function scoreCandidates(candidates, input) {
  const { mood, pulse, presence, memory, state, config } = input;
  const moodId = mood?.mood?.primary || "calm";
  const core = mood?.core || {};
  const safety = config?.safety || {};

  return candidates
    .map(c => {
      if (safety.privacyRiskThreshold && c.privacyRisk > safety.privacyRiskThreshold) return null;
      if (safety.dependencyRiskThreshold && c.dependencyRisk > safety.dependencyRiskThreshold) return null;

      const hash = textHash(c.text);
      const isRepeat = recentHashes.has(hash);
      const repetitionPenalty = isRepeat ? 0.6 : 0;

      const moodFit = moodFitScore(c, moodId, core);

      const score =
        0.22 * c.relevance +
        0.18 * c.factuality +
        0.14 * c.novelty +
        0.12 * c.styleFit +
        0.10 * (c.brevity === "micro" ? 0.8 : c.brevity === "short" ? 0.6 : 0.4) +
        0.10 * c.priority +
        0.08 * (c.memoryBasis?.length > 0 ? 0.7 : 0.3) +
        0.06 * moodFit -
        0.18 * c.interruptionRisk -
        0.18 * c.privacyRisk -
        0.14 * c.dependencyRisk -
        0.10 * repetitionPenalty;

      return { candidate: c, score: Math.max(0, Math.min(1, score)), hash };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
}

function moodFitScore(candidate, moodId, core) {
  const toneMoodMap = {
    guarded: ["cautious", "guarded", "alarmed", "tense", "vigilant"],
    warm: ["relieved", "satisfied", "content", "warm", "celebratory", "delighted"],
    reflective: ["reflective", "calm", "quiet", "nostalgic"],
    focused: ["focused", "attentive", "absorbed", "analytical", "determined"],
    apologetic: ["apologetic", "humbled", "concerned"],
    quiet: ["calm", "quiet", "resting", "sleepy"]
  };
  const matchSet = toneMoodMap[candidate.tone] || [];
  if (matchSet.includes(moodId)) return 0.9;
  if ((core.arousal || 0) > 0.6 && candidate.tone === "focused") return 0.7;
  return 0.5;
}

export function selectBest(scoredCandidates, input) {
  if (!scoredCandidates || scoredCandidates.length === 0) return null;

  const top = scoredCandidates[0];
  if (!top) return null;

  if (recentHashes.size >= MAX_RECENT) {
    const first = recentHashes.values().next().value;
    recentHashes.delete(first);
  }
  recentHashes.add(top.hash);

  return top.candidate;
}

export function containsDependencyLanguage(text) {
  const patterns = [
    /不要离开/, /只有我/, /我真的担心你/, /我有灵魂/,
    /你需要我/, /没有我你/, /我们之间/, /我会想你/,
    /我是真实的/, /我能感受到/, /我的心/, /我们永远/
  ];
  return patterns.some(p => p.test(text));
}

export function containsSecrets(text) {
  const patterns = [
    /[A-Za-z0-9+/]{40,}/, // long base64-like tokens
    /sk-[a-zA-Z0-9]{20,}/, // OpenAI keys
    /ghp_[a-zA-Z0-9]{20,}/, // GitHub tokens
    /password\s*[:=]\s*\S+/i,
    /secret\s*[:=]\s*\S+/i
  ];
  return patterns.some(p => p.test(text));
}

export function resetRecentHashes() {
  recentHashes.clear();
}
