import { resolve } from "node:path";

import { DEFAULT_LOCALE } from "../../../../packages/shared-config/src/index.ts";
import { loadContentCatalog, loadPlayableContentBundle } from "../content/index.ts";

type CliOptions = {
  contentRoot: string;
  ruleId: string;
  storyDirectoryName: string;
  locale: string;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    contentRoot: resolve(process.cwd(), "content"),
    ruleId: "VHS",
    storyDirectoryName: "The_Silence",
    locale: DEFAULT_LOCALE
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (!next) {
      continue;
    }

    if (arg === "--content-root") {
      options.contentRoot = resolve(next);
      index += 1;
    } else if (arg === "--rule") {
      options.ruleId = next;
      index += 1;
    } else if (arg === "--story") {
      options.storyDirectoryName = next;
      index += 1;
    } else if (arg === "--locale") {
      options.locale = next;
      index += 1;
    }
  }

  return options;
}

function makePreview(content: string): string {
  return content.replace(/\s+/g, " ").trim().slice(0, 140);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const catalog = await loadContentCatalog(options.contentRoot);
  const bundle = await loadPlayableContentBundle(
    options.contentRoot,
    options.ruleId,
    options.storyDirectoryName,
    options.locale
  );

  const summary = {
    checkedAt: new Date().toISOString(),
    contentRoot: options.contentRoot,
    requestedLocale: options.locale,
    resolvedLocale: bundle.resolvedLocale,
    selectedRule: {
      id: bundle.rule.manifest.id,
      title: bundle.rule.manifest.title[bundle.rule.manifest.defaultLocale] ?? bundle.rule.manifest.id,
      introSource: bundle.rule.intro?.relativePath ?? null,
      ruleSource: bundle.rule.rule.relativePath,
      rulePreview: makePreview(bundle.rule.rule.content)
    },
    selectedStory: {
      id: bundle.story.manifest.id,
      title: bundle.story.manifest.title[bundle.story.manifest.defaultLocale] ?? bundle.story.manifest.id,
      introSource: bundle.story.intro?.relativePath ?? null,
      storySource: bundle.story.story.relativePath,
      storyPreview: makePreview(bundle.story.story.content)
    },
    catalog
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
