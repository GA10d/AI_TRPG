import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent
} from "react";

import type {
  BootstrapResponse,
  ContentCatalogEntry,
  ContentCatalogStoryEntry
} from "../../../../packages/shared-types/src/index.ts";
import { useUiText, type UiText } from "../locales/index.tsx";
import { clipText, renderJoinedList } from "../ui.ts";
import { MarkdownBlock } from "./MarkdownBlock.tsx";
import { ScreenHeader } from "./ScreenHeader.tsx";

type StorySelectScreenProps = {
  bootstrap: BootstrapResponse | null;
  ruleDirectoryName: string;
  storyDirectoryName: string;
  onBack: () => void;
  onClose: () => void;
  onRuleChange: (value: string) => void;
  onStoryChange: (value: string) => void;
  onContinue: () => void;
};

type DragTarget = "rule" | "story" | null;

type StoryLayoutState = {
  ruleWidth: number;
  storyWidth: number;
  isRuleCollapsed: boolean;
  isStoryCollapsed: boolean;
};

type HoverPreviewPayload = {
  title: string;
  meta: string;
  body: string;
};

type HoverPreviewState = {
  x: number;
  y: number;
  payload: HoverPreviewPayload;
} | null;

const STORY_LAYOUT_STORAGE_KEY = "trpg3.storySelectLayout";
const RULE_MIN_WIDTH = 220;
const STORY_MIN_WIDTH = 280;
const DETAIL_MIN_WIDTH = 360;
const RULE_COLLAPSED_WIDTH = 52;
const STORY_COLLAPSED_WIDTH = 52;
const SPLITTER_WIDTH = 14;
const HOVER_DELAY_MS = 1000;

const DEFAULT_LAYOUT: StoryLayoutState = {
  ruleWidth: 320,
  storyWidth: 420,
  isRuleCollapsed: false,
  isStoryCollapsed: false
};

function clampNumber(value: number, minValue: number, maxValue: number): number {
  if (!Number.isFinite(value)) {
    return minValue;
  }

  return Math.min(maxValue, Math.max(minValue, value));
}

function loadStoredLayout(): StoryLayoutState {
  if (typeof window === "undefined") {
    return DEFAULT_LAYOUT;
  }

  try {
    const rawValue = window.localStorage.getItem(STORY_LAYOUT_STORAGE_KEY);
    if (!rawValue) {
      return DEFAULT_LAYOUT;
    }

    const parsed = JSON.parse(rawValue) as Partial<StoryLayoutState>;
    return {
      ruleWidth:
        typeof parsed.ruleWidth === "number" ? parsed.ruleWidth : DEFAULT_LAYOUT.ruleWidth,
      storyWidth:
        typeof parsed.storyWidth === "number" ? parsed.storyWidth : DEFAULT_LAYOUT.storyWidth,
      isRuleCollapsed:
        typeof parsed.isRuleCollapsed === "boolean"
          ? parsed.isRuleCollapsed
          : DEFAULT_LAYOUT.isRuleCollapsed,
      isStoryCollapsed:
        typeof parsed.isStoryCollapsed === "boolean"
          ? parsed.isStoryCollapsed
          : DEFAULT_LAYOUT.isStoryCollapsed
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

function getRuleSegmentWidth(layout: StoryLayoutState): number {
  return layout.isRuleCollapsed ? RULE_COLLAPSED_WIDTH : layout.ruleWidth;
}

function getStorySegmentWidth(layout: StoryLayoutState): number {
  return layout.isStoryCollapsed ? STORY_COLLAPSED_WIDTH : layout.storyWidth;
}

function getFirstHandleWidth(layout: StoryLayoutState): number {
  return layout.isRuleCollapsed ? 0 : SPLITTER_WIDTH;
}

function getSecondHandleWidth(layout: StoryLayoutState): number {
  return layout.isStoryCollapsed ? 0 : SPLITTER_WIDTH;
}

function computeMaxRuleWidth(layout: StoryLayoutState, containerWidth: number): number {
  return Math.max(
    RULE_MIN_WIDTH,
    containerWidth -
      getStorySegmentWidth(layout) -
      getSecondHandleWidth(layout) -
      DETAIL_MIN_WIDTH -
      getFirstHandleWidth(layout)
  );
}

function computeMaxStoryWidth(layout: StoryLayoutState, containerWidth: number): number {
  return Math.max(
    STORY_MIN_WIDTH,
    containerWidth -
      getRuleSegmentWidth(layout) -
      getFirstHandleWidth(layout) -
      getSecondHandleWidth(layout) -
      DETAIL_MIN_WIDTH
  );
}

function normalizeLayout(
  layout: StoryLayoutState,
  containerWidth: number
): StoryLayoutState {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return layout;
  }

  let nextLayout = { ...layout };

  for (let index = 0; index < 2; index += 1) {
    if (!nextLayout.isRuleCollapsed) {
      nextLayout.ruleWidth = clampNumber(
        nextLayout.ruleWidth,
        RULE_MIN_WIDTH,
        computeMaxRuleWidth(nextLayout, containerWidth)
      );
    }

    if (!nextLayout.isStoryCollapsed) {
      nextLayout.storyWidth = clampNumber(
        nextLayout.storyWidth,
        STORY_MIN_WIDTH,
        computeMaxStoryWidth(nextLayout, containerWidth)
      );
    }
  }

  return nextLayout;
}

function buildRuleHoverPayload(rule: ContentCatalogEntry, text: UiText): HoverPreviewPayload {
  return {
    title: rule.ruleTitle,
    meta: `${rule.ruleId} / ${renderJoinedList(rule.themes, text)}`,
    body: clipText(rule.ruleIntro, 320, text)
  };
}

function pickRuleIntroText(rule: ContentCatalogEntry | null, text: UiText): string {
  const intro = rule?.ruleIntro?.trim();
  return intro && intro.length > 0 ? intro : text.storySelectScreen.defaultRuleIntro;
}

function pickStoryIntroText(story: ContentCatalogStoryEntry | null, text: UiText): string {
  const intro = story?.intro?.trim();
  return intro && intro.length > 0 ? intro : text.storySelectScreen.defaultStoryIntro;
}

function pickStoryCoverQuote(story: ContentCatalogStoryEntry | null, text: UiText): string {
  const quote = story?.coverQuote?.trim();
  if (quote && quote.length > 0) {
    return quote;
  }

  const intro = story?.intro?.trim();
  if (intro && intro.length > 0) {
    return clipText(intro, 120, text);
  }

  return text.storySelectScreen.defaultCoverQuote;
}

function buildLocalizedStoryHoverPayload(
  story: ContentCatalogStoryEntry,
  text: UiText
): HoverPreviewPayload {
  const playerCountLabel =
    story.playerCount.min === story.playerCount.max
      ? text.storySelectScreen.playerCountSingle(story.playerCount.min)
      : text.storySelectScreen.playerCountRange(
          story.playerCount.min,
          story.playerCount.max
        );

  return {
    title: story.title,
    meta: `${playerCountLabel} / ${story.recommendedLength} / ${story.recommendedPacing}`,
    body: clipText(story.intro, 320, text)
  };
}

export function StorySelectScreen(props: StorySelectScreenProps) {
  const text = useUiText();
  const storyText = text.storySelectScreen;
  const {
    bootstrap,
    ruleDirectoryName,
    storyDirectoryName,
    onBack,
    onClose,
    onRuleChange,
    onStoryChange,
    onContinue
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const hoverTimeoutRef = useRef<number | null>(null);
  const hoverKeyRef = useRef<string | null>(null);
  const [layout, setLayout] = useState<StoryLayoutState>(() => loadStoredLayout());
  const [dragTarget, setDragTarget] = useState<DragTarget>(null);
  const [hoverPreview, setHoverPreview] = useState<HoverPreviewState>(null);
  const [isCoverExpanded, setIsCoverExpanded] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(STORY_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  }, [layout]);

  useEffect(() => {
    function syncLayout(): void {
      const containerWidth = containerRef.current?.getBoundingClientRect().width ?? 0;
      if (containerWidth <= 0) {
        return;
      }

      setLayout((current) => {
        const nextLayout = normalizeLayout(current, containerWidth);
        if (JSON.stringify(nextLayout) === JSON.stringify(current)) {
          return current;
        }
        return nextLayout;
      });
    }

    syncLayout();
    window.addEventListener("resize", syncLayout);
    return () => {
      window.removeEventListener("resize", syncLayout);
    };
  }, []);

  useEffect(() => {
    if (!dragTarget) {
      return;
    }

    function handlePointerMove(event: PointerEvent): void {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) {
        return;
      }

      setLayout((current) => {
        if (dragTarget === "rule" && !current.isRuleCollapsed) {
          const nextRuleWidth = clampNumber(
            event.clientX - rect.left,
            RULE_MIN_WIDTH,
            computeMaxRuleWidth(current, rect.width)
          );
          return {
            ...current,
            ruleWidth: nextRuleWidth
          };
        }

        if (dragTarget === "story" && !current.isStoryCollapsed) {
          const leftAnchor =
            rect.left + getRuleSegmentWidth(current) + getFirstHandleWidth(current);
          const nextStoryWidth = clampNumber(
            event.clientX - leftAnchor,
            STORY_MIN_WIDTH,
            computeMaxStoryWidth(current, rect.width)
          );
          return {
            ...current,
            storyWidth: nextStoryWidth
          };
        }

        return current;
      });
    }

    function handlePointerUp(): void {
      setDragTarget(null);
    }

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragTarget]);

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current !== null) {
        window.clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setIsCoverExpanded(false);
  }, [ruleDirectoryName, storyDirectoryName]);

  function handleSplitterPointerDown(
    target: DragTarget,
    event: ReactPointerEvent<HTMLButtonElement>
  ): void {
    event.preventDefault();
    setDragTarget(target);
  }

  function handleToggleRuleCollapse(): void {
    setLayout((current) => ({
      ...current,
      isRuleCollapsed: !current.isRuleCollapsed
    }));
  }

  function handleToggleStoryCollapse(): void {
    setLayout((current) => ({
      ...current,
      isStoryCollapsed: !current.isStoryCollapsed
    }));
  }

  function clearHoverPreview(): void {
    hoverKeyRef.current = null;
    if (hoverTimeoutRef.current !== null) {
      window.clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHoverPreview(null);
  }

  function scheduleHoverPreview(
    previewKey: string,
    payload: HoverPreviewPayload,
    event: ReactMouseEvent<HTMLElement>
  ): void {
    clearHoverPreview();
    hoverKeyRef.current = previewKey;
    const { clientX, clientY } = event;

    hoverTimeoutRef.current = window.setTimeout(() => {
      if (hoverKeyRef.current !== previewKey) {
        return;
      }

      setHoverPreview({
        x: clientX,
        y: clientY,
        payload
      });
    }, HOVER_DELAY_MS);
  }

  function handleHoverMove(event: ReactMouseEvent<HTMLElement>): void {
    setHoverPreview((current) =>
      current
        ? {
            ...current,
            x: event.clientX,
            y: event.clientY
          }
        : current
    );
  }

  const selectedRule =
    bootstrap?.catalog.find((item) => item.directoryName === ruleDirectoryName) ??
    bootstrap?.catalog[0] ??
    null;
  const stories = selectedRule?.stories ?? [];
  const selectedStory =
    stories.find((item) => item.directoryName === storyDirectoryName) ?? stories[0] ?? null;
  const coverAsset = selectedStory?.assets.find((item) => item.type === "cover") ?? null;
  const ruleIntroText = pickRuleIntroText(selectedRule, text);
  const storyIntroText = pickStoryIntroText(selectedStory, text);
  const storyCoverQuote = pickStoryCoverQuote(selectedStory, text);
  const playerCountLabel = selectedStory
    ? selectedStory.playerCount.min === selectedStory.playerCount.max
      ? storyText.playerCountSingle(selectedStory.playerCount.min)
      : storyText.playerCountRange(
          selectedStory.playerCount.min,
          selectedStory.playerCount.max
        )
    : text.common.none;
  const warningText = selectedStory
    ? renderJoinedList(selectedStory.contentWarnings, text)
    : text.common.none;
  const tagText = selectedStory ? renderJoinedList(selectedStory.tags, text) : text.common.none;
  const ruleThemeText = selectedRule
    ? renderJoinedList(selectedRule.themes, text)
    : text.common.none;
  const rulePaneStyle: CSSProperties = {
    width: layout.ruleWidth,
    minWidth: RULE_MIN_WIDTH
  };

  const storyPaneStyle: CSSProperties = {
    width: layout.storyWidth,
    minWidth: STORY_MIN_WIDTH
  };

  const detailPaneStyle: CSSProperties = {
    minWidth: DETAIL_MIN_WIDTH
  };

  const tooltipStyle: CSSProperties | undefined = hoverPreview
    ? {
        left:
          typeof window !== "undefined"
            ? Math.min(hoverPreview.x + 18, window.innerWidth - 340)
            : hoverPreview.x + 18,
        top:
          typeof window !== "undefined"
            ? Math.min(hoverPreview.y + 18, window.innerHeight - 220)
            : hoverPreview.y + 18
      }
    : undefined;

  return (
    <section className="panel page-panel story-select-page-panel">
      <ScreenHeader
        title={storyText.title}
        description={storyText.description}
        onBack={onBack}
        backLabel={storyText.backLabel}
        onClose={onClose}
        closeLabel={storyText.closeLabel}
      />

      <div className="story-select-summary-strip">
        <div className="summary-card story-select-summary-card">
          <div className="meta-label">{storyText.ruleEyebrow}</div>
          <div className="summary-title">{selectedRule?.ruleTitle ?? text.common.none}</div>
          <div className="summary-text">{selectedRule?.ruleId ?? text.common.none}</div>
        </div>
        <div className="summary-card story-select-summary-card">
          <div className="meta-label">{storyText.storyEyebrow}</div>
          <div className="summary-title">{selectedStory?.title ?? text.common.none}</div>
          <div className="summary-text">
            {stories.length > 0 ? `${stories.length} / ${storyText.storyListTitle}` : storyText.empty}
          </div>
        </div>
        <div className="summary-card story-select-summary-card">
          <div className="meta-label">{storyText.pacingLengthLabel}</div>
          <div className="summary-title">{playerCountLabel}</div>
          <div className="summary-text">
            {selectedStory
              ? `${selectedStory.recommendedLength} / ${selectedStory.recommendedPacing}`
              : text.common.none}
          </div>
        </div>
      </div>

      <div
        className={`story-resizable-layout ${dragTarget ? "story-resizable-layout-dragging" : ""}`}
        ref={containerRef}
      >
        {layout.isRuleCollapsed ? (
          <button
            className="collapsed-pane-toggle"
            onClick={handleToggleRuleCollapse}
            type="button"
          >
            <span className="collapsed-pane-toggle-label">{storyText.collapsedRuleLabel}</span>
            <span className="collapsed-pane-toggle-action">{storyText.expandAction}</span>
          </button>
        ) : (
          <>
            <section className="selection-column story-pane story-pane-rule" style={rulePaneStyle}>
              <div className="selection-column-header selection-column-header-rich">
                <div className="selection-column-copy">
                  <div className="eyebrow">{storyText.ruleEyebrow}</div>
                  <h2>{storyText.ruleListTitle}</h2>
                  <p className="summary-text selection-column-hint">
                    {bootstrap?.catalog.length
                      ? ruleThemeText
                      : text.storySelectScreen.defaultRuleIntro}
                  </p>
                </div>
                <div className="selection-column-tools">
                  <div className="selection-column-count">
                    {String(bootstrap?.catalog.length ?? 0).padStart(2, "0")}
                  </div>
                  <button
                    className="ghost-button pane-toggle-button"
                    onClick={handleToggleRuleCollapse}
                    type="button"
                  >
                    {storyText.collapseAction}
                  </button>
                </div>
              </div>

              <div className="selection-card-list">
                {bootstrap?.catalog.length ? (
                  bootstrap.catalog.map((rule, index) => {
                    const isActive = rule.directoryName === selectedRule?.directoryName;
                    return (
                      <button
                        className={`selection-card selection-card-compact ${isActive ? "selection-card-active" : ""}`}
                        key={rule.directoryName}
                        onClick={() => onRuleChange(rule.directoryName)}
                        onMouseEnter={(event) =>
                          scheduleHoverPreview(
                            `rule:${rule.directoryName}`,
                            buildRuleHoverPayload(rule, text),
                            event
                          )
                        }
                        onMouseLeave={clearHoverPreview}
                        onMouseMove={handleHoverMove}
                        type="button"
                      >
                        <div className="selection-card-topline">
                          <span className="selection-card-index">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <span
                            className={`selection-card-marker ${isActive ? "selection-card-marker-active" : ""}`}
                          />
                        </div>
                        <div className="selection-card-title">{rule.ruleTitle}</div>
                        <div className="selection-card-meta">{rule.ruleId}</div>
                        <div className="selection-card-copy selection-card-copy-singleline">
                          {clipText(rule.ruleIntro, 120, text)}
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="empty-state">{storyText.empty}</div>
                )}
              </div>
            </section>

            <button
              aria-label={storyText.splitterRuleStoryAria}
              className="story-resize-handle"
              onPointerDown={(event) => handleSplitterPointerDown("rule", event)}
              type="button"
            >
              <span className="story-resize-handle-line" />
            </button>
          </>
        )}

        {layout.isStoryCollapsed ? (
          <button
            className="collapsed-pane-toggle collapsed-pane-toggle-story"
            onClick={handleToggleStoryCollapse}
            type="button"
          >
            <span className="collapsed-pane-toggle-label">{storyText.collapsedStoryLabel}</span>
            <span className="collapsed-pane-toggle-action">{storyText.expandAction}</span>
          </button>
        ) : (
          <>
            <section
              className="selection-column selection-column-emphasis story-pane story-pane-story"
              style={storyPaneStyle}
            >
              <div className="selection-column-header selection-column-header-rich">
                <div className="selection-column-copy">
                  <div className="eyebrow">{storyText.storyEyebrow}</div>
                  <h2>{storyText.storyListTitle}</h2>
                  <p className="summary-text selection-column-hint">
                    {selectedStory ? clipText(selectedStory.intro, 100, text) : storyText.empty}
                  </p>
                </div>
                <div className="selection-column-tools">
                  <div className="selection-column-count">
                    {String(stories.length).padStart(2, "0")}
                  </div>
                  <button
                    className="ghost-button pane-toggle-button"
                    onClick={handleToggleStoryCollapse}
                    type="button"
                  >
                    {storyText.collapseAction}
                  </button>
                </div>
              </div>

              <div className="selection-card-list">
                {stories.length ? (
                  stories.map((story, index) => {
                    const isActive = story.directoryName === selectedStory?.directoryName;
                    const storyPlayerLabel =
                      story.playerCount.min === story.playerCount.max
                        ? storyText.playerCountSingle(story.playerCount.min)
                        : storyText.playerCountRange(
                            story.playerCount.min,
                            story.playerCount.max
                          );

                    return (
                      <button
                        className={`selection-card story-card ${isActive ? "selection-card-active" : ""}`}
                        key={story.directoryName}
                        onClick={() => onStoryChange(story.directoryName)}
                        onMouseEnter={(event) =>
                          scheduleHoverPreview(
                            `story:${story.directoryName}`,
                            buildLocalizedStoryHoverPayload(story, text),
                            event
                          )
                        }
                        onMouseLeave={clearHoverPreview}
                        onMouseMove={handleHoverMove}
                        type="button"
                      >
                        <div className="selection-card-topline">
                          <span className="selection-card-index">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <span
                            className={`selection-card-marker ${isActive ? "selection-card-marker-active" : ""}`}
                          />
                        </div>
                        <div className="selection-card-title">{story.title}</div>
                        <div className="selection-card-meta">
                          {storyPlayerLabel}
                          {" / "}
                          {story.recommendedLength}
                        </div>
                        <div className="selection-card-copy selection-card-copy-singleline">
                          {clipText(story.intro, 120, text)}
                        </div>
                        <div className="flag-list">
                          {story.tags.slice(0, 3).map((tag) => (
                            <span className="badge" key={tag}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="empty-state">{storyText.empty}</div>
                )}
              </div>
            </section>

            <button
              aria-label={storyText.splitterStoryDetailAria}
              className="story-resize-handle"
              onPointerDown={(event) => handleSplitterPointerDown("story", event)}
              type="button"
            >
              <span className="story-resize-handle-line" />
            </button>
          </>
        )}

        <section
          className="selection-column selection-detail-column story-pane story-pane-detail"
          style={detailPaneStyle}
        >
          {selectedRule && selectedStory ? (
            <div className="story-detail-panel">
              <div className="story-detail-stagebar">
                <div className="summary-card story-detail-stage-card">
                  <div className="meta-label">{storyText.ruleEyebrow}</div>
                  <div className="summary-title">{selectedRule.ruleTitle}</div>
                  <div className="summary-text">{selectedRule.ruleId}</div>
                </div>
                <div className="summary-card story-detail-stage-card">
                  <div className="meta-label">{storyText.storyEyebrow}</div>
                  <div className="summary-title">{selectedStory.title}</div>
                  <div className="summary-text">{ruleThemeText}</div>
                </div>
                <div className="summary-card story-detail-stage-card">
                  <div className="meta-label">{storyText.pacingLengthLabel}</div>
                  <div className="summary-title">{playerCountLabel}</div>
                  <div className="summary-text">
                    {selectedStory.recommendedLength} / {selectedStory.recommendedPacing}
                  </div>
                </div>
              </div>

              <div
                className={`story-visual-card ${coverAsset ? "story-visual-card-covered" : "story-visual-card-fallback"}`}
              >
                {coverAsset ? (
                  <img
                    alt={storyText.coverAlt(selectedStory.title)}
                    className="story-cover-image"
                    src={coverAsset.url}
                  />
                ) : null}
                <div className="story-cover-placeholder story-cover-overlay">
                  <div className="story-cover-head">
                    <div>
                      <div className="eyebrow">{storyText.storyPreviewEyebrow}</div>
                      <h2>{selectedStory.title}</h2>
                    </div>
                    {coverAsset ? (
                      <button
                        aria-label={
                          isCoverExpanded ? storyText.closeCoverAria : storyText.openCoverAria
                        }
                        className="ghost-button story-cover-expand-button"
                        onClick={() => setIsCoverExpanded(true)}
                        type="button"
                      >
                        {storyText.openCoverButton}
                      </button>
                    ) : null}
                  </div>

                  <p>{storyCoverQuote}</p>

                  <div className="story-cover-chip-row">
                    <span className="badge">{playerCountLabel}</span>
                    <span className="badge">{selectedStory.recommendedLength}</span>
                    <span className="badge">{selectedStory.recommendedPacing}</span>
                  </div>

                  {!coverAsset ? (
                    <p className="story-cover-fallback-copy">{storyText.defaultCoverCopy}</p>
                  ) : null}
                </div>
              </div>

              <div className="summary-card story-detail-cta-panel">
                <div className="story-detail-cta-copy">
                  <div className="meta-label">{storyText.storyPreviewEyebrow}</div>
                  <div className="summary-title">{selectedStory.title}</div>
                  <div className="summary-text">
                    {selectedRule.ruleTitle} / {selectedRule.ruleId}
                  </div>
                </div>
                <button className="primary-button story-detail-cta-button" onClick={onContinue} type="button">
                  {storyText.startAdventure}
                </button>
              </div>

              <div className="story-detail-meta-grid">
                <div className="summary-card">
                  <div className="meta-label">{storyText.tagsLabel}</div>
                  <div className="summary-text">{tagText}</div>
                </div>
                <div className="summary-card">
                  <div className="meta-label">{storyText.pacingLengthLabel}</div>
                  <div className="summary-text">
                    {selectedStory.recommendedPacing} / {selectedStory.recommendedLength}
                  </div>
                </div>
                <div className="summary-card">
                  <div className="meta-label">Rule Themes</div>
                  <div className="summary-text">{ruleThemeText}</div>
                </div>
                <div className="summary-card">
                  <div className="meta-label">Warnings</div>
                  <div className="summary-text">{warningText}</div>
                </div>
              </div>

              <div className="story-detail-copy-grid">
                <div className="summary-card story-detail-block">
                  <div className="meta-label">{storyText.storyIntroLabel}</div>
                  <MarkdownBlock className="story-markdown-block" content={storyIntroText} />
                </div>

                <div className="summary-card story-detail-block">
                  <div className="meta-label">{storyText.ruleIntroLabel}</div>
                  <MarkdownBlock className="story-markdown-block" content={ruleIntroText} />
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state">{storyText.empty}</div>
          )}
        </section>
      </div>

      {hoverPreview ? (
        <div className="story-hover-preview" style={tooltipStyle}>
          <div className="story-hover-preview-title">{hoverPreview.payload.title}</div>
          <div className="story-hover-preview-meta">{hoverPreview.payload.meta}</div>
          <div className="story-hover-preview-body">{hoverPreview.payload.body}</div>
        </div>
      ) : null}

      {coverAsset && isCoverExpanded ? (
        <div
          aria-label={storyText.coverDialogAria}
          className="story-cover-lightbox"
          onClick={() => setIsCoverExpanded(false)}
          role="dialog"
        >
          <div
            className="story-cover-lightbox-panel"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              aria-label={storyText.closeCoverDialogAria}
              className="ghost-button story-cover-lightbox-close"
              onClick={() => setIsCoverExpanded(false)}
              type="button"
            >
              {storyText.closeImageButton}
            </button>
            <img
              alt={storyText.coverDialogAlt(selectedStory.title)}
              className="story-cover-lightbox-image"
              src={coverAsset.url}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
