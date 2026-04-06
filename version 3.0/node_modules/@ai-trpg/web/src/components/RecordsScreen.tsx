import type { SessionRecord } from "../storage.ts";
import { formatDateTime } from "../ui.ts";
import { ScreenHeader } from "./ScreenHeader.tsx";

type RecordsScreenProps = {
  records: SessionRecord[];
  isRestoring: boolean;
  onBack: () => void;
  onClearRecords: () => void;
  onOpenRecord: (record: SessionRecord) => Promise<void>;
};

export function RecordsScreen(props: RecordsScreenProps) {
  const { records, isRestoring, onBack, onClearRecords, onOpenRecord } = props;

  return (
    <section className="panel page-panel">
      <ScreenHeader
        title="战绩"
        description="这里先展示本地保存的会话摘要。"
        onBack={onBack}
      />

      {records.length === 0 ? (
        <div className="empty-state">还没有本地战绩记录。</div>
      ) : (
        <div className="stack-grid">
          <div className="button-row">
            <button className="ghost-button" onClick={onClearRecords} type="button">
              清空本地战绩摘要
            </button>
          </div>

          <div className="records-grid">
            {records.map((record) => (
              <article className="record-card" key={record.sessionId}>
                <div className="record-header">
                  <div>
                    <div className="summary-title">{record.storyTitle}</div>
                    <div className="summary-text">{record.ruleTitle}</div>
                  </div>
                  <span className="badge">{record.status}</span>
                </div>

                <div className="summary-text">Session: {record.sessionId}</div>
                <div className="summary-text">场景: {record.sceneId}</div>
                <div className="summary-text">回合: {record.round}</div>
                <div className="summary-text">语言: {record.locale}</div>
                <div className="summary-text">
                  最后更新: {formatDateTime(record.updatedAt)}
                </div>

                <div className="button-row">
                  <button
                    className="ghost-button"
                    disabled={isRestoring}
                    onClick={() => void onOpenRecord(record)}
                    type="button"
                  >
                    尝试载入
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
