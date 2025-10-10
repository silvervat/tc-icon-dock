import React from "react";
import { createRoot } from "react-dom/client";
import IconDockTC from "./IconDockTC";
import { CONFIG } from "./config";

// @ts-expect-error – kui TC Workspace injekteerib viewer'i
const viewer = (window as any)?.TCWorkspace?.viewer || (window as any).TCViewer || undefined;

const projectIdFromUrl = new URL(window.location.href).searchParams.get("projectId") || undefined;
const projectId = projectIdFromUrl || CONFIG.DEFAULT_PROJECT_ID || undefined;

const root = createRoot(document.getElementById("root")!);
root.render(
  <React.StrictMode>
    <IconDockTC viewer={viewer} projectId={projectId} />
  </React.StrictMode>
);
