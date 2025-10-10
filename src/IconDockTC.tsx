import React, { useEffect, useRef, useState } from "react";

/**
 * IconDock – Trimble Connect kompaktne overlay (VASAK alumine nurk, mudeli peal)
 * -------------------------------------------------------------------------------
 * ✓ AUTOMAATSELT PEIDAB VASAKU VALGE PANEELI kohe laadimisel
 * ✓ Kompaktne ikoonidokk vasakul all
 * ✓ Kõik funktsioonid: snapshot, link, zoom, full screen
 */

type ViewerLike = any;

const COLORS = {
  navy: "#0A3A67",
  darkNavy: "#082943",
  white: "#FFFFFF",
};

const ASSEMBLY_KEYS = [
  "Kooste märk (BLOCK)",
  "Assembly",
  "ASSEMBLY",
  "Tekla_Assembly.AssemblyCast_unit_mark",
];

// --- Utiliidid ---------------------------------------------------------------
function flattenProps(input: any): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (o: any, prefix = "") => {
    if (!o || typeof o !== "object") return;
    for (const [k, v] of Object.entries(o)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object") walk(v as any, key);
      else out[key] = v == null ? "" : String(v);
      out[k] = v == null ? "" : String(v);
    }
  };
  walk(input);
  return out;
}

function firstNonEmpty(obj: Record<string, string>, keys: string[]): string | undefined {
  for (const k of keys) if (obj[k]?.trim()) return obj[k].trim();
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) lower[k.toLowerCase()] = v as string;
  for (const k of keys) if (lower[k.toLowerCase()]?.trim()) return lower[k.toLowerCase()].trim();
  return undefined;
}

// --- Viewer utiliidid --------------------------------------------------------
async function resolveActiveModelId(viewer: ViewerLike): Promise<string | undefined> {
  try {
    if (!viewer?.getModels) return undefined;
    const loaded = await viewer.getModels("loaded").catch(() => null);
    const list = (loaded && loaded.length ? loaded : await viewer.getModels()) || [];
    const visible = list.find((m: any) => m?.visible === true);
    return (visible?.id || list[0]?.id) as string | undefined;
  } catch {
    return undefined;
  }
}

async function getSelectionRuntimeIds(viewer: ViewerLike): Promise<{ modelId: string; runtimeIds: number[] } | null> {
  try {
    const sel = await viewer.getSelection?.();
    if (sel && Array.isArray(sel) && sel[0]?.modelId && sel[0]?.objectRuntimeIds?.length) {
      return { modelId: sel[0].modelId as string, runtimeIds: sel[0].objectRuntimeIds as number[] };
    }
  } catch {}
  return null;
}

async function runtimeToIfcGuid(viewer: ViewerLike, modelId: string, runtimeIds: number[]): Promise<string[]> {
  try {
    if (!viewer?.convertToObjectIds) return [];
    const exIds: string[] = await viewer.convertToObjectIds(modelId, runtimeIds);
    return exIds || [];
  } catch {
    return [];
  }
}

async function ifcGuidToRuntime(viewer: ViewerLike, modelId: string, guids: string[]): Promise<number[]> {
  try {
    if (!viewer?.convertToObjectRuntimeIds) return [];
    const rids: number[] = await viewer.convertToObjectRuntimeIds(modelId, guids);
    return (rids || []).filter((x) => x != null);
  } catch {
    return [];
  }
}

async function getPropsForRuntime(viewer: ViewerLike, modelId: string, runtimeIds: number[]) {
  try {
    if (!runtimeIds.length || !viewer?.getObjectProperties) return [];
    const props = await viewer.getObjectProperties(modelId, runtimeIds);
    return props || [];
  } catch {
    return [];
  }
}

async function getSnapshot(viewer: ViewerLike): Promise<string | undefined> {
  try {
    if (viewer?.getSnapshot) return await viewer.getSnapshot();
    if (viewer?.getScreenshot) return await viewer.getScreenshot({ width: 1600, height: 900, includeUI: false });
  } catch {}
  return undefined;
}

async function focusByGuid(viewer: ViewerLike, modelId: string, guid: string) {
  try {
    const rids = await ifcGuidToRuntime(viewer, modelId, [guid]);
    if (!rids.length) return;
    await viewer.setSelection?.([{ modelId, objectRuntimeIds: rids }]);
  } catch {}
}

// --- React komponent ---------------------------------------------------------
export default function IconDockTC({ 
  viewer, 
  projectId: initialProjectId 
}: { 
  viewer: ViewerLike; 
  projectId?: string; 
}) {
  const [toast, setToast] = useState("");
  const [preview, setPreview] = useState<string>("");
  const projectIdRef = useRef<string | undefined>(initialProjectId);
  const [modelId, setModelId] = useState<string | undefined>(undefined);
  const [panelHidden, setPanelHidden] = useState(false);

  // ✨ AUTOMAATNE PEITMINE: init mudel + peida vasak paneel kohe
  useEffect(() => {
    (async () => {
      const id = await resolveActiveModelId(viewer);
      setModelId(id);
    })();

    // PEIDA VASAK PANEEL AUTOMAATSELT
    const styleId = "tc-auto-hide-left-panel";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.innerHTML = `
        /* =====================================================
           AUTOMAATNE VASAKU PANEELI PEITMINE
           ===================================================== */
        
        /* Peida kõik vasakpoolsed elemendid */
        .tc-left-panel,
        .modus-sidebar,
        .left-navigation,
        .navigation-pane,
        .sidebar,
        aside[class*="left"],
        aside[class*="Left"],
        div[class*="LeftPanel"],
        div[class*="leftPanel"],
        div[class*="SidePanel"]:first-of-type,
        div[class*="sidebar"]:first-of-type,
        aside:first-of-type,
        nav:first-of-type {
          display: none !important;
          width: 0 !important;
          opacity: 0 !important;
        }
        
        /* Laienda viewer täislaiuseks */
        .viewer-container,
        .main-view,
        .tc-3d-viewer,
        .workspace-content,
        div[class*="ViewerContainer"],
        div[class*="MainContent"],
        div[class*="workspace"],
        main,
        canvas {
          width: 100% !important;
          left: 0 !important;
          margin-left: 0 !important;
        }
        
        /* Erilised Trimble Connect selektorid */
        [class*="WorkspaceLayout"] > aside:first-child,
        [class*="MainLayout"] > aside:first-child {
          display: none !important;
        }
      `;
      document.head.appendChild(style);
      setPanelHidden(true);
      console.log("✓ Vasak paneel automaatselt peidetud");
    }
  }, [viewer]);

  // URL-ist GUID lugemine
  useEffect(() => {
    (async () => {
      const u = new URL(window.location.href);
      const guid = u.searchParams.get("guid");
      const mId = u.searchParams.get("modelId") || modelId || (await resolveActiveModelId(viewer));
      if (guid && mId) {
        await focusByGuid(viewer, mId, guid);
        setToast(`🔍 Fokusseeritud: ${guid.substring(0, 12)}...`);
      }
    })();
  }, [viewer, modelId]);

  // --- Toimingud ---
  async function actionMakeLink() {
    const pair = await getSelectionRuntimeIds(viewer);
    const mId = modelId || pair?.modelId || (await resolveActiveModelId(viewer));
    
    if (!mId || !pair?.runtimeIds?.length) {
      setToast("⚠️ Vali mudelist objekt");
      return;
    }

    const guids = await runtimeToIfcGuid(viewer, mId, pair.runtimeIds);
    const guid = guids[0];
    
    if (!guid) {
      setToast("⚠️ IFC GUID puudub");
      return;
    }

    const url = new URL(window.location.href);
    if (projectIdRef.current) url.searchParams.set("projectId", projectIdRef.current);
    url.searchParams.set("modelId", mId);
    url.searchParams.set("guid", guid);
    
    const linkUrl = url.toString();
    
    try {
      await navigator.clipboard.writeText(linkUrl);
      setToast("✓ Link kopeeritud");
    } catch {
      setToast(`📋 ${linkUrl.substring(0, 50)}...`);
    }
  }

  async function actionSnapAndSend() {
    const mId = modelId || (await resolveActiveModelId(viewer));
    if (!mId) {
      setToast("⚠️ Mudelit ei leitud");
      return;
    }

    const pair = await getSelectionRuntimeIds(viewer);
    if (!pair?.runtimeIds?.length) {
      setToast("⚠️ Vali objekt pildistamiseks");
      return;
    }

    const guids = await runtimeToIfcGuid(viewer, mId, pair.runtimeIds);
    const guid = guids[0] || "";
    
    const props = await getPropsForRuntime(viewer, mId, [pair.runtimeIds[0]]);
    const flat = flattenProps(props?.[0] || {});
    const assembly = firstNonEmpty(flat, ASSEMBLY_KEYS) || "";

    const png = await getSnapshot(viewer);
    if (!png) {
      setToast("⚠️ Snapshot ebaõnnestus");
      return;
    }

    const comment = window.prompt("Lisa kommentaar:", "") || "";
    
    setToast(`✓ GUID: ${guid.substring(0, 8)}... | ASM: ${assembly || "(puudub)"}`);
    setPreview(png);

    // TODO: Saada webhook'i
    // await fetch(WEBHOOK_URL, { ... });
  }

  async function actionZoomPrompt() {
    const guid = window.prompt("Sisesta IFC GUID:", "");
    if (!guid?.trim()) return;
    
    const mId = modelId || (await resolveActiveModelId(viewer));
    if (!mId) {
      setToast("⚠️ Mudelit ei leitud");
      return;
    }
    
    await focusByGuid(viewer, mId, guid.trim());
    setToast(`🔍 Fookus: ${guid.substring(0, 12)}...`);
  }

  function toggleFullScreen() {
    if (!document.fullscreenElement) {
      document.documentElement
        .requestFullscreen()
        .then(() => setToast("✓ Täisekraan"))
        .catch(() => setToast("⚠️ Täisekraan ebaõnnestus"));
    } else {
      document
        .exitFullscreen()
        .then(() => setToast("✓ Tavavaade"))
        .catch(() => setToast("⚠️ Väljumine ebaõnnestus"));
    }
  }

  function toggleLeftPanel() {
    const styleId = "tc-auto-hide-left-panel";
    const existing = document.getElementById(styleId);
    
    if (existing) {
      existing.remove();
      setPanelHidden(false);
      setToast("✓ Paneel nähtav");
    } else {
      // Lisa peitmine uuesti
      const style = document.createElement("style");
      style.id = styleId;
      style.innerHTML = `
        .tc-left-panel, .modus-sidebar, .left-navigation, .navigation-pane, .sidebar,
        aside[class*="left"], aside[class*="Left"], div[class*="LeftPanel"],
        div[class*="leftPanel"], aside:first-of-type { display: none !important; }
        .viewer-container, .main-view, .tc-3d-viewer, main { 
          width: 100% !important; left: 0 !important; margin-left: 0 !important; 
        }
      `;
      document.head.appendChild(style);
      setPanelHidden(true);
      setToast("✓ Paneel peidetud");
    }
  }

  // --- Render ---
  return (
    <>
      {/* ✨ Ujuv dock VASAKUL ALL */}
      <div
        style={{
          position: "fixed",
          left: 16,
          bottom: 20,
          width: 48,
          background: COLORS.navy,
          borderRadius: 12,
          boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
          padding: 8,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          zIndex: 999999,
        }}
      >
        <DockButton
          title="Pildista + saada"
          onClick={actionSnapAndSend}
          icon={<CameraIcon />}
        />
        <DockButton
          title="Genereeri link valikule"
          onClick={actionMakeLink}
          icon={<LinkIcon />}
        />

        <Divider />

        <DockButton
          title="Zoom IFC GUID-iga"
          onClick={actionZoomPrompt}
          icon={<ZoomIcon />}
        />
        <DockButton
          title="Täisekraan"
          onClick={toggleFullScreen}
          icon={<FullScreenIcon />}
        />
        <DockButton
          title={panelHidden ? "Näita vasakut paneeli" : "Peida vasak paneel"}
          onClick={toggleLeftPanel}
          icon={<HidePanelIcon />}
          accent={panelHidden}
        />

        <Divider />

        <DockButton
          title="Seaded"
          onClick={() => alert("Seadete dialoog (tuleb)")}
          icon={<SettingsIcon />}
        />
      </div>

      {/* Toast teated */}
      {toast && (
        <div
          style={{
            position: "fixed",
            right: 20,
            bottom: 20,
            background: "rgba(8,41,67,0.95)",
            color: COLORS.white,
            padding: "10px 16px",
            borderRadius: 8,
            fontSize: 13,
            fontFamily: "system-ui, -apple-system, sans-serif",
            zIndex: 999999,
            maxWidth: 380,
            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
            animation: "fadeIn 0.2s ease-out",
            cursor: "pointer",
          }}
          onClick={() => setToast("")}
        >
          {toast}
        </div>
      )}

      {/* Preview modal */}
      {preview && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999999,
            padding: 20,
          }}
          onClick={() => setPreview("")}
        >
          <img
            src={preview}
            alt="Snapshot"
            style={{
              maxWidth: "90%",
              maxHeight: "90%",
              borderRadius: 8,
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            }}
          />
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}

// --- Nupu komponent ---
function DockButton({
  title,
  onClick,
  icon,
  accent = false,
}: {
  title: string;
  onClick: () => void;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        background: accent 
          ? (isHovered ? "#4ADE80" : "#22C55E")
          : (isHovered ? "#FFFFFF" : "rgba(255,255,255,0.9)"),
        border: "none",
        boxShadow: isHovered
          ? "0 4px 12px rgba(0,0,0,0.2)"
          : "0 2px 6px rgba(0,0,0,0.15)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        transition: "all 0.2s ease",
        transform: isHovered ? "scale(1.05)" : "scale(1)",
      }}
    >
      {icon}
    </button>
  );
}

function Divider() {
  return (
    <div
      style={{
        height: 1,
        background: "rgba(255,255,255,0.3)",
        margin: "2px 0",
      }}
    />
  );
}

// --- Ikoonid ---
function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#0A3A67" strokeWidth="2">
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#0A3A67" strokeWidth="2">
      <path d="M10 13a5 5 0 007.07 0l1.41-1.41a5 5 0 10-7.07-7.07L10 5" />
      <path d="M14 11a5 5 0 00-7.07 0L5.5 12.41a5 5 0 107.07 7.07L14 19" />
    </svg>
  );
}

function ZoomIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#0A3A67" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35M11 8v6M8 11h6" />
    </svg>
  );
}

function FullScreenIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="#0A3A67">
      <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
    </svg>
  );
}

function HidePanelIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#0A3A67" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#0A3A67" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v6m0 6v10M6.34 7.34l4.24 4.24m5.66 5.66l4.24 4.24M1 12h6m6 0h10M6.34 16.66l4.24-4.24m5.66-5.66l4.24-4.24" />
    </svg>
  );
}




