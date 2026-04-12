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
      quickEndingTestPending: "Running the mock ending test...",
      quickEndingTestSuccess: "Mock ending test submitted.",
      quickEndingTestEnded: "Mock ending test succeeded and the session is now in an ending.",
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
    },
    pendingSessionSystemMessage: (storyTitle: string, locale: string) =>
      `Creating a session for ${storyTitle} (${locale}).`,
    pendingSessionReplaySummary: "Session bootstrap started",
    pendingPlayerName: "Player",
    pendingNarratorName: "Narrator",
    quickEndingTestInput: "I force an immediate mock ending trigger and choose to escape."
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
    uiLanguageAriaLabel: "Select UI language",
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
    missingNpcContentInfo:
      "This save is missing content directory information, so NPC files cannot be loaded.",
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
  },
  storySelectScreen: {
    title: "Start Game",
    description:
      "Pick the rule set and story for this run first. Choose a rule on the left, a story in the middle, and confirm the tone and details on the right.",
    backLabel: "Back to Menu",
    closeLabel: "Close",
    collapsedRuleLabel: "RULE",
    collapsedStoryLabel: "STORY",
    expandAction: "Expand",
    collapseAction: "Collapse",
    ruleEyebrow: "Rule",
    ruleListTitle: "Rule List",
    storyEyebrow: "Story",
    storyListTitle: "Story List",
    storyPreviewEyebrow: "Story Preview",
    splitterRuleStoryAria: "Resize the rule and story columns",
    splitterStoryDetailAria: "Resize the story and detail columns",
    playerCountSingle: (count: number) => `${count} player`,
    playerCountRange: (min: number, max: number) => `${min}-${max} players`,
    defaultRuleIntro:
      "This rule set does not provide `intro.txt` or `intro.md` yet, so a fallback summary is shown for now. You can still keep choosing a story and move into setup.",
    defaultStoryIntro:
      "This story does not provide `intro.txt` or `intro.md` yet, so a fallback summary is shown for now. You can still continue into the game and add richer intro copy later.",
    defaultCoverCopy:
      "This story does not provide `cover.png` yet, so the default cover area is used for now. If you later place `cover.png`, `cover.jpg`, or `cover.webp` in the story folder, it will be loaded automatically.",
    defaultCoverQuote:
      "This story does not provide a dedicated cover quote yet, so the intro summary is used instead.",
    coverAlt: (storyTitle: string) => `${storyTitle} cover`,
    openCoverAria: "View full image",
    closeCoverAria: "Hide full image",
    openCoverButton: "View full image",
    storyIntroLabel: "Story Intro",
    ruleIntroLabel: "Rule Intro",
    tagsLabel: "Tags",
    pacingLengthLabel: "Pacing & Length",
    contentWarnings: (value: string) => `Content warnings: ${value}`,
    startAdventure: "Start Adventure",
    empty: "No playable rules or stories are available yet. Check whether the content packs loaded correctly.",
    coverDialogAria: "Story cover preview",
    closeCoverDialogAria: "Close cover preview",
    closeImageButton: "Close image",
    coverDialogAlt: (storyTitle: string) => `${storyTitle} full cover image`
  },
  gameSetupScreen: {
    titleFallback: "Game Setup",
    description:
      "Confirm the host style, model entry, and your character concept one last time before the run formally begins.",
    backLabel: "Back to Story Select",
    closeLabel: "Close",
    detailTabs: {
      game: {
        label: "Game Settings",
        description: "Language, host style, display, and pace settings for this run."
      },
      model: {
        label: "Model Settings",
        description: "Model access, profile selection, and capability overview."
      },
      companions: {
        label: "Companion Settings",
        description: "AI companion entry points, content boundaries, and future extension slots."
      }
    },
    fields: {
      languageLabel: "Language",
      languageHint: "Controls the base language of content text and interface text.",
      difficultyLabel: "Difficulty",
      difficultyHint: "Difficulty is not wired into real adjudication yet, so it is fixed for now.",
      difficultyStandardPending: "Standard (Coming later)",
      gmArchitectureLabel: "GM Architecture",
      gmArchitectureHint: "A shared entry point for single-agent and multi-agent hosting.",
      playModeLabel: "Play Mode",
      playModeHint: "The current MVP keeps single, single + NPC, and multiplayer entry points visible.",
      modelModeLabel: "Model Mode",
      modelModeHint: "Choose whether this run stays in mock mode or goes through a real model proxy.",
      modelProfileLabel: "Model Profile",
      modelProfileHint: "This picker only decides which model profile this run will use.",
      logViewLabel: "Log View",
      logViewHint: "Adjust log detail for play or debugging.",
      previewDeliveryLabel: "Opening Delivery",
      previewDeliveryHint: "Streaming shows text as it arrives; complete waits for the full response first.",
      markdownFontSizeLabel: "Markdown Font Size",
      markdownFontSizeHint: "Controls the rendered size of AI body text, headings, and lists.",
      debugModeLabel: "Debug Mode",
      debugModeHint: "Currently used mainly for model and runtime debugging.",
      debugOn: "On",
      debugOff: "Off"
    },
    overview: {
      eyebrow: "Setup Overview",
      title: "Setup Overview",
      gameTitle: "Game Settings",
      gameDescription: "Manage language, hosting, and the baseline play style for this run.",
      modelTitle: "Model Settings",
      modelDescription: "Choose the model entry, profile, and display preferences for this run.",
      currentRunTitle: "Current Run Overview"
    },
    currentRun: {
      rule: (value: string) => `Rule: ${value}`,
      story: (value: string) => `Story: ${value}`,
      tags: (value: string) => `Tags: ${value}`,
      gmStyle: (value: string) => `GM style: ${value}`,
      noRule: "No rule selected",
      noStory: "No story selected",
      undecided: "TBD"
    },
    model: {
      entryTitle: "Model Entry Setup",
      capabilitiesTitle: "Model Capabilities",
      capabilitiesDescription:
        "This area tells you whether the current profile supports file upload, deeper reasoning, tool use, and other capabilities.",
      noCapabilities: "There is no available model profile to show capability information for right now.",
      summaryTitle: "Current Model Overview",
      currentProfile: (value: string) => `Current profile: ${value}`,
      accessMode: (value: string) => `Access: ${value}`,
      profile: (value: string) => `Profile: ${value}`,
      resolvedModel: (value: string) => `Actual model: ${value}`,
      status: (value: string) => `Status: ${value}`,
      message: (value: string) => `Notes: ${value}`,
      supported: "Supported",
      unsupported: "Unsupported",
      referenceModel: (value: string) => `Reference model: ${value}`,
      officialDocs: "Official docs",
      noSpecificModel: "No specific model listed",
      noExplanation: "No explanation provided",
      notConfigured: "Not configured",
      ready: "Ready to create a session",
      needsConfig: "More configuration is required"
    },
    preview: {
      eyebrow: "Opening Preview",
      title: "Opening Preview",
      regenerate: "Regenerate Opening",
      regenerateBusy: "Generating...",
      coverAlt: (storyTitle: string) => `${storyTitle} cover`,
      openCoverAria: "View full image",
      openCoverButton: "View full image",
      fallbackStoryTitle: "No story selected",
      generatingText: "Generating the AI opening preview...",
      streamingText: "Receiving the opening preview as a stream...",
      waitingText: "Waiting for the full opening preview...",
      provider: (provider: string) => `Source: ${provider}`
    },
    characterSetup: {
      eyebrow: "Character Setup",
      title: "Who are you?",
      description:
        "You can write the concept yourself, or let AI generate or complete a first character draft from the opening.",
      placeholder:
        "Example: I am a documentary student searching for my missing sister. I am good with a camera, but I carry an unshakable sense of deja vu about the fire by the lake.",
      generateButton: "AI Generate",
      completeButton: "AI Complete",
      generating: "AI is generating the character concept...",
      completing: "AI is completing the character concept..."
    },
    companions: {
      eyebrow: "Companions",
      title: "Companion Settings",
      description:
        "This panel groups AI companion entry points, extension slots, and current story boundaries.",
      entryTitle: "AI Companion Entry",
      entryDescription:
        "NPC companions and multiplayer private-chat views will be connected here later. Phase 2 keeps the layout and controls in place first.",
      addTitle: "Add Companion",
      addDescription: "Coming later: create, edit, and remove AI players.",
      addButton: "+ Add Companion",
      warningsTitle: "Content Warnings"
    },
    layout: {
      collapsedConfigLabel: "CONFIG",
      collapsedAllyLabel: "ALLY",
      expandAction: "Expand",
      detailButton: "Details",
      collapseButton: "Collapse",
      leftResizeAria: "Resize the left setup column",
      rightResizeAria: "Resize the right companion column"
    },
    actions: {
      startGame: "Start Game",
      creatingSession: "Creating Session..."
    },
    modal: {
      ariaLabel: "Setup details",
      titleFallback: "Setup Details",
      close: "Close",
      categoryTabsAria: "Setup categories"
    },
    coverDialogAria: "Story cover preview",
    closeCoverDialogAria: "Close cover preview",
    closeImageButton: "Close image",
    coverDialogAlt: (storyTitle: string) => `${storyTitle} full cover image`
  },
  gameBootstrapScreen: {
    fallbackStoryTitle: "Preparing Session",
    progressTitle: "Initialization Progress",
    progressLabel: (percent: number) => `${percent}%`,
    waitHint:
      "Game initialization usually takes around 30 seconds. Thank you for your patience!",
    tipLabel: "Tips While You Wait",
    defaultLoadingHint: (storyTitle: string) =>
      `We are opening ${storyTitle} and preparing the first narration for the live scene.`,
    coverAlt: (storyTitle: string) => `${storyTitle} cover art`,
    fallbackCoverTitle: "Cover Preview Unavailable",
    fallbackCoverDescription:
      "If this story pack provides cover.png, it will appear here automatically.",
    tips: [
      "Save and Load stay on the main play screen, so you can checkpoint before an important choice.",
      "Use the NPC panel to inspect current character notes and generate portraits later.",
      "The Details drawer keeps ending-judge JSON, replay logs, and branch graphs out of the main reading area.",
      "Text model, image model, and image prompt defaults can all be adjusted from Settings.",
      "If the opening tone feels off, go back to Beginning and rewrite your character concept before starting again."
    ]
  },
  playthroughGraph: {
    openingTitle: "Opening",
    endingTitle: (round: number) => `Ending / R${round}`,
    debriefTitle: "Debrief",
    epilogueTitle: "Epilogue",
    roundTitle: (round: number) => `Round ${round}`,
    eyebrow: "Branch Backtrack Tree",
    title: (count: number) => `Unlocked after the ending, with ${count} nodes`,
    description: "You can drag nodes to rearrange the view now, and the links will update in real time.",
    expandAriaLabel: "Expand the branch backtrack tree",
    collapseAriaLabel: "Collapse the branch backtrack tree",
    expandButton: "Expand",
    collapseButton: "Collapse",
    legendMainline: "Mainline / Brown Red",
    legendBranch: "Branch / Teal Green",
    legendAfterEnding: "After Ending / Purple",
    noExtraSummary: "No additional summary is available for this node.",
    currentNode: "Current node",
    endingLeaf: "Ending leaf",
    resumeBusy: "Resuming...",
    continueFromHere: "Continue from here"
  }
} as const satisfies UiText;
