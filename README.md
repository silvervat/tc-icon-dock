# TC Icon Dock (Trimble Connect ViewerAPI)

Kitsas ikooniriba, mis:
- loeb valikust IFC GUID-i,
- **Genereeri link** → `?projectId=&modelId=&guid=`,
- **Pildista + saada** → võtab `getSnapshot()`; POST (Apps Script) salvestab pildid Drive’i ja rea Sheet’i,
- **Zoom GUID-iga** → valib/zoomib GUID-ile,
- Kui lehel on `guid`, fokusseerib automaatselt.

## Kiirstart

```bash
pnpm i   # või npm i / yarn
pnpm dev # http://localhost:5173
