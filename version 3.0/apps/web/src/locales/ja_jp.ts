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
    status: {
      submitTurnPending: "このターンを送信しています...",
      turnComplete: "このターンは完了しました。",
      turnCompleteEnded: "このターンは完了し、セッションはエンディングに入りました。",
      createSessionPending: "ゲームに入り、セッションを作成しています...",
      narratorConnected: "ナレーターに接続しました。正式な導入が始まっています...",
      sessionCreated: "セッションを作成しました。",
      sessionCreatedWithCharacter:
        "セッションを作成し、キャラクター設定を導入に反映しました。",
      startGameFirst: "先にゲームを開始してください。",
      enterAction: "このターンの行動を入力してください。",
      quickEndingMockOnly: "クイックエンディングテストは mock モードでのみ使えます。",
      quickEndingTestPending: "mock エンディングテストを実行しています...",
      quickEndingTestSuccess: "mock エンディングテストを送信しました。",
      quickEndingTestEnded:
        "mock エンディングテストが成功し、セッションはエンディングに入りました。",
      noActiveSessionToSave: "保存できるアクティブなセッションがありません。",
      creatingLocalSave: "ローカルセーブを作成しています...",
      localSaveCreated: "ローカルセーブを作成しました。",
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
      "正式なレポート、エンディング履歴、長期統計は後続フェーズでここに実装されます。",
    empty: "まだ表示できる記録ビューはありません。"
  },
  gameScreen: {
    emptyTitle: "ゲーム中",
    emptyDescription: "現在アクティブなセッションはありません。",
    emptyState: "表示できるプレイ中セッションがありません。",
    heroEyebrow: "コアプレイ",
    creatingSession: "セッション作成中",
    openingScene: "開幕シーン進行中",
    ended: "結末確定",
    inProgress: "進行中",
    currentNarration: "現在の語り",
    endedTitle: "このプレイはエンディングに入りました",
    joiningSceneTitle: "ナレーターがシーンへ参加中",
    advancingStoryTitle: "ナレーターが物語を進行中",
    bootstrapEyebrow: "セッション初期化",
    bootstrapWaiting:
      "すでにコアプレイ画面に入っています。最初の narration が届き次第、ここに表示されます。",
    noNarrationYet: "まだ narration はありません。",
    recentContext: "最近の文脈",
    recentContextTitle: "直近の対話と導入ログ",
    recentItems: (count: number) => `${count} 件`,
    playerRound: (round: number) => `プレイヤー / R${round}`,
    narratorRound: (round: number) => `ナレーター / R${round}`,
    historyEmpty: "表示できる十分な履歴はまだありません。",
    endingState: "エンディング状態",
    yourAction: "あなたの行動",
    actionTitle: "次の行動または台詞を入力",
    inputLocked: "シーンの準備が整うまで入力はロックされます。",
    submitTurnHint: "このターンを送信します。",
    initPlaceholder: "セッションを初期化しています。正式な開幕が終わると入力できます。",
    actionPlaceholder:
      "例: まず扉の裏の痕跡を調べ、それからなぜ今この時間に現れたのかを尋ねる。",
    submitTurn: "ターン送信",
    saveLoadEyebrow: "保存 / 読み込み",
    loadSaveTitle: "セーブを読み込む",
    saveLoadDescription:
      "保存と読み込みはコアプレイ画面の第一階層アクションとして残します。",
    saveOpen: "開く",
    savedAt: (value: string) => `保存日時: ${value}`,
    noLocalSaves: "ローカルセーブはまだありません。",
    npcEyebrow: "NPC",
    npcTitle: "人物ファイル",
    npcDescription: "NPC のメモ、立ち絵、生成結果をここで確認できます。",
    loadingNpcFiles: "NPC ファイルを読み込み中...",
    noNpcFiles: "この物語には閲覧可能な NPC ファイルがまだありません。",
    missingNpcContentInfo:
      "このセーブにはコンテンツディレクトリ情報がないため、NPC ファイルを読み込めません。",
    npcSelectHint: "先に左側から NPC を選択してください。",
    generatePortrait: "立ち絵を生成",
    generatingPortrait: "生成中...",
    noPortraitYet: "この NPC にはまだ立ち絵がありません。",
    detailsEyebrow: "詳細",
    detailsTitle: "セッション詳細",
    detailsDescription:
      "エンディング判定結果、リプレイログ、分岐グラフ、デバッグ情報などの非コア情報をここにまとめます。",
    sessionInfo: "セッション情報",
    sessionId: (value: string) => `Session ID: ${value}`,
    content: (ruleTitle: string, storyTitle: string) => `内容: ${ruleTitle} / ${storyTitle}`,
    endingJudge: "エンディング判定 JSON",
    noEndingJudge: "このターンのエンディング判定結果はまだありません。",
    replayLog: "リプレイログ",
    noReplayLog: "表示できるリプレイイベントはまだありません。",
    quickEndingTest: "クイック結末テスト",
    branchGraph: "分岐グラフ"
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
      playModeLabel: "ゲームモード",
      playModeHint: "現行 MVP では単独、単独+NPC、複数人入口を残しています。",
      modelModeLabel: "モデルモード",
      modelModeHint: "この回を mock で進めるか、実モデルへ接続するかを決めます。",
      modelProfileLabel: "モデルプロファイル",
      modelProfileHint: "ここではこの回で使うモデルプロファイルを選びます。",
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
        "AI 同伴入口、拡張枠、現在のストーリー境界をここにまとめます。",
      entryTitle: "AI 同伴入口",
      entryDescription:
        "将来的に NPC 同伴や複数プレイヤーの私聊ビューをここへ接続します。現状は構造だけ先に残しています。",
      addTitle: "同行者を追加",
      addDescription: "今後実装予定: AI プレイヤーの作成、編集、削除。",
      addButton: "+ 同行者を追加",
      warningsTitle: "コンテンツ警告"
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
