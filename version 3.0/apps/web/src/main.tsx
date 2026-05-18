import React, { useState } from "react";
import ReactDOM from "react-dom/client";

import { App } from "./App.tsx";
import { IntroVideoScreen } from "./components/IntroVideoScreen.tsx";
import { VideoMainMenuOverlay } from "./components/VideoMainMenuOverlay.tsx";
import "./styles.css";
import type { AppView } from "./ui.ts";

function Root() {
  const [introComplete, setIntroComplete] = useState(false);
  const [initialView, setInitialView] = useState<AppView>("menu");

  if (introComplete) {
    return <App initialView={initialView} />;
  }

  function openAppView(view: AppView): void {
    setInitialView(view);
    setIntroComplete(true);
  }

  return (
    <IntroVideoScreen
      completeOnSelectionInput={false}
      onComplete={() => openAppView("menu")}
      selectionOverlay={<VideoMainMenuOverlay onOpenView={openAppView} />}
    />
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
