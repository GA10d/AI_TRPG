import type { SavedGameRecord } from "../storage.ts";
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
  const { onBack } = props;

  return (
    <section className="panel page-panel">
      <ScreenHeader
        title="战绩"
        description="这里后续会放正式的战绩、结局记录和统计内容。"
        onBack={onBack}
      />

      <div className="empty-state">待开发</div>
    </section>
  );
}
