import React from "react";
import ReactDOM from "react-dom/client";

import { useState } from "react";

import { App } from "./App.tsx";
import { IntroVideoScreen } from "./components/IntroVideoScreen.tsx";
import "./styles.css";

function Root() {
  const [introComplete, setIntroComplete] = useState(false);

  if (introComplete) {
    return <App />;
  }

  return (
    <IntroVideoScreen
      onComplete={() => setIntroComplete(true)}
      selectionOverlay={<div className="intro-video-selection-slot" />}
    />
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
