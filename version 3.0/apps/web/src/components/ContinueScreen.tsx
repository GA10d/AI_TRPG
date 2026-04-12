import type { SessionSnapshot } from "../../../../packages/shared-types/src/index.ts";
import { useUiText } from "../locales/index.tsx";
import type { SavedGameRecord } from "../storage.ts";
import { formatDateTime } from "../ui.ts";
import { ScreenHeader } from "./ScreenHeader.tsx";

type ContinueScreenProps = {
  recentSave: SavedGameRecord | null;
  recentSnapshot: SessionSnapshot | null;
  isRestoring: boolean;
  onBack: () => void;
  onContinueSavedGame: () => Promise<void>;
  onContinueSnapshot: () => Promise<void>;
  onClearRecent: () => void;
  onRemoveRecentSave: () => void;
};

export function ContinueScreen(props: ContinueScreenProps) {
  const text = useUiText();
  const {
    recentSave,
    recentSnapshot,
    isRestoring,
    onBack,
    onContinueSavedGame,
    onContinueSnapshot,
    onClearRecent,
    onRemoveRecentSave
  } = props;

  const hasRecentSave = Boolean(recentSave);
  const hasRecentSnapshot = Boolean(recentSnapshot);

  return (
    <section className="panel page-panel">
      <ScreenHeader
        title={text.continueScreen.title}
        description={text.continueScreen.description}
        onBack={onBack}
      />

      {!hasRecentSave && !hasRecentSnapshot ? (
        <div className="empty-state">{text.continueScreen.empty}</div>
      ) : (
        <div className="stack-grid">
          {recentSave ? (
            <div className="summary-card">
              <div className="meta-label">{text.continueScreen.recentSave}</div>
              <div className="summary-title">{recentSave.storyTitle}</div>
              <div className="summary-text">{text.continueScreen.rule(recentSave.ruleTitle)}</div>
              <div className="summary-text">{text.continueScreen.status(recentSave.status)}</div>
              <div className="summary-text">{text.continueScreen.round(recentSave.round)}</div>
              <div className="summary-text">{text.continueScreen.model(recentSave.modelProfileId)}</div>
              <div className="summary-text">
                {text.continueScreen.savedAt(formatDateTime(recentSave.savedAt))}
              </div>
            </div>
          ) : null}

          {!recentSave && recentSnapshot ? (
            <div className="summary-card">
              <div className="meta-label">{text.continueScreen.recentSnapshot}</div>
              <div className="summary-title">{recentSnapshot.contentSummary.storyTitle}</div>
              <div className="summary-text">
                {text.continueScreen.rule(recentSnapshot.contentSummary.ruleTitle)}
              </div>
              <div className="summary-text">
                {text.continueScreen.status(recentSnapshot.session.status)}
              </div>
              <div className="summary-text">
                {text.continueScreen.round(recentSnapshot.session.currentRound)}
              </div>
              <div className="summary-text">
                {text.continueScreen.updatedAt(formatDateTime(recentSnapshot.session.updatedAt))}
              </div>
            </div>
          ) : null}

          <div className="button-row">
            {recentSave ? (
              <button
                className="primary-button"
                disabled={isRestoring}
                onClick={() => void onContinueSavedGame()}
                type="button"
              >
                {isRestoring ? text.continueScreen.restoring : text.continueScreen.continueSave}
              </button>
            ) : null}

            {!recentSave && recentSnapshot ? (
              <button
                className="primary-button"
                disabled={isRestoring}
                onClick={() => void onContinueSnapshot()}
                type="button"
              >
                {isRestoring
                  ? text.continueScreen.restoring
                  : text.continueScreen.continueSnapshot}
              </button>
            ) : null}

            {recentSave ? (
              <button className="ghost-button" onClick={onRemoveRecentSave} type="button">
                {text.continueScreen.removeRecentSave}
              </button>
            ) : null}

            {!recentSave && recentSnapshot ? (
              <button className="ghost-button" onClick={onClearRecent} type="button">
                {text.continueScreen.clearRecentSnapshot}
              </button>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
