# Pulse Subsystem (Cardiac Oscillator)

[← Back to doc index](../README.md) · [Mood](./mood.md) · [Presence](./presence.md)

The pulse subsystem models **autonomic** dynamics: a **sympathetic** channel (“accelerator”) tied to stakes and time pressure, and a **parasympathetic** channel (“brake”) tied to resolution, trust, and recovery. The Soul TUI reads pulse **events** and **phase** to animate heartbeat rhythm, micro-jitter (HRV), and breath-synchronized easing.

## Channels

| Channel | Physiological analogy | Typical drivers |
|---------|----------------------|-----------------|
| **Sympathetic** | Fight/flight readiness | Host risk, tool stack depth, failing tests, permission waits, memory **trust debt** |
| **Parasympathetic** | Rest/digest | Successful repairs, low-risk stretches, rhythmic completion from **session rhythm memory**, calm core mood |

Both channels integrate each tick with saturation so BPM stays in a bounded band unless a **surge** event explicitly permits short overshoot.

## BPM formula

Let \(S\) be sympathetic drive \([0,1]\), \(P_{\mathrm{para}}\) parasympathetic drive \([0,1]\), and \(B_0\) baseline BPM from persona config (for example 58–66 idle). A smooth combined tension \(T = \mathrm{clamp}( w_S S - w_P P_{\mathrm{para}} + w_M m_{\mathrm{arousal}} , 0, 1 )\) feeds:

\[
\mathrm{BPM} = B_0 + (B_{\max} - B_0) \cdot \sigma\bigl( k \cdot (T - T_0) \bigr)
\]

- \(\sigma\) is a sigmoid (logistic) for soft saturation
- \(k\) controls steepness; \(T_0\) is an inflection bias so calm mid-states hug baseline
- **Tool pressure** and **fatigue** from memory nudge \(T\) upward or flatten the sigmoid (heavy fatigue lowers the effective \(B_{\max}\) ceiling)

## Heart rate variability (HRV)

HRV is modeled **without** claiming medical accuracy: inter-beat interval noise scales with:

- **Uncertainty** in signal classification (wider spread)
- Recent **mode switches** in presence (temporary coherence loss)
- Opposing sympathetic/parasympathetic ramps (oscillation in \(T\))

High HRV reads visually as gentle shimmer; collapsed HRV reads as a tight metronome—useful when the user should feel “locked in” versus “stalled.”

## Breath coupling

Breath is a slower oscillator slaved to pulse:

- **Inhale** phase lengthens when parasympathetic dominance rises after success
- **Exhale** deepens when mood transitions toward `reflective` or `calm`
- **Holding** aligns with `guardian` / high-risk posture from [Presence](./presence.md)

Breath phase modulates avatar micro-motion amplitude (when motion is enabled).

## Pulse event reference

| Event | Triggers (examples) | Visual / UX effect |
|-------|---------------------|--------------------|
| **steady** | Sustained low risk, calm mood | Stable cadence; minimal rail flicker |
| **quickening** | Reasoning begin, shallow tool chain growth | BPM ramps; soft brightening on pulse glyph |
| **holding** | Permission pending, dangerous command review | Paused beat or half-amplitude; “wait” color token |
| **skip** | Dropped frame integration or conflicting signals | One missed beat; diagnostic tick only in dev traces |
| **flutter** | Mixed success/failure spam, noisy stderr | Raised HRV; shimmer on avatar border |
| **surge** | Test failure burst + repair.begin | Short BPM overshoot; sympathetic crest |
| **settling** | repair.success → celebrating | Decay envelope back to baseline |
| **exhale** | Idle timeout → reflective, or output.done | Breath-led easing; dim transient on rail |

Events are **advisory**: accessibility `reduceMotion` collapses them to state labels and optional title pulse only.

## Related documentation

- [Tick cycle](../architecture/tick-cycle.md)
- [Settings: pulse persona](../configuration/settings.md)
- [Memory fatigue coupling](./memory.md)
