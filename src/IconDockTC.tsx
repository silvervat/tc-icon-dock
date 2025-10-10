import React, { useEffect, useRef, useState } from "react";

/**
 * IconDock – Trimble Connect kompaktne overlay (mudeli peal, vasak alumine nurk)
 * --------------------------------------------------------------------------------
 * • Puhas overlay ILMA Trimble'i paneeli struktuuri kasutamata
 * • Vasakul all, mudeli peal (nagu esimesel snipil näidatud)
 * • Kitsas vertikaalne dokk ikoonidega
 * • "Pildista + saada" — võtab snapshot'i, küsib kommentaari
 * • "Genereeri link" — URL ?projectId=&modelId=&guid=
 * • "Zoom GUID-iga" — fokusseerib IFC GUID-ile
 * • "Full screen" — lülitab täisekraani režiimi
 * • "Peida paneel" — peidab vasaku paneeli CSS-ga
 */

type ViewerLike = any;

const COLORS = {
  navy: "#0A3A67",
  darkNavy: "#082943",
  white: "#FFFFFF",
};

// Eelistatud võtmed
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

  // Init: leia mudel
  useEffect(() => {
    (async () => {
      const id = await resolveActiveModelId(viewer);
      setModelId(id);
    })();
  }, [viewer]);

  // URL-ist GUID lugemine ja fokusseerimine
  useEffect(() => {
    (async () => {
      const u = new URL(window.location.href);
      const guid = u.searchParams.get("guid");
      const mId = u.searchParams.get("modelId") || modelId || (await resolveActiveModelId(viewer));
      if (guid && mId) await focusByGuid(viewer, mId, guid);
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
      setToast(`📋 ${linkUrl}`);
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
    
    setToast(`✓ GUID: ${guid.substring(0, 8)}... | ASM: ${assembly}`);
    setPreview(png);

    // NB! Siin saada päris webhook'i:
    // await fetch(WEBHOOK_URL, {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify({
    //     projectId: projectIdRef.current,
    //     modelId: mId,
    //     guid,
    //     assembly,
    //     comment,
    //     screenshot: png
    //   })
    // });
  }

  async function actionZoomPrompt() {
    const guid = window.prompt("Sisesta IFC GUID:", "");
    if (!guid) return;
    
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

  function hideLeftPanel() {
    // Peida Trimble Connect'i vasak paneel CSS-ga
    const styleId = "tc-hide-left-panel";
    
    if (document.getElementById(styleId)) {
      // Kui juba peidetud, eemalda
      document.getElementById(styleId)?.remove();
      setToast("✓ Paneel nähtav");
      return;
    }

    const style = document.createElement("style");
    style.id = styleId;
    style.innerHTML = `
      /* Peida Trimble Connect vasak paneel */
      .tc-left-panel,
      .modus-sidebar,
      .left-navigation,
      .navigation-pane,
      .sidebar,
      [class*="LeftPanel"],
      [class*="leftPanel"],
      [class*="SidePanel"]:first-child {
        display: none !important;
      }
      
      /* Laienda viewer täislaiuseks */
      .viewer-container,
      .main-view,
      .tc-3d-viewer,
      [class*="ViewerContainer"],
      [class*="MainContent"] {
        width: 100% !important;
        left: 0 !important;
        margin-left: 0 !important;
      }
    `;
    document.head.appendChild(style);
    setToast("✓ Paneel peidetud");
  }

  // --- Render: VASAKUL ALL, kompaktne overlay ---
  return (
    <>
      {/* Ujuv dock – VASAK alumine nurk, mudeli peal */}
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
          zIndex: 999999, // Väga kõrge z-index, et oleks mudeli peal
        }}
      >
        {/* Peamine nupurida */}
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

        {/* Eraldaja */}
        <div
          style={{
            height: 1,
            background: "rgba(255,255,255,0.3)",
            margin: "2px 0",
          }}
        />

        {/* Teisesed nupud */}
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
          title="Peida/näita vasak paneel"
          onClick={hideLeftPanel}
          icon={<HidePanelIcon />}
        />

        {/* Eraldaja */}
        <div
          style={{
            height: 1,
            background: "rgba(255,255,255,0.3)",
            margin: "2px 0",
          }}
        />

        {/* Seaded */}
        <DockButton
          title="Seaded"
          onClick={() => alert("Seadete dialoog (tuleb)")}
          icon={<SettingsIcon />}
        />
      </div>

      {/* Toast - paremal all, et mitte katta doki */}
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
          }}
          onClick={() => setToast("")}
        >
          {toast}
        </div>
      )}

      {/* Preview (kui on) */}
      {preview && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.8)",
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

      {/* Lisame fade-in animatsiooni */}
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
}: {
  title: string;
  onClick: () => void;
  icon: React.ReactNode;
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
        background: isHovered ? "#FFFFFF" : "rgba(255,255,255,0.9)",
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

// --- Ikoonid (inline SVG) ----------------------------------------------------
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
      <path d="M21 21l-4.35-4.35" />
      <path d="M11 8v6M8 11h6" />
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
