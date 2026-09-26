import type { Learning, LearningsFile, Suggestion, UntestedTerritory } from "./types";

export interface ParsedPayload {
  learnings?: Partial<Learning>[];
  suggestions?: Partial<Suggestion>[];
  untested_territory?: Partial<UntestedTerritory>[];
  retired?: { id: string; reason: string }[];
}

export interface ParseResult {
  valid: boolean;
  errors: string[];
  payload?: ParsedPayload;
  raw?: string;
}

const VALID_STATUS = new Set(["supported", "weak", "contradicted"]);

/** Extracts and validates the ===LEARNINGS_UPDATE===...===END=== block from a pasted AI response. */
export function parseAiResponse(text: string): ParseResult {
  const m = /===LEARNINGS_UPDATE===([\s\S]*?)===END===/.exec(text);
  if (!m) {
    return { valid: false, errors: ["Couldn't find the ===LEARNINGS_UPDATE=== ... ===END=== block in the pasted response."] };
  }
  const raw = m[1].trim();
  let payload: ParsedPayload;
  try {
    payload = JSON.parse(raw);
  } catch (e: any) {
    return { valid: false, errors: [`Invalid JSON inside the block: ${e.message}`], raw };
  }

  const errors: string[] = [];
  for (const l of payload.learnings ?? []) {
    if (!l.id) errors.push("A learning came without an id.");
    if (!l.component) errors.push(`Learning ${l.id ?? "?"} has no component.`);
    if (!l.pattern) errors.push(`Learning ${l.id ?? "?"} has no pattern.`);
    if (!l.status || !VALID_STATUS.has(l.status)) {
      errors.push(`Learning ${l.id ?? "?"} has an invalid status: "${l.status}" (must be supported/weak/contradicted).`);
    }
    if (typeof l.confidence !== "number" || l.confidence < 0 || l.confidence > 1) {
      errors.push(`Learning ${l.id ?? "?"} has an invalid confidence: "${l.confidence}" (must be 0-1).`);
    }
  }
  for (const s of payload.suggestions ?? []) {
    if (!s.id) errors.push("A suggestion came without an id.");
    if (!s.component) errors.push(`Suggestion ${s.id ?? "?"} has no component.`);
    if (!s.draft) errors.push(`Suggestion ${s.id ?? "?"} has no draft (the suggested text).`);
  }
  for (const r of payload.retired ?? []) {
    if (!r.id) errors.push("A retired item came without an id.");
  }

  return { valid: errors.length === 0, errors, payload, raw };
}

export interface DiffPreview {
  updated: { id: string; pattern: string; from: string; to: string }[];
  created: { id: string; pattern: string; status: string }[];
  retired: { id: string; reason: string }[];
  newSuggestions: { id: string; component: string; draft: string }[];
  newUntested: { id: string; note: string }[];
}

export function computeDiff(current: LearningsFile, payload: ParsedPayload): DiffPreview {
  const byId = new Map(current.learnings.map((l) => [l.id, l]));
  const updated: DiffPreview["updated"] = [];
  const created: DiffPreview["created"] = [];
  for (const l of payload.learnings ?? []) {
    const existing = l.id ? byId.get(l.id) : undefined;
    if (existing) {
      updated.push({ id: l.id!, pattern: l.pattern ?? existing.pattern, from: existing.status, to: l.status ?? existing.status });
    } else if (l.id) {
      created.push({ id: l.id, pattern: l.pattern ?? "", status: l.status ?? "weak" });
    }
  }
  const retired = (payload.retired ?? []).map((r) => ({ id: r.id, reason: r.reason ?? "" }));
  const newSuggestions = (payload.suggestions ?? []).map((s) => ({
    id: s.id ?? "",
    component: s.component ?? "",
    draft: s.draft ?? "",
  }));
  const newUntested = (payload.untested_territory ?? []).map((u) => ({ id: u.id ?? "", note: u.note ?? "" }));
  return { updated, created, retired, newSuggestions, newUntested };
}

/** Applies a validated payload onto the current learnings file. Pure — caller persists the result. */
export function mergeLearnings(current: LearningsFile, payload: ParsedPayload, run: number): LearningsFile {
  const learnings = [...current.learnings];
  for (const incoming of payload.learnings ?? []) {
    if (!incoming.id) continue;
    const i = learnings.findIndex((l) => l.id === incoming.id);
    if (i >= 0) {
      const prev = learnings[i];
      learnings[i] = {
        ...prev,
        pattern: incoming.pattern ?? prev.pattern,
        mechanism: incoming.mechanism ?? prev.mechanism,
        status: (incoming.status as any) ?? prev.status,
        confidence: incoming.confidence ?? prev.confidence,
        evidence: incoming.evidence ?? prev.evidence,
        last_reviewed_run: run,
        history: [...prev.history, { run, status: (incoming.status as any) ?? prev.status }],
      };
    } else {
      learnings.push({
        id: incoming.id,
        component: (incoming.component as any) ?? "geral",
        pattern: incoming.pattern ?? "",
        mechanism: incoming.mechanism,
        status: (incoming.status as any) ?? "weak",
        confidence: incoming.confidence ?? 0.3,
        evidence: incoming.evidence ?? { supporting: [], contradicting: [] },
        first_seen_run: run,
        last_reviewed_run: run,
        history: [{ run, status: incoming.status ?? "weak" }],
      });
    }
  }

  const retiredIds = new Set((payload.retired ?? []).map((r) => r.id));
  const keptLearnings = learnings.filter((l) => !retiredIds.has(l.id));
  const retired = [...current.retired];
  for (const r of payload.retired ?? []) {
    if (!retired.some((x) => x.id === r.id)) retired.push({ id: r.id, reason: r.reason ?? "", run });
  }

  const suggestions = [...current.suggestions];
  for (const s of payload.suggestions ?? []) {
    if (!s.id || suggestions.some((x) => x.id === s.id)) continue;
    suggestions.push({
      id: s.id,
      run,
      component: (s.component as any) ?? "hook",
      draft: s.draft ?? "",
      rationale: s.rationale,
      tests_learning: s.tests_learning,
      predicted: s.predicted,
    });
  }

  const untested_territory = [...current.untested_territory];
  for (const u of payload.untested_territory ?? []) {
    if (!u.id || untested_territory.some((x) => x.id === u.id)) continue;
    untested_territory.push({ id: u.id, note: u.note ?? "", added_run: run });
  }

  return {
    version: current.version,
    updated_run: run,
    learnings: keptLearnings,
    suggestions,
    untested_territory,
    retired,
  };
}
