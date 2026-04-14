export const zhCn = {
  appName: "AI TRPG 3.0",
  screenHeader: {
    defaultBackLabel: "返回",
    defaultCloseLabel: "关闭"
  },
  common: {
    none: "暂无",
    noContent: "暂无内容。",
    backToMenu: "返回主菜单",
    close: "关闭",
    save: "保存",
    load: "读取",
    open: "打开",
    delete: "删除",
    details: "详情",
    npc: "NPC",
    expand: "展开",
    collapse: "收起",
    loading: "加载中...",
    generating: "生成中...",
    creating: "创建中...",
    clear: "清空",
    provider: "来源",
    prompt: "提示词"
  },
  options: {
    playModes: [
      {
        value: "single_player",
        label: "单人模式",
        description: "由你一个人推进剧情，适合最轻量的游玩体验。"
      },
      {
        value: "story_mode",
        label: "故事模式",
        description: "主玩家改为 AI 主角推进剧情，你可以逐步接管和调整它的行动。"
      },
      {
        value: "single_player_with_npc",
        label: "单人 + NPC",
        description: "除你之外还会有 AI 同伴参与讨论与行动。"
      },
      {
        value: "multiplayer",
        label: "多人模式",
        description: "为后续联机流程预留入口，当前 MVP 仍以本地体验为主。"
      }
    ],
    gmArchitectures: [
      {
        value: "single_agent",
        label: "单 Agent 主持",
        description: "由一个主持模型统一负责叙事与 NPC 扮演。"
      },
      {
        value: "multi_agent",
        label: "多 Agent 主持",
        description: "为未来多智能体协作保留入口，当前仍以单 Agent 为主。"
      }
    ],
    logViews: [
      {
        value: "all",
        label: "全部日志",
        description: "显示完整运行日志，方便排查。"
      },
      {
        value: "compact",
        label: "精简日志",
        description: "只保留关键信息，更适合正常游玩。"
      },
      {
        value: "hidden",
        label: "隐藏日志",
        description: "尽量减少日志区域对主界面的打扰。"
      }
    ],
    markdownFontSizes: [
      {
        value: "standard",
        label: "标准（16px）",
        description: "适合桌面端默认阅读。"
      },
      {
        value: "large",
        label: "偏大（18px）",
        description: "正文更舒展，适合长段落阅读。"
      },
      {
        value: "xlarge",
        label: "大字（20px）",
        description: "更强调可读性与标题层级。"
      },
      {
        value: "xxlarge",
        label: "超大（22px）",
        description: "适合高缩放或远距离查看。"
      }
    ],
    menuFontSizes: [
      {
        value: "standard",
        label: "标准（100%）",
        description: "保持默认菜单与界面字号。"
      },
      {
        value: "large",
        label: "偏大（110%）",
        description: "让按钮、标题和说明更易读。"
      },
      {
        value: "xlarge",
        label: "大字（120%）",
        description: "适合更强调菜单可读性的界面。"
      },
      {
        value: "xxlarge",
        label: "超大（130%）",
        description: "适合大屏或较远距离观看。"
      }
    ],
    openingPreviewDelivery: [
      {
        value: "stream",
        label: "偏好流式",
        description: "边生成边显示，更快看到开场内容。"
      },
      {
        value: "complete",
        label: "完整传输",
        description: "等待全文完成后再一次性显示。"
      }
    ],
    imageTriggers: [
      { value: "manual", label: "手动生成" },
      { value: "character_portrait", label: "角色立绘" },
      { value: "npc_intro", label: "NPC 展示" },
      { value: "scene_shift", label: "场景切换" }
    ]
  },
  helperText: {
    previewFallbackLines: [
      "夜幕正在收拢，旧磁带里的声音还没完全显形。",
      "这段预览区会在后续接入真实开场生成。",
      "当前先根据剧本简介和规则设定，为你搭起氛围。"
    ],
    aiMeta: {
      source: (provider: string) => `来源：${provider}`,
      duration: (seconds: string) => `耗时：${seconds}s`,
      tokens: (count: number) => `Tokens：${count}`,
      cost: (currencySymbol: string, amount: string) => `费用：${currencySymbol}${amount}`,
      pendingCost: "费用：待补充",
      separator: " · "
    }
  },
  app: {
    saveDirectoryPrompt: {
      title: "请选择本地存档目录。",
      hint: "保存地址可以在设置修改。"
    },
    status: {
      submitTurnPending: "正在提交本轮行动...",
      preparingRoundDrafts: "正在准备本轮队伍草稿...",
      preparingAiLeaderDraft: "AI 主玩家正在起草下一步行动...",
      roundDraftsReady: "本轮草稿已准备完成，可以检查后统一提交。",
      enterPrivateChat: "请先输入私聊内容。",
      sendingPrivateChat: "正在发送私聊消息...",
      privateChatSent: "私聊已发送。",
      storyControlSwitching: "正在切换故事模式控制方式...",
      storyControlAutoEnabled: "已切换为自动进行，后续回合会自动准备并提交。",
      storyControlInterveneEnabled: "已切换为玩家介入，你可以继续修改主玩家草稿。",
      autoRoundSubmitting: "自动模式下正在统一提交本轮回复...",
      autoModeSubmitLocked: "当前处于自动进行模式，无需手动提交。",
      privateChatAutoModeUnavailable: "自动进行模式下不可发起私聊，请先切换到玩家介入。",
      turnComplete: "本轮行动已完成。",
      turnCompleteEnded: "本轮行动已完成，并且本局已进入结局。",
      endingFollowupComplete: "结局后的追问已发送，主持人继续回应了这条世界线。",
      createSessionPending: "正在进入游戏并创建会话...",
      narratorConnected: "旁白已连接，正式开场正在展开……",
      sessionCreated: "会话已创建。",
      sessionCreatedWithCharacter: "会话已创建，角色设定已并入开场。",
      startGameFirst: "请先开始一局游戏。",
      enterAction: "请输入本轮行动。",
      quickEndingMockOnly: "快速结局测试仅在 mock 模式下可用。",
      quickEndingDraftModeUnavailable: "启用队伍草稿编排时，暂不支持快速结局测试。",
      quickEndingTestPending: "正在运行 mock 结局测试...",
      quickEndingTestSuccess: "Mock 结局测试已提交。",
      quickEndingTestEnded: "Mock 结局测试成功，当前会话已进入结局。",
      enterManualNarration: "请先输入一段主持人回复。",
      manualNarrationPending: "正在测试这段手动主持人回复的结局判定...",
      manualNarrationSuccess: "手动主持人回复已写入，并完成结局判定。",
      manualNarrationEnded: "手动主持人回复已触发结局判定，本局已进入结局。",
      noActiveSessionToSave: "当前没有可保存的活动会话。",
      creatingLocalSave: "正在创建本地存档...",
      localSaveCreated: "本地存档已创建。",
      localSaveDirectorySelectionCancelled: "已取消本次存档目录选择，本次保存没有继续。",
      loadingSelectedSave: "正在载入所选存档...",
      noRecentSave: "当前没有最近存档。",
      noRecentSnapshot: "本地还没有最近快照。",
      restoringLatestSnapshot: "正在从服务端恢复最近快照...",
      latestSessionSynced: "已从服务端同步最近会话。",
      localSnapshotOpenedInstead: "服务端未找到该会话，已改为打开本地快照。",
      nodeCannotResume: "该节点无法继续，或本地快照已经缺失。",
      switchingNode: "正在切换到所选节点并重建分支上下文...",
      switchedNode: "已切换到所选节点，下一回合会从这里长出新分支。",
      defaultSettingsSaved: "默认设置已保存。",
      defaultsRestored: "默认设置已恢复。",
      recentSnapshotCleared: "最近快照已清除。",
      localSavesCleared: "本地存档列表已清空。",
      recentSaveDeleted: "最近存档已删除。",
      saveDeleted: "该存档已删除。",
      closeTabManually: "如果页面仍保持打开，请手动关闭浏览器标签页。",
      waitOpeningPreviewBeforeAssist:
        "请先等待开场预览生成完成，再使用角色概念 AI 辅助。",
      aiDraftingCharacterConcept: "AI 正在生成角色设定草稿...",
      aiCompletingCharacterConcept: "AI 正在补全当前角色设定...",
      aiDraftedCharacterConcept: "AI 已生成一版角色设定草稿，你可以继续修改。",
      aiCompletedCharacterConcept: "AI 已补全角色设定草稿，你可以继续修改。",
      selectStoryFirst: "请先选择可用剧本。",
      noPlayableStory: "当前没有可用的规则包或剧本包。"
    },
    bootstrapStages: {
      entered_game: {
        label: "进入游戏界面",
        detail: "已经切换到核心游玩界面，正在准备正式会话。",
        progress: 0.08
      },
      loading_content: {
        label: "加载规则与剧本",
        detail: "正在读取当前故事需要的规则文本和剧本内容。",
        progress: 0.2
      },
      assembling_prompt: {
        label: "整理 Narrator 输入",
        detail: "正在组合 narrator prompt、rule.txt、story.txt 和玩家设定。",
        progress: 0.42
      },
      requesting_narrator: {
        label: "请求 Narrator Agent",
        detail: "正在把开场材料发给模型，并准备第一段叙事。",
        progress: 0.64
      },
      waiting_first_reply: {
        label: "等待首条叙事",
        detail: "模型已经开始处理开场，正在等待第一段正式 narration 返回。",
        progress: 0.84
      },
      finalizing_session: {
        label: "写入会话快照",
        detail: "正在把首条叙事和当前设置写入正式会话。",
        progress: 0.96
      }
    },
    pendingSessionSystemMessage: (storyTitle: string, locale: string) =>
      `正在为《${storyTitle}》创建会话（${locale}）。`,
    pendingSessionReplaySummary: "会话初始化已启动",
    pendingPlayerName: "玩家",
    pendingNarratorName: "旁白",
    quickEndingTestInput: "我强制触发一个立即发生的 mock 结局，并立刻 escape。"
  },
  mainMenu: {
    eyebrow: "主菜单",
    title: "AI TRPG 3.0",
    description:
      "以文字叙事为核心的 AI TRPG 原型。你可以从这里开始新游戏、继续最近进度，或调整当前版本的默认模型与语言配置。",
    buttons: {
      newGame: "开始游戏",
      continue: "继续游戏",
      records: "记录",
      settings: "设置",
      exit: "退出"
    },
    footer: {
      about: "关于",
      contact: "联系我们"
    },
    feed: {
      eyebrow: "公告",
      title: "公告与动态",
      description: "这里会展示最近的版本更新与开发动态。",
      showMore: "显示更多..."
    },
    recentProgress: {
      label: "最近进度",
      roundAndStatus: (round: number, status: string) => `回合 ${round} / 状态：${status}`,
      updatedAt: (value: string) => `更新时间：${value}`,
      empty: "还没有可继续的本地进度。"
    },
    defaults: {
      label: "当前默认配置",
      locale: (value: string) => `语言：${value}`,
      playMode: (value: string) => `模式：${value}`,
      gmArchitecture: (value: string) => `主持架构：${value}`,
      modelAccessMode: (value: string) => `模型模式：${value}`,
      modelProfile: (value: string) => `模型档案：${value}`
    },
    uiLanguageAriaLabel: "选择界面语言",
    splitterAriaLabel: "拖拽调整主菜单左右宽度"
  },
  continueScreen: {
    title: "继续游戏",
    description: "优先从手动存档恢复；如果还没有手动存档，再回退到最近快照。",
    empty: "当前没有可继续的存档或最近进度。",
    recentSave: "最近存档",
    recentSnapshot: "最近快照",
    rule: (value: string) => `规则：${value}`,
    status: (value: string) => `状态：${value}`,
    round: (value: number) => `回合：${value}`,
    model: (value: string) => `模型：${value}`,
    savedAt: (value: string) => `存档时间：${value}`,
    updatedAt: (value: string) => `更新时间：${value}`,
    continueSave: "继续最近存档",
    continueSnapshot: "继续最近快照",
    restoring: "恢复中...",
    removeRecentSave: "删除最近存档",
    clearRecentSnapshot: "清除最近快照"
  },
  exitScreen: {
    title: "退出",
    description:
      "网页版本无法稳定直接退出程序，所以这里先提供退出前的整理操作。",
    noteTitle: "退出说明",
    noteBody:
      "如果只是想离开当前界面，可以返回主菜单；如果想结束当前网页，请关闭浏览器标签页。",
    buttons: {
      tryCloseWindow: "尝试关闭窗口",
      clearRecent: "清除最近进度",
      clearRecords: "清除存档摘要"
    }
  },
  recordsScreen: {
    title: "记录",
    description: "这里后续会放正式的战绩、结局记录和统计内容。",
    empty: "暂时还没有可展示的记录。"
  },
  gameScreen: {
    emptyTitle: "游戏中",
    emptyDescription: "当前没有活动中的会话。",
    emptyState: "没有可显示的可玩会话。",
    heroEyebrow: "核心游玩",
    creatingSession: "创建会话中",
    openingScene: "旁白正在展开开场",
    ended: "结局已锁定",
    inProgress: "进行中",
    currentNarration: "本轮叙事",
    endedTitle: "本局已进入结局",
    joiningSceneTitle: "旁白正在进入场景",
    advancingStoryTitle: "主持人正在推进故事",
    bootstrapEyebrow: "会话启动",
    bootstrapWaiting:
      "你已经进入核心游玩界面。首条叙事一开始流入，就会直接显示在这里。",
    noNarrationYet: "还没有生成叙事内容。",
    recentContext: "最近上下文",
    recentContextTitle: "上一轮对话与铺垫",
    recentItems: (count: number) => `${count} 条`,
    historyTab: "历史上下文",
    roundRepliesTab: "本轮回复",
    worldlineTab: "世界线查询",
    judgeTab: "辅助AI回复",
    endingJudgeSideLabel: "辅助判定",
    worldlineEyebrow: "世界线查询",
    worldlineTitle: "分支节点时间线",
    worldlineNodeCount: (count: number) => `${count} 个节点`,
    worldlineEmpty: "还没有解锁可查询的世界线节点。到达一次真实结局后，这里会按时间从上到下显示整条树状时间线。",
    worldlineEmptyShort: "尚未解锁",
    worldlineLockedTitle: "世界线尚未解锁",
    judgeTabTitle: "辅助AI回复",
    playerRound: (round: number) => `玩家 / R${round}`,
    participantRound: (name: string, round: number) => `${name} / R${round}`,
    narratorRound: (round: number) => `旁白 / R${round}`,
    historyEmpty: "目前还没有足够的历史对话。",
    endingState: "结局状态",
    roundDraftsEyebrow: "本轮草稿",
    roundDraftsTitle: "队伍公开行动草稿",
    roundRepliesTitle: "本轮回复",
    roundDraftCount: (count: number) => `已准备 ${count} 条草稿`,
    roundDraftsEmpty: "还没有草稿",
    roundRepliesEmpty: "当前还没有可展示的本轮回复。",
    roundDraftsDescription: "先准备本轮，再在这里检查 AI 队友的回复，然后统一提交。",
    primaryDraftLabel: "主玩家草稿",
    companionDraftLabel: "AI 队友草稿",
    aiDraftBadge: "AI",
    humanDraftBadge: "人类",
    editableDraftBadge: "可编辑",
    yourAction: "你的行动",
    actionTitle: "输入这一轮的行动或对话",
    endingFollowupTitle: "继续追问主持人或做结局复盘",
    storyControlLabel: "故事模式控制",
    storyControlAuto: "自动进行",
    storyControlIntervene: "玩家介入",
    inputLocked: "场景尚未准备完成，暂时不能输入。",
    preparingRoundHint: "AI 队友正在起草本轮回复。",
    commitRoundHint: (count: number) => `本轮已准备 ${count} 条草稿，可以统一提交。`,
    storyAutoHint: "自动进行中，AI 主玩家与队友准备完成后会自动统一提交。",
    storyAutoCountdownHint: (seconds: number) =>
      `自动进行倒计时中，将在 ${seconds} 秒后统一提交；现在切回“玩家介入”仍可打断。`,
    storyInterveneHint: "旁白稳定后，AI 主玩家会自动生成草稿；你可以修改后再统一提交。",
    aiDraftHint: "旁白稳定后，AI 主玩家会自动生成草稿；你可以在这里修改主草稿后再统一提交。",
    prepareRoundHint: "先准备本轮，让 AI 队友一起生成回复，再统一提交给主持人。",
    submitTurnHint: "输入后提交本轮行动。",
    endingFollowupHint: "本局已经结束，但你仍然可以继续向主持人追问、复盘，或确认隐藏信息；如果想回到节点重开分支，可以进入结算页面。",
    autoSubmittingRound: "自动提交中...",
    autoRunning: "自动进行中",
    autoCommitCountdown: (seconds: number) => `${seconds}s 后自动提交`,
    initPlaceholder: "会话正在初始化，正式开场完成后即可行动。",
    draftingPlaceholder: "AI 队友正在为本轮生成公开回复...",
    aiDraftPlaceholder: "旁白稳定后，AI 主玩家会先在这里生成下一步行动草稿。",
    aiDraftWaiting: "正在等待 AI 主玩家和队友完成本轮草稿。",
    autoModeLockedInput: "自动进行模式下会直接使用 AI 草稿推进；切到“玩家介入”后即可编辑。",
    actionPlaceholder: "例如：我先检查门后的痕迹，再追问为什么会在这个时间出现在这里。",
    endingFollowupPlaceholder: "例如：现在已经结局了，我想复盘一下，西厢房里真正发生了什么？",
    prepareRound: "准备本轮",
    preparingRound: "准备中...",
    commitRound: "统一提交",
    submitTurn: "提交本轮行动",
    endingFollowupSubmit: "发送追问",
    openSettlementPage: "进入结算页面",
    settlementPageTitle: "结算页面",
    settlementPageDescription: "这里集中查看已经解锁的世界线节点，并从任意可继续节点重新开始一条新分支。",
    settlementPageHint: "点击某个可继续节点后，会立即切回游戏界面，并从那个节点重新开始。",
    settlementNoEnding: "这条会话还没有锁定结局，因此暂时没有专用结算页内容。",
    backToGame: "返回游戏",
    saveLoadEyebrow: "保存 / 读取",
    loadSaveTitle: "读取存档",
    saveLoadDescription: "保存和读档保留在核心游戏界面的一线入口。",
    privateChatButton: "私聊",
    privateChatEyebrow: "AI 队友私聊",
    privateChatTitle: "同行者私聊线程",
    privateChatDescription: "在这里和 AI 队友单独对话，私聊不会混入公共剧情历史。",
    privateChatWithEyebrow: "当前线程",
    privateChatHistoryHint: "这条私聊只有你和这名队友可见。",
    privateChatTeammateHint: "点击后可以和这名队友单独交流。",
    privateChatSelectHint: "请先从左侧选择一名 AI 队友。",
    privateChatEmpty: "这条私聊线程还没有历史消息。",
    privateChatYou: "你",
    privateChatInputLabel: "私聊内容",
    privateChatInputPlaceholder: "例如：小点声，你真正注意到了什么？",
    privateChatSend: "发送私聊",
    privateChatSending: "发送中...",
    resizeSidePanel: "调整右侧面板大小",
    resizeComposer: "调整输入区大小",
    saveOpen: "打开",
    savedAt: (value: string) => `存档时间：${value}`,
    noLocalSaves: "当前还没有本地存档。",
    npcEyebrow: "NPC",
    npcTitle: "人物档案",
    npcDescription: "在这里查看 NPC 设定、当前立绘和生成结果。",
    loadingNpcFiles: "正在加载 NPC 文件...",
    noNpcFiles: "这个剧本暂时没有可读取的 NPC 档案。",
    missingNpcContentInfo: "这个存档缺少内容目录信息，因此无法加载 NPC 档案。",
    npcSelectHint: "请先从左侧选择一位 NPC。",
    generatePortrait: "生成立绘",
    generatingPortrait: "生成中...",
    noPortraitYet: "这个 NPC 暂时还没有立绘。",
    detailsEyebrow: "详情",
    detailsTitle: "会话详情",
    detailsDescription:
      "非核心信息放在这里，包括结局判定、回放日志、分支图与调试信息。",
    sessionInfo: "会话信息",
    sessionId: (value: string) => `Session ID：${value}`,
    content: (ruleTitle: string, storyTitle: string) => `内容：${ruleTitle} / ${storyTitle}`,
    endingJudge: "结局判定",
    endingJudgeGameOverTrue: "GameOver: True",
    endingJudgeGameOverFalse: "GameOver: False",
    endingJudgePending: "等待判定",
    endingJudgeStructuredJson: "结构化返回",
    manualNarrationTest: "手动主持人输出测试",
    manualNarrationTestDescription:
      "在这里直接输入一段主持人回复，系统会立刻把它写入当前会话，并运行辅助 AI 判断这是否已经是真正结局。",
    manualNarrationInputLabel: "手动主持人回复",
    manualNarrationInputPlaceholder:
      "例如：你们终于离开宅院，天色彻底放亮，这个故事到此结束。",
    manualNarrationSubmit: "写入并运行判定",
    manualNarrationSubmitting: "判定中...",
    noEndingJudge: "本轮还没有结局判定结果。",
    replayLog: "回放日志",
    noReplayLog: "当前没有可展示的回放事件。",
    quickEndingTest: "快速结局测试",
    branchGraph: "分支图"
  },
  settingsScreen: {
    title: "设置",
    description: "这里保存的是默认值。文本模型、图片模型和文生图模板都会在后续新游戏中自动带入。",
    generalEyebrow: "通用",
    generalTitle: "基础偏好",
    locale: "默认语言",
    playMode: "默认游戏模式",
    gmArchitecture: "默认主持架构",
    logViewMode: "默认日志显示",
    menuFontSize: "菜单字号",
    debugOptions: "调试选项",
    enableDebug: "默认开启调试信息",
    showAiMetadata: "显示 AI 耗时、Token 与费用",
    localSaveDirectory: "本地存档目录",
    localSaveDirectoryPlaceholder: "留空则回退到默认目录",
    localSaveDirectoryBrowse: "浏览文件夹",
    localSaveDirectoryBrowsing: "正在打开...",
    localSaveDirectoryHint: "这里填写服务端写入本地存档的目录路径。",
    localSaveDirectoryEffective: (value: string) => `当前实际保存位置：${value}`,
    localSaveDirectoryUsingDefault: "当前使用默认目录。清空后保存也会回到这里。",
    textModelEyebrow: "文本模型",
    textModelTitle: "文本模型配置",
    imageModelEyebrow: "图片模型",
    imageModelTitle: "文生图 Provider 配置",
    imagePromptEyebrow: "图像提示词",
    imagePromptTitle: "文生图模板",
    imagePromptDescription: "这里配置不同场景下的通用模板，实际生成时会与业务 prompt 自动拼接。",
    modelAccessMode: "模型接入模式",
    textModelProfile: "默认文本模型档案",
    imageModelProfile: "默认图片模型档案",
    apiKeyOverride: "API Key 覆盖",
    imageApiKeyOverride: "图片 API Key 覆盖",
    modelNameOverride: "模型名覆盖",
    imageModelNameOverride: "图片模型名覆盖",
    baseUrlOverride: "Base URL 覆盖",
    imageBaseUrlOverride: "图片 Base URL 覆盖",
    apiKeyPlaceholder: "留空则读取本地 .env",
    modelPlaceholder: "留空使用默认模型",
    baseUrlPlaceholder: "留空使用默认 Base URL",
    clearTextModelOverride: "清空当前文本模型覆盖",
    clearImageModelOverride: "清空当前图片模型覆盖",
    supported: "支持",
    unsupported: "不支持",
    referenceModel: (value: string) => ` / 参考模型：${value}`,
    defaultSelectedSummary: (name: string, status: string) => `当前默认：${name} / ${status}`,
    configStatusBuiltIn: "内置可用",
    configStatusLocalOverride: "已填写本地覆盖",
    configStatusConfigured: "已配置",
    configStatusMissing: "未配置",
    defaultTheme: "默认主题",
    defaultTrigger: "默认触发器",
    fallbackTemplate: "兜底模板",
    themeStyle: (themeKey: string) => `主题样式：${themeKey}`,
    triggerTemplate: (triggerKey: string) => `触发器模板：${triggerKey}`,
    characterClauseTemplate: "角色拼接模板",
    characterEntryTemplate: "角色条目模板",
    characterJoinSeparator: "角色连接符",
    saveSettings: "保存设置",
    resetDefaults: "恢复默认"
  },
  storySelectScreen: {
    title: "开始游戏",
    description: "先从规则和剧本里挑出这一局的舞台。左侧选规则，中间挑故事，右侧确认氛围与信息。",
    backLabel: "返回主菜单",
    closeLabel: "关闭",
    collapsedRuleLabel: "规则",
    collapsedStoryLabel: "剧本",
    expandAction: "展开",
    collapseAction: "收起",
    ruleEyebrow: "规则",
    ruleListTitle: "规则列表",
    storyEyebrow: "剧本",
    storyListTitle: "剧本列表",
    storyPreviewEyebrow: "剧本预览",
    splitterRuleStoryAria: "调整规则栏和剧本栏宽度",
    splitterStoryDetailAria: "调整剧本栏和详情栏宽度",
    playerCountSingle: (count: number) => `${count} 人`,
    playerCountRange: (min: number, max: number) => `${min}-${max} 人`,
    defaultRuleIntro:
      "这条规则暂时还没有提供 `intro.txt` 或 `intro.md`，当前先使用默认说明。你可以继续选择剧本并进入设置页，后续也可以再补完整的规则简介。",
    defaultStoryIntro:
      "这个剧本暂时还没有提供 `intro.txt` 或 `intro.md`，当前先使用默认说明。你仍然可以进入游戏，后续再补完整简介和演出文本。",
    defaultCoverCopy:
      "当前剧本暂时没有提供 `cover.png`，这里先使用默认封面区。后续只要在剧本目录放入 `cover.png`、`cover.jpg` 或 `cover.webp`，这里就会自动读取。",
    defaultCoverQuote:
      "当前剧本还没有单独提供封面短句，所以这里先回退到剧本简介摘要。",
    coverAlt: (storyTitle: string) => `${storyTitle} 封面`,
    openCoverAria: "查看大图",
    closeCoverAria: "收起大图",
    openCoverButton: "查看大图",
    storyIntroLabel: "剧本简介",
    ruleIntroLabel: "规则简介",
    tagsLabel: "标签",
    pacingLengthLabel: "节奏与时长",
    contentWarnings: (value: string) => `内容警告：${value}`,
    startAdventure: "开始冒险",
    empty: "还没有可用的规则与剧本，请先检查内容包是否已经加载成功。",
    coverDialogAria: "剧本封面大图预览",
    closeCoverDialogAria: "关闭大图预览",
    closeImageButton: "收起图片",
    coverDialogAlt: (storyTitle: string) => `${storyTitle} 封面大图`
  },
  gameSetupScreen: {
    titleFallback: "游戏设置",
    description: "最后确认这一局的主持方式、模型入口和角色概念，然后再真正开局。",
    backLabel: "返回选剧本",
    closeLabel: "关闭",
    detailTabs: {
      game: {
        label: "游戏设置",
        description: "语言、主持方式、显示和游玩节奏相关配置。"
      },
      model: {
        label: "模型设置",
        description: "模型入口、档案与当前能力概览。"
      },
      companions: {
        label: "同行者设置",
        description: "AI 同伴入口、内容边界与后续扩展位。"
      }
    },
    fields: {
      languageLabel: "语言",
      languageHint: "控制内容文本和界面的基础语言。",
      difficultyLabel: "难度",
      difficultyHint: "难度还没接入真实裁定，当前先固定为标准。",
      difficultyStandardPending: "标准（待开发）",
      gmArchitectureLabel: "主持架构",
      gmArchitectureHint: "为单 Agent / 多 Agent 主持预留统一入口。",
      playModeLabel: "游戏模式",
      playModeHint: "当前阶段支持单人、故事模式、单人 + NPC 和多人入口。",
      modelModeLabel: "模型模式",
      modelModeHint: "决定这局是纯 mock，还是通过代理接入真实模型。",
      modelProfileLabel: "模型档案",
      modelProfileHint: "这里只负责选择本局要使用的模型档案。",
      logViewLabel: "日志显示",
      logViewHint: "控制日志区域的细粒度，方便游玩或排查。",
      previewDeliveryLabel: "开场传输",
      previewDeliveryHint: "流式会边生成边显示；完整传输会等待全文完成后再显示。",
      markdownFontSizeLabel: "Markdown 字号",
      markdownFontSizeHint: "控制 AI 正文、标题和列表的渲染大小。",
      debugModeLabel: "调试模式",
      debugModeHint: "当前主要用于调试模型与运行时日志。",
      debugOn: "开启",
      debugOff: "关闭"
    },
    overview: {
      eyebrow: "设置概览",
      title: "设置概览",
      gameTitle: "游戏设置",
      gameDescription: "管理语言、主持架构和本局的基础游玩方式。",
      modelTitle: "模型设置",
      modelDescription: "选择本局使用的模型入口、档案以及显示偏好。",
      currentRunTitle: "当前局面概览"
    },
    currentRun: {
      rule: (value: string) => `规则：${value}`,
      story: (value: string) => `剧本：${value}`,
      tags: (value: string) => `标签：${value}`,
      gmStyle: (value: string) => `主持风格：${value}`,
      noRule: "未选择规则",
      noStory: "未选择剧本",
      undecided: "待定"
    },
    model: {
      entryTitle: "模型入口设置",
      capabilitiesTitle: "模型能力",
      capabilitiesDescription: "这里会告诉你当前模型档案是否支持文件上传、深度思考、工具调用等能力。",
      noCapabilities: "当前没有可用模型档案，暂时无法显示能力信息。",
      summaryTitle: "当前模型概览",
      currentProfile: (value: string) => `当前档案：${value}`,
      accessMode: (value: string) => `入口：${value}`,
      profile: (value: string) => `档案：${value}`,
      resolvedModel: (value: string) => `实际模型：${value}`,
      status: (value: string) => `状态：${value}`,
      message: (value: string) => `说明：${value}`,
      supported: "支持",
      unsupported: "不支持",
      referenceModel: (value: string) => `参考模型：${value}`,
      officialDocs: "官方说明",
      noSpecificModel: "未标注具体模型",
      noExplanation: "未提供说明",
      notConfigured: "未配置",
      ready: "可创建会话",
      needsConfig: "还需补全配置"
    },
    preview: {
      eyebrow: "开场预览",
      title: "开场预览",
      regenerate: "重新生成开场白",
      regenerateBusy: "生成中...",
      coverAlt: (storyTitle: string) => `${storyTitle} 封面`,
      openCoverAria: "查看大图",
      openCoverButton: "查看大图",
      fallbackStoryTitle: "未选择剧本",
      generatingText: "正在生成 AI 开场预览...",
      streamingText: "正在流式接收开场预览...",
      waitingText: "正在等待完整开场预览...",
      provider: (provider: string) => `来源：${provider}`
    },
    characterSetup: {
      eyebrow: "角色设定",
      title: "你是谁？",
      description: "可以先自己写，也可以基于开场白让 AI 生成或补全一版角色概念。",
      placeholder: "例如：我是来寻找失踪姐姐的纪录片学生，擅长摄影，但对湖边大火有难以解释的既视感。",
      generateButton: "AI 生成",
      completeButton: "AI 补全",
      generating: "AI 正在生成角色概念...",
      completing: "AI 正在补全角色概念..."
    },
    companions: {
      eyebrow: "同行者",
      title: "同行者设置",
      description: "这里集中管理 AI 队友名单、名字和人格标签，并保留后续私聊扩展位。",
      entryTitle: "AI 同伴入口",
      entryDescription: "普通模式下，人类玩家与 AI 队友一起行动；你可以先在这里搭好本局的队伍。",
      storyModeDescription: "故事模式下，主玩家会改为 AI 主角；这里添加的 AI 队友会和它一起参与剧情。",
      count: (value: number) => `当前 AI 队友：${value} 名`,
      emptyTitle: "还没有 AI 队友",
      emptyDescription: "点击下方按钮先添加一名 AI 队友，然后为它设置名字和人格标签。",
      addTitle: "添加同伴",
      addDescription: "最多支持 3 名 AI 队友。每名队友都可以自定义名字和多选人格。",
      addButton: "+ 添加同伴",
      loadPresetButton: "读取配置",
      savedPresetCount: (value: number) => `本地已保存配置：${value} 个`,
      limitReached: "当前 MVP 最多添加 3 名 AI 队友。",
      memberTitle: (value: number) => `AI队友 ${value}`,
      nameLabel: "名字",
      namePlaceholder: (value: number) => `例如：AI队友${value}`,
      selectedCount: (value: number) => `已选人格标签：${value} 个`,
      selectedPreviewEmpty: "还没有选择人格标签。",
      savePresetButton: "保存配置",
      configureButton: "设置性格",
      configureDescription: "点击进入独立性格界面，为这名 AI 队友挑选或调整人格标签。",
      tagHint: "点击下方人格标签即可多选；悬停时可以查看描述。",
      loadPresetTitle: "读取 AI 队友配置",
      loadPresetDescription: "这里会列出保存在本地浏览器里的 AI 队友配置，读取后会直接加入当前队伍。",
      usePresetButton: "读取这个配置",
      presetNameFallback: "未命名 AI 队友",
      presetSavedAt: (value: string) => `最近保存：${value}`,
      noSavedPresets: "本地还没有保存过 AI 队友配置。",
      removeButton: "移除",
      noTags: "人格标签尚未加载完成。",
      basicPositiveLabel: "基础正向",
      basicNegativeLabel: "基础负向",
      advancedPositiveLabel: "高级正向",
      advancedNegativeLabel: "高级负向",
      warningsTitle: "内容警告"
    },
    layout: {
      collapsedConfigLabel: "配置",
      collapsedAllyLabel: "同行者",
      expandAction: "展开",
      detailButton: "详情",
      collapseButton: "收起",
      leftResizeAria: "调整左侧配置栏宽度",
      rightResizeAria: "调整右侧同行者栏宽度"
    },
    actions: {
      startGame: "开始游戏",
      creatingSession: "正在创建会话..."
    },
    modal: {
      ariaLabel: "设置详情",
      titleFallback: "设置详情",
      close: "关闭",
      categoryTabsAria: "设置分类"
    },
    coverDialogAria: "剧本封面大图预览",
    closeCoverDialogAria: "关闭大图预览",
    closeImageButton: "收起图片",
    coverDialogAlt: (storyTitle: string) => `${storyTitle} 封面大图`
  },
  gameBootstrapScreen: {
    fallbackStoryTitle: "正在准备会话",
    progressTitle: "初始化进度",
    progressLabel: (percent: number) => `${percent}%`,
    waitHint: "游戏初始化通常需要等待30s左右，感谢您的耐心等待！",
    tipLabel: "游玩小贴士",
    defaultLoadingHint: (storyTitle: string) =>
      `正在载入《${storyTitle}》并准备第一段正式叙事。`,
    coverAlt: (storyTitle: string) => `${storyTitle} 封面`,
    fallbackCoverTitle: "暂无封面预览",
    fallbackCoverDescription: "如果这个剧本包提供了 cover.png，这里会自动显示。",
    tips: [
      "保存和读档保留在主界面一级入口，重要选择前可以随时留档。",
      "NPC 面板里可以查看角色档案，后续也会在这里接入立绘生成。",
      "详情面板集中放结局判定、回放日志和分支图，不会打扰主游玩视线。",
      "设置页可以统一调整文本模型、图像模型和文生图模板。",
      "如果开场气质不对，可以回到 beginning 重写角色设定后重新开始。"
    ]
  },
  playthroughGraph: {
    openingTitle: "开场",
    endingTitle: (round: number) => `结局 / R${round}`,
    debriefTitle: "复盘",
    epilogueTitle: "后日谈",
    roundTitle: (round: number) => `回合 ${round}`,
    endingShortLabel: "ENDING",
    debriefShortLabel: "复盘",
    epilogueShortLabel: "尾声",
    manualShortLabel: "手动",
    roundShortLabel: "回合",
    eyebrow: "分支回溯树",
    title: (count: number) => `已在结局后解锁，共 ${count} 个节点`,
    description: "现在可以直接拖动节点重排视图，连线会实时跟随更新。",
    expandAriaLabel: "放大分支回溯树",
    collapseAriaLabel: "收起分支回溯树",
    expandButton: "放大",
    collapseButton: "收起",
    legendMainline: "主线 / 棕红",
    legendBranch: "分支 / 青绿",
    legendAfterEnding: "结局后 / 紫色",
    noExtraSummary: "该节点暂无额外摘要。",
    currentNode: "当前节点",
    endingLeaf: "结局叶节点",
    resumeBusy: "恢复中...",
    continueFromHere: "从此继续"
  }
} as const;

export type ZhCnText = typeof zhCn;







