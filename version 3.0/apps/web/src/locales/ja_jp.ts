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
    load: "読込",
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
        description: "あなた一人で物語を進める、もっとも軽量なプレイ形式です。"
      },
      {
        value: "single_player_with_npc",
        label: "シングル + NPC",
        description: "AI の仲間 NPC が会話や行動に参加します。"
      },
      {
        value: "multiplayer",
        label: "マルチプレイ",
        description: "将来の連携プレイ用の入口です。現時点の MVP はローカル中心です。"
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
        description: "将来の複数エージェント協調向けの入口です。現状は単一ナレーターが中心です。"
      }
    ],
    logViews: [
      {
        value: "all",
        label: "全ログ",
        description: "デバッグや確認のために実行ログをすべて表示します。"
      },
      {
        value: "compact",
        label: "簡易ログ",
        description: "通常プレイ向けに重要な情報だけを表示します。"
      },
      {
        value: "hidden",
        label: "非表示",
        description: "ログ領域を最小限まで抑えます。"
      }
    ],
    markdownFontSizes: [
      {
        value: "standard",
        label: "標準 (16px)",
        description: "デスクトップでの標準的な読みやすさです。"
      },
      {
        value: "large",
        label: "大きめ (18px)",
        description: "長い本文を少しゆったり読めます。"
      },
      {
        value: "xlarge",
        label: "大 (20px)",
        description: "より視認性を重視したサイズです。"
      },
      {
        value: "xxlarge",
        label: "特大 (22px)",
        description: "拡大表示や離れた位置からの閲覧に向いています。"
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
        label: "大きめ (110%)",
        description: "ボタンや見出しを少し見やすくします。"
      },
      {
        value: "xlarge",
        label: "大 (120%)",
        description: "メニュー全体をはっきり大きく表示します。"
      },
      {
        value: "xxlarge",
        label: "特大 (130%)",
        description: "大画面や離れた位置での閲覧に向いています。"
      }
    ],
    openingPreviewDelivery: [
      {
        value: "stream",
        label: "ストリーム優先",
        description: "生成しながら開幕プレビューを表示します。"
      },
      {
        value: "complete",
        label: "全文待機",
        description: "全文完成後にまとめて表示します。"
      }
    ],
    imageTriggers: [
      { value: "manual", label: "手動生成" },
      { value: "character_portrait", label: "キャラクター立ち絵" },
      { value: "npc_intro", label: "NPC 紹介" },
      { value: "scene_shift", label: "シーン切替" }
    ]
  },
  helperText: {
    previewFallbackLines: [
      "夜の気配がゆっくり降りてきて、古いテープの声はまだ完全には形を取っていません。",
      "このプレビュー領域は、後で本物の開幕生成に置き換わります。",
      "今は選択中のルールと物語設定から、最初の雰囲気だけを先に組み立てています。"
    ],
    aiMeta: {
      source: (provider: string) => `ソース: ${provider}`,
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
      createSessionPending: "ゲームへ入り、セッションを作成しています...",
      narratorConnected: "ナレーターに接続しました。正式な導入が始まっています...",
      sessionCreated: "セッションを作成しました。",
      sessionCreatedWithCharacter: "セッションを作成し、キャラクター設定を導入に反映しました。",
      startGameFirst: "先にゲームを開始してください。",
      enterAction: "このターンの行動を入力してください。",
      quickEndingMockOnly: "クイックエンディングテストは mock モードでのみ使えます。",
      noActiveSessionToSave: "保存できるアクティブなセッションがありません。",
      creatingLocalSave: "ローカルセーブを作成しています...",
      localSaveCreated: "ローカルセーブを作成しました。",
      loadingSelectedSave: "選択したセーブを読み込んでいます...",
      noRecentSave: "最近のセーブはまだありません。",
      noRecentSnapshot: "最近のローカルスナップショットはまだありません。",
      restoringLatestSnapshot: "サーバーから最新スナップショットを復元しています...",
      latestSessionSynced: "最新セッションをサーバーから同期しました。",
      localSnapshotOpenedInstead:
        "サーバー上のコピーが見つからなかったため、代わりにローカルスナップショットを開きました。",
      nodeCannotResume: "このノードは再開できないか、ローカルスナップショットが不足しています。",
      switchingNode: "選択したノードへ切り替え、分岐コンテキストを再構築しています...",
      switchedNode: "選択したノードへ切り替えました。次のターンはここから新しい分岐として伸びます。",
      defaultSettingsSaved: "デフォルト設定を保存しました。",
      defaultsRestored: "デフォルト設定を復元しました。",
      recentSnapshotCleared: "最近のスナップショットを削除しました。",
      localSavesCleared: "ローカルセーブ一覧をクリアしました。",
      recentSaveDeleted: "最近のセーブを削除しました。",
      saveDeleted: "セーブを削除しました。",
      closeTabManually: "ページが開いたままなら、ブラウザのタブを手動で閉じてください。",
      waitOpeningPreviewBeforeAssist:
        "AI キャラクター補助を使う前に、開幕プレビューの生成完了を待ってください。",
      aiDraftingCharacterConcept: "AI がキャラクター設定の下書きを生成しています...",
      aiCompletingCharacterConcept: "AI が現在のキャラクター設定を補完しています...",
      aiDraftedCharacterConcept:
        "AI がキャラクター設定の下書きを作成しました。続けて編集できます。",
      aiCompletedCharacterConcept:
        "AI がキャラクター設定を補完しました。続けて編集できます。",
      selectStoryFirst: "先に利用可能な物語を選択してください。",
      noPlayableStory: "現在利用できるルールパックまたは物語パックがありません。"
    },
    bootstrapStages: {
      entered_game: {
        label: "ゲーム画面へ移動",
        detail: "すでにコアプレイ画面に入り、正式なセッション準備を進めています。",
        progress: 0.08
      },
      loading_content: {
        label: "ルールと物語を読み込み中",
        detail: "この導入に必要なルール本文と物語素材を読み込んでいます。",
        progress: 0.2
      },
      assembling_prompt: {
        label: "Narrator 入力を組み立て中",
        detail: "narrator prompt、rule.txt、story.txt、player info を組み合わせています。",
        progress: 0.42
      },
      requesting_narrator: {
        label: "Narrator Agent を呼び出し中",
        detail: "導入素材をモデルへ送り、最初の語りを準備しています。",
        progress: 0.64
      },
      waiting_first_reply: {
        label: "最初の返答を待機中",
        detail: "モデルが導入を処理しており、最初の narration を待っています。",
        progress: 0.84
      },
      finalizing_session: {
        label: "セッションスナップショットを書き込み中",
        detail: "最初の語りと現在の設定を正式なセッションへ保存しています。",
        progress: 0.96
      }
    }
  },
  mainMenu: {
    eyebrow: "メインメニュー",
    title: "AI TRPG 3.0",
    description:
      "テキスト叙述を中心とした AI TRPG プロトタイプです。ここから新しいゲームを始めたり、最近の進行を再開したり、モデルや言語の既定値を調整できます。",
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
      label: "現在の既定値",
      locale: (value: string) => `言語: ${value}`,
      playMode: (value: string) => `モード: ${value}`,
      gmArchitecture: (value: string) => `GM 構成: ${value}`,
      modelAccessMode: (value: string) => `モデルモード: ${value}`,
      modelProfile: (value: string) => `モデルプロファイル: ${value}`
    },
    splitterAriaLabel: "ドラッグしてメインメニューの左右幅を調整"
  },
  continueScreen: {
    title: "続きから",
    description:
      "まずは手動セーブから復元し、手動セーブがない場合は最近のスナップショットへ戻れます。",
    empty: "現在は再開できるセーブや最近の進行がありません。",
    recentSave: "最近のセーブ",
    recentSnapshot: "最近のスナップショット",
    rule: (value: string) => `ルール: ${value}`,
    status: (value: string) => `状態: ${value}`,
    round: (value: number) => `ラウンド: ${value}`,
    model: (value: string) => `モデル: ${value}`,
    savedAt: (value: string) => `保存時刻: ${value}`,
    updatedAt: (value: string) => `更新時刻: ${value}`,
    continueSave: "最近のセーブを続ける",
    continueSnapshot: "最近のスナップショットを続ける",
    restoring: "復元中...",
    removeRecentSave: "最近のセーブを削除",
    clearRecentSnapshot: "最近のスナップショットを削除"
  },
  exitScreen: {
    title: "終了",
    description:
      "Web 版では自身を確実に終了できないため、離脱前の整理用画面を先に用意しています。",
    noteTitle: "終了前の案内",
    noteBody:
      "現在の画面から離れるだけならメインメニューへ戻れます。ページ自体を閉じたい場合はブラウザタブを閉じてください。",
    buttons: {
      tryCloseWindow: "ウィンドウを閉じる",
      clearRecent: "最近の進行を削除",
      clearRecords: "セーブ概要を削除"
    }
  },
  recordsScreen: {
    title: "記録",
    description:
      "正式な戦績、エンディング履歴、長期統計などは後続フェーズでここに統合されます。",
    empty: "まだ記録ビューはありません。"
  },
  gameScreen: {
    emptyTitle: "ゲーム中",
    emptyDescription: "現在アクティブなセッションはありません。",
    emptyState: "表示できるプレイ中セッションがありません。",
    heroEyebrow: "コアプレイ",
    creatingSession: "セッション作成中",
    openingScene: "導入シーン展開中",
    ended: "エンディング確定",
    inProgress: "進行中",
    currentNarration: "今回の叙述",
    endedTitle: "このプレイはエンディングに入りました",
    joiningSceneTitle: "ナレーターがシーンへ入っています",
    advancingStoryTitle: "ナレーターが物語を進めています",
    bootstrapEyebrow: "セッション起動",
    bootstrapWaiting:
      "すでにコアプレイ画面に入っています。最初の narration が流れ始めると、ここに直接表示されます。",
    noNarrationYet: "まだ叙述はありません。",
    recentContext: "直近の文脈",
    recentContextTitle: "前ラウンドの対話と布石",
    recentItems: (count: number) => `${count} 件`,
    playerRound: (round: number) => `プレイヤー / R${round}`,
    narratorRound: (round: number) => `ナレーター / R${round}`,
    historyEmpty: "表示できる十分な履歴はまだありません。",
    endingState: "エンディング状態",
    yourAction: "あなたの行動",
    actionTitle: "次の行動やセリフを入力",
    inputLocked: "シーン準備が終わるまで入力はロックされています。",
    submitTurnHint: "このターンを送信します。",
    initPlaceholder: "セッションを初期化中です。正式な導入が終わると行動できます。",
    actionPlaceholder:
      "例: まずドアの後ろの痕跡を調べ、そのあとでなぜこの時間に起きたのかを問いただす。",
    submitTurn: "ターン送信",
    saveLoadEyebrow: "保存 / 読込",
    loadSaveTitle: "読込",
    saveLoadDescription: "保存と読込はコアプレイ画面の第一階層アクションとして残します。",
    saveOpen: "開く",
    savedAt: (value: string) => `保存時刻: ${value}`,
    noLocalSaves: "ローカルセーブはまだありません。",
    npcEyebrow: "NPC",
    npcTitle: "人物ファイル",
    npcDescription: "NPC 設定、立ち絵、生成結果をここで確認できます。",
    loadingNpcFiles: "NPC ファイルを読み込み中...",
    noNpcFiles: "この物語では読み取れる NPC ファイルがまだ公開されていません。",
    npcSelectHint: "先に左側から NPC を選択してください。",
    generatePortrait: "立ち絵を生成",
    generatingPortrait: "生成中...",
    noPortraitYet: "この NPC にはまだ立ち絵がありません。",
    detailsEyebrow: "詳細",
    detailsTitle: "セッション詳細",
    detailsDescription:
      "エンディング判定、リプレイログ、分岐図、デバッグ情報などの非コア情報はここにまとめます。",
    sessionInfo: "セッション情報",
    sessionId: (value: string) => `Session ID: ${value}`,
    content: (ruleTitle: string, storyTitle: string) => `内容: ${ruleTitle} / ${storyTitle}`,
    endingJudge: "Ending Judge JSON",
    noEndingJudge: "このターンのエンディング判定結果はまだありません。",
    replayLog: "リプレイログ",
    noReplayLog: "表示できるリプレイイベントはまだありません。",
    quickEndingTest: "クイックエンディングテスト",
    branchGraph: "分岐グラフ"
  },
  settingsScreen: {
    title: "設定",
    description:
      "ここで保存するのは既定値です。テキストモデル、画像モデル、画像プロンプトテンプレートは次回以降の新規ゲームにも自動で引き継がれます。",
    generalEyebrow: "共通",
    generalTitle: "基本設定",
    locale: "既定の内容言語",
    playMode: "既定のプレイモード",
    gmArchitecture: "既定の GM 構成",
    logViewMode: "既定のログ表示",
    menuFontSize: "メニュー文字サイズ",
    debugOptions: "デバッグ項目",
    enableDebug: "既定でデバッグ情報を有効にする",
    showAiMetadata: "AI の時間、トークン、コストを表示する",
    textModelEyebrow: "テキストモデル",
    textModelTitle: "テキストモデル設定",
    imageModelEyebrow: "画像モデル",
    imageModelTitle: "画像プロバイダ設定",
    imagePromptEyebrow: "画像プロンプト",
    imagePromptTitle: "画像プロンプトテンプレート",
    imagePromptDescription:
      "シーントリガーごとの共通テンプレートをここで設定します。実際の生成時には業務プロンプトと自動連結されます。",
    modelAccessMode: "モデル接続モード",
    textModelProfile: "既定のテキストモデルプロファイル",
    imageModelProfile: "既定の画像モデルプロファイル",
    apiKeyOverride: "API Key 上書き",
    imageApiKeyOverride: "画像 API Key 上書き",
    modelNameOverride: "モデル名上書き",
    imageModelNameOverride: "画像モデル名上書き",
    baseUrlOverride: "Base URL 上書き",
    imageBaseUrlOverride: "画像 Base URL 上書き",
    apiKeyPlaceholder: "空欄ならローカル .env を利用",
    modelPlaceholder: "空欄なら既定モデルを利用",
    baseUrlPlaceholder: "空欄なら既定 Base URL を利用",
    clearTextModelOverride: "現在のテキストモデル上書きをクリア",
    clearImageModelOverride: "現在の画像モデル上書きをクリア",
    supported: "対応",
    unsupported: "未対応",
    referenceModel: (value: string) => ` / 参照モデル: ${value}`,
    defaultSelectedSummary: (name: string, status: string) => `現在の既定値: ${name} / ${status}`,
    configStatusBuiltIn: "内蔵利用可",
    configStatusLocalOverride: "ローカル上書き入力済み",
    configStatusConfigured: "設定済み",
    configStatusMissing: "未設定",
    defaultTheme: "既定テーマ",
    defaultTrigger: "既定トリガー",
    fallbackTemplate: "フォールバックテンプレート",
    themeStyle: (themeKey: string) => `テーマスタイル: ${themeKey}`,
    triggerTemplate: (triggerKey: string) => `トリガーテンプレート: ${triggerKey}`,
    characterClauseTemplate: "キャラクター句テンプレート",
    characterEntryTemplate: "キャラクター項目テンプレート",
    characterJoinSeparator: "キャラクター連結区切り",
    saveSettings: "設定を保存",
    resetDefaults: "既定値に戻す"
  }
} as const satisfies UiText;
