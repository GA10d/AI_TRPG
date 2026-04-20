# AI TRPG

[中文说明](./README.zh-CN.md)

A personal solo AI TRPG project, built entirely out of my interest in role-playing games and story generators.

This repository is not a commercial product or a polished studio production. It is an ongoing independent project where I keep testing one question: can AI support a TRPG experience that is not just open-ended, but actually playable, finishable, immersive, and expandable?

The repo currently contains two major generations of the project:

- `version 2.0/`: a relatively stable single-agent text TRPG prototype with replay and export workflows.
- `version 3.0/`: a newer full-stack prototype that keeps the single-agent path while also exploring multi-agent storytelling, comic generation, and richer multimodal UX.

## Visual Preview

<p align="center">
  <img src="version%203.0/content/VHS/story/The_Silence/art_assets/cover.png" alt="The Silence cover" width="32%" />
  <img src="version%203.0/content/VHS/story/The_Fox/art_assets/cover.png" alt="The Fox cover" width="32%" />
  <img src="version%203.0/content/ROM/Story/School/art_assets/cover.png" alt="School cover" width="32%" />
</p>

<p align="center">
  <img src="version%203.0/artifacts/comic_generation_notebook/comic-page-google-pro-latest-20260413-175150.jpg" alt="Comic generation sample" width="62%" />
</p>

These examples are pulled directly from tracked project assets and artifacts. They are meant to show the tonal range I am aiming for: retro horror, supernatural mystery, school romance, and text-plus-comic storytelling inside the same larger TRPG research space.

## Text Preview

Adapted from a replay export in `version 3.0/artifacts/save_text_exports/`:

> Rain fell like a thousand thin needles over the stone outside Yuqing Hall.  
> When the player pushed open the heavy wooden door, an old steward was already waiting with an oil lamp in hand.  
> Inside, a fox-spirit shrine stood beside a bright red demolition notice, as if the house itself were being asked to choose between burial and memory.  
> The player had only a few hours before dawn, a missing family relic, a silent well in the courtyard, and the feeling that everyone in the house was waiting for one question too many.

That balance between atmosphere, player agency, and narrative pressure is the core of what I want this project to do well.

## What Version 2.0 Did

`version 2.0` focused on the single-player experience and on making single-agent storytelling actually close its own loop. It established a relatively stable text-based TRPG prototype and laid the groundwork for content expansion, state management, and replay analysis.

Most importantly, in single-agent mode it can reliably move the story forward and trigger an ending. That matters because an AI role-playing game should not just keep generating text forever. It should know how to pace a story, when to escalate, and when to end.

## What Version 3.0 Did

`version 3.0` keeps the single-agent path, but also introduces a multi-agent system (MAS). Different models can focus on different responsibilities, such as NPC behavior, world and event management, macro-level pacing, and moment-to-moment narration.

At the same time, `version 3.0` moves closer to a fuller product form with a modern frontend/backend structure, clearer content organization, and workflow foundations for paired text and comic generation.

## What I Have Built, and What I Am Still Trying to Solve

### 1. Richer multimodal user experience

The project already supports paired comic and text generation, and it has partially addressed character consistency.

The harder problem is that different image models behave very differently inside the same framework, so it is difficult to find a good trade-off between price, time, and quality. Right now I am working on a better text-to-image pipeline, hoping to get more stable and usable images even with more ordinary, lower-cost models.

After that, I also want to explore video and AI audio so the experience can grow beyond "text + comics" into a more complete multimedia storytelling system.

### 2. Endings and narrative closure

In both `version 1.0` and `version 2.0`, the single-agent mode can reliably reach a story ending, which means the gameplay loop is closed. In previous tests with human players, stories usually ended within about 20 turns.

`version 3.0` keeps the single-agent path, but also uses an MAS framework for storytelling. It adds AI teammates and an AI player option. AI teammates can be influenced through private chat, and the AI player can participate in the same narrative framework autonomously.

However, under the current MAS setup, the AI player can go through as many as 40 turns without reliably triggering an ending. That suggests that once multiple agents are coordinating, pacing control and ending convergence become much harder problems. Because of limited time, I have not yet run systematic human-player testing for the MAS framework.

### 3. Long-range narrative consistency

Logical consistency in long-running AI storytelling has always been one of the hardest problems in story generation. A truly immersive experience needs both less hallucination over long arcs and less sycophantic behavior toward the player.

The MAS system has already helped with the "AI trying too hard to please the player" problem. NPCs now act more from their own interests, and they may deceive, betray, or use the human player when it benefits them.

As for consistency, I once tried using an extra LLM to continuously maintain a world model. The idea was to extract facts and key checkpoints from the story through structured outputs and keep updating the world state to reduce narrative drift. In practice, though, that approach increased token usage too much, so I decided not to continue with it.

## Replay Reference

You can find `version 2.0` game replays on Bilibili:

- <https://space.bilibili.com/13201826> videos in the `AI TRPG` replay series

## Contact

If you are interested in AI role-playing games, or if you have interesting ideas about AI storytelling, feel free to reach out.

- Email: `zg2567@columbia.edu`
- WeChat: `languissant314`
