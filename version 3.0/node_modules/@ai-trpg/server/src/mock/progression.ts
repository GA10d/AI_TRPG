import type { GameState, LocaleCode } from "../../../../packages/shared-types/src/index.ts";

export type MockProgressionResult = {
  nextGameState: GameState;
  sceneChanged: boolean;
  sceneSummary: string;
  stateSummary: string;
  unlockedInfoIds: string[];
  completedObjectives: string[];
  activatedObjectives: string[];
};

type MockSceneDefinition = {
  sceneId: string;
  titleZh: string;
  titleEn: string;
  objectiveId: string;
  infoId: string;
  summaryZh: string;
  summaryEn: string;
  keywords: string[];
};

const MOCK_SCENE_FLOW: MockSceneDefinition[] = [
  {
    sceneId: "entry_plaza",
    titleZh: "入口广场",
    titleEn: "Entry Plaza",
    objectiveId: "stabilize_entry",
    infoId: "entry_first_impression",
    summaryZh: "玩家仍在入口广场收束局势，开始确认今晚的调查方向。",
    summaryEn: "The player is still stabilizing the situation at the entry plaza and choosing an investigation direction.",
    keywords: [
      "入口",
      "门口",
      "观察",
      "莉莉",
      "entry",
      "gate",
      "observe",
      "lily"
    ]
  },
  {
    sceneId: "counselor_dormitory",
    titleZh: "辅导员宿舍区",
    titleEn: "Counselor Dormitory",
    objectiveId: "inspect_dormitory",
    infoId: "claire_room_trace",
    summaryZh: "玩家把调查重心转向宿舍区，开始追查克莱尔与简的痕迹。",
    summaryEn: "The player shifts the investigation toward the dormitory area and starts tracing Claire and Jane.",
    keywords: [
      "宿舍",
      "木屋",
      "房间",
      "信件",
      "镜子",
      "dorm",
      "dormitory",
      "cabin",
      "room",
      "letter",
      "mirror"
    ]
  },
  {
    sceneId: "stardust_video_hall",
    titleZh: "星尘录像厅",
    titleEn: "Stardust Video Hall",
    objectiveId: "inspect_video_hall",
    infoId: "black_tape_hint",
    summaryZh: "玩家把注意力集中到录像厅，开始逼近录像带和当夜放映记录。",
    summaryEn: "The player focuses on the video hall and moves closer to the tape and screening records from that night.",
    keywords: [
      "录像",
      "录像厅",
      "放映",
      "胶片",
      "屏幕",
      "video",
      "hall",
      "tape",
      "projector",
      "screen"
    ]
  },
  {
    sceneId: "lakeside_dock",
    titleZh: "湖边码头",
    titleEn: "Lakeside Dock",
    objectiveId: "trace_jane",
    infoId: "jane_investigation_note",
    summaryZh: "玩家沿着湖边继续深入，开始追查简留下的第二条证据链。",
    summaryEn: "The player pushes deeper along the lakeside and starts tracing Jane's second evidence trail.",
    keywords: [
      "湖",
      "码头",
      "水边",
      "船",
      "简",
      "lake",
      "dock",
      "shore",
      "boat",
      "jane"
    ]
  }
];

const INITIAL_ACTIVE_OBJECTIVES = [
  "stabilize_entry"
];

function isEnglishLocale(locale: LocaleCode): boolean {
  return String(locale).toLowerCase().startsWith("en");
}

function pushUnique<T>(values: T[], item: T): T[] {
  return values.includes(item) ? values : [...values, item];
}

function resolveSceneDefinition(input: string, currentRound: number): MockSceneDefinition {
  const loweredInput = input.toLowerCase();

  for (const scene of MOCK_SCENE_FLOW.slice(1)) {
    if (scene.keywords.some((keyword) => loweredInput.includes(keyword.toLowerCase()))) {
      return scene;
    }
  }

  const fallbackIndex = Math.min(currentRound, MOCK_SCENE_FLOW.length - 1);
  return MOCK_SCENE_FLOW[fallbackIndex] ?? MOCK_SCENE_FLOW[0];
}

function buildStateSummary(
  locale: LocaleCode,
  targetScene: MockSceneDefinition,
  completedObjectives: string[],
  activatedObjectives: string[],
  nightfallClock: number
): string {
  if (isEnglishLocale(locale)) {
    return [
      `Scene focus: ${targetScene.titleEn}`,
      completedObjectives.length > 0
        ? `Completed objectives: ${completedObjectives.join(", ")}`
        : "Completed objectives: none",
      activatedObjectives.length > 0
        ? `Active objectives: ${activatedObjectives.join(", ")}`
        : "Active objectives: none",
      `Nightfall clock: ${nightfallClock}`
    ].join(" | ");
  }

  return [
    `场景焦点：${targetScene.titleZh}`,
    completedObjectives.length > 0
      ? `已完成目标：${completedObjectives.join("、")}`
      : "已完成目标：暂无",
    activatedObjectives.length > 0
      ? `当前目标：${activatedObjectives.join("、")}`
      : "当前目标：暂无",
    `夜幕进度：${nightfallClock}`
  ].join(" | ");
}

export function createInitialMockGameState(
  current: GameState,
  locale: LocaleCode
): GameState {
  const entryScene = MOCK_SCENE_FLOW[0];

  return {
    ...current,
    sceneState: {
      ...current.sceneState,
      sceneTitle: isEnglishLocale(locale) ? entryScene.titleEn : entryScene.titleZh,
      mockStage: "entry",
      lastSceneSummary: isEnglishLocale(locale) ? entryScene.summaryEn : entryScene.summaryZh
    },
    storyFlags: {
      ...current.storyFlags,
      phase1_mock_mode: true,
      trust_lily: "uncertain",
      danger_level: "low"
    },
    clocks: {
      ...current.clocks,
      nightfall: 0
    },
    discoveredInfoIds: pushUnique(current.discoveredInfoIds, entryScene.infoId),
    objectiveState: {
      active: INITIAL_ACTIVE_OBJECTIVES,
      completed: current.objectiveState.completed,
      failed: current.objectiveState.failed
    },
    unresolvedHooks: pushUnique(current.unresolvedHooks, "find_first_real_lead")
  };
}

export function advanceMockGameState(
  current: GameState,
  playerInput: string,
  locale: LocaleCode,
  round: number
): MockProgressionResult {
  const targetScene = resolveSceneDefinition(playerInput, round);
  const previousSceneId = current.sceneId;
  const sceneChanged = previousSceneId !== targetScene.sceneId;
  const previousActive = current.objectiveState.active;
  const alreadyDiscovered = current.discoveredInfoIds.includes(targetScene.infoId);

  const completedObjectives = previousActive.filter((objectiveId) => objectiveId !== targetScene.objectiveId);
  const nextCompletedObjectives = Array.from(
    new Set([
      ...current.objectiveState.completed,
      ...completedObjectives
    ])
  );
  const nextActiveObjectives = Array.from(
    new Set([
      targetScene.objectiveId
    ])
  );
  const nightfallClock = (current.clocks.nightfall ?? 0) + 1;
  const tensionLevel = round >= 3 ? "high" : round >= 2 ? "medium" : "low";
  const sceneSummary = isEnglishLocale(locale) ? targetScene.summaryEn : targetScene.summaryZh;
  const stateSummary = buildStateSummary(
    locale,
    targetScene,
    nextCompletedObjectives,
    nextActiveObjectives,
    nightfallClock
  );

  const nextGameState: GameState = {
    ...current,
    sceneId: targetScene.sceneId,
    sceneState: {
      ...current.sceneState,
      sceneTitle: isEnglishLocale(locale) ? targetScene.titleEn : targetScene.titleZh,
      mockStage: targetScene.sceneId,
      lastSceneSummary: sceneSummary,
      lastTransitionRound: round
    },
    storyFlags: {
      ...current.storyFlags,
      last_player_input: playerInput,
      last_mock_turn_round: round,
      danger_level: tensionLevel,
      last_scene_title: isEnglishLocale(locale) ? targetScene.titleEn : targetScene.titleZh
    },
    clocks: {
      ...current.clocks,
      nightfall: nightfallClock
    },
    discoveredInfoIds: pushUnique(current.discoveredInfoIds, targetScene.infoId),
    objectiveState: {
      active: nextActiveObjectives,
      completed: nextCompletedObjectives,
      failed: current.objectiveState.failed
    },
    unresolvedHooks: [
      `follow_${targetScene.sceneId}`
    ]
  };

  return {
    nextGameState,
    sceneChanged,
    sceneSummary,
    stateSummary,
    unlockedInfoIds: alreadyDiscovered ? [] : [targetScene.infoId],
    completedObjectives,
    activatedObjectives: nextActiveObjectives
  };
}
