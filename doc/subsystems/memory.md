# Memory Subsystem (Experience Layers)

[← Back to doc index](../README.md) · [Mood](./mood.md) · [Pulse](./pulse.md) · [Presence](./presence.md)

The memory subsystem keeps **experience traces** that survive longer than a single PTY chunk: patterns of success, friction with permissions, and rhythmic cadence of the session. Memory is write-scored—only high-value episodes persist—and each layer decays at a different rate.

## Five layers

| Layer | Scope | Contents | Decay |
|-------|-------|-----------|-------|
| **Working** | Current tick window | Short list of active hypotheses, last N signals, scratch embeddings | Cleared on session end |
| **Rhythm** | Session / multi-session | Cadence metrics: average dwell in phases, burstiness of tool use | Slow exponential decay |
| **Relationship** | User / project | Interaction style, tone preference, risk tolerance priors | Very slow; opt-in erase |
| **Debt** | Operational | Trust hits from denials, flaky tools, repeated test failures | Decay on repair success + wall-clock half-life |
| **Bios** | Persona | Long-horizon “who this soul is” invariants; boundary packs | Manual or policy-driven refresh only |

**Read path**: mood samples **working + rhythm + debt + bios** heavily; pulse leans on **debt + rhythm**; presence prioritizes **relationship + rhythm**.

## Memory write scoring

Each candidate episode \(e\) receives a scalar score before admission to non-working layers:

\[
\mathrm{score}(e) = w_r\, R(e) + w_n\, N(e) + w_u\, U(e) + w_t\, T(e) - w_c\, C(e)
\]

| Term | Meaning |
|------|---------|
| \(R\) | **Relevance**: embedding similarity to active task / user goal |
| \(N\) | **Novelty**: distance from existing centroids in the target layer |
| \(U\) | **Utility**: did state improve (tests green, permission cleared)? |
| \(T\) | **Teachability**: did the episode revise a rule or prototype boundary? |
| \(C\) | **Cost**: tokens, time, or user annoyance proxies |

Candidates with \(\mathrm{score} < \theta_{\text{layer}}\) are dropped or summarized into aggregates instead of raw rows.

## Debt accumulation and decay

**Accumulation** spikes on:

- Permission **denied** or **expired** with pending danger tier
- **verify** failures without immediate successful repair
- Contradictory host signals (classified flapping) under time pressure

**Decay** uses a smoothed law:

\[
D_{t+1} = \lambda \, D_t + \Delta_{\text{event}} \qquad 0 < \lambda < 1
\]

Successful **repair chains**, **user praise signals**, or sustained calm phases increase an opposing **relief** term that accelerates effective \(\lambda\) toward faster forgetting for *recent* debt only—long audits may retain a small permanent tail in relationship layer for transparency.

## Memory → mood / pulse / presence bias matrix

| Memory signal | Mood bias | Pulse bias | Presence bias |
|---------------|-----------|------------|---------------|
| High **trust debt** | Toward `guarded`, higher appraisal tension | `holding`, reduced HRV | `guardian` mode, `protective` stance |
| Strong **rhythm** (predictable success) | Toward `calm` / `focused` stability | `steady`, narrower HRV | `mirror_host` stance, `host_stream` gaze |
| **Relationship** formality preference | Lower warmth channel gain | Softer sympathetic ramp | `defer`, distant `soft_minimize` |
| **Working** novelty spike | Toward `attentive` / `curious` prototypes | `quickening` | `lean_in`, `user_input` gaze |
| **Bios** boundary hit | Suppress romanticized moods; enforce `skeptical_hold` ceiling | Forced exhale settle after alarm | `checkpoint` stance until acknowledged |

## Related documentation

- [Tick cycle](../architecture/tick-cycle.md)
- [Host risk coupling](./host.md)
- [Signal → memory candidates](./signal.md)
- [Settings: memory scopes](../configuration/settings.md)
