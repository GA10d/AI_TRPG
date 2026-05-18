# AI TRPG 3.0

A text-first AI TRPG prototype.

This repository contains a full project skeleton under active development: a `React + Vite` web client, a `Node + TypeScript` session service, editable content packs, reserved boundaries for both single-agent and multi-agent orchestration, and integration foundations for text and image models. The current focus is to stabilize a single-player AI TRPG loop that is playable, saveable, replayable, and extensible.

## Showcase

### Multi-genre Covers

These sample covers show that the same AI TRPG framework can support different tones and settings, including fox-themed fantasy, romance, and space science fiction.

| Fox | Love | Space |
| --- | --- | --- |
| ![Fox-themed game cover](show_case/cover%20fox.png) | ![Romance-themed game cover](show_case/cover%20love.png) | ![Space-themed game cover](show_case/cover%20space.png) |

### Current Look

These screenshots show the current opening cover and main menu.

| Opening cover | Main menu |
| --- | --- |
| ![Current project opening cover](show_case/%E5%B0%81%E9%9D%A2.png) | ![Current project main menu](show_case/%E4%B8%BB%E8%8F%9C%E5%8D%95.png) |

### Demo

[Watch the demo video](show_case/%E6%BC%94%E7%A4%BAdemo.mp4)

<video controls src="show_case/%E6%BC%94%E7%A4%BAdemo.mp4" width="100%"></video>

## Current Features

- Web main menu, new game, continue, records, settings, and exit flow
- Single-player text-based gameplay loop
- MVP dual-agent runtime with `Narrator + Ending Judge`
- AI opening preview and AI-assisted character concept generation / completion
- Local save, continue, and replay logs
- Branch replay tree after endings
- Two model access modes: `mock` and `server_proxy`
- Multi-profile text model switching: `ChatGPT / DeepSeek / Gemini / Doubao / Custom OpenAI-compatible`
- NPC profile entry and image-generation pipeline foundation
- Rule pack and story pack loading based on `content/`

## Project Goals

- Build a long-term, extensible AI TRPG runtime centered on natural-language storytelling
- Preserve AI freedom in narration while keeping state, logs, saves, and replay debuggable and persistent
- Reserve clean boundaries for future `multi_agent`, multiplayer, private chat, image expansion, and community-authored content

## Tech Stack

- Frontend: `React 18 + TypeScript + Vite`
- Backend: `Node.js + TypeScript`
- Workspace: `npm workspaces`
- Runtime modes: `mock`, `server_proxy`
- Shared packages: `packages/shared-types`, `packages/shared-config`
- Content format: `Markdown / txt + JSON`

## Quick Start

Use a recent Node.js version that supports `node --experimental-strip-types`.

1. Install dependencies

```powershell
npm.cmd install
```

2. Copy the environment template

```powershell
Copy-Item .env.example .env
```

3. Fill in `.env` as needed

- Text-model related variables are documented in `.env.example`
- Supported profiles include `ChatGPT / DeepSeek / Gemini / Doubao / Custom OpenAI-compatible`
- If you only want local flow validation, start with `mock` mode

4. Start the server

```powershell
npm.cmd run dev:server
```

5. Start the web app

```powershell
npm.cmd run dev:web
```

6. Open the browser

```text
http://127.0.0.1:4317/
```

## Common Commands

```powershell
# Start the server
npm.cmd run dev:server

# Start the web app
npm.cmd run dev:web

# Build the web app
npm.cmd run build:web

# Validate content packs
npm.cmd run content:catalog

# Validate content packs with English locale
npm.cmd run content:catalog:en

# Run one end-to-end business flow check
npm.cmd run test:real -- --mode=mock
```

Notes:

- If `apps/web/dist` exists, the server can host the built frontend directly
- In `server_proxy` mode, model profiles can be switched through the settings page or `.env`

## Repository Structure

```text
apps/
  web/        React frontend
  server/     Node session service and model gateway
  prompt/     Prompt assets for narrator, ending judge, image generation, etc.
packages/
  shared-types/
  shared-config/
content/      Rule packs and story packs
docs/         Design docs, field audits, and phase plans
scripts/      Helper scripts
test_ipynb/   Prompt experiments, batch validation, and replay analysis
```

## Included Content Packs

### Rule Packs

- `VHS`: `VHS Retro Horror Tape`
- `ROM`: `Heart Boundary`
- `MOCA`: `Mock A Urban Anomalies`
- `MOCB`: `Mock B Small-Town Horror`

### Example Stories

- `VHS / The Silence`
- `VHS / The Fox`
- `ROM / Early Summer Unread Messages`
- `MOCA / Fog Platform`
- `MOCA / Neon Corridor`
- `MOCB / Red Archive`
- `MOCB / Broken Ferry`

These packs are organized as folders so they can keep evolving, be replaced, and eventually support community authoring workflows.

## Current Development Focus

- Refine the game UI around “narrative reading + action input”
- Stabilize the playable single-player flow powered by `Narrator + Ending Judge`
- Expand NPC presentation and image-generation support
- Continue improving save/load, replay, branching tree, and model configuration experience

## Related Docs

- `docs/phase0_foundation.md`: 3.0 foundation design
- `docs/phase2_field_audit.md`: field simplification audit
- `docs/phase3_plan.md`: current implementation plan
- `docs/ending_branch_playthrough_design.md`: ending branch replay tree design

## Project Status

This repository is still under active iteration. It already contains a runnable prototype, but the API, data structures, UI, and content conventions will continue to evolve. It currently works well as:

- A foundation for AI TRPG prototyping
- A sandbox for prompt and agent orchestration experiments
- A reference for file-based rule pack and story pack design
- A sample runtime for single-player text-driven interactive games
