import { useState } from "react";

import { MENU_ANNOUNCEMENTS } from "../content/menuAnnouncements.ts";
import type { AppView } from "../ui.ts";

type VideoMainMenuOverlayProps = {
  onOpenView: (view: AppView) => void;
};

type VideoMenuItem = {
  index: string;
  label: string;
  sublabel: string;
  view: AppView;
  danger?: boolean;
};

const videoMenuItems: VideoMenuItem[] = [
  {
    index: "01",
    label: "开始游戏",
    sublabel: "NEW GAME",
    view: "story_select"
  },
  {
    index: "02",
    label: "内容生成器",
    sublabel: "CONTENT GENERATOR",
    view: "content_generator"
  },
  {
    index: "03",
    label: "继续游戏",
    sublabel: "CONTINUE",
    view: "continue"
  },
  {
    index: "04",
    label: "记录",
    sublabel: "ARCHIVE",
    view: "records"
  },
  {
    index: "05",
    label: "设置",
    sublabel: "SETTINGS",
    view: "settings"
  },
  {
    index: "06",
    label: "退出",
    sublabel: "EXIT",
    view: "exit",
    danger: true
  }
];

export function VideoMainMenuOverlay({ onOpenView }: VideoMainMenuOverlayProps) {
  const [isNoticeOpen, setIsNoticeOpen] = useState(false);
  const latestAnnouncements = MENU_ANNOUNCEMENTS.slice(0, 5);

  return (
    <div className="video-main-menu-overlay">
      <section className="video-main-menu-panel" aria-label="主菜单">
        <div className="video-menu-kicker">MAIN MENU / 主菜单</div>
        <div className="video-menu-rule" />
        <h1 className="video-menu-title">AI TRPG 3.0</h1>
        <p className="video-menu-subtitle">CHOOSE YOUR STORYLINE</p>

        <div className="video-menu-list">
          {videoMenuItems.map((item, itemIndex) => (
            <button
              className={[
                "video-menu-item",
                item.danger ? "video-menu-item-danger" : ""
              ].filter(Boolean).join(" ")}
              key={item.view}
              onClick={() => onOpenView(item.view)}
              type="button"
            >
              <span className="video-menu-index">{item.index}</span>
              <span className="video-menu-copy">
                <span className="video-menu-label">{item.label}</span>
                <span className="video-menu-sublabel">{item.sublabel}</span>
              </span>
              <span className="video-menu-caret" aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>

      <div className="video-menu-footer">
        <button className="video-menu-footer-button" type="button">
          关于
        </button>
        <button
          className="video-menu-footer-button"
          onClick={() => setIsNoticeOpen((current) => !current)}
          type="button"
        >
          公告
        </button>
        <button className="video-menu-footer-button" type="button">
          联系我们
        </button>
      </div>

      {isNoticeOpen ? (
        <section className="video-menu-notice-popover" aria-label="公告与动态">
          <div className="video-menu-notice-header">
            <div>
              <div className="video-menu-notice-kicker">NOTICE</div>
              <h2>公告与动态</h2>
            </div>
            <button
              className="video-menu-notice-close"
              onClick={() => setIsNoticeOpen(false)}
              type="button"
            >
              关闭
            </button>
          </div>
          <div className="video-menu-notice-list">
            {latestAnnouncements.map((announcement) => (
              <article className="video-menu-notice-card" key={announcement.id}>
                <div className="video-menu-notice-date">{announcement.publishedAt}</div>
                <h3>{announcement.title}</h3>
                <p>{announcement.body}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
