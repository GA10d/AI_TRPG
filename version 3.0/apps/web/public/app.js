const elements = {
  form: document.getElementById("create-session-form"),
  turnForm: document.getElementById("turn-form"),
  statusLine: document.getElementById("status-line"),
  resultBadge: document.getElementById("result-badge"),
  resultEmpty: document.getElementById("result-empty"),
  resultContent: document.getElementById("result-content"),
  submitButton: document.getElementById("submit-button"),
  turnSubmitButton: document.getElementById("turn-submit-button"),
  ruleSelect: document.getElementById("rule-select"),
  storySelect: document.getElementById("story-select"),
  localeSelect: document.getElementById("locale-select"),
  modelModeSelect: document.getElementById("model-mode-select"),
  playModeSelect: document.getElementById("play-mode-select"),
  gmArchitectureSelect: document.getElementById("gm-architecture-select"),
  debugEnabled: document.getElementById("debug-enabled"),
  turnInput: document.getElementById("turn-input"),
  sessionId: document.getElementById("session-id"),
  contentSummary: document.getElementById("content-summary"),
  localeSummary: document.getElementById("locale-summary"),
  countSummary: document.getElementById("count-summary"),
  openingText: document.getElementById("opening-text"),
  gameArea: document.getElementById("game-area"),
  gameStateSummary: document.getElementById("game-state-summary"),
  gameRoundSummary: document.getElementById("game-round-summary"),
  messageList: document.getElementById("message-list"),
  replayList: document.getElementById("replay-list")
};

let bootstrapData = null;
let currentSnapshot = null;

function setStatus(message, isError = false) {
  elements.statusLine.textContent = message;
  elements.statusLine.style.color = isError ? "#912f23" : "";
}

function buildOption(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function clearSelect(selectElement) {
  while (selectElement.firstChild) {
    selectElement.removeChild(selectElement.firstChild);
  }
}

function renderStories(ruleDirectoryName) {
  const selectedRule = bootstrapData?.catalog.find((item) => item.directoryName === ruleDirectoryName);
  clearSelect(elements.storySelect);

  if (!selectedRule) {
    return;
  }

  for (const story of selectedRule.stories) {
    elements.storySelect.appendChild(
      buildOption(story.directoryName, `${story.title} (${story.storyId})`)
    );
  }
}

function renderBootstrap(data) {
  bootstrapData = data;

  clearSelect(elements.ruleSelect);
  clearSelect(elements.localeSelect);
  clearSelect(elements.modelModeSelect);

  for (const rule of data.catalog) {
    elements.ruleSelect.appendChild(
      buildOption(rule.directoryName, `${rule.ruleTitle} (${rule.ruleId})`)
    );
  }

  for (const language of data.languages) {
    elements.localeSelect.appendChild(
      buildOption(language.code, `${language.nativeLabel} / ${language.label}`)
    );
  }

  for (const mode of data.modelAccessModes) {
    elements.modelModeSelect.appendChild(
      buildOption(mode.code, `${mode.label} - ${mode.description}`)
    );
  }

  elements.ruleSelect.value = data.catalog[0]?.directoryName ?? "";
  renderStories(elements.ruleSelect.value);
  elements.localeSelect.value = data.defaults.locale;
  elements.modelModeSelect.value = data.defaults.modelAccessMode;
  elements.playModeSelect.value = data.defaults.playMode;
  elements.gmArchitectureSelect.value = data.defaults.gmArchitecture;
}

function showResult(snapshot) {
  currentSnapshot = snapshot;
  elements.resultBadge.textContent = "创建成功";
  elements.resultEmpty.classList.add("hidden");
  elements.resultContent.classList.remove("hidden");
  elements.sessionId.textContent = snapshot.session.id;
  elements.contentSummary.textContent = `${snapshot.contentSummary.ruleTitle} / ${snapshot.contentSummary.storyTitle}`;
  elements.localeSummary.textContent = `请求: ${snapshot.contentSummary.requestedLocale} | 实际: ${snapshot.contentSummary.resolvedLocale}`;
  elements.countSummary.textContent = `${snapshot.messages.length} 条消息 / ${snapshot.replay.length} 条回放`;

  const openingMessage = snapshot.messages.find((item) => item.kind === "gm_narration");
  elements.openingText.textContent = openingMessage?.content ?? "未找到 mock 开场文本";
  elements.gameArea.classList.remove("hidden");
  renderGameSnapshot(snapshot);
}

function renderGameSnapshot(snapshot) {
  elements.gameStateSummary.textContent = `scene=${snapshot.session.gameState.sceneId} | status=${snapshot.session.status}`;
  elements.gameRoundSummary.textContent = `Round ${snapshot.session.currentRound}`;

  elements.messageList.innerHTML = "";
  for (const message of snapshot.messages) {
    const item = document.createElement("article");
    item.className = "message-item";

    const meta = document.createElement("div");
    meta.className = "message-meta";
    meta.innerHTML = `<span>${message.kind}</span><span>R${message.round}</span>`;

    const body = document.createElement("div");
    body.className = "message-body";
    body.textContent = message.content;

    item.append(meta, body);
    elements.messageList.appendChild(item);
  }

  elements.replayList.innerHTML = "";
  for (const event of snapshot.replay) {
    const item = document.createElement("article");
    item.className = "replay-item";

    const meta = document.createElement("div");
    meta.className = "replay-meta";
    meta.innerHTML = `<span>${event.type}</span><span>R${event.round}</span>`;

    const body = document.createElement("div");
    body.className = "replay-body";
    body.textContent = event.summary;

    item.append(meta, body);
    elements.replayList.appendChild(item);
  }

  elements.messageList.scrollTop = elements.messageList.scrollHeight;
  elements.replayList.scrollTop = elements.replayList.scrollHeight;
}

async function fetchBootstrap() {
  const response = await fetch("/api/bootstrap");
  if (!response.ok) {
    throw new Error("bootstrap 数据加载失败");
  }

  return response.json();
}

async function createSession(payload) {
  const response = await fetch("/api/sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message ?? "创建 session 失败");
  }

  return data;
}

async function submitTurn(sessionId, payload) {
  const response = await fetch(`/api/sessions/${sessionId}/turns`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message ?? "提交 turn 失败");
  }

  return data;
}

elements.ruleSelect.addEventListener("change", (event) => {
  renderStories(event.target.value);
});

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    ruleDirectoryName: elements.ruleSelect.value,
    storyDirectoryName: elements.storySelect.value,
    locale: elements.localeSelect.value,
    playMode: elements.playModeSelect.value,
    gmArchitecture: elements.gmArchitectureSelect.value,
    modelAccessMode: elements.modelModeSelect.value,
    debugEnabled: elements.debugEnabled.checked,
    promptDebugEnabled: false,
    logViewMode: "compact"
  };

  elements.submitButton.disabled = true;
  setStatus("正在创建 session...");

  try {
    const snapshot = await createSession(payload);
    showResult(snapshot);
    setStatus("Session 创建成功，最小游戏页已激活，可以继续提交假回合。");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
    elements.resultBadge.textContent = "创建失败";
  } finally {
    elements.submitButton.disabled = false;
  }
});

elements.turnForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentSnapshot) {
    setStatus("请先创建 session。", true);
    return;
  }

  const playerInput = elements.turnInput.value.trim();
  if (!playerInput) {
    setStatus("请输入本轮行动。", true);
    return;
  }

  elements.turnSubmitButton.disabled = true;
  setStatus("正在提交本轮行动...");

  try {
    const snapshot = await submitTurn(currentSnapshot.session.id, {
      playerInput
    });
    currentSnapshot = snapshot;
    renderGameSnapshot(snapshot);
    elements.countSummary.textContent = `${snapshot.messages.length} 条消息 / ${snapshot.replay.length} 条回放`;
    elements.turnInput.value = "";
    setStatus("本轮 mock 处理完成，消息流和回放已更新。");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    elements.turnSubmitButton.disabled = false;
  }
});

async function main() {
  try {
    const data = await fetchBootstrap();
    renderBootstrap(data);
    setStatus("bootstrap 数据已加载，可以开始创建 session。");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

main();
