import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./paths";
import type { Connections, ComponentRow } from "./types";

export const CONNECTIONS_JSON = path.join(ROOT, "connections.json");

export function edgeKey(a: string, b: string): string {
  return `${a}|${b}`;
}

export function emptyConnections(): Connections {
  return { cutsHookBody: [], cutsBodyCta: [] };
}

export function loadConnections(): Connections {
  try {
    const raw = JSON.parse(fs.readFileSync(CONNECTIONS_JSON, "utf8"));
    return {
      cutsHookBody: Array.isArray(raw.cutsHookBody) ? raw.cutsHookBody : [],
      cutsBodyCta: Array.isArray(raw.cutsBodyCta) ? raw.cutsBodyCta : [],
    };
  } catch {
    return emptyConnections();
  }
}

export function saveConnections(c: Connections): void {
  fs.writeFileSync(
    CONNECTIONS_JSON,
    JSON.stringify(
      {
        cutsHookBody: [...new Set(c.cutsHookBody)].sort(),
        cutsBodyCta: [...new Set(c.cutsBodyCta)].sort(),
      },
      null,
      2
    ) + "\n",
    "utf8"
  );
}

/**
 * Drop cuts that reference components which no longer exist, so a deleted +
 * re-added id doesn't stay silently disconnected.
 */
export function pruneConnections(
  c: Connections,
  rows: ComponentRow[]
): Connections {
  const ids = new Set(rows.map((r) => r.id));
  const keep = (k: string) => k.split("|").every((id) => ids.has(id));
  return {
    cutsHookBody: c.cutsHookBody.filter(keep),
    cutsBodyCta: c.cutsBodyCta.filter(keep),
  };
}
