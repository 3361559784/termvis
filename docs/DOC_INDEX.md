# Soul Dynamics Runtime — Documentation

Welcome to the documentation for the **Soul Dynamics Runtime (SDR)**, the orchestration layer that turns raw terminal and agent activity into a coherent, legible “digital presence”: mood, pulse, posture, and memory-aware bias—without taking control of the host AI CLI.

## What is the Soul Dynamics Runtime?

The Soul Dynamics Runtime is a **tick-synchronized cognitive–affective loop** that sits beside real coding agents (Codex, Claude Code, Gemini CLI, Copilot CLI, OpenCode, and others). It ingests **signals** from the environment, maintains a **host model** of task phase and tooling risk, updates **layered memory** (rhythm, relationship, debt), and drives three expressive engines:

- **HADE Mood (CAAP)**: appraisal vectors, prototype matching, and governed transitions between discrete affective states.
- **Cardiac Pulse**: sympathetic and parasympathetic channels that modulate BPM, HRV, and breath-coupled visuals in the Soul TUI.
- **Presence**: behavior posture, stance, and gaze—how the soul *acts* in the rail without mutating host I/O.

The **Soul TUI Panel** composes avatar, heartbeat, stance labels, and optional narration into one protected layout region, while the host viewport remains a faithful mirror of the underlying CLI stream.

This repository’s working name is `chafa_cli` / **termvis**; SDR is the conceptual runtime that termvis implements and extends. For implementation-oriented notes, see also [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) and [`../README.md`](../README.md).

## Document map

| Area | Document | Description |
|------|----------|-------------|
| Architecture | [Overview](./architecture/overview.md) | End-to-end system diagram and subsystem roles |
| Architecture | [Tick cycle](./architecture/tick-cycle.md) | Unified per-tick sequence across SignalBus → UI |
| Subsystems | [Mood (HADE / CAAP)](./subsystems/mood.md) | Appraisal vectors, prototypes, transition governor |
| Subsystems | [Pulse](./subsystems/pulse.md) | Cardiac oscillator, BPM/HRV, breath, pulse events |
| Subsystems | [Presence](./subsystems/presence.md) | Modes, stances, gaze, posture state machine |
| Subsystems | [Host](./subsystems/host.md) | Task phases, tools, permissions, host adapters |
| Subsystems | [Memory](./subsystems/memory.md) | Five layers, scoring, debt, cross-subsystem bias |
| Subsystems | [Signal](./subsystems/signal.md) | Universal signals, pipeline, LLM appraisal path |
| Configuration | [API providers](./configuration/api-providers.md) | LLM and embedding providers, env vars, JSONC keys |
| Configuration | [Settings](./configuration/settings.md) | Themes, avatar, accessibility, pulse, anchors |
| Guides | [Quickstart](./guides/quickstart.md) | Install → configure → run → customize |

## Reading order

1. [Architecture overview](./architecture/overview.md) for the big picture.
2. [Tick cycle](./architecture/tick-cycle.md) for ordering and data flow.
3. Subsystem docs in any order; [Signal](./subsystems/signal.md) and [Host](./subsystems/host.md) pair well first.
4. [Quickstart](./guides/quickstart.md) when you want hands-on commands.

## Conventions

- **Cross-links** use paths relative to this `docs/` tree.
- **Mermaid** diagrams render in GitHub, GitLab, and many Markdown viewers.
- **Normative vs illustrative**: tables and formulas here describe the SDR design; the shipped `termvis` binary may subset or extend them—see the main repo docs for file-level truth.
