const elements = {
  form: document.getElementById("create-session-form"),
  statusLine: document.getElementById("status-line"),
  resultBadge: document.getElementById("result-badge"),
  resultEmpty: document.getElementById("result-empty"),
  resultContent: document.getElementById("result-content"),
  submitButton: document.getElementById("submit-button"),
  ruleSelect: document.getElementById("rule-select"),
  storySelect: document.getElementById("story-select"),
  localeSelect: document.getElementById("locale-select"),
  modelModeSelect: document.getElementById("model-mode-select"),
  playModeSelect: document.getElementById("play-mode-select"),
  gmArchitectureSelect: document.getElementById("gm-architecture-select"),
  debugEnabled: document.getElementById("debug-enabled"),
  sessionId: document.getElementById("session-id"),
  contentSummary: document.getElementById("content-summary"),
  localeSummary: document.getElementById("locale-summary"),
  countSummary: document.getElementById("count-summary"),
  openingText: document.getElementById("opening-text")
};

let bootstrapData = null;

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
  elements.resultBadge.textContent = "创建成功";
  elements.resultEmpty.classList.add("hidden");
  elements.resultContent.classList.remove("hidden");
  elements.sessionId.textContent = snapshot.session.id;
  elements.contentSummary.textContent = `${snapshot.contentSummary.ruleTitle} / ${snapshot.contentSummary.storyTitle}`;
  elements.localeSummary.textContent = `请求: ${snapshot.contentSummary.requestedLocale} | 实际: ${snapshot.contentSummary.resolvedLocale}`;
  elements.countSummary.textContent = `${snapshot.messages.length} 条消息 / ${snapshot.replay.length} 条回放`;

  const openingMessage = snapshot.messages.find((item) => item.kind === "gm_narration");
  elements.openingText.textContent = openingMessage?.content ?? "未找到 mock 开场文本";
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
    setStatus("Session 创建成功，mock 开场文本已生成。");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
    elements.resultBadge.textContent = "创建失败";
  } finally {
    elements.submitButton.disabled = false;
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
