export function createEpisodeSummarizer() {
  const episodes = [];
  const maxEpisodes = 100;

  return {
    recordEpisode(moodId, durationMs, causeIds = [], peakIntensity = 0.5) {
      const entry = {
        moodId,
        durationMs,
        causeIds: [...causeIds],
        peakIntensity,
        endedAt: Date.now()
      };
      if (episodes.length >= maxEpisodes) episodes.shift();
      episodes.push(entry);
      return entry;
    },

    getRecentTrajectory(limit = 8) {
      return episodes.slice(-limit).map(e => ({
        mood: e.moodId,
        durationMs: e.durationMs,
        causes: e.causeIds
      }));
    },

    getMoodFrequency(windowMs = 300000) {
      const cutoff = Date.now() - windowMs;
      const freq = {};
      for (const e of episodes) {
        if (e.endedAt < cutoff) continue;
        freq[e.moodId] = (freq[e.moodId] || 0) + 1;
      }
      return freq;
    },

    getAll() { return [...episodes]; },
    get size() { return episodes.length; },
    clear() { episodes.length = 0; }
  };
}
