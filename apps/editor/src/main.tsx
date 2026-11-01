import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { startBrowserPreviewBridge } from "./core/browser-preview";
import React from "react";
import { createRoot } from "react-dom/client";
import { initializeLocalWorkspace } from "./core/local-workspace";
import { App } from "./App";
import "./style.css";
import "./ui.css";
import "./editor-controls.css";
import "./i18n";
document.documentElement.classList.add("dark");
void initializeLocalWorkspace()
  .then(() => {
    startBrowserPreviewBridge();
    createRoot(document.getElementById("root")!).render(
      <DndProvider backend={HTML5Backend}>
        <App />
      </DndProvider>,
    );
  })
  .catch((e) => {
    document.getElementById("root")!.textContent = e.message;
  });
