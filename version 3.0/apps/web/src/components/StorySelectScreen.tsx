import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent
} from "react";

import type { BootstrapResponse } from "../../../../packages/shared-types/src/index.ts";
import { clipText, renderJoinedList } from "../ui.ts";
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
};

const STORY_LAYOUT_STORAGE_KEY = "trpg3.storySelectLayout";
const RULE_MIN_WIDTH = 220;
const STORY_MIN_WIDTH = 300;
const DETAIL_MIN_WIDTH = 360;
const RULE_COLLAPSED_WIDTH = 52;
const SPLITTER_WIDTH = 14;
const DEFAULT_LAYOUT: StoryLayoutState = {
  ruleWidth: 320,
  storyWidth: 420,
  isRuleCollapsed: false
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
          : DEFAULT_LAYOUT.isRuleCollapsed
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

function normalizeLayout(
  layout: StoryLayoutState,
  containerWidth: number
): StoryLayoutState {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return layout;
  }

  const reservedWidth =
    (layout.isRuleCollapsed ? RULE_COLLAPSED_WIDTH : layout.ruleWidth) +
    (layout.isRuleCollapsed ? 0 : SPLITTER_WIDTH) +
    SPLITTER_WIDTH;
  const maxStoryWidth = Math.max(
    STORY_MIN_WIDTH,
    containerWidth - reservedWidth - DETAIL_MIN_WIDTH
  );
  const storyWidth = clampNumber(layout.storyWidth, STORY_MIN_WIDTH, maxStoryWidth);

  const maxRuleWidth = Math.max(
    RULE_MIN_WIDTH,
    containerWidth - storyWidth - DETAIL_MIN_WIDTH - SPLITTER_WIDTH * 2
  );
  const ruleWidth = clampNumber(layout.ruleWidth, RULE_MIN_WIDTH, maxRuleWidth);

  const normalizedStoryWidth = clampNumber(
    storyWidth,
    STORY_MIN_WIDTH,
    Math.max(
      STORY_MIN_WIDTH,
      containerWidth -
        ((layout.isRuleCollapsed ? RULE_COLLAPSED_WIDTH : ruleWidth) +
          (layout.isRuleCollapsed ? 0 : SPLITTER_WIDTH) +
          SPLITTER_WIDTH +
          DETAIL_MIN_WIDTH)
    )
  );

  return {
    ruleWidth,
    storyWidth: normalizedStoryWidth,
    isRuleCollapsed: layout.isRuleCollapsed
  };
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
  const [layout, setLayout] = useState<StoryLayoutState>(() => loadStoredLayout());
  const [dragTarget, setDragTarget] = useState<DragTarget>(null);

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
        if (
          nextLayout.ruleWidth === current.ruleWidth &&
          nextLayout.storyWidth === current.storyWidth &&
          nextLayout.isRuleCollapsed === current.isRuleCollapsed
        ) {
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
          const maxRuleWidth = Math.max(
            RULE_MIN_WIDTH,
            rect.width - current.storyWidth - DETAIL_MIN_WIDTH - SPLITTER_WIDTH * 2
          );
          return {
            ...current,
            ruleWidth: clampNumber(event.clientX - rect.left, RULE_MIN_WIDTH, maxRuleWidth)
          };
        }

        const leftAnchor =
          rect.left +
          (current.isRuleCollapsed
            ? RULE_COLLAPSED_WIDTH
            : current.ruleWidth + SPLITTER_WIDTH);
        const maxStoryWidth = Math.max(
          STORY_MIN_WIDTH,
          rect.width -
            ((current.isRuleCollapsed ? RULE_COLLAPSED_WIDTH : current.ruleWidth) +
              (current.isRuleCollapsed ? 0 : SPLITTER_WIDTH) +
              SPLITTER_WIDTH +
              DETAIL_MIN_WIDTH)
        );

        return {
          ...current,
          storyWidth: clampNumber(
            event.clientX - leftAnchor,
            STORY_MIN_WIDTH,
            maxStoryWidth
          )
        };
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

  const selectedRule =
    bootstrap?.catalog.find((item) => item.directoryName === ruleDirectoryName) ??
    bootstrap?.catalog[0] ??
    null;
  const stories = selectedRule?.stories ?? [];
  const selectedStory =
    stories.find((item) => item.directoryName === storyDirectoryName) ?? stories[0] ?? null;
  const coverAsset = selectedStory?.assets.find((item) => item.type === "cover") ?? null;

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

  return (
    <section className="panel page-panel">
      <ScreenHeader
        title="开始游戏"
        description="先从规则和剧本里挑出这一局的舞台。左侧选规则，中间锁定故事，右侧确认氛围与关键信息。"
        onBack={onBack}
        backLabel="返回主菜单"
        onClose={onClose}
        closeLabel="关闭"
      />

      <div
        className={`story-resizable-layout ${
          layout.isRuleCollapsed ? "story-resizable-layout-rule-collapsed" : ""
        } ${dragTarget ? "story-resizable-layout-dragging" : ""}`}
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
                      type="button"
                    >
                      <div className="selection-card-title">{rule.ruleTitle}</div>
                      <div className="selection-card-meta">{rule.ruleId}</div>
                      <div className="selection-card-copy">{clipText(rule.ruleIntro, 92)}</div>
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

        <section
          className="selection-column selection-column-emphasis story-pane story-pane-story"
          style={storyPaneStyle}
        >
          <div className="selection-column-header">
            <div className="eyebrow">Story</div>
            <h2>剧本列表</h2>
          </div>
          <div className="selection-card-list">
            {stories.map((story) => {
              const isActive = story.directoryName === selectedStory?.directoryName;
              return (
                <button
                  className={`selection-card story-card ${isActive ? "selection-card-active" : ""}`}
                  key={story.directoryName}
                  onClick={() => onStoryChange(story.directoryName)}
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
                  <div className="selection-card-copy">{clipText(story.intro, 110)}</div>
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

        <section
          className="selection-column selection-detail-column story-pane story-pane-detail"
          style={detailPaneStyle}
        >
          {selectedRule && selectedStory ? (
            <div className="story-detail-panel">
              <div className="story-visual-card">
                {coverAsset ? (
                  <img
                    alt={`${selectedStory.title} 封面`}
                    className="story-cover-image"
                    src={coverAsset.url}
                  />
                ) : (
                  <div className="story-cover-placeholder">
                    <div className="eyebrow">Story Preview</div>
                    <h2>{selectedStory.title}</h2>
                    <p>{clipText(selectedStory.intro, 120)}</p>
                  </div>
                )}
              </div>

              <div className="story-detail-copy">
                <div className="eyebrow">Story Detail</div>
                <h2>{selectedStory.title}</h2>
                <p className="summary-text">{clipText(selectedStory.intro, 260)}</p>
              </div>

              <div className="story-detail-matrix">
                <div className="summary-card">
                  <div className="meta-label">规则简介</div>
                  <div className="summary-text">{clipText(selectedRule.ruleIntro, 180)}</div>
                </div>
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
                <div className="summary-card">
                  <div className="meta-label">支持模式</div>
                  <div className="summary-text">
                    {renderJoinedList(selectedStory.supportsModes)}
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
    </section>
  );
}
