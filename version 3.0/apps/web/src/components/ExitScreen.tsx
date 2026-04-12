import { useUiText } from "../locales/index.tsx";
import { ScreenHeader } from "./ScreenHeader.tsx";

type ExitScreenProps = {
  onBack: () => void;
  onExit: () => void;
  onClearRecent: () => void;
  onClearRecords: () => void;
};

export function ExitScreen(props: ExitScreenProps) {
  const text = useUiText();
  const { onBack, onExit, onClearRecent, onClearRecords } = props;

  return (
    <section className="panel page-panel">
      <ScreenHeader
        title={text.exitScreen.title}
        description={text.exitScreen.description}
        onBack={onBack}
      />

      <div className="stack-grid">
        <div className="summary-card">
          <div className="meta-label">{text.exitScreen.noteTitle}</div>
          <div className="summary-text">{text.exitScreen.noteBody}</div>
        </div>

        <div className="button-row">
          <button className="primary-button" onClick={onExit} type="button">
            {text.exitScreen.buttons.tryCloseWindow}
          </button>
          <button className="ghost-button" onClick={onClearRecent} type="button">
            {text.exitScreen.buttons.clearRecent}
          </button>
          <button className="ghost-button" onClick={onClearRecords} type="button">
            {text.exitScreen.buttons.clearRecords}
          </button>
        </div>
      </div>
    </section>
  );
}
