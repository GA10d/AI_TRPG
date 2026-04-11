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
const DEFAULT_RULE_INTRO =
  "这条规则暂时还没有提供 `intro.txt` 或 `intro.md`，当前先使用默认说明。你可以继续选择剧本并进入设置页，后续也可以再补完整的规则简介。";
const DEFAULT_STORY_INTRO =
  "这个剧本暂时还没有提供 `intro.txt` 或 `intro.md`，当前先使用默认说明。你仍然可以进入游戏，后续再补完整简介和演出文本。";
const DEFAULT_COVER_COPY =
  "当前剧本暂时没有提供 `cover.png`，这里先使用默认封面区。后续只要在剧本目录放入 `cover.png`、`cover.jpg` 或 `cover.webp`，这里就会自动读取。";
const DEFAULT_COVER_QUOTE =
  "当前剧本还没有单独提供封面短句，所以这里先回退到剧本简介摘要。";

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

function buildRuleHoverPayload(rule: ContentCatalogEntry): HoverPreviewPayload {
  return {
    title: rule.ruleTitle,
    meta: `${rule.ruleId} · ${renderJoinedList(rule.themes)}`,
    body: clipText(rule.ruleIntro, 320)
  };
}

function buildStoryHoverPayload(story: ContentCatalogStoryEntry): HoverPreviewPayload {
  const playerCountLabel =
    story.playerCount.min === story.playerCount.max
      ? `${story.playerCount.min} 人`
      : `${story.playerCount.min}-${story.playerCount.max} 人`;

  return {
    title: story.title,
    meta: `${playerCountLabel} · ${story.recommendedLength} · ${story.recommendedPacing}`,
    body: clipText(story.intro, 320)
  };
}

function pickRuleIntroText(rule: ContentCatalogEntry | null): string {
  const intro = rule?.ruleIntro?.trim();
  return intro && intro.length > 0 ? intro : DEFAULT_RULE_INTRO;
}

function pickStoryIntroText(story: ContentCatalogStoryEntry | null): string {
  const intro = story?.intro?.trim();
  return intro && intro.length > 0 ? intro : DEFAULT_STORY_INTRO;
}

function pickStoryCoverQuote(story: ContentCatalogStoryEntry | null): string {
  const quote = story?.coverQuote?.trim();
  if (quote && quote.length > 0) {
    return quote;
  }

  const intro = story?.intro?.trim();
  if (intro && intro.length > 0) {
    return clipText(intro, 120);
  }

  return DEFAULT_COVER_QUOTE;
}

export function StorySelectScreen(props: StorySelectScreenProps) {
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
  const ruleIntroText = pickRuleIntroText(selectedRule);
  const storyIntroText = pickStoryIntroText(selectedStory);
  const storyCoverQuote = pickStoryCoverQuote(selectedStory);
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
        title="开始游戏"
        description="先从规则和剧本里挑出这一局的舞台。左侧选规则，中间挑故事，右侧确认氛围与信息。"
        onBack={onBack}
        backLabel="返回主菜单"
        onClose={onClose}
        closeLabel="关闭"
      />

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
            <span className="collapsed-pane-toggle-label">RULE</span>
            <span className="collapsed-pane-toggle-action">展开</span>
          </button>
        ) : (
          <>
            <section className="selection-column story-pane story-pane-rule" style={rulePaneStyle}>
              <div className="selection-column-header">
                <div>
                  <div className="eyebrow">Rule</div>
                  <h2>规则列表</h2>
                </div>
                <button
                  className="ghost-button pane-toggle-button"
                  onClick={handleToggleRuleCollapse}
                  type="button"
                >
                  收起
                </button>
              </div>
              <div className="selection-card-list">
                {bootstrap?.catalog.map((rule) => {
                  const isActive = rule.directoryName === selectedRule?.directoryName;
                  return (
                    <button
                      className={`selection-card ${isActive ? "selection-card-active" : ""}`}
                      key={rule.directoryName}
                      onClick={() => onRuleChange(rule.directoryName)}
                      onMouseEnter={(event) =>
                        scheduleHoverPreview(
                          `rule:${rule.directoryName}`,
                          buildRuleHoverPayload(rule),
                          event
                        )
                      }
                      onMouseLeave={clearHoverPreview}
                      onMouseMove={handleHoverMove}
                      type="button"
                    >
                      <div className="selection-card-title">{rule.ruleTitle}</div>
                      <div className="selection-card-meta">{rule.ruleId}</div>
                      <div className="selection-card-copy selection-card-copy-singleline">
                        {clipText(rule.ruleIntro, 120)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <button
              aria-label="调整规则栏和剧本栏宽度"
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
            <span className="collapsed-pane-toggle-label">STORY</span>
            <span className="collapsed-pane-toggle-action">展开</span>
          </button>
        ) : (
          <>
            <section
              className="selection-column selection-column-emphasis story-pane story-pane-story"
              style={storyPaneStyle}
            >
              <div className="selection-column-header">
                <div>
                  <div className="eyebrow">Story</div>
                  <h2>剧本列表</h2>
                </div>
                <button
                  className="ghost-button pane-toggle-button"
                  onClick={handleToggleStoryCollapse}
                  type="button"
                >
                  收起
                </button>
              </div>
              <div className="selection-card-list">
                {stories.map((story) => {
                  const isActive = story.directoryName === selectedStory?.directoryName;
                  return (
                    <button
                      className={`selection-card story-card ${isActive ? "selection-card-active" : ""}`}
                      key={story.directoryName}
                      onClick={() => onStoryChange(story.directoryName)}
                      onMouseEnter={(event) =>
                        scheduleHoverPreview(
                          `story:${story.directoryName}`,
                          buildStoryHoverPayload(story),
                          event
                        )
                      }
                      onMouseLeave={clearHoverPreview}
                      onMouseMove={handleHoverMove}
                      type="button"
                    >
                      <div className="selection-card-title">{story.title}</div>
                      <div className="selection-card-meta">
                        {story.playerCount.min === story.playerCount.max
                          ? `${story.playerCount.min} 人`
                          : `${story.playerCount.min}-${story.playerCount.max} 人`}
                        {" · "}
                        {story.recommendedLength}
                      </div>
                      <div className="selection-card-copy selection-card-copy-singleline">
                        {clipText(story.intro, 120)}
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
                })}
              </div>
            </section>

            <button
              aria-label="调整剧本栏和详情栏宽度"
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
              <div
                className={`story-visual-card ${coverAsset ? "story-visual-card-covered" : "story-visual-card-fallback"}`}
              >
                {coverAsset ? (
                  <img
                    alt={`${selectedStory.title} 灏侀潰`}
                    className="story-cover-image"
                    src={coverAsset.url}
                  />
                ) : null}
                {coverAsset ? (
                  <button
                    aria-label={isCoverExpanded ? "收起大图" : "查看大图"}
                    className="ghost-button story-cover-expand-button"
                    onClick={() => setIsCoverExpanded(true)}
                    type="button"
                  >
                    查看大图
                  </button>
                ) : null}
                <div className="story-cover-placeholder story-cover-overlay">
                  <div className="eyebrow">Story Preview</div>
                  <h2>{selectedStory.title}</h2>
                  <p>{storyCoverQuote}</p>
                  {!coverAsset ? (
                    <p className="story-cover-fallback-copy">{DEFAULT_COVER_COPY}</p>
                  ) : null}
                </div>
              </div>

              <div className="summary-card story-detail-block">
                <div className="meta-label">剧本简介</div>
                <MarkdownBlock className="story-markdown-block" content={storyIntroText} />
              </div>

              <div className="summary-card story-detail-block">
                <div className="meta-label">规则简介</div>
                <MarkdownBlock className="story-markdown-block" content={ruleIntroText} />
              </div>

              <div className="story-detail-meta-row">
                <div className="summary-card">
                  <div className="meta-label">标签</div>
                  <div className="summary-text">{renderJoinedList(selectedStory.tags)}</div>
                </div>
                <div className="summary-card">
                  <div className="meta-label">节奏与时长</div>
                  <div className="summary-text">
                    {selectedStory.recommendedPacing} / {selectedStory.recommendedLength}
                  </div>
                </div>
              </div>

              <div className="story-detail-footer">
                <div className="summary-text">
                  内容警告：{renderJoinedList(selectedStory.contentWarnings)}
                </div>
                <button className="primary-button" onClick={onContinue} type="button">
                  开始冒险
                </button>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              还没有可用的规则与剧本，请先检查内容包是否已经加载成功。
            </div>
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
          aria-label="剧本封面大图预览"
          className="story-cover-lightbox"
          onClick={() => setIsCoverExpanded(false)}
          role="dialog"
        >
          <div
            className="story-cover-lightbox-panel"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              aria-label="关闭大图预览"
              className="ghost-button story-cover-lightbox-close"
              onClick={() => setIsCoverExpanded(false)}
              type="button"
            >
              收起图片
            </button>
            <img
              alt={`${selectedStory.title} 封面大图`}
              className="story-cover-lightbox-image"
              src={coverAsset.url}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
