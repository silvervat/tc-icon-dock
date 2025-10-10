import React, { useEffect, useRef, useState } from "react";
/**
 * IconDock – Trimble Connect (ViewerAPI) integratsiooniga overlay-dokk
 * -------------------------------------------------------------------
 * • Ainult ujuv kitsas ikooniriba mudeli PEAL (parem alumine nurk)
 * • "Pildista + saada" — võtab viewerist snapshot'i, küsib kommentaari
 * • "Genereeri link" — URL ?projectId=&modelId=&guid= ja kopeerib lõikepuhvrisse
 * • "Zoom GUID-iga" — valib ja fokusseerib vaate IFC GUID-ile
 * • "Full screen" — lülitab full screen režiimi (peidab valge paneeli)
 * • "Peida paneel" — peidab vasaku valge paneeli CSS-ga
 * • Automaatne modelId tuvastus (visible/loaded/first)
 * • Omadused: getObjectProperties + IFC GUID konversioonid
 *
 * NB! Parandused: dock paremale (mudeli peale), lisatud full screen toggle valge paneeli peitmiseks, uus nupp CSS peitmiseks.
 */
type ViewerLike = any; // Trimble ViewerAPI (Workspace API)
const COLORS = {
  navy: "#0A3A67",
  slateBg: "#F8FAFC",
  cardBorder: "#E2E8F0",
};
// Eelistatud võtmed
const ASSEMBLY_KEYS = [
  "Kooste märk (BLOCK)",
  "Assembly",
  "ASSEMBLY",
  "Tekla_Assembly.AssemblyCast_unit_mark",
];
const IFC_GUID_KEYS = ["GUID_IFC", "IFC GUID", "GlobalId", "GUID"]; // fallbackina ka GUID
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
export default function IconDockTC({ viewer, projectId: initialProjectId }: { viewer: ViewerLike; projectId?: string; }) {
  const [toast, setToast] = useState("");
  const [preview, setPreview] = useState<string>("");
  const [linkState, setLinkState] = useState<string>("");
  const projectIdRef = useRef<string | undefined>(initialProjectId);
  const [modelId, setModelId] = useState<string | undefined>(undefined);
  // init: leia mudel
  useEffect(() => {
    (async () => {
      const id = await resolveActiveModelId(viewer);
      setModelId(id);
    })();
  }, [viewer]);
  async function actionMakeLink() {
    const pair = await getSelectionRuntimeIds(viewer);
    const mId = modelId || pair?.modelId || (await resolveActiveModelId(viewer));
    if (!mId || !pair?.runtimeIds?.length) {
      setToast("Vali mudelist objekt, et luua link.");
      return;
    }
    const guids = await runtimeToIfcGuid(viewer, mId, pair.runtimeIds);
    const guid = guids[0];
    if (!guid) { setToast("IFC GUID puudub valikul."); return; }
    const url = new URL(window.location.href);
    if (projectIdRef.current) url.searchParams.set("projectId", projectIdRef.current);
    url.searchParams.set("modelId", mId);
    url.searchParams.set("guid", guid);
    const s = url.toString();
    try { await navigator.clipboard.writeText(s); setLinkState("(kopeeritud)"); }
    catch { setLinkState("(kopeeri käsitsi)"); }
    setToast("Link loodud.");
  }
  async function actionSnapAndSend() {
    const mId = modelId || (await resolveActiveModelId(viewer));
    if (!mId) { setToast("Mudelit ei leitud."); return; }
    const pair = await getSelectionRuntimeIds(viewer);
    if (!pair?.runtimeIds?.length) { setToast("Vali objekt pildistamiseks."); return; }
    const guids = await runtimeToIfcGuid(viewer, mId, pair.runtimeIds);
    const guid = guids[0] || "";
    const props = await getPropsForRuntime(viewer, mId, [pair.runtimeIds[0]]);
    const flat = flattenProps(props?.[0] || {});
    const assembly = firstNonEmpty(flat, ASSEMBLY_KEYS) || "";
    const png = await getSnapshot(viewer);
    if (!png) { setToast("Snapshot ebaõnnestus."); return; }
    const comment = window.prompt("Lisa kommentaar:", "") || "";
    // Demo: näita, mis saadaksime (päris saatmine toimub Apps Scripti kaudu)
    setToast(`Saatmiseks valmis → IFC_GUID=${guid}; ASM='${assembly}'`);
    setPreview(png);
    // NB! Siin tee päris POST sinu webhooki (Apps Script):
    // await fetch(WEBHOOK_URL, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ projectId: projectIdRef.current, modelId: mId, guid, assembly, comment, screenshot: png }) });
  }
  async function actionZoomPrompt() {
    const guid = window.prompt("Sisesta IFC GUID:", "");
    if (!guid) return;
    const mId = modelId || (await resolveActiveModelId(viewer));
    if (!mId) { setToast("Mudelit ei leitud."); return; }
    await focusByGuid(viewer, mId, guid.trim());
    setToast(`Fookus GUID: ${guid}`);
  }
  function toggleFullScreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setToast("Full screen sisse")).catch(() => setToast("Full screen ebaõnnestus"));
    } else {
      document.exitFullscreen().then(() => setToast("Full screen välja")).catch(() => setToast("Full screen ebaõnnestus"));
    }
  }
  function hideLeftPanel() {
    const style = document.createElement('style');
    style.innerHTML = `
      /* Peida vasak paneel - kohanda klassid vastavalt inspect'ile (F12) */
      .tc-left-panel, .modus-sidebar, .left-navigation, .navigation-pane, .sidebar { 
        display: none !important; 
      }
      /* Laienda viewer täislaiuseks */
      .viewer-container, .main-view, .tc-3d-viewer { 
        width: 100% !important; 
        left: 0 !important; 
        margin-left: 0 !important; 
      }
    `;
    document.head.appendChild(style);
    setToast("Vasak paneel peidetud (CSS-ga)");
  }
  // Kui URL'is on guid, proovi fokusseerida
  useEffect(() => {
    (async () => {
      const u = new URL(window.location.href);
      const guid = u.searchParams.get("guid");
      const mId = u.searchParams.get("modelId") || modelId || (await resolveActiveModelId(viewer));
      if (guid && mId) await focusByGuid(viewer, mId, guid);
    })();
  }, [viewer, modelId]);
  // --- Overlay: ainult ujuv kitsas ikooniriba mudeli PEAL --------------------
  return (
    <>
      {/* Ujuv dokk – parem alumine nurk, mudeli peal */}
      <div style={{ position: "fixed", right: 12, bottom: 20, width: 48, background: COLORS.navy, borderRadius: 12, boxShadow: "0 10px 24px rgba(0,0,0,0.25)", padding: 6, display: "flex", flexDirection: "column", gap: 10, zIndex: 9999 }}>
        <button title="Pildista + saada" onClick={actionSnapAndSend} style={btnStyleCompact}><CameraIcon/></button>
        <button title="Genereeri link valikule" onClick={actionMakeLink} style={btnStyleCompact}><LinkIcon/></button>
        <div style={{ height: 1, background: "rgba(255,255,255,.35)", margin: "4px 8px" }}/>
        <button title="Zoom IFC GUID-iga" onClick={actionZoomPrompt} style={btnStyleCompact}><ZoomIcon/></button>
        <button title="Full screen (proovi peita paneel)" onClick={toggleFullScreen} style={btnStyleCompact}><FullScreenIcon/></button>
        <button title="Peida vasak paneel (CSS)" onClick={hideLeftPanel} style={btnStyleCompact}><HidePanelIcon/></button>
        <button title="Seaded (demo)" onClick={() => alert("Lisa siia oma seadete dialoog")} style={btnStyleCompact}><SettingsIcon/></button>
      </div>
      {/* Õrn toast paremas allnurgas, et mitte katta vaadet */}
      {toast && (
        <div style={{ position: "fixed", right: 16, bottom: 16, background: "rgba(15,23,42,0.92)", color: "#fff", padding: "8px 12px", borderRadius: 8, fontSize: 13, zIndex: 9999, maxWidth: 420 }}>{toast}</div>
      )}
    </>
  );
}
// --- Ikoonid (inline SVG) ----------------------------------------------------
function CameraIcon(){return(<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden><path d="M9 3l1.5 2H15a3 3 0 013 3v8a3 3 0 01-3 3H7a3 3 0 01-3-3V8a3 3 0 013-3h1.5L9 3zM8 12a4 4 0 108 0 4 4 0 00-8 0z" fill="currentColor"/></svg>)}
function LinkIcon(){return(<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden><path d="M10 13a5 5 0 007.07 0l1.41-1.41a5 5 0 10-7.07-7.07L10 5" stroke="currentColor" strokeWidth="2" fill="none"/><path d="M14 11a5 5 0 00-7.07 0L5.5 12.41a5 5 0 107.07 7.07L14 19" stroke="currentColor" strokeWidth="2" fill="none"/></svg>)}
function ZoomIcon(){return(<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden><path d="M11 19a8 8 0 100-16 8 8 0 000 16z" stroke="currentColor" strokeWidth="2" fill="none"/><path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" fill="none"/></svg>)}
function FullScreenIcon(){return(<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" fill="currentColor"/></svg>)}
function HidePanelIcon(){return(<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden><path d="M3 5h18v14H3z" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M9 5v14" stroke="currentColor" strokeWidth="2"/></svg>)} // Lihtne ikoon paneeli peitmiseks
function SettingsIcon(){return(<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden><path d="M12 15.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7z" stroke="currentColor" strokeWidth="2" fill="none"/><path d="M19.4 15a7.97 7.97 0 00.1-6l2.1-1.2-2-3.4L17.5 5a8.03 8.03 0 00-5-.1L11 2H7l-.6 2.9a8.03 8.03 0 00-3.8 3.8L0 10.9 3.4 13l1.2-2.1a7.97 7.97 0 006 .1l1.2 2.1 3.4-2z" stroke="currentColor" strokeWidth="2" fill="none"/></svg>)}
const btnStyleCompact: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 12,
  background: "white",
  border: "1px solid rgba(0,0,0,0.1)",
  boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
  display: "grid",
  placeItems: "center",
  cursor: "pointer"
};
// --- Self-tests (ei muuda käitumist) ----------------------------------------
try {
  // Stiilide test
  console.assert(typeof btnStyleCompact.cursor === "string", "btnStyleCompact.cursor peab olema string");
  console.assert(typeof btnStyleCompact.width === "number" && typeof btnStyleCompact.height === "number", "Compact-nupu mõõdud");
  // Utiliitide testid
  const flat = flattenProps({ A: 1, nest: { B: "x" } });
  console.assert(flat.A === "1" && flat.B === "x" && flat["nest.B"] === "x", "flattenProps lamendab ja säilitab lühivõtmed");
  console.assert(firstNonEmpty({ a: "", mark: "M1" }, ["mark"]) === "M1", "firstNonEmpty leiab esimese mitte-tühja võtme");
  console.assert(firstNonEmpty({ MARK: "M2" }, ["mark"]) === "M2", "firstNonEmpty töötab case-insensitive");
  // Linki test
  const url = new URL("https://x/");
  url.searchParams.set("projectId", "PID"); url.searchParams.set("modelId", "MID"); url.searchParams.set("guid", "G");
  console.assert(url.toString().includes("projectId=PID") && url.toString().includes("modelId=MID") && url.toString().includes("guid=G"), "Link peab sisaldama projectId/modelId/guid");
} catch {}
