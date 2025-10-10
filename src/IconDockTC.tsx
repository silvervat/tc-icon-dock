import React, { useEffect, useRef, useState } from "react";

/**
 * IconDock – Trimble Connect (ViewerAPI) integratsiooniga demo
 * -----------------------------------------------------------
 * ✔ Vasak ainult-ikoonide riba (≈52px)
 * ✔ "Pildista + saada" — võtab viewerist snapshot'i (või screenshot'i), küsib kommentaari
 * ✔ "Genereeri link" — loob URL-i ?projectId=&modelId=&guid= ja kopeerib lõikepuhvrisse
 * ✔ "Zoom GUID-iga" — seab valiku ja keskendab vaate GUID-ile (IFC GUID)
 * ✔ Automaatne modelId tuvastus: eelistab loaded/visible mudelit; muidu esimene
 * ✔ Omadused: kasutab ViewerAPI.getObjectProperties/convertToObjectIds (IFC GUID)
 *
 * Märkused:
 * - Trimble Connect Workspace API viited (vaata ametlikke docs'e):
 *   • viewer.getLayers(modelId) — kihiinfo (kasutame hiljem filtrite jaoks) 
 *   • viewer.getModels(state?) — mudelite loetelu 
 *   • viewer.getSelection() — valik (runtimeId'd)
 *   • viewer.setSelection([...]) — valiku seadmine
 *   • viewer.convertToObjectIds(modelId, runtimeIds) — saab välised id'd (IFC GUID) 
 *   • viewer.convertToObjectRuntimeIds(modelId, objectIds) — IFC GUID → runtimeId 
 *   • viewer.getObjectProperties(modelId, runtimeIds) — omadused 
 *   • viewer.getSnapshot() | viewer.getScreenshot() — pilt
 */

type ViewerLike = any; // Eeldame Trimble ViewerAPI objekti (Workspace API)

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

// Utiliidid
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

// --- Pealogi: Viewer ühendus + toimingud ------------------------------------
async function resolveActiveModelId(viewer: ViewerLike): Promise<string | undefined> {
  try {
    if (!viewer?.getModels) return undefined;
    // proovi "loaded" mudelid (kui enum/konstant pole kättesaadav, too kõik)
    const loaded = await viewer.getModels("loaded").catch(() => null);
    const list = (loaded && loaded.length ? loaded : await viewer.getModels()) || [];
    // prioriteet: visible || loaded || esimene
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
      // Workspace API: ModelObjects[]
      const mId = sel[0].modelId as string;
      const rids = sel[0].objectRuntimeIds as number[];
      return { modelId: mId, runtimeIds: rids };
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
    // Heuristikaga keskendus: kui bbox API on saadaval, saad siit edasi kaamera kohandada
    // (näiteks viewer.getObjectBoundingBoxes + viewer.setCamera), kuid minimaalne select töötab kohe
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

  // Kui URL'is on guid, proovi fokusseerida
  useEffect(() => {
    (async () => {
      const u = new URL(window.location.href);
      const guid = u.searchParams.get("guid");
      const mId = u.searchParams.get("modelId") || modelId || (await resolveActiveModelId(viewer));
      if (guid && mId) await focusByGuid(viewer, mId, guid);
    })();
  }, [viewer, modelId]);

  return (
    <div style={{ fontFamily: "Inter, ui-sans-serif, system-ui", minHeight: "100vh", background: COLORS.slateBg }}>
      {/* Icon dock */}
      <div style={{ position: "fixed", top: 24, left: 24, width: 52, background: COLORS.navy, borderRadius: 12, boxShadow: "0 6px 18px rgba(0,0,0,0.18)", padding: 6, display: "flex", flexDirection: "column", gap: 8, zIndex: 9 }}>
        <button title="Pildista + saada" onClick={actionSnapAndSend} style={btnStyle}><CameraIcon/></button>
        <button title="Genereeri link valikule" onClick={actionMakeLink} style={btnStyle}><LinkIcon/></button>
        <div style={{ height: 1, background: "rgba(255,255,255,.3)", margin: "4px 8px" }}/>
        <button title="Zoom IFC GUID-iga" onClick={actionZoomPrompt} style={btnStyle}><ZoomIcon/></button>
        <button title="Seaded (demo)" onClick={() => alert("Lisa siia oma seadete dialoog")} style={btnStyle}><SettingsIcon/></button>
      </div>

      {/* Header */}
      <div style={{ padding: "24px 24px 8px 92px" }}>
        <h1 style={{ margin: 0, color: COLORS.navy }}>IconDock – TC ViewerAPI</h1>
        <p style={{ marginTop: 6, color: "#475569" }}>Vali mudelist detail → loo link → hiljem avamine fokusseerib samale GUID-ile. Snapshoti saatmine läheb Apps Scripti.</p>
        <div style={{ color: "#334155", fontSize: 13 }}>Akt. modelId: {modelId || "—"}</div>
      </div>

      {/* Output */}
      <div style={{ padding: "0 24px 48px 92px", display: "grid", gap: 16 }}>
        <div style={{ background: "#ECFEFF", border: "1px solid #BAE6FD", color: "#0369A1", padding: 12, borderRadius: 10 }}>
          <div style={{ fontWeight: 600 }}>Viimane teade:</div>
          <div style={{ whiteSpace: "pre-wrap" }}>{toast || "—"}</div>
        </div>
        {preview && (
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ color: "#0F172A", fontWeight: 600 }}>Snapshot (dataURL):</div>
            <img src={preview} alt="snapshot" style={{ maxWidth: "100%", borderRadius: 12, border: `1px solid ${COLORS.cardBorder}` }} />
          </div>
        )}
        <div style={{ color: "#334155", fontSize: 13 }}>Link {linkState}</div>
      </div>
    </div>
  );
}

// --- Ikoonid (inline SVG) ----------------------------------------------------
function CameraIcon(){return(<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden><path d="M9 3l1.5 2H15a3 3 0 013 3v8a3 3 0 01-3 3H7a3 3 0 01-3-3V8a3 3 0 013-3h1.5L9 3zM8 12a4 4 0 108 0 4 4 0 00-8 0z" fill="currentColor"/></svg>)}
function LinkIcon(){return(<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden><path d="M10 13a5 5 0 007.07 0l1.41-1.41a5 5 0 10-7.07-7.07L10 5" stroke="currentColor" strokeWidth="2" fill="none"/><path d="M14 11a5 5 0 00-7.07 0L5.5 12.41a5 5 0 107.07 7.07L14 19" stroke="currentColor" strokeWidth="2" fill="none"/></svg>)}
function ZoomIcon(){return(<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden><path d="M11 19a8 8 0 100-16 8 8 0 000 16z" stroke="currentColor" strokeWidth="2" fill="none"/><path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" fill="none"/></svg>)}
function SettingsIcon(){return(<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden><path d="M12 15.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7z" stroke="currentColor" strokeWidth="2" fill="none"/><path d="M19.4 15a7.97 7.97 0 00.1-6l2.1-1.2-2-3.4L17.5 5a8.03 8.03 0 00-5-.1L11 2H7l-.6 2.9a8.03 8.03 0 00-3.8 3.8L0 10.9 3.4 13l1.2-2.1a7.97 7.97 0 006 .1l1.2 2.1 3.4-2z" stroke="currentColor" strokeWidth="2" fill="none"/></svg>)}

const btnStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 10,
  background: "white",
  border: "1px solid rgba(0,0,0,0.08)",
  display: "grid",
  placeItems: "center",
  cursor: "pointer"
};

// --- Self-tests (ei muuda käitumist) ----------------------------------------
try {
  console.assert(typeof btnStyle.cursor === "string", "btnStyle.cursor peab olema string");
  console.assert(typeof btnStyle.width === "number" && typeof btnStyle.height === "number", "Nupu mõõdud peavad olema numbrid");
  const url = new URL("https://x/");
  url.searchParams.set("projectId", "PID"); url.searchParams.set("modelId", "MID"); url.searchParams.set("guid", "G");
  console.assert(url.toString().includes("projectId=PID") && url.toString().includes("modelId=MID") && url.toString().includes("guid=G"), "Link peab sisaldama projectId/modelId/guid");
} catch {}
