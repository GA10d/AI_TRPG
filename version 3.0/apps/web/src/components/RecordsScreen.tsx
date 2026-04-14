import type { SavedGameRecord } from "../storage.ts";
import { useUiText } from "../locales/index.tsx";
import { formatDateTime } from "../ui.ts";
import { ScreenHeader } from "./ScreenHeader.tsx";

type RecordExportKind = "text" | "comic_html" | "combined_html";

type RecordsScreenProps = {
  savedGames: SavedGameRecord[];
  isRestoring: boolean;
  activeExport: {
    saveId: string;
    kind: RecordExportKind;
  } | null;
  onBack: () => void;
  onClearSavedGames: () => Promise<void>;
  onDeleteSavedGame: (saveId: string) => Promise<void>;
  onExportComicHtml: (record: SavedGameRecord) => Promise<void>;
  onExportCombinedHtml: (record: SavedGameRecord) => Promise<void>;
  onExportSaveText: (record: SavedGameRecord) => Promise<void>;
  onLoadSavedGame: (record: SavedGameRecord) => Promise<void>;
};

export function RecordsScreen(props: RecordsScreenProps) {
  const text = useUiText();
  const {
    activeExport,
    isRestoring,
    onBack,
    onClearSavedGames,
    onDeleteSavedGame,
    onExportComicHtml,
    onExportCombinedHtml,
    onExportSaveText,
    onLoadSavedGame,
    savedGames
  } = props;

  return (
    <section className="panel page-panel">
      <ScreenHeader
        title={text.recordsScreen.title}
        description={text.recordsScreen.description}
        onBack={onBack}
      />

      {savedGames.length > 0 ? (
        <div className="button-row header-actions records-toolbar">
          <button
            className="ghost-button"
            disabled={Boolean(activeExport) || isRestoring}
            onClick={() => void onClearSavedGames()}
            type="button"
          >
            {text.recordsScreen.clearAll}
          </button>
        </div>
      ) : null}

      {savedGames.length > 0 ? (
        <div className="records-list">
          {savedGames.map((record) => {
            const exportingText =
              activeExport?.saveId === record.saveId && activeExport.kind === "text";
            const exportingComic =
              activeExport?.saveId === record.saveId && activeExport.kind === "comic_html";
            const exportingCombined =
              activeExport?.saveId === record.saveId && activeExport.kind === "combined_html";
            const hasWorldlineComic = Boolean(record.worldlineId?.trim());

            return (
              <article className="record-card records-card" key={record.saveId}>
                <div className="record-header">
                  <div>
                    <div className="summary-title">{record.storyTitle}</div>
                    <div className="summary-text">
                      {record.ruleTitle} / Round {record.round} / {record.status}
                    </div>
                  </div>
                  <div className="record-tag">{record.modelProfileId}</div>
                </div>

                <div className="records-meta-grid">
                  <div className="summary-text">
                    {text.recordsScreen.savedAt(formatDateTime(record.savedAt))}
                  </div>
                  <div className="summary-text">
                    {text.recordsScreen.updatedAt(formatDateTime(record.updatedAt))}
                  </div>
                  <div className="summary-text">
                    {text.recordsScreen.locale(record.locale)}
                  </div>
                  <div className="summary-text">
                    {text.recordsScreen.worldline(record.worldlineId?.trim() || text.common.none)}
                  </div>
                </div>

                <div className="record-actions">
                  <button
                    className="primary-button"
                    disabled={isRestoring || Boolean(activeExport)}
                    onClick={() => void onLoadSavedGame(record)}
                    type="button"
                  >
                    {isRestoring ? text.recordsScreen.loadingSave : text.recordsScreen.loadSave}
                  </button>
                  <button
                    className="ghost-button"
                    disabled={isRestoring || Boolean(activeExport)}
                    onClick={() => void onExportSaveText(record)}
                    type="button"
                  >
                    {exportingText ? text.recordsScreen.exportingText : text.recordsScreen.exportText}
                  </button>
                  <button
                    className="ghost-button"
                    disabled={!hasWorldlineComic || isRestoring || Boolean(activeExport)}
                    onClick={() => void onExportComicHtml(record)}
                    type="button"
                  >
                    {exportingComic
                      ? text.recordsScreen.exportingComicHtml
                      : text.recordsScreen.exportComicHtml}
                  </button>
                  <button
                    className="ghost-button"
                    disabled={!hasWorldlineComic || isRestoring || Boolean(activeExport)}
                    onClick={() => void onExportCombinedHtml(record)}
                    type="button"
                  >
                    {exportingCombined
                      ? text.recordsScreen.exportingCombinedHtml
                      : text.recordsScreen.exportCombinedHtml}
                  </button>
                  <button
                    className="ghost-button ghost-button-danger"
                    disabled={Boolean(activeExport) || isRestoring}
                    onClick={() => void onDeleteSavedGame(record.saveId)}
                    type="button"
                  >
                    {text.common.delete}
                  </button>
                </div>

                {!hasWorldlineComic ? (
                  <div className="hint-text records-card-hint">
                    {text.recordsScreen.noComicWorldline}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">{text.recordsScreen.empty}</div>
      )}
    </section>
  );
}
