import type { ModelAccessMode } from "../../../../packages/shared-types/src/index.ts";
import {
  buildMockEndingJudgeFromNarration,
  buildMockEndingJudgeDecisionFromNarration,
  buildMockInitialNarration,
  buildMockOpeningText,
  buildMockTurnOutcome
} from "../mock/index.ts";
import {
  generateOpeningViaServerProxy,
  generatePromptedTextViaServerProxy,
  streamOpeningViaServerProxy
} from "./openai_compatible.ts";
import {
  generateInitialSessionNarrationViaServerProxy,
  generateStructuredAssistantOutputViaServerProxy,
  generateTurnNarrationViaSingleAgentServerProxy,
  judgeEndingViaServerProxy
} from "./single_agent_proxy.ts";
import type {
  EndingJudgeInput,
  EndingJudgeOutput,
  InitialSessionNarrationInput,
  ModelGateway,
  OpeningGenerationInput,
  OpeningGenerationStreamOptions,
  OpeningGenerationOutput,
  PromptedTextGenerationInput,
  PromptedTextGenerationOutput,
  StructuredAssistantInput,
  StructuredAssistantOutput,
  TurnNarrationInput,
  TurnNarrationOutput
} from "./types.ts";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function splitMockPreviewTextIntoChunks(text: string): string[] {
  const tokens = text.match(/\S+\s*|\n+/gu) ?? [text];
  const chunks: string[] = [];
  let currentChunk = "";

  for (const token of tokens) {
    if (
      currentChunk.length > 0 &&
      currentChunk.length + token.length > 36 &&
      !token.includes("\n")
    ) {
      chunks.push(currentChunk);
      currentChunk = token;
      continue;
    }

    currentChunk += token;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function buildMockMultiAgentPromptedText(
  input: PromptedTextGenerationInput
): string | null {
  const userPrompt = input.userPrompt;

  if (userPrompt.includes("Multi-agent task: Dicer")) {
    return [
      "规则一致性检查：本次行动没有明显越出当前世界观边界，但执行过程存在一定风险，需要按现场阻力承受后果。",
      "成功可能性：中。",
      "推荐结论：部分成功。",
      "结果后果：目标会被推进，但会制造额外动静，并暴露玩家当前位置或意图。",
      "改进方向：若先确认周围风险来源，或补充更谨慎的执行步骤，成功率会更高。"
    ].join("\n");
  }

  if (userPrompt.includes("Multi-agent task: NPC Manager")) {
    return JSON.stringify(
      {
        active_visible_npcs: ["值夜人"],
        visible_npcs_output: [
          {
            npc_name: "值夜人",
            label: "值夜人（警觉巡查者）",
            action: "停下脚步，转头观察玩家制造出的动静来源。",
            dialogue: "刚才那边是什么声音？别再往里乱闯。",
            emotion: "警惕",
            tone: "压低声音",
            expression: "提灯微抬，视线在黑暗里来回搜索",
            inner_state_note: "他怀疑附近有人在隐瞒行踪。",
            concealment_note: ""
          }
        ],
        active_background_npcs: ["馆主"],
        background_updates: [
          {
            npc_name: "馆主",
            label: "馆主（仍在暗处观察）",
            progress: "暂未现身，但已经注意到前厅的异常动静。",
            location: "宅邸内侧走廊",
            task: "继续观察来客与值夜人的反应",
            eta_minutes: 10,
            contact_plan: "若局势继续升级，可能会亲自出现或派人传话。",
            state_change: "戒备略有提高"
          }
        ],
        timeline_notes: [
          {
            npc_name: "馆主",
            note: "若噪音继续扩大，馆主会在稍后出面试探玩家来意。",
            due_in_minutes: 10,
            trigger_reason: "前厅异常动静持续升级"
          }
        ],
        state_delta: [
          "值夜人警戒提高，并开始主动搜索声源。",
          "馆主注意到前厅异常动静，进入持续观察状态。"
        ],
        event_log_entries: [
          "值夜人开始搜索前厅的异常声源。",
          "馆主在暗处注意到新的动静。"
        ]
      },
      null,
      2
    );
  }

  if (userPrompt.includes("Multi-agent task: Director")) {
    return [
      "当前节奏判断：玩家已经推动局势前进，但现场紧张度还可以继续抬高，不需要立刻强推主线真相。",
      "建议方向：接下来 1-2 轮可以通过值夜人的搜查与馆主的试探，让玩家感到自己正在逼近更深层的信息。",
      "情绪基调：压低声音的紧张感，夹杂被人暗中观察的不安。",
      "提醒：暂时不要直接揭露核心秘密，只给出更明确的阻力与下一步可追的线索。"
    ].join("\n");
  }

  if (userPrompt.includes("Multi-agent task: Narrator")) {
    if (input.locale === "en-US") {
      return "Your move lands, but not cleanly. The immediate obstacle gives way with a harsh scrape, and the sound carries farther than you wanted. A lantern flare shifts across the corridor as the night watch turns toward the disturbance, calling out for whoever is inside to show themselves. Somewhere deeper in the manor, another presence pauses to listen. You have only a heartbeat to decide whether to press forward, hide, or answer.";
    }

    if (input.locale === "ja-JP") {
      return "行動は確かに状況を動かしたが、きれいには収まらなかった。目の前の障害は軋む音とともに崩れ、その響きが思った以上に奥まで走る。廊下の先で提灯の光が揺れ、値夜人が物音の方へ向き直って声を張った。さらに奥では、別の誰かが気配を殺して様子をうかがっている。押し切るか、身を隠すか、それとも今ここで名乗るかを決める猶予はほとんどない。";
    }

    return "你的行动确实撬动了眼前的局势，但代价也立刻显现出来。面前的阻碍在一阵刺耳的摩擦声里被你推动了，可那声响比预想中传得更远，空荡的走廊很快就有提灯的光晃了过来。值夜人警觉地停下脚步，朝声源方向压低嗓音喝问，显然已经开始搜查。更深处的宅邸里，另一道本来沉着不动的目光也被惊醒，像是在暗处重新衡量你的来意。你现在只有很短的一瞬，可以选择立刻压低身形躲开视线，顺势继续深入，或者先把这一场突如其来的对峙接住。";
  }

  return null;
}

class MockModelGateway implements ModelGateway {
  async generateOpening(input: OpeningGenerationInput): Promise<OpeningGenerationOutput> {
    return {
      text: buildMockOpeningText(
        input.storyTitle,
        input.storyText,
        String(input.locale)
      ),
      provider: "mock-local",
      mode: "mock",
      meta: {
        provider: "mock-local",
        mode: "mock",
        model: "mock-local",
        durationMs: 0,
        estimatedCost: {
          amount: 0,
          currency: "USD",
          pricingModel: "mock-local",
          note: "Mock mode does not consume billable tokens."
        },
        usage: {
          promptTokens: null,
          completionTokens: null,
          totalTokens: null,
          promptCacheHitTokens: null,
          promptCacheMissTokens: null
        }
      }
    };
  }

  async streamOpening(
    input: OpeningGenerationInput,
    options?: OpeningGenerationStreamOptions
  ): Promise<OpeningGenerationOutput> {
    const output = await this.generateOpening(input);
    const chunks = splitMockPreviewTextIntoChunks(output.text);

    for (const chunk of chunks) {
      if (options?.signal?.aborted) {
        throw new Error("Opening preview stream aborted.");
      }

      await options?.onTextDelta?.(chunk);
      await delay(24);
    }

    return output;
  }

  async generateTurnNarration(input: TurnNarrationInput): Promise<TurnNarrationOutput> {
    const outcome = buildMockTurnOutcome(
      input.playerInput,
      String(input.locale),
      input.round,
      input.conversationContext
    );
    return {
      text: outcome.text,
      provider: "mock-local",
      mode: "mock",
      meta: {
        provider: "mock-local",
        mode: "mock",
        model: "mock-local",
        durationMs: 0,
        estimatedCost: {
          amount: 0,
          currency: "USD",
          pricingModel: "mock-local",
          note: "Mock mode does not consume billable tokens."
        },
        usage: {
          promptTokens: null,
          completionTokens: null,
          totalTokens: null,
          promptCacheHitTokens: null,
          promptCacheMissTokens: null
        }
      },
    };
  }

  async generateInitialSessionNarration(
    input: InitialSessionNarrationInput
  ): Promise<TurnNarrationOutput> {
    return {
      text: buildMockInitialNarration(
        input.storyTitle,
        input.playerInfo,
        String(input.locale)
      ),
      provider: "mock-local",
      mode: "mock",
      meta: {
        provider: "mock-local",
        mode: "mock",
        model: "mock-local",
        durationMs: 0,
        estimatedCost: {
          amount: 0,
          currency: "USD",
          pricingModel: "mock-local",
          note: "Mock mode does not consume billable tokens."
        },
        usage: {
          promptTokens: null,
          completionTokens: null,
          totalTokens: null,
          promptCacheHitTokens: null,
          promptCacheMissTokens: null
        }
      }
    };
  }

  async judgeEnding(input: EndingJudgeInput): Promise<EndingJudgeOutput> {
    const adjudication = buildMockEndingJudgeFromNarration(input.narrationText);
    const judgeDecision = buildMockEndingJudgeDecisionFromNarration(input.narrationText);

    return {
      adjudication:
        adjudication.endingState === null
          ? adjudication
          : {
              ...adjudication,
              endingState: {
                ...adjudication.endingState,
                confirmedAtRound: input.round
              }
            },
      judgeDecision,
      rawText: JSON.stringify(judgeDecision, null, 2),
      provider: "mock-local",
      mode: "mock",
      meta: {
        provider: "mock-local",
        mode: "mock",
        model: "mock-local",
        durationMs: 0,
        estimatedCost: {
          amount: 0,
          currency: "USD",
          pricingModel: "mock-local",
          note: "Mock mode does not consume billable tokens."
        },
        usage: {
          promptTokens: null,
          completionTokens: null,
          totalTokens: null,
          promptCacheHitTokens: null,
          promptCacheMissTokens: null
        }
      }
    };
  }

  async generatePromptedText(
    input: PromptedTextGenerationInput
  ): Promise<PromptedTextGenerationOutput> {
    const multiAgentText = buildMockMultiAgentPromptedText(input);
    if (multiAgentText !== null) {
      return {
        text: multiAgentText,
        provider: "mock-local",
        mode: "mock",
        meta: {
          provider: "mock-local",
          mode: "mock",
          model: "mock-local",
          durationMs: 0,
          estimatedCost: {
            amount: 0,
            currency: "USD",
            pricingModel: "mock-local",
            note: "Mock mode does not consume billable tokens."
          },
          usage: {
            promptTokens: null,
            completionTokens: null,
            totalTokens: null,
            promptCacheHitTokens: null,
            promptCacheMissTokens: null
          }
        }
      };
    }

    const currentTextMatch = input.userPrompt.match(/Current character draft:\n([\s\S]*?)\n(?:\n|$)/u);
    const currentText = currentTextMatch?.[1]?.trim() ?? "";
    const generatedText =
      currentText.length > 0
        ? `${currentText}\n我把录音笔和手电塞进外套口袋，告诉自己这趟回来不是为了逞强，而是为了把一直卡在心口的那件事查清楚。`
        : "我是个做民俗采访的自由撰稿人，背着旧相机和录音笔进山，表面上说是来补最后一篇稿，实际上是想确认多年前那场怪事到底有没有把我家人一起卷进去。";

    return {
      text: generatedText,
      provider: "mock-local",
      mode: "mock",
      meta: {
        provider: "mock-local",
        mode: "mock",
        model: "mock-local",
        durationMs: 0,
        estimatedCost: {
          amount: 0,
          currency: "USD",
          pricingModel: "mock-local",
          note: "Mock mode does not consume billable tokens."
        },
        usage: {
          promptTokens: null,
          completionTokens: null,
          totalTokens: null,
          promptCacheHitTokens: null,
          promptCacheMissTokens: null
        }
      }
    };
  }

  async generateStructuredAssistantOutput(
    input: StructuredAssistantInput
  ): Promise<StructuredAssistantOutput> {
    const loweredSchemaName = input.schemaName.toLowerCase();
    const defaultMeta = {
      provider: "mock-local",
      mode: "mock" as const,
      model: "mock-local",
      durationMs: 0,
      estimatedCost: {
        amount: 0,
        currency: "USD" as const,
        pricingModel: "mock-local",
        note: "Mock mode does not consume billable tokens."
      },
      usage: {
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        promptCacheHitTokens: null,
        promptCacheMissTokens: null
      }
    };

    let data: Record<string, unknown>;
    if (loweredSchemaName.includes("fact_extractor")) {
      data = {
        newFacts: [],
        supersededFactIds: [],
        resolvedFactIds: [],
        newOpenLoops: [],
        resolvedOpenLoopIds: [],
        newEntities: [],
        shouldRefreshEpisodeSummary: true
      };
    } else if (loweredSchemaName.includes("episode_compressor")) {
      data = {
        title: "Recent developments",
        summary: input.userPrompt.slice(0, 240).trim() || "No summary available.",
        keyFactIds: [],
        openLoopIds: []
      };
    } else {
      data = {};
    }

    return {
      data,
      rawText: JSON.stringify(data, null, 2),
      provider: "mock-local",
      mode: "mock",
      meta: defaultMeta
    };
  }
}

class ServerProxyModelGateway implements ModelGateway {
  async generateOpening(input: OpeningGenerationInput): Promise<OpeningGenerationOutput> {
    return generateOpeningViaServerProxy(input);
  }

  async streamOpening(
    input: OpeningGenerationInput,
    options?: OpeningGenerationStreamOptions
  ): Promise<OpeningGenerationOutput> {
    return streamOpeningViaServerProxy(input, options);
  }

  async generateTurnNarration(input: TurnNarrationInput): Promise<TurnNarrationOutput> {
    return generateTurnNarrationViaSingleAgentServerProxy(input);
  }

  async generateInitialSessionNarration(
    input: InitialSessionNarrationInput
  ): Promise<TurnNarrationOutput> {
    return generateInitialSessionNarrationViaServerProxy(input);
  }

  async judgeEnding(input: EndingJudgeInput): Promise<EndingJudgeOutput> {
    return judgeEndingViaServerProxy(input);
  }

  async generatePromptedText(
    input: PromptedTextGenerationInput
  ): Promise<PromptedTextGenerationOutput> {
    return generatePromptedTextViaServerProxy(input);
  }

  async generateStructuredAssistantOutput(
    input: StructuredAssistantInput
  ): Promise<StructuredAssistantOutput> {
    return generateStructuredAssistantOutputViaServerProxy(input);
  }
}

const mockGateway = new MockModelGateway();
const serverProxyGateway = new ServerProxyModelGateway();

export function getModelGateway(accessMode: ModelAccessMode): ModelGateway {
  if (accessMode === "mock") {
    return mockGateway;
  }

  if (accessMode === "server_proxy") {
    return serverProxyGateway;
  }

  throw new Error(`Unsupported model access mode: ${accessMode}`);
}
