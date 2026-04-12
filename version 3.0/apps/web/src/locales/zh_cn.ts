export const zhCn = {
  appName: "AI TRPG 3.0",
  screenHeader: {
    defaultBackLabel: "返回主菜单",
    defaultCloseLabel: "关闭"
  },
  common: {
    none: "暂无",
    noContent: "暂无内容。",
    backToMenu: "返回主菜单",
    close: "关闭",
    save: "保存",
    load: "读档",
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
    prompt: "Prompt"
  },
  options: {
    playModes: [
      {
        value: "single_player",
        label: "单人模式",
        description: "由你一个人推进剧情，适合最轻量的体验。"
      },
      {
        value: "single_player_with_npc",
        label: "单人 + NPC",
        description: "除你之外还会有 AI 同伴参与讨论与行动。"
      },
      {
        value: "multiplayer",
        label: "多人模式",
        description: "为后续联机流程预留，当前仍以单机路径为主。"
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
        description: "只保留关键信息，适合正常游玩。"
      },
      {
        value: "hidden",
        label: "隐藏日志",
        description: "将日志区收敛为最低打扰。"
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
        description: "适合更重视可读性的阅读体验。"
      },
      {
        value: "xxlarge",
        label: "超大（22px）",
        description: "适合远距离观看或高缩放场景。"
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
        description: "让菜单按钮、标题和说明字更易读。"
      },
      {
        value: "xlarge",
        label: "大字（120%）",
        description: "适合偏好更明显字号层级的界面阅读。"
      },
      {
        value: "xxlarge",
        label: "超大（130%）",
        description: "适合远距离观看或高分辨率大屏。"
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
        description: "等待全文完成后再一次性渲染。"
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
    status: {
      submitTurnPending: "正在提交本轮行动...",
      turnComplete: "本轮行动已完成。",
      turnCompleteEnded: "本轮行动已完成，并且本局已进入结局。",
      createSessionPending: "正在进入游戏并创建会话...",
      narratorConnected: "旁白已连接，正式开场正在展开……",
      sessionCreated: "会话已创建。",
      sessionCreatedWithCharacter: "会话已创建，角色设定已并入开场。",
      startGameFirst: "请先开始一局游戏。",
      enterAction: "请输入本轮行动。",
      quickEndingMockOnly: "快速结局测试仅在 mock 模式下可用。",
      noActiveSessionToSave: "当前没有可保存的活动会话。",
      creatingLocalSave: "正在创建本地存档...",
      localSaveCreated: "本地存档已创建。",
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
      waitOpeningPreviewBeforeAssist: "请先等开场预览生成完成，再使用角色设定 AI 辅助。",
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
        detail: "已切换到核心游玩界面，正在准备正式会话。",
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
        detail: "正在把开场材料发送给模型，并准备第一段叙事。",
        progress: 0.64
      },
      waiting_first_reply: {
        label: "等待首条叙事",
        detail: "模型已经开始处理开场，正在等待第一段正式 narration 返回。",
        progress: 0.84
      },
      finalizing_session: {
        label: "写入会话快照",
        detail: "正在把首条叙事和本局设置写入正式会话。",
        progress: 0.96
      }
    }
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
    description: "网页版无法稳定直接退出程序，所以这里先提供退出前的整理操作。",
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
    empty: "待开发"
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
    playerRound: (round: number) => `玩家 / R${round}`,
    narratorRound: (round: number) => `旁白 / R${round}`,
    historyEmpty: "目前还没有足够的历史对话。",
    endingState: "结局状态",
    yourAction: "你的行动",
    actionTitle: "输入这一轮的行动或对话",
    inputLocked: "场景尚未准备完成，暂时不能输入。",
    submitTurnHint: "提交本轮行动。",
    initPlaceholder: "会话正在初始化，正式开场完成后即可行动。",
    actionPlaceholder: "例如：我先查看门后的痕迹，再追问为什么会在这个时间出现。",
    submitTurn: "提交本轮行动",
    saveLoadEyebrow: "保存 / 读档",
    loadSaveTitle: "读档",
    saveLoadDescription: "保存和读档保留在核心游玩界面的一级入口。",
    saveOpen: "打开",
    savedAt: (value: string) => `存档时间：${value}`,
    noLocalSaves: "当前还没有本地存档。",
    npcEyebrow: "NPC",
    npcTitle: "人物档案",
    npcDescription: "在这里查看 NPC 设定、当前立绘和生成结果。",
    loadingNpcFiles: "正在加载 NPC 文件...",
    noNpcFiles: "这个剧本暂时没有可读取的 NPC 档案。",
    npcSelectHint: "请先从左侧选择一位 NPC。",
    generatePortrait: "生成立绘",
    generatingPortrait: "生成中...",
    noPortraitYet: "这个 NPC 暂时还没有立绘。",
    detailsEyebrow: "详情",
    detailsTitle: "会话详情",
    detailsDescription: "非核心信息放在这里，包括结局判定、回放日志、分支图与调试信息。",
    sessionInfo: "会话信息",
    sessionId: (value: string) => `Session ID：${value}`,
    content: (ruleTitle: string, storyTitle: string) => `内容：${ruleTitle} / ${storyTitle}`,
    endingJudge: "结局判定 JSON",
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
  }
} as const;

export type ZhCnText = typeof zhCn;
