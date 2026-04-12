import type { SavedGameRecord } from "../storage.ts";
import { useUiText } from "../locales/index.tsx";
import { ScreenHeader } from "./ScreenHeader.tsx";

type RecordsScreenProps = {
  savedGames: SavedGameRecord[];
  isRestoring: boolean;
  onBack: () => void;
  onClearSavedGames: () => void;
  onDeleteSavedGame: (saveId: string) => void;
  onLoadSavedGame: (record: SavedGameRecord) => Promise<void>;
};

export function RecordsScreen(props: RecordsScreenProps) {
  const text = useUiText();
  const { onBack } = props;

  return (
    <section className="panel page-panel">
      <ScreenHeader
        title={text.recordsScreen.title}
        description={text.recordsScreen.description}
        onBack={onBack}
      />

      <div className="empty-state">{text.recordsScreen.empty}</div>
    </section>
  );
}
