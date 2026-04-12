import type { UiText } from "./types.ts";

export const enUs = {
  appName: "AI TRPG 3.0",
  screenHeader: {
    defaultBackLabel: "Back",
    defaultCloseLabel: "Close"
  },
  common: {
    none: "None",
    noContent: "No content yet.",
    backToMenu: "Back to Menu",
    close: "Close",
    save: "Save",
    load: "Load",
    open: "Open",
    delete: "Delete",
    details: "Details",
    npc: "NPC",
    expand: "Expand",
    collapse: "Collapse",
    loading: "Loading...",
    generating: "Generating...",
    creating: "Creating...",
    clear: "Clear",
    provider: "Provider",
    prompt: "Prompt"
  },
  options: {
    playModes: [
      {
        value: "single_player",
        label: "Single Player",
        description: "A lightweight run where you alone drive the story forward."
      },
      {
        value: "single_player_with_npc",
        label: "Single + NPC",
        description: "AI companions can join the scene, talk, and react with you."
      },
      {
        value: "multiplayer",
        label: "Multiplayer",
        description: "Reserved for future linked-play flows. The current MVP still focuses on local play."
      }
    ],
    gmArchitectures: [
      {
        value: "single_agent",
        label: "Single Agent GM",
        description: "One narrator model handles story beats and NPC portrayal together."
      },
      {
        value: "multi_agent",
        label: "Multi-Agent GM",
        description: "A future entry point for coordinated agents. The current build still centers on a single narrator."
      }
    ],
    logViews: [
      {
        value: "all",
        label: "Full Logs",
        description: "Show the complete runtime log for debugging and inspection."
      },
      {
        value: "compact",
        label: "Compact Logs",
        description: "Keep only the most important runtime information visible."
      },
      {
        value: "hidden",
        label: "Hidden Logs",
        description: "Reduce the log footprint to the minimum for normal play."
      }
    ],
    markdownFontSizes: [
      {
        value: "standard",
        label: "Standard (16px)",
        description: "Balanced desktop reading size."
      },
      {
        value: "large",
        label: "Large (18px)",
        description: "A roomier body copy size for longer scenes."
      },
      {
        value: "xlarge",
        label: "XL (20px)",
        description: "A larger reading size with stronger legibility."
      },
      {
        value: "xxlarge",
        label: "XXL (22px)",
        description: "Best for distant viewing or a highly magnified UI."
      }
    ],
    menuFontSizes: [
      {
        value: "standard",
        label: "Standard (100%)",
        description: "Keep the current menu and chrome scale."
      },
      {
        value: "large",
        label: "Large (110%)",
        description: "Make menu buttons, headings, and labels easier to scan."
      },
      {
        value: "xlarge",
        label: "XL (120%)",
        description: "A stronger scale-up for menu reading comfort."
      },
      {
        value: "xxlarge",
        label: "XXL (130%)",
        description: "Best for large screens or distant viewing."
      }
    ],
    openingPreviewDelivery: [
      {
        value: "stream",
        label: "Prefer streaming",
        description: "Show the opening while it is being generated."
      },
      {
        value: "complete",
        label: "Wait for full text",
        description: "Render the preview only after the whole response is complete."
      }
    ],
    imageTriggers: [
      { value: "manual", label: "Manual" },
      { value: "character_portrait", label: "Character Portrait" },
      { value: "npc_intro", label: "NPC Intro" },
      { value: "scene_shift", label: "Scene Shift" }
    ]
  },
  helperText: {
    previewFallbackLines: [
      "The room is dimming and the old tape has not fully taken shape yet.",
      "This preview area will later be replaced by the real opening generation.",
      "For now, it builds a first mood from the selected rules and story setup."
    ],
    aiMeta: {
      source: (provider: string) => `Source: ${provider}`,
      duration: (seconds: string) => `Duration: ${seconds}s`,
      tokens: (count: number) => `Tokens: ${count}`,
      cost: (currencySymbol: string, amount: string) => `Cost: ${currencySymbol}${amount}`,
      pendingCost: "Cost: pending",
      separator: " | "
    }
  },
  app: {
    status: {
      submitTurnPending: "Submitting this turn...",
      turnComplete: "This turn has been completed.",
      turnCompleteEnded: "This turn has been completed and the session has entered an ending.",
      createSessionPending: "Entering the game and creating the session...",
      narratorConnected: "Narrator connected. The formal opening is now unfolding...",
      sessionCreated: "Session created.",
      sessionCreatedWithCharacter: "Session created. Your character setup has been folded into the opening.",
      startGameFirst: "Start a game first.",
      enterAction: "Enter an action for this turn.",
      quickEndingMockOnly: "Quick ending test is only available in mock mode.",
      noActiveSessionToSave: "There is no active session to save.",
      creatingLocalSave: "Creating a local save...",
      localSaveCreated: "Local save created.",
      loadingSelectedSave: "Loading the selected save...",
      noRecentSave: "There is no recent save yet.",
      noRecentSnapshot: "There is no recent local snapshot yet.",
      restoringLatestSnapshot: "Restoring the latest snapshot from the server...",
      latestSessionSynced: "The latest session was synced from the server.",
      localSnapshotOpenedInstead: "The server copy was not found, so the local snapshot was opened instead.",
      nodeCannotResume: "This node cannot be resumed, or its local snapshot is missing.",
      switchingNode: "Switching to the selected node and rebuilding the branch context...",
      switchedNode: "Switched to the selected node. The next turn will grow a new branch from here.",
      defaultSettingsSaved: "Default settings saved.",
      defaultsRestored: "Default settings restored.",
      recentSnapshotCleared: "Recent snapshot cleared.",
      localSavesCleared: "Local saves cleared.",
      recentSaveDeleted: "Recent save deleted.",
      saveDeleted: "Save deleted.",
      closeTabManually: "If the page is still open, close the browser tab manually.",
      waitOpeningPreviewBeforeAssist:
        "Wait until the opening preview finishes before using AI character assistance.",
      aiDraftingCharacterConcept: "AI is drafting a character concept...",
      aiCompletingCharacterConcept: "AI is completing the current character concept...",
      aiDraftedCharacterConcept: "AI produced a first character draft. You can keep editing it.",
      aiCompletedCharacterConcept: "AI completed the character draft. You can keep editing it.",
      selectStoryFirst: "Select an available story first.",
      noPlayableStory: "There is no playable rule pack or story pack right now."
    },
    bootstrapStages: {
      entered_game: {
        label: "Entered the play screen",
        detail: "You are already in the core play view and the formal session is being prepared.",
        progress: 0.08
      },
      loading_content: {
        label: "Loading rule and story content",
        detail: "Reading the rule text and story materials needed for this opening.",
        progress: 0.2
      },
      assembling_prompt: {
        label: "Assembling narrator input",
        detail: "Combining the narrator prompt, rule.txt, story.txt, and player info.",
        progress: 0.42
      },
      requesting_narrator: {
        label: "Requesting the narrator agent",
        detail: "Sending the opening materials to the model and preparing the first narration.",
        progress: 0.64
      },
      waiting_first_reply: {
        label: "Waiting for the first reply",
        detail: "The model is processing the opening and we are waiting for the first narration.",
        progress: 0.84
      },
      finalizing_session: {
        label: "Writing the session snapshot",
        detail: "Saving the first narration and the current setup into the formal session.",
        progress: 0.96
      }
    }
  },
  mainMenu: {
    eyebrow: "Main Menu",
    title: "AI TRPG 3.0",
    description:
      "A text-first AI TRPG prototype. Start a new run, continue your latest progress, or adjust the current build's default model and language settings from here.",
    buttons: {
      newGame: "Start Game",
      continue: "Continue",
      records: "Records",
      settings: "Settings",
      exit: "Exit"
    },
    footer: {
      about: "About",
      contact: "Contact"
    },
    feed: {
      eyebrow: "Updates",
      title: "Announcements",
      description: "Recent build notes and development updates appear here.",
      showMore: "Show more..."
    },
    recentProgress: {
      label: "Recent Progress",
      roundAndStatus: (round: number, status: string) => `Round ${round} / Status: ${status}`,
      updatedAt: (value: string) => `Updated: ${value}`,
      empty: "There is no local progress to continue yet."
    },
    defaults: {
      label: "Current Defaults",
      locale: (value: string) => `Language: ${value}`,
      playMode: (value: string) => `Mode: ${value}`,
      gmArchitecture: (value: string) => `GM architecture: ${value}`,
      modelAccessMode: (value: string) => `Model mode: ${value}`,
      modelProfile: (value: string) => `Model profile: ${value}`
    },
    splitterAriaLabel: "Drag to resize the main menu columns"
  },
  continueScreen: {
    title: "Continue",
    description:
      "Restore from a manual save first. If you do not have one yet, you can fall back to the latest snapshot.",
    empty: "There is no save or recent progress to continue right now.",
    recentSave: "Recent Save",
    recentSnapshot: "Recent Snapshot",
    rule: (value: string) => `Rule: ${value}`,
    status: (value: string) => `Status: ${value}`,
    round: (value: number) => `Round: ${value}`,
    model: (value: string) => `Model: ${value}`,
    savedAt: (value: string) => `Saved at: ${value}`,
    updatedAt: (value: string) => `Updated at: ${value}`,
    continueSave: "Continue recent save",
    continueSnapshot: "Continue recent snapshot",
    restoring: "Restoring...",
    removeRecentSave: "Delete recent save",
    clearRecentSnapshot: "Clear recent snapshot"
  },
  exitScreen: {
    title: "Exit",
    description:
      "The web build cannot reliably close itself, so this screen gives you a clean place to wrap up before leaving.",
    noteTitle: "Before you go",
    noteBody:
      "If you only want to leave the current view, go back to the main menu. If you want to close this build entirely, close the browser tab.",
    buttons: {
      tryCloseWindow: "Try closing the window",
      clearRecent: "Clear recent progress",
      clearRecords: "Clear save summaries"
    }
  },
  recordsScreen: {
    title: "Records",
    description:
      "Formal reports, ending history, and long-term statistics will live here in a later pass.",
    empty: "No record view is available yet."
  },
  gameScreen: {
    emptyTitle: "In Game",
    emptyDescription: "There is no active session right now.",
    emptyState: "There is no playable session to display.",
    heroEyebrow: "Core Play",
    creatingSession: "Creating session",
    openingScene: "Opening scene is unfolding",
    ended: "Ending locked",
    inProgress: "In progress",
    currentNarration: "Current Narration",
    endedTitle: "This run has entered an ending",
    joiningSceneTitle: "Narrator is joining the scene",
    advancingStoryTitle: "Narrator is advancing the story",
    bootstrapEyebrow: "Session Bootstrap",
    bootstrapWaiting:
      "You are already inside the core play view. The first narration will appear here as soon as it begins streaming in.",
    noNarrationYet: "There is no narration yet.",
    recentContext: "Recent Context",
    recentContextTitle: "Last exchanges and setup beats",
    recentItems: (count: number) => `${count} items`,
    playerRound: (round: number) => `Player / R${round}`,
    narratorRound: (round: number) => `Narrator / R${round}`,
    historyEmpty: "There is not enough history to show yet.",
    endingState: "Ending State",
    yourAction: "Your Action",
    actionTitle: "Enter the next action or line of dialogue",
    inputLocked: "Input is locked until the scene is ready.",
    submitTurnHint: "Submit this turn.",
    initPlaceholder: "Session is initializing. You can act once the formal opening finishes.",
    actionPlaceholder:
      "For example: I examine the marks behind the door first, then ask why this happened at this exact time.",
    submitTurn: "Submit Turn",
    saveLoadEyebrow: "Save / Load",
    loadSaveTitle: "Load Save",
    saveLoadDescription: "Saving and loading stay as first-level actions inside the core play screen.",
    saveOpen: "Open",
    savedAt: (value: string) => `Saved at: ${value}`,
    noLocalSaves: "There are no local saves yet.",
    npcEyebrow: "NPC",
    npcTitle: "Character Files",
    npcDescription: "Review NPC notes, portraits, and generated image results here.",
    loadingNpcFiles: "Loading NPC files...",
    noNpcFiles: "This story does not expose readable NPC files yet.",
    npcSelectHint: "Select an NPC from the left side first.",
    generatePortrait: "Generate Portrait",
    generatingPortrait: "Generating...",
    noPortraitYet: "This NPC does not have a portrait yet.",
    detailsEyebrow: "Details",
    detailsTitle: "Session Details",
    detailsDescription:
      "Non-core information lives here, including ending-judge results, replay logs, branch graphs, and debugging details.",
    sessionInfo: "Session Info",
    sessionId: (value: string) => `Session ID: ${value}`,
    content: (ruleTitle: string, storyTitle: string) => `Content: ${ruleTitle} / ${storyTitle}`,
    endingJudge: "Ending Judge JSON",
    noEndingJudge: "There is no ending-judge result for this turn yet.",
    replayLog: "Replay Log",
    noReplayLog: "There are no replay events to show right now.",
    quickEndingTest: "Quick Ending Test",
    branchGraph: "Branch Graph"
  },
  settingsScreen: {
    title: "Settings",
    description:
      "These values are stored as defaults. Text models, image models, and image prompt templates will be carried into later new sessions automatically.",
    generalEyebrow: "General",
    generalTitle: "Base Preferences",
    locale: "Default content language",
    playMode: "Default play mode",
    gmArchitecture: "Default GM architecture",
    logViewMode: "Default log visibility",
    menuFontSize: "Menu font size",
    debugOptions: "Debug options",
    enableDebug: "Enable debug information by default",
    showAiMetadata: "Show AI timing, tokens, and cost",
    textModelEyebrow: "Text Model",
    textModelTitle: "Text Model Configuration",
    imageModelEyebrow: "Image Model",
    imageModelTitle: "Image Provider Configuration",
    imagePromptEyebrow: "Image Prompts",
    imagePromptTitle: "Image Prompt Templates",
    imagePromptDescription:
      "Configure reusable templates for different scene triggers here. They will be joined with business prompts at generation time.",
    modelAccessMode: "Model access mode",
    textModelProfile: "Default text model profile",
    imageModelProfile: "Default image model profile",
    apiKeyOverride: "API key override",
    imageApiKeyOverride: "Image API key override",
    modelNameOverride: "Model name override",
    imageModelNameOverride: "Image model name override",
    baseUrlOverride: "Base URL override",
    imageBaseUrlOverride: "Image Base URL override",
    apiKeyPlaceholder: "Leave blank to use the local .env value",
    modelPlaceholder: "Leave blank to use the default model",
    baseUrlPlaceholder: "Leave blank to use the default Base URL",
    clearTextModelOverride: "Clear current text model override",
    clearImageModelOverride: "Clear current image model override",
    supported: "supported",
    unsupported: "unsupported",
    referenceModel: (value: string) => ` / Reference model: ${value}`,
    defaultSelectedSummary: (name: string, status: string) => `Current default: ${name} / ${status}`,
    configStatusBuiltIn: "built in",
    configStatusLocalOverride: "local override filled",
    configStatusConfigured: "configured",
    configStatusMissing: "missing",
    defaultTheme: "Default theme",
    defaultTrigger: "Default trigger",
    fallbackTemplate: "Fallback template",
    themeStyle: (themeKey: string) => `Theme style: ${themeKey}`,
    triggerTemplate: (triggerKey: string) => `Trigger template: ${triggerKey}`,
    characterClauseTemplate: "Character clause template",
    characterEntryTemplate: "Character entry template",
    characterJoinSeparator: "Character join separator",
    saveSettings: "Save settings",
    resetDefaults: "Restore defaults"
  }
} as const satisfies UiText;
