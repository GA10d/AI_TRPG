import { ScreenHeader } from "./ScreenHeader.tsx";

type ExitScreenProps = {
  onBack: () => void;
  onExit: () => void;
  onClearRecent: () => void;
  onClearRecords: () => void;
};

export function ExitScreen(props: ExitScreenProps) {
  const { onBack, onExit, onClearRecent, onClearRecords } = props;

  return (
    <section className="panel page-panel">
      <ScreenHeader
        title="退出"
        description="网页版本无法稳定直接退出程序，所以这里先提供退出前的整理操作。"
        onBack={onBack}
      />

      <div className="stack-grid">
        <div className="summary-card">
          <div className="meta-label">退出说明</div>
          <div className="summary-text">
            如果只是想离开当前界面，可以返回主菜单；如果想结束当前网页，请关闭浏览器标签页。
          </div>
        </div>

        <div className="button-row">
          <button className="primary-button" onClick={onExit} type="button">
            尝试关闭窗口
          </button>
          <button className="ghost-button" onClick={onClearRecent} type="button">
            清除最近进度
          </button>
          <button className="ghost-button" onClick={onClearRecords} type="button">
            清除战绩摘要
          </button>
        </div>
      </div>
    </section>
  );
}
