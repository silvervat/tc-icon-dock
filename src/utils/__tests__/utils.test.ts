import { describe, it, expect } from "vitest";

// Kopeerime siia minimaalsed utiliidid kontrolliks.
// NB: need on identsed loogikaga IconDockTC failis.
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

describe("flattenProps", () => {
  it("lamendab ja säilitab ka lühivõtmed", () => {
    const flat = flattenProps({ A: 1, nest: { B: "x" } });
    expect(flat.A).toBe("1");
    expect(flat.B).toBe("x");
    expect(flat["nest.B"]).toBe("x");
  });
});

describe("firstNonEmpty", () => {
  it("leiab esimese mitte-tühja võtme", () => {
    expect(firstNonEmpty({ a: "", mark: "M1" }, ["mark"])).toBe("M1");
  });
  it("on case-insensitive", () => {
    expect(firstNonEmpty({ MARK: "M2" }, ["mark"])).toBe("M2");
  });
});
