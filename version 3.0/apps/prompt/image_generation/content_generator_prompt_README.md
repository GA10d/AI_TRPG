# Content Generator Image Prompts

These files are loaded by `apps/server/src/content_generator/service.ts`.

- `content_generator_asset_plan_*`: prompts for deciding which images a generated story package should include.
- `content_generator_cover_*`: prompts for the cover image. Keep the 16:9 wording here when the cover must stay widescreen.
- `content_generator_npc_portrait_*`: prompts for NPC portrait image prompts.
- `content_generator_support_asset_*`: prompts for non-cover support image prompts.

Template variables use `{{VARIABLE_NAME}}`. Unknown variables are left visible in the rendered prompt so missing wiring is easy to notice.
