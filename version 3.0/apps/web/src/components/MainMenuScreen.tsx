import type {
  CreateSessionRequest,
  SessionSnapshot
} from "../../../../packages/shared-types/src/index.ts";
import { formatDateTime } from "../ui.ts";

type MainMenuScreenProps = {
  recentSnapshot: SessionSnapshot | null;
  locale: CreateSessionRequest["locale"];
  playMode: CreateSessionRequest["playMode"];
  gmArchitecture: CreateSessionRequest["gmArchitecture"];
  modelAccessMode: CreateSessionRequest["modelAccessMode"];
  modelProfileId: string;
  onOpenNewGame: () => void;
  onOpenContinue: () => void;
  onOpenRecords: () => void;
  onOpenSettings: () => void;
  onOpenExit: () => void;
};

export function MainMenuScreen(props: MainMenuScreenProps) {
  const {
    recentSnapshot,
    locale,
    playMode,
    gmArchitecture,
    modelAccessMode,
    modelProfileId,
    onOpenNewGame,
    onOpenContinue,
    onOpenRecords,
    onOpenSettings,
    onOpenExit
  } = props;

  return (
    <div className="menu-grid">
      <section className="panel hero-panel">
        <div className="eyebrow">Main Menu</div>
        <h1>AI TRPG 3.0</h1>
        <p className="lead">
          当前版本已经具备 React 前端、Node 会话服务、mock 假闭环，以及可切换的
          `server_proxy` 多模型入口。现在可以从主菜单进入新游戏、继续游戏、战绩和设置页面。
        </p>

        <div className="menu-button-list">
          <button className="menu-button" onClick={onOpenNewGame} type="button">
            开始游戏
          </button>
          <button className="menu-button" onClick={onOpenContinue} type="button">
            继续游戏
          </button>
          <button className="menu-button" onClick={onOpenRecords} type="button">
            战绩
          </button>
          <button className="menu-button" onClick={onOpenSettings} type="button">
            设置
          </button>
          <button className="menu-button menu-button-danger" onClick={onOpenExit} type="button">
            退出
          </button>
        </div>
      </section>

      <section className="panel summary-panel">
        <div className="summary-card">
          <div className="meta-label">最近进度</div>
          {recentSnapshot ? (
            <>
              <div className="summary-title">{recentSnapshot.contentSummary.storyTitle}</div>
              <div className="summary-text">
                回合 {recentSnapshot.session.currentRound} / 场景{" "}
                {recentSnapshot.session.gameState.sceneId}
              </div>
              <div className="summary-text">
                更新时间：{formatDateTime(recentSnapshot.session.updatedAt)}
              </div>
            </>
          ) : (
            <div className="summary-text">还没有可继续的本地快照。</div>
          )}
        </div>

        <div className="summary-card">
          <div className="meta-label">默认设置</div>
          <div className="summary-text">语言：{locale}</div>
          <div className="summary-text">游戏模式：{playMode}</div>
          <div className="summary-text">主持架构：{gmArchitecture}</div>
          <div className="summary-text">模型模式：{modelAccessMode}</div>
          <div className="summary-text">模型档案：{modelProfileId}</div>
        </div>

        <div className="summary-card">
          <div className="meta-label">当前进度</div>
          <div className="summary-text">Phase 2 进行中</div>
          <div className="summary-text">
            已完成 React 前端迁移、状态化 mock 闭环，以及 `server_proxy` 多模型配置入口。
          </div>
        </div>
      </section>
    </div>
  );
}
