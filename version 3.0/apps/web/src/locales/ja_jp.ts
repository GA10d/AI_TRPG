import type { UiText } from "./types.ts";

export const jaJp = {
  appName: "AI TRPG 3.0",
  screenHeader: {
    defaultBackLabel: "戻る",
    defaultCloseLabel: "閉じる"
  },
  common: {
    none: "なし",
    noContent: "まだ内容はありません。",
    backToMenu: "メニューへ戻る",
    close: "閉じる",
    save: "保存",
    load: "読み込む",
    open: "開く",
    delete: "削除",
    details: "詳細",
    npc: "NPC",
    expand: "展開",
    collapse: "折りたたむ",
    loading: "読み込み中...",
    generating: "生成中...",
    creating: "作成中...",
    clear: "クリア",
    provider: "プロバイダ",
    prompt: "プロンプト"
  },
  options: {
    playModes: [
      {
        value: "single_player",
        label: "シングルプレイ",
        description: "あなた一人で物語を進める軽量なプレイモードです。"
      },
      {
        value: "story_mode",
        label: "ストーリーモード",
        description: "主役が AI 主人公になり、あなたはその行動を段階的に介入・調整できます。"
      },
      {
        value: "single_player_with_npc",
        label: "シングル + NPC",
        description: "AI の同行者が会話や行動に参加します。"
      },
      {
        value: "multiplayer",
        label: "マルチプレイ",
        description: "将来の連携プレイ向け入口です。現行 MVP はローカル体験が中心です。"
      }
    ],
    gmArchitectures: [
      {
        value: "single_agent",
        label: "単一 Agent GM",
        description: "1 つのナレーターが進行と NPC 演出をまとめて担当します。"
      },
      {
        value: "multi_agent",
        label: "マルチ Agent GM",
        description: "将来の複数エージェント協調向け入口です。現行版は単一ナレーター中心です。"
      }
    ],
    logViews: [
      {
        value: "all",
        label: "完全ログ",
        description: "デバッグや確認のために実行ログをすべて表示します。"
      },
      {
        value: "compact",
        label: "簡易ログ",
        description: "通常プレイに必要な情報だけを残します。"
      },
      {
        value: "hidden",
        label: "非表示",
        description: "ログ表示を最小限に抑えます。"
      }
    ],
    markdownFontSizes: [
      {
        value: "standard",
        label: "標準 (16px)",
        description: "デスクトップで読みやすい標準サイズです。"
      },
      {
        value: "large",
        label: "大 (18px)",
        description: "長めの本文を少し広めに読めます。"
      },
      {
        value: "xlarge",
        label: "特大 (20px)",
        description: "より強い可読性を重視したサイズです。"
      },
      {
        value: "xxlarge",
        label: "最大 (22px)",
        description: "拡大表示や距離のある閲覧に向いています。"
      }
    ],
    menuFontSizes: [
      {
        value: "standard",
        label: "標準 (100%)",
        description: "現在のメニュー倍率を維持します。"
      },
      {
        value: "large",
        label: "大 (110%)",
        description: "ボタンや見出しを少し見やすくします。"
      },
      {
        value: "xlarge",
        label: "特大 (120%)",
        description: "メニュー全体をより大きく表示します。"
      },
      {
        value: "xxlarge",
        label: "最大 (130%)",
        description: "大画面や離れた位置からの閲覧に向いています。"
      }
    ],
    openingPreviewDelivery: [
      {
        value: "stream",
        label: "ストリーム優先",
        description: "生成しながら開場プレビューを表示します。"
      },
      {
        value: "complete",
        label: "全文完了待ち",
        description: "全文がそろってからまとめて表示します。"
      }
    ],
    imageTriggers: [
      { value: "manual", label: "手動生成" },
      { value: "character_portrait", label: "キャラクター立ち絵" },
      { value: "npc_intro", label: "NPC 紹介" },
      { value: "scene_shift", label: "シーン転換" }
    ]
  },
  helperText: {
    previewFallbackLines: [
      "部屋の空気だけが先に立ち上がり、古いテープの声はまだ輪郭を持っていません。",
      "このプレビュー領域は、あとで本物の開場生成に置き換わります。",
      "今は選んだルールと物語設定から、最初の雰囲気だけを先に組み立てています。"
    ],
    aiMeta: {
      source: (provider: string) => `提供元: ${provider}`,
      duration: (seconds: string) => `所要時間: ${seconds}s`,
      tokens: (count: number) => `Tokens: ${count}`,
      cost: (currencySymbol: string, amount: string) => `コスト: ${currencySymbol}${amount}`,
      pendingCost: "コスト: 後で補完",
      separator: " | "
    }
  },
  app: {
    saveDirectoryPrompt: {
      title: "ローカル保存先フォルダを入力してください。",
      hint: "保存先は後から設定画面でも変更できます。"
    },
    status: {
      submitTurnPending: "このターンを送信しています...",
      preparingRoundDrafts: "このラウンドのパーティ草稿を準備しています...",
      preparingAiLeaderDraft: "AI主人公が次の行動草稿を作成しています...",
      roundDraftsReady: "このラウンドの草稿がそろいました。確認してからまとめて送信できます。",
      prepareRoundLogStart: (round: number) => `ラウンド ${round} の草稿準備を開始しました。`,
      prepareRoundLogPrimaryAi: (name: string) =>
        `段階 1: AI主役「${name}」の草稿を生成しています。`,
      prepareRoundLogPrimaryHuman: "段階 1: 主プレイヤー入力を記録しました。",
      prepareRoundLogCompanions: (count: number, names: string) =>
        `段階 2: ${count} 名のAI仲間草稿を並列生成します${names ? `: ${names}` : ""}。`,
      prepareRoundLogWait:
        "サーバー側で草稿生成が完了するのを待っています。長くここで止まる場合、たいていモデルがまだ生成中です。",
      prepareRoundLogDone: (count: number) =>
        `草稿準備が完了しました。このラウンドの草稿は ${count} 件です。`,
      prepareRoundLogFailed: (reason: string) => `草稿準備に失敗しました: ${reason}`,
      enterPrivateChat: "先に個別チャットの内容を入力してください。",
      sendingPrivateChat: "個別チャットを送信しています...",
      privateChatSent: "個別チャットを送信しました。",
      storyControlSwitching: "ストーリーモードの制御を切り替えています...",
      storyControlAutoEnabled:
        "自動進行に切り替えました。以降のラウンドは自動で準備され、そのまま送信されます。",
      storyControlInterveneEnabled:
        "プレイヤー介入に切り替えました。AI主人公の草稿を再び編集できます。",
      autoRoundSubmitting: "自動進行でこのラウンドをまとめて送信しています...",
      commitRoundLogCountdown: (seconds: number) =>
        `草稿の準備ができました。${seconds} 秒後に自動送信します。`,
      commitRoundLogStart: (round: number, count: number) =>
        `ラウンド ${round} を送信しています。パーティ入力は ${count} 件です。`,
      commitRoundLogWait: "ナレーター応答とエンディング判定の返却を待っています。",
      commitRoundLogDone: (round: number) => `ラウンド ${round} の送信が完了しました。`,
      commitRoundLogFailed: (reason: string) => `ラウンド送信に失敗しました: ${reason}`,
      autoModeSubmitLocked: "自動進行中のため、手動送信はできません。",
      reasonerTimeoutHint:
        "このセッションは DeepSeek Reasoner を使っています。タイムアウトが続く場合は TRPG_DEEPSEEK_REASONER_TIMEOUT_MS または TRPG_SERVER_PROXY_TIMEOUT_MS を上げてください。",
      privateChatAutoModeUnavailable:
        "自動進行中は個別チャットを使えません。先にプレイヤー介入へ切り替えてください。",
      turnComplete: "このターンは完了しました。",
      turnCompleteEnded: "このターンは完了し、セッションはエンディングに入りました。",
      endingFollowupComplete:
        "エンディング後の追問を送信しました。ナレーターはこの世界線で応答を続けます。",
      createSessionPending: "ゲームに入り、セッションを作成しています...",
      narratorConnected: "ナレーターに接続しました。正式な導入が始まっています...",
      sessionCreated: "セッションを作成しました。",
      sessionCreatedWithCharacter:
        "セッションを作成し、キャラクター設定を導入に反映しました。",
      startGameFirst: "先にゲームを開始してください。",
      enterAction: "このターンの行動を入力してください。",
      quickEndingMockOnly: "クイックエンディングテストは mock モードでのみ使えます。",
      quickEndingDraftModeUnavailable:
        "パーティ草稿の編成中はクイックエンディングテストを使えません。",
      quickEndingTestPending: "mock エンディングテストを実行しています...",
      quickEndingTestSuccess: "mock エンディングテストを送信しました。",
      quickEndingTestEnded:
        "mock エンディングテストが成功し、セッションはエンディングに入りました。",
      enterManualNarration: "先にナレーター返信を入力してください。",
      manualNarrationPending: "手動ナレーター返信をエンディング判定にかけています...",
      manualNarrationSuccess: "手動ナレーター返信を記録し、判定を完了しました。",
      manualNarrationEnded: "手動ナレーター返信でエンディングが確定しました。",
      dismissEndingUnavailable: "取り消せるエンディング状態はまだありません。",
      dismissEndingPending: "誤判定だったエンディングを取り消しています...",
      dismissEndingSuccess: "エンディング状態を解除しました。通常の進行へ戻れます。",
      noActiveSessionToSave: "保存できるアクティブなセッションがありません。",
      creatingLocalSave: "ローカルセーブを作成しています...",
      localSaveCreated: "ローカルセーブを作成しました。",
      localSaveDirectorySelectionCancelled:
        "保存先の選択がキャンセルされたため、今回の保存は続行されませんでした。",
      loadingSelectedSave: "選択したセーブを読み込んでいます...",
      noRecentSave: "最近のセーブはまだありません。",
      noRecentSnapshot: "最近のローカルスナップショットはまだありません。",
      restoringLatestSnapshot: "サーバーから最新スナップショットを復元しています...",
      latestSessionSynced: "最新セッションをサーバーから同期しました。",
      localSnapshotOpenedInstead:
        "サーバー側のコピーが見つからなかったため、代わりにローカルスナップショットを開きました。",
      nodeCannotResume:
        "このノードは再開できないか、対応するローカルスナップショットが不足しています。",
      switchingNode:
        "選択したノードへ切り替え、分岐コンテキストを再構築しています...",
      switchedNode:
        "選択したノードへ切り替えました。次のターンはここから新しい分岐として伸びます。",
      defaultSettingsSaved: "既定設定を保存しました。",
      defaultsRestored: "既定設定を復元しました。",
      recentSnapshotCleared: "最近のスナップショットを削除しました。",
      localSavesCleared: "ローカルセーブ一覧をクリアしました。",
      recentSaveDeleted: "最近のセーブを削除しました。",
      saveDeleted: "セーブを削除しました。",
      exportingSaveAsText: "セーブ本文を書き出しています...",
      exportedSaveAsText: "セーブ本文を書き出しました。",
      exportingComicHtml: "漫画 HTML を書き出しています...",
      exportedComicHtml: "漫画 HTML を書き出しました。",
      exportingCombinedHtml: "本文 + 漫画 HTML を書き出しています...",
      exportedCombinedHtml: "本文 + 漫画 HTML を書き出しました。",
      noWorldlineComicForSave: "このセーブには世界線漫画がまだ紐付いていません。",
      noComicPagesToExport: "書き出せる漫画ページがまだありません。",
      closeTabManually:
        "ページがまだ開いている場合は、ブラウザのタブを手動で閉じてください。",
      waitOpeningPreviewBeforeAssist:
        "AI キャラクター補助を使う前に、開場プレビューの生成完了を待ってください。",
      aiDraftingCharacterConcept: "AI がキャラクター案を作成しています...",
      aiCompletingCharacterConcept: "AI が現在のキャラクター案を補完しています...",
      aiDraftedCharacterConcept:
        "AI がキャラクター案の下書きを生成しました。続けて編集できます。",
      aiCompletedCharacterConcept:
        "AI がキャラクター案を補完しました。続けて編集できます。",
      selectStoryFirst: "先に利用可能な物語を選んでください。",
      noPlayableStory: "現在利用できるルールパックまたは物語パックがありません。"
    },
    bootstrapStages: {
      entered_game: {
        label: "ゲーム画面へ移動",
        detail: "すでにコアプレイ画面へ入り、正式なセッション準備を進めています。",
        progress: 0.08
      },
      loading_content: {
        label: "ルールと物語を読み込み中",
        detail: "この導入に必要な rule / story コンテンツを読んでいます。",
        progress: 0.2
      },
      assembling_prompt: {
        label: "Narrator 入力を組み立て中",
        detail: "narrator prompt、rule.txt、story.txt、player info をまとめています。",
        progress: 0.42
      },
      requesting_narrator: {
        label: "Narrator Agent を呼び出し中",
        detail: "導入素材をモデルへ送り、最初の語りを準備しています。",
        progress: 0.64
      },
      waiting_first_reply: {
        label: "最初の応答を待機中",
        detail: "モデルが導入を処理しており、最初の narration を待っています。",
        progress: 0.84
      },
      finalizing_session: {
        label: "セッションスナップショットを書き込み中",
        detail: "最初の語りと現在の設定を正式なセッションへ保存しています。",
        progress: 0.96
      }
    },
    pendingSessionSystemMessage: (storyTitle: string, locale: string) =>
      `${storyTitle} (${locale}) のセッションを作成しています。`,
    pendingSessionReplaySummary: "セッション初期化を開始しました",
    pendingPlayerName: "プレイヤー",
    pendingNarratorName: "ナレーター",
    quickEndingTestInput: "mock エンディングを即時に発生させて、そのまま escape する。"
  },
  mainMenu: {
    eyebrow: "メインメニュー",
    title: "AI TRPG 3.0",
    description:
      "テキスト叙述を中心にした AI TRPG プロトタイプです。ここから新しいゲームを始めたり、最近の進行を再開したり、既定のモデルや言語設定を調整できます。",
    buttons: {
      newGame: "ゲーム開始",
      continue: "続きから",
      records: "記録",
      settings: "設定",
      exit: "終了"
    },
    footer: {
      about: "この作品について",
      contact: "お問い合わせ"
    },
    feed: {
      eyebrow: "お知らせ",
      title: "更新情報",
      description: "最近のビルド更新や開発状況をここに表示します。",
      showMore: "もっと見る..."
    },
    recentProgress: {
      label: "最近の進行",
      roundAndStatus: (round: number, status: string) => `ラウンド ${round} / 状態: ${status}`,
      updatedAt: (value: string) => `更新時刻: ${value}`,
      empty: "続きから始められるローカル進行はまだありません。"
    },
    defaults: {
      label: "現在の既定設定",
      locale: (value: string) => `言語: ${value}`,
      playMode: (value: string) => `モード: ${value}`,
      gmArchitecture: (value: string) => `GM 構成: ${value}`,
      modelAccessMode: (value: string) => `モデルモード: ${value}`,
      modelProfile: (value: string) => `モデルプロファイル: ${value}`
    },
    uiLanguageAriaLabel: "UI 言語を選択",
    splitterAriaLabel: "ドラッグしてメインメニューの列幅を変更"
  },
  continueScreen: {
    title: "続きから",
    description:
      "まず手動セーブから復元できます。まだなければ最新スナップショットから再開できます。",
    empty: "今すぐ再開できるセーブや進行はありません。",
    recentSave: "最近のセーブ",
    recentSnapshot: "最近のスナップショット",
    rule: (value: string) => `ルール: ${value}`,
    status: (value: string) => `状態: ${value}`,
    round: (value: number) => `ラウンド: ${value}`,
    model: (value: string) => `モデル: ${value}`,
    savedAt: (value: string) => `保存日時: ${value}`,
    updatedAt: (value: string) => `更新日時: ${value}`,
    continueSave: "最近のセーブを続ける",
    continueSnapshot: "最近のスナップショットを続ける",
    restoring: "復元中...",
    removeRecentSave: "最近のセーブを削除",
    clearRecentSnapshot: "最近のスナップショットをクリア"
  },
  exitScreen: {
    title: "終了",
    description:
      "Web 版は自動で確実に閉じられないため、ここで一度区切りを付けてから離脱できます。",
    noteTitle: "終了前に",
    noteBody:
      "今の画面だけを離れたいならメインメニューへ戻ってください。完全に閉じる場合はブラウザタブを閉じてください。",
    buttons: {
      tryCloseWindow: "ウィンドウを閉じる",
      clearRecent: "最近の進行を消去",
      clearRecords: "セーブ一覧を消去"
    }
  },
  recordsScreen: {
    title: "記録",
    description:
      "ローカルセーブを一覧し、テキスト、漫画 HTML、本文と漫画を対応づけた HTML を書き出せます。",
    empty: "書き出し可能なローカルセーブはまだありません。",
    clearAll: "全セーブをクリア",
    loadSave: "セーブを読み込む",
    loadingSave: "読み込み中...",
    exportText: "テキストを書き出す",
    exportingText: "テキストを書き出し中...",
    exportComicHtml: "漫画 HTML を書き出す",
    exportingComicHtml: "漫画 HTML を書き出し中...",
    exportCombinedHtml: "本文+漫画 HTML を書き出す",
    exportingCombinedHtml: "本文+漫画 HTML を書き出し中...",
    savedAt: (value: string) => `保存日時: ${value}`,
    updatedAt: (value: string) => `更新日時: ${value}`,
    locale: (value: string) => `言語: ${value}`,
    worldline: (value: string) => `世界線: ${value}`,
    noComicWorldline: "このセーブには世界線漫画が紐付いていないため、テキストのみ書き出せます。"
  },
  gameScreen: {
    emptyTitle: "????",
    emptyDescription: "????????????????????",
    emptyState: "?????????????????????",
    heroEyebrow: "?????",
    creatingSession: "????????",
    openingScene: "????????",
    ended: "????????",
    inProgress: "???",
    currentNarration: "?????",
    endedTitle: "??????????????????",
    joiningSceneTitle: "????????????????",
    advancingStoryTitle: "???????????????",
    bootstrapEyebrow: "????????",
    bootstrapWaiting:
      "????????????????????? narration ?????????????????",
    noNarrationYet: "?? narration ???????",
    recentContext: "?????",
    recentContextTitle: "????????????",
    recentItems: (count: number) => `${count} ?`,
    historyTab: "履歴",
    roundRepliesTab: "このラウンド",
    reasoningTab: "推理内容",
    worldlineTab: "世界線",
    judgeTab: "補助AI",
    endingJudgeSideLabel: "補助判定",
    reasoningEyebrow: "推理内容",
    reasoningTitle: "モデル推理ログ",
    reasoningCount: (count: number) => `${count} 件`,
    worldlineEyebrow: "世界線検索",
    worldlineTitle: "分岐タイムライン",
    worldlineNodeCount: (count: number) => `${count} ノード`,
    worldlineEmpty:
      "まだ参照できる世界線ノードは解放されていません。真のエンディング到達後に、ここへ上から下へ表示されます。",
    worldlineEmptyShort: "未解放",
    worldlineLockedTitle: "世界線はまだ未解放",
    judgeTabTitle: "補助AIの返信",
    playerRound: (round: number) => `????? / R${round}`,
    participantRound: (name: string, round: number) => `${name} / R${round}`,
    narratorRound: (round: number) => `????? / R${round}`,
    historyEmpty: "???????????????????",
    endingState: "????????",
    roundDraftsEyebrow: "??????",
    roundDraftsTitle: "????????",
    roundRepliesTitle: "このラウンドの返信",
    roundDraftCount: (count: number) => `${count} ?????????`,
    roundDraftsEmpty: "??????????",
    roundRepliesEmpty: "このラウンドの返信はまだありません。",
    reasoningEmpty: "まだ確認できる推理内容はありません。",
    reasoningOutputLabel: "Output",
    reasoningContentLabel: "Reasoning content",
    reasoningCommittedLabel: "送信済み",
    reasoningPrimaryDraftLabel: "主プレイヤー草稿",
    reasoningCompanionDraftLabel: "AI仲間草稿",
    roundDraftsDescription:
      "???????????????AI??????????????????????????",
    primaryDraftLabel: "????????",
    companionDraftLabel: "AI????",
    aiDraftBadge: "AI",
    humanDraftBadge: "Human",
    editableDraftBadge: "???",
    yourAction: "??????",
    actionTitle: "????????????",
    activityLogEyebrow: "実行ログ",
    activityLogTitle: "自動進行と状態",
    activityLogCount: (count: number) => `${count} 件`,
    activityLogCurrentStatus: "現在の状態",
    activityLogIdle: "新しい実行ログはまだありません。",
    activityLogEmpty: "表示できる実行ログはまだありません。",
    activityLogErrorLabel: "エラー",
    endingFollowupTitle: "結末後の追問や振り返り",
    storyControlLabel: "ストーリー制御",
    storyControlAuto: "自動進行",
    storyControlIntervene: "プレイヤー介入",
    inputLocked: "??????????????????????",
    preparingRoundHint: "AI???????????????????",
    commitRoundHint: (count: number) =>
      `${count} ????????????????????????????`,
    storyAutoHint:
      "自動進行中です。AI主人公と仲間の草稿がそろうと、そのまま自動で送信されます。",
    storyAutoCountdownHint: (seconds: number) =>
      `自動進行は ${seconds} 秒後に送信されます。発火前ならプレイヤー介入へ戻して止められます。`,
    storyInterveneHint:
      "語りが落ち着くと AI主人公が草稿を作成し、送信前にあなたが編集できます。",
    aiDraftHint:
      "???????????? AI ???????????????????????????????????????",
    prepareRoundHint:
      "????????????AI?????????????????????",
    submitTurnHint: "????????????",
    endingFollowupHint:
      "このゲーム自体は終了していますが、ナレーターへの追問や復盤は続けられます。別ノードから分岐し直したい場合は結算ページを開いてください。",
    autoSubmittingRound: "自動送信中...",
    autoRunning: "自動進行中",
    autoCommitCountdown: (seconds: number) => `${seconds}s 後に自動送信`,
    initPlaceholder: "????????????????????????????????",
    draftingPlaceholder: "AI??????????????????????...",
    aiDraftPlaceholder:
      "?????????????AI???????????????????",
    aiDraftWaiting: "AI??????????????????????????????",
    autoModeLockedInput:
      "自動進行では準備済みの AI 草稿をそのまま使います。編集したい場合はプレイヤー介入に切り替えてください。",
    actionPlaceholder:
      "?: ??????????????????????????????????",
    endingFollowupPlaceholder:
      "例: もう結末だけど、西棟で本当は何が起きていたのか改めて知りたい。",
    prepareRound: "??????",
    preparingRound: "???...",
    commitRound: "??????",
    submitTurn: "?????",
    endingFollowupSubmit: "追問を送信",
    dismissEndingFalsePositive: "誤判定を解除",
    dismissEndingFalsePositiveSubmitting: "解除中...",
    openSettlementPage: "結算ページ",
    settlementPageTitle: "結算ページ",
    settlementPageDescription:
      "解放済みの世界線ノードをまとめて確認し、再開可能なノードから新しい分岐を始められます。",
    settlementPageHint:
      "再開可能なノードを選ぶと、すぐにゲーム画面へ戻り、その地点から再開します。",
    settlementNoEnding:
      "このセッションではまだエンディングが確定していないため、専用の結算内容はありません。",
    backToGame: "ゲームへ戻る",
    saveLoadEyebrow: "?? / ????",
    loadSaveTitle: "????????",
    saveLoadDescription: "Saving and loading stay as first-level actions inside the core play screen.",
    comicButton: "漫画",
    comicEyebrow: "漫画",
    comicTitle: "世界線漫画",
    comicDescription: "この世界線で生成済みの漫画ページをここで確認できます。",
    comicCount: (count: number) => `${count} 枚`,
    comicEmpty: "この世界線にはまだ漫画が生成されていません。",
    comicGeneratingHint: "漫画をバックグラウンドで生成中です。完了するとここに表示されます。",
    comicPageLabel: (index: number) => `漫画 ${index}`,
    comicPageAlt: (index: number) => `漫画 ${index}`,
    comicOpenLightbox: "拡大表示",
    comicPrevPage: "前へ",
    comicNextPage: "次へ",
    comicGenerationStart: (index: number) => `漫画 ${index} を生成中...`,
    comicGenerationDone: (index: number) => `漫画 ${index} を生成しました。`,
    comicAlreadyExists: (index: number) => `漫画 ${index} は既存のものを再利用しました。`,
    comicGenerationFailed: (message: string) => `漫画生成に失敗しました: ${message}`,
    comicLoadFailed: (message: string) => `漫画の読み込みに失敗しました: ${message}`,
    privateChatButton: "個別チャット",
    privateChatEyebrow: "AI仲間の個別会話",
    privateChatTitle: "仲間との個別スレッド",
    privateChatDescription: "AI仲間とサイド会話できます。この履歴は公開ストーリーログに混ざりません。",
    privateChatWithEyebrow: "選択中の仲間",
    privateChatHistoryHint: "このスレッドはあなたとこの仲間だけに表示されます。",
    privateChatTeammateHint: "この仲間と個別会話を開きます。",
    privateChatSelectHint: "左側から仲間を選んでください。",
    privateChatEmpty: "このスレッドにはまだ個別会話がありません。",
    privateChatYou: "あなた",
    privateChatInputLabel: "個別メッセージ",
    privateChatInputPlaceholder: "例えば: 声を落として。本当は何に気づいたの？",
    privateChatSend: "個別送信",
    privateChatSending: "送信中...",
    resizeSidePanel: "右パネルのサイズ変更",
    resizeComposer: "入力欄のサイズ変更",
    saveOpen: "??",
    savedAt: (value: string) => `????: ${value}`,
    noLocalSaves: "????????????????",
    npcEyebrow: "NPC",
    npcTitle: "??????",
    npcDescription: "NPC ???????????????????????",
    loadingNpcFiles: "NPC ??????????...",
    noNpcFiles: "??????????? NPC ?????????????",
    missingNpcContentInfo:
      "??????????????????????????NPC ?????????????",
    npcSelectHint: "?????? NPC ??????????",
    generatePortrait: "??????",
    redrawPortrait: "??????",
    generatingPortrait: "???...",
    noPortraitYet: "?? NPC ??????????????",
    noPortraitYetPreparing: (ready: number, total: number) =>
      `??? NPC ??????????????????????? ${ready} / ${total} ??????`,
    portraitPreparingHint: (ready: number, total: number) =>
      `????????????????? NPC ???????????????????????????????? ${ready} / ${total} ??????`,
    portraitPrev: "??",
    portraitNext: "??",
    portraitCounter: (current: number, total: number) => `${current} / ${total}`,
    detailsEyebrow: "??",
    detailsTitle: "???????",
    detailsDescription:
      "????????????????????????????????????????????????",
    sessionInfo: "???????",
    sessionId: (value: string) => `Session ID: ${value}`,
    content: (ruleTitle: string, storyTitle: string) => `??: ${ruleTitle} / ${storyTitle}`,
    endingJudge: "エンディング判定",
    endingJudgeGameOverTrue: "GameOver: True",
    endingJudgeGameOverFalse: "GameOver: False",
    endingJudgePending: "判定待ち",
    endingJudgeStructuredJson: "構造化出力",
    manualNarrationTest: "手動ナレーター出力テスト",
    manualNarrationTestDescription:
      "ここでナレーター返信を直接入力すると、現在のセッションへ書き込み、補助 AI が本当にゲーム終了かどうかを即時判定します。",
    manualNarrationInputLabel: "手動ナレーター返信",
    manualNarrationInputPlaceholder:
      "例: あなたたちは屋敷から生還し、夜は明け、この物語はここで終わる。",
    manualNarrationSubmit: "書き込みして判定",
    manualNarrationSubmitting: "判定中...",
    noEndingJudge: "?????????????????????????",
    memoryDebug: "コンテキスト圧縮デバッグ",
    memoryDebugDescription:
      "現在の session memory、Narrator context pack、AI 仲間の公開ターン context pack を確認できます。",
    memoryRebuild: "Memory を再構築",
    memoryRebuilding: "再構築中...",
    memoryFacts: (count: number) => `事実: ${count}`,
    memoryOpenLoops: (count: number) => `未解決: ${count}`,
    memoryEpisodes: (count: number) => `要約: ${count}`,
    noMemoryDebugData: "まだ表示できる memory / context pack データがありません。",
    narratorContextPack: "Narrator Context Pack",
    companionContextPack: (name: string) => `${name} 公開ターン Context Pack`,
    replayLog: "??????",
    noReplayLog: "??????????????????????",
    quickEndingTest: "?????????",
    branchGraph: "?????"
  },
  settingsScreen: {
    title: "設定",
    description:
      "ここで保存するのは既定値です。テキストモデル、画像モデル、画像プロンプトテンプレートは次回以降の新規ゲームに自動で引き継がれます。",
    generalEyebrow: "一般",
    generalTitle: "基本設定",
    locale: "既定の内容言語",
    playMode: "既定のゲームモード",
    gmArchitecture: "既定の GM 構成",
    logViewMode: "既定のログ表示",
    menuFontSize: "メニュー文字サイズ",
    debugOptions: "デバッグオプション",
    enableDebug: "デバッグ情報を既定で有効にする",
    showAiMetadata: "AI の所要時間、Token、料金を表示する",
    localSaveDirectory: "ローカル保存先フォルダ",
    localSaveDirectoryPlaceholder: "空欄なら既定の保存先に戻ります",
    localSaveDirectoryBrowse: "フォルダを選ぶ",
    localSaveDirectoryBrowsing: "開いています...",
    localSaveDirectoryHint: "ローカルサーバーがセーブファイルを書き込むディレクトリを指定します。",
    localSaveDirectoryEffective: (value: string) => `現在の実際の保存先: ${value}`,
    localSaveDirectoryUsingDefault:
      "現在は既定の保存先を使用しています。この欄を空にして保存してもここへ戻ります。",
    textModelEyebrow: "テキストモデル",
    textModelTitle: "テキストモデル設定",
    imageModelEyebrow: "画像モデル",
    imageModelTitle: "画像 Provider 設定",
    imagePromptEyebrow: "画像プロンプト",
    imagePromptTitle: "画像テンプレート",
    imagePromptDescription:
      "シーンごとの共通テンプレートをここで設定します。実際の生成時には業務 prompt と自動結合されます。",
    modelAccessMode: "モデル接続モード",
    textModelProfile: "既定のテキストモデルプロファイル",
    imageModelProfile: "既定の画像モデルプロファイル",
    apiKeyOverride: "API Key 上書き",
    imageApiKeyOverride: "画像 API Key 上書き",
    modelNameOverride: "モデル名上書き",
    imageModelNameOverride: "画像モデル名上書き",
    baseUrlOverride: "Base URL 上書き",
    imageBaseUrlOverride: "画像 Base URL 上書き",
    apiKeyPlaceholder: "空欄ならローカル .env を使用",
    modelPlaceholder: "空欄なら既定モデルを使用",
    baseUrlPlaceholder: "空欄なら既定 Base URL を使用",
    clearTextModelOverride: "現在のテキストモデル上書きをクリア",
    clearImageModelOverride: "現在の画像モデル上書きをクリア",
    supported: "対応",
    unsupported: "未対応",
    referenceModel: (value: string) => ` / 参考モデル: ${value}`,
    defaultSelectedSummary: (name: string, status: string) =>
      `現在の既定値: ${name} / ${status}`,
    configStatusBuiltIn: "内蔵で利用可能",
    configStatusLocalOverride: "ローカル上書きあり",
    configStatusConfigured: "設定済み",
    configStatusMissing: "未設定",
    defaultTheme: "既定テーマ",
    defaultTrigger: "既定トリガー",
    fallbackTemplate: "フォールバックテンプレート",
    themeStyle: (themeKey: string) => `テーマスタイル: ${themeKey}`,
    triggerTemplate: (triggerKey: string) => `トリガーテンプレート: ${triggerKey}`,
    characterClauseTemplate: "キャラクター連結テンプレート",
    characterEntryTemplate: "キャラクター項目テンプレート",
    characterJoinSeparator: "キャラクター区切り文字",
    saveSettings: "設定を保存",
    resetDefaults: "既定値に戻す"
  },
  storySelectScreen: {
    title: "ゲーム開始",
    description:
      "まず今回の舞台となるルールと物語を選びます。左でルール、中でストーリー、右で雰囲気と詳細を確認します。",
    backLabel: "メニューへ戻る",
    closeLabel: "閉じる",
    collapsedRuleLabel: "RULE",
    collapsedStoryLabel: "STORY",
    expandAction: "展開",
    collapseAction: "折りたたむ",
    ruleEyebrow: "ルール",
    ruleListTitle: "ルール一覧",
    storyEyebrow: "物語",
    storyListTitle: "物語一覧",
    storyPreviewEyebrow: "物語プレビュー",
    splitterRuleStoryAria: "ルール列と物語列の幅を調整",
    splitterStoryDetailAria: "物語列と詳細列の幅を調整",
    playerCountSingle: (count: number) => `${count} 人`,
    playerCountRange: (min: number, max: number) => `${min}-${max} 人`,
    defaultRuleIntro:
      "このルールセットにはまだ `intro.txt` または `intro.md` がありません。いまは仮の説明を表示しています。",
    defaultStoryIntro:
      "このストーリーにはまだ `intro.txt` または `intro.md` がありません。いまは仮の説明を表示しています。",
    defaultCoverCopy:
      "このストーリーにはまだ `cover.png` がありません。しばらくは既定のカバー領域を表示します。",
    defaultCoverQuote:
      "このストーリーには専用のカバー短句がまだないため、概要の要約を表示しています。",
    coverAlt: (storyTitle: string) => `${storyTitle} のカバー`,
    openCoverAria: "大きい画像を表示",
    closeCoverAria: "大きい画像を閉じる",
    openCoverButton: "大きく見る",
    storyIntroLabel: "ストーリー概要",
    ruleIntroLabel: "ルール概要",
    tagsLabel: "タグ",
    pacingLengthLabel: "テンポと想定時間",
    contentWarnings: (value: string) => `コンテンツ警告: ${value}`,
    startAdventure: "冒険を始める",
    empty: "利用可能なルールまたはストーリーがまだありません。コンテンツパックの読み込みを確認してください。",
    coverDialogAria: "ストーリーカバーの拡大表示",
    closeCoverDialogAria: "拡大表示を閉じる",
    closeImageButton: "画像を閉じる",
    coverDialogAlt: (storyTitle: string) => `${storyTitle} のカバー大画像`
  },
  gameSetupScreen: {
    titleFallback: "ゲーム設定",
    description:
      "この回の進行方式、モデル入口、キャラクター概念を最後に確認してから本編を開始します。",
    backLabel: "物語選択へ戻る",
    closeLabel: "閉じる",
    detailTabs: {
      game: {
        label: "ゲーム設定",
        description: "言語、進行方式、表示、プレイテンポに関する設定です。"
      },
      model: {
        label: "モデル設定",
        description: "モデル入口、プロファイル、現在の能力概要です。"
      },
      companions: {
        label: "同行者設定",
        description: "AI 同伴入口、内容境界、今後の拡張枠です。"
      }
    },
    fields: {
      languageLabel: "言語",
      languageHint: "コンテンツ本文と UI の基本言語を切り替えます。",
      difficultyLabel: "難易度",
      difficultyHint: "難易度はまだ実裁定に接続されていないため、現状は固定です。",
      difficultyStandardPending: "標準（開発予定）",
      gmArchitectureLabel: "GM 構成",
      gmArchitectureHint: "単一 Agent / 複数 Agent 進行の共通入口です。",
      backgroundCompressionLabel: "背景圧縮",
      backgroundCompressionHint:
        "単一 Agent Narrator にのみ適用されます。オンでは圧縮済み context pack を渡し、オフでは完全な公開コンテキストをそのまま Narrator に渡します。",
      backgroundCompressionOn: "背景圧縮を有効化",
      backgroundCompressionOff: "背景圧縮を無効化して全量コンテキストを使用",
      playModeLabel: "ゲームモード",
      playModeHint: "現行ビルドではシングル、ストーリーモード、シングル+NPC、マルチプレイ入口を表示します。",
      modelModeLabel: "モデルモード",
      modelModeHint: "この回を mock で進めるか、実モデルへ接続するかを決めます。",
      modelProfileLabel: "モデルプロファイル",
      modelProfileHint: "ここではこの回で使うモデルプロファイルを選びます。",
      comicStyleLabel: "漫画画風",
      comicStyleHint:
        "新しく作る世界線漫画プロジェクトの既定画風を選びます。同じ世界線で 1 ページ目が生成されると、以降はその画風を引き継ぎます。",
      comicStyleLoadingHint: "利用可能な漫画画風プリセットを読み込んでいます。",
      comicStyleUnavailableHint:
        "漫画画風プリセットを今は読み込めませんでした。このまま開始すると、バックエンド既定の画風にフォールバックします。",
      comicStyleLoadingOption: "画風プリセットを読み込み中...",
      comicStyleUnavailableOption: "画風プリセットを利用できません",
      logViewLabel: "ログ表示",
      logViewHint: "遊ぶ時にも調査時にも使いやすいよう、ログ粒度を調整します。",
      previewDeliveryLabel: "開場伝送",
      previewDeliveryHint:
        "ストリームは生成しながら表示、全文待ちは完成後にまとめて表示します。",
      markdownFontSizeLabel: "Markdown 文字サイズ",
      markdownFontSizeHint: "AI 本文、見出し、リストの表示サイズを調整します。",
      debugModeLabel: "デバッグモード",
      debugModeHint: "主にモデルとランタイムの確認用です。",
      debugOn: "オン",
      debugOff: "オフ"
    },
    overview: {
      eyebrow: "設定概要",
      title: "設定概要",
      gameTitle: "ゲーム設定",
      gameDescription: "言語、進行、基本プレイ方式を管理します。",
      modelTitle: "モデル設定",
      modelDescription: "この回で使うモデル入口、プロファイル、表示設定を選びます。",
      currentRunTitle: "現在の状況"
    },
    currentRun: {
      rule: (value: string) => `ルール: ${value}`,
      story: (value: string) => `物語: ${value}`,
      tags: (value: string) => `タグ: ${value}`,
      gmStyle: (value: string) => `GM スタイル: ${value}`,
      noRule: "ルール未選択",
      noStory: "物語未選択",
      undecided: "未定"
    },
    model: {
      entryTitle: "モデル入口設定",
      capabilitiesTitle: "モデル能力",
      capabilitiesDescription:
        "現在のプロファイルがファイルアップロード、深い推論、ツール呼び出しなどに対応しているかを表示します。",
      noCapabilities: "利用可能なモデルプロファイルがないため、能力情報を表示できません。",
      summaryTitle: "現在のモデル概要",
      currentProfile: (value: string) => `現在のプロファイル: ${value}`,
      accessMode: (value: string) => `入口: ${value}`,
      profile: (value: string) => `プロファイル: ${value}`,
      comicStyle: (value: string) => `漫画画風: ${value}`,
      resolvedModel: (value: string) => `実際のモデル: ${value}`,
      status: (value: string) => `状態: ${value}`,
      message: (value: string) => `説明: ${value}`,
      supported: "対応",
      unsupported: "未対応",
      referenceModel: (value: string) => `参考モデル: ${value}`,
      officialDocs: "公式説明",
      noSpecificModel: "具体モデル未記載",
      noExplanation: "説明なし",
      notConfigured: "未設定",
      ready: "セッション作成可能",
      needsConfig: "追加設定が必要"
    },
    advancedModel: {
      title: "詳細設定",
      description:
        "既定ではすべての AI が上の共通テキストモデルを使います。ここを有効にすると、ナレーター、AI 主人公、各 AI 仲間ごとに別のモデルプロファイルを指定できます。",
      enabled: "有効",
      disabled: "無効",
      enabledSummary: (count: number) =>
        count > 0
          ? `${count} 役に個別モデルを設定しています。`
          : "詳細設定は有効ですが、現在はすべての役が共通モデルを使っています。",
      followDefaultBadge: "既定を使用",
      inheritDefault: "共通の既定モデルを使う",
      followingDefault: (value: string) => `現在は共通既定を使用中: ${value}`,
      roleModelProfile: "役ごとのモデルプロファイル",
      narratorTitle: "AI ナレーター",
      narratorDescription:
        "導入、各ターンの叙述、エンディング判定、記憶圧縮などナレーター側の処理に使います。",
      primaryPlayerTitle: "AI 主人公",
      primaryPlayerDescription:
        "ストーリーモードでのみ有効で、AI 主役の行動草稿生成に使われます。",
      companionsTitle: "AI 仲間",
      companionTitle: (value: string) => `AI 仲間: ${value}`,
      companionDescription: "この仲間の公開行動草稿と私聊返信に使われます。",
      companionFallback: (index: number) => `AI 仲間 ${index}`,
      noCompanions: "まだ AI 仲間がいません。仲間を追加すると、ここで個別モデルを指定できます。"
    },
    preview: {
      eyebrow: "開場プレビュー",
      title: "開場プレビュー",
      regenerate: "開場を再生成",
      regenerateBusy: "生成中...",
      coverAlt: (storyTitle: string) => `${storyTitle} のカバー`,
      openCoverAria: "大きい画像を表示",
      openCoverButton: "大きく見る",
      fallbackStoryTitle: "物語未選択",
      generatingText: "AI が開場プレビューを生成しています...",
      streamingText: "開場プレビューをストリーム受信しています...",
      waitingText: "開場プレビュー全文を待っています...",
      provider: (provider: string) => `提供元: ${provider}`
    },
    characterSetup: {
      eyebrow: "キャラクター設定",
      title: "あなたは誰？",
      description:
        "自分で書いてもいいし、開場文をもとに AI に草案生成や補完を任せても構いません。",
      placeholder:
        "例: 行方不明の姉を探しているドキュメンタリー学生。撮影は得意だが、湖畔の火事に奇妙な既視感がある。",
      generateButton: "AI 生成",
      completeButton: "AI 補完",
      generating: "AI がキャラクター概念を生成中...",
      completing: "AI がキャラクター概念を補完中..."
    },
    companions: {
      eyebrow: "同行者",
      title: "同行者設定",
      description:
        "AI 仲間の枠、名前、人格タグ、見た目設定をここで管理し、後続の私聊拡張にも備えます。",
      entryTitle: "AI 同伴入口",
      entryDescription:
        "通常モードでは、人間プレイヤーがここで設定した AI 仲間と一緒に行動します。",
      storyModeDescription:
        "ストーリーモードでは主役が AI 主人公になり、ここで追加した AI 仲間が同じパーティに参加します。",
      count: (value: number) => `AI 仲間: ${value} 名`,
      emptyTitle: "AI 仲間はまだいません",
      emptyDescription:
        "まず AI 仲間を追加し、その後で名前、性格、見た目を設定してください。",
      addTitle: "同行者を追加",
      addDescription:
        "この MVP では最大 3 名までの AI 仲間を追加できます。各仲間に名前、複数の人格タグ、複数の見た目タグを設定できます。",
      addButton: "+ 同行者を追加",
      loadPresetButton: "設定を読み込む",
      savedPresetCount: (value: number) => `ローカル保存済み設定: ${value} 件`,
      limitReached: "この MVP では AI 仲間を 3 名まで追加できます。",
      memberTitle: (value: number) => `AI 仲間 ${value}`,
      nameLabel: "名前",
      namePlaceholder: (value: number) => `例: AI仲間${value}`,
      selectedCount: (value: number) => `選択中の人格タグ: ${value}`,
      selectionSummary: (personalityCount: number, appearanceCount: number) =>
        `性格 ${personalityCount} / 見た目 ${appearanceCount}`,
      personalitySelectionLabel: (value: number) => `人格タグ: ${value}`,
      appearanceSelectionLabel: (value: number) => `見た目タグ: ${value}`,
      selectedPreviewEmpty: "まだ人格タグは選択されていません。",
      appearancePreviewEmpty: "まだ見た目タグは選択されていません。",
      savePresetButton: "設定を保存",
      configureButton: "性格を設定",
      configureDescription:
        "専用の性格画面を開いて、この AI 仲間の人格タグを選択または調整します。",
      configureAppearanceButton: "見た目を設定",
      configureAppearanceDescription:
        "専用の見た目画面を開いて、この AI 仲間の外見と服装の手掛かりを選択または調整します。",
      tagHint: "下の人格タグをクリックして複数選択できます。ホバーで説明を確認できます。",
      appearanceTagHint:
        "下の形象タグをクリックして複数選択できます。外貌と服装に分かれています。",
      loadPresetTitle: "AI 仲間設定を読み込む",
      loadPresetDescription:
        "ここにはブラウザのローカルに保存された AI 仲間設定が並びます。読み込むと現在のパーティへすぐ追加されます。",
      usePresetButton: "この設定を使う",
      presetNameFallback: "無名の AI 仲間",
      presetSavedAt: (value: string) => `最終保存: ${value}`,
      noSavedPresets: "ローカルに保存された AI 仲間設定はまだありません。",
      removeButton: "削除",
      noTags: "人格タグをまだ読み込めていません。",
      noAppearanceTags: "見た目タグをまだ読み込めていません。",
      basicPositiveLabel: "基本・正向",
      basicNegativeLabel: "基本・負向",
      advancedPositiveLabel: "上級・正向",
      advancedNegativeLabel: "上級・負向",
      appearanceLabel: "外見",
      outfitLabel: "服装",
      warningsTitle: "コンテンツ警告"
    },
    protagonist: {
      eyebrow: "AI主人公",
      title: "AI 主人公設定",
      description:
        "ストーリーモードでは、AI 主人公の性格と見た目を個別に設定でき、AI 仲間と共通のローカル保存設定も読み込めます。",
      nameLabel: "主人公の名前",
      namePlaceholder: "例: 周倚 / 林深 / 顧言",
      nameSummary: (value: string) => `現在の主人公名: ${value}`,
      selectionSummary: (personalityCount: number, appearanceCount: number) =>
        `性格 ${personalityCount} / 見た目 ${appearanceCount}`,
      personalitySelectionLabel: (value: number) => `人格タグ: ${value}`,
      appearanceSelectionLabel: (value: number) => `見た目タグ: ${value}`,
      selectedPreviewEmpty: "まだ人格タグは選択されていません。",
      appearancePreviewEmpty: "まだ見た目タグは選択されていません。",
      savedPresetCount: (value: number) => `読み込めるローカル設定: ${value} 件`,
      configurePersonalityButton: "主人公の性格を設定",
      configureAppearanceButton: "主人公の見た目を設定",
      configurePersonalityDescription:
        "ストーリーモードの AI 主人公に使う人格タグを選択または調整します。",
      configureAppearanceDescription:
        "ストーリーモードの AI 主人公に使う外見と服装の手掛かりを選択または調整します。",
      loadPresetButton: "ローカル設定を読み込む",
      loadPresetTitle: "AI 主人公設定を読み込む",
      loadPresetDescription:
        "ここで読み込む設定は AI 仲間と共通です。適用すると主人公の性格タグと見た目タグがまとめて置き換わります。",
      usePresetButton: "主人公に適用",
      presetNameFallback: "無名の AI 設定",
      tagHint: "下の人格タグをクリックして複数選択できます。ホバーで説明を確認できます。",
      appearanceTagHint:
        "下の形象タグをクリックして複数選択できます。外貌と服装に分かれています。",
      noTags: "人格タグはまだ読み込み中です。",
      noAppearanceTags: "形象タグはまだ読み込み中です。"
    },
    layout: {
      collapsedConfigLabel: "CONFIG",
      collapsedAllyLabel: "ALLY",
      expandAction: "展開",
      detailButton: "詳細",
      collapseButton: "折りたたむ",
      leftResizeAria: "左側設定欄の幅を調整",
      rightResizeAria: "右側同行者欄の幅を調整"
    },
    actions: {
      startGame: "ゲーム開始",
      creatingSession: "セッション作成中..."
    },
    modal: {
      ariaLabel: "設定詳細",
      titleFallback: "設定詳細",
      close: "閉じる",
      categoryTabsAria: "設定カテゴリ"
    },
    coverDialogAria: "ストーリーカバー拡大表示",
    closeCoverDialogAria: "拡大表示を閉じる",
    closeImageButton: "画像を閉じる",
    coverDialogAlt: (storyTitle: string) => `${storyTitle} のカバー大画像`
  },
  gameBootstrapScreen: {
    fallbackStoryTitle: "セッションを準備中",
    progressTitle: "初期化の進行状況",
    progressLabel: (percent: number) => `${percent}%`,
    waitHint: "ゲームの初期化には通常30秒前後かかります。しばらくお待ちください。",
    tipLabel: "プレイのヒント",
    defaultLoadingHint: (storyTitle: string) =>
      `「${storyTitle}」を読み込み、最初の正式な語りを準備しています。`,
    coverAlt: (storyTitle: string) => `${storyTitle} のカバー`,
    fallbackCoverTitle: "カバープレビューなし",
    fallbackCoverDescription:
      "このストーリーパックに cover.png があれば、ここに自動表示されます。",
    tips: [
      "セーブとロードはメイン画面の第一階層に残るので、大事な選択の前にすぐ退避できます。",
      "NPC パネルでは人物メモを確認でき、後続では立ち絵生成もここに接続されます。",
      "詳細パネルにはエンディング判定、リプレイログ、分岐グラフをまとめ、主画面を読みやすく保ちます。",
      "設定画面ではテキストモデル、画像モデル、画像プロンプトの既定値をまとめて調整できます。",
      "導入の空気が合わないときは Beginning に戻ってキャラクター設定を書き直してから始め直せます。"
    ]
  },
  playthroughGraph: {
    openingTitle: "開場",
    endingTitle: (round: number) => `結末 / R${round}`,
    debriefTitle: "振り返り",
    epilogueTitle: "後日談",
    roundTitle: (round: number) => `ラウンド ${round}`,
    endingShortLabel: "ENDING",
    debriefShortLabel: "振り返り",
    epilogueShortLabel: "後日談",
    manualShortLabel: "手動",
    roundShortLabel: "ラウンド",
    eyebrow: "分岐回溯ツリー",
    title: (count: number) => `エンディング後に解放済み / 全 ${count} ノード`,
    description: "ノードを直接ドラッグして配置を変えられます。接続線もリアルタイムで追従します。",
    expandAriaLabel: "分岐回溯ツリーを拡大",
    collapseAriaLabel: "分岐回溯ツリーを折りたたむ",
    expandButton: "拡大",
    collapseButton: "折りたたむ",
    legendMainline: "本線 / 茶赤",
    legendBranch: "分岐 / 青緑",
    legendAfterEnding: "結末後 / 紫",
    noExtraSummary: "このノードには追加要約がありません。",
    currentNode: "現在ノード",
    endingLeaf: "エンディング葉ノード",
    resumeBusy: "復元中...",
    continueFromHere: "ここから続ける"
  }
} as const satisfies UiText;






