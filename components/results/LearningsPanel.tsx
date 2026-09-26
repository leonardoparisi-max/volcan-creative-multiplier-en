"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles, Copy, Check, X } from "lucide-react";
import { api } from "@/lib/client";
import type { ResultsConfig, LearningsFile } from "@/lib/results/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

function statusVariant(s: string): "success" | "warn" | "danger" | "secondary" {
  if (s === "supported") return "success";
  if (s === "weak") return "warn";
  return "danger";
}

export function LearningsPanel() {
  const [cfg, setCfg] = useState<ResultsConfig | null>(null);
  const [savingCfg, setSavingCfg] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [pasteText, setPasteText] = useState("");
  const [checking, setChecking] = useState(false);
  const [parseResult, setParseResult] = useState<{ valid: boolean; errors: string[]; diff?: any } | null>(null);
  const [importing, setImporting] = useState(false);

  const [learnings, setLearnings] = useState<LearningsFile | null>(null);

  useEffect(() => {
    api.getResultsConfig().then(setCfg);
    api.getLearnings().then(setLearnings);
  }, []);

  async function saveCfg() {
    if (!cfg) return;
    setSavingCfg(true);
    try {
      const saved = await api.saveResultsConfig(cfg);
      setCfg(saved);
      toast.success("configuration saved");
    } catch (e: any) {
      toast.error(`Failed: ${e.message}`);
    } finally {
      setSavingCfg(false);
    }
  }

  async function generate() {
    setGenerating(true);
    setPrompt(null);
    try {
      const res = await api.generatePrompt();
      setPrompt(res.prompt);
      toast.success(`Run ${res.run} prompt generated`);
    } catch (e: any) {
      toast.error(`Failed to generate: ${e.message}`);
    } finally {
      setGenerating(false);
    }
  }

  async function copyPrompt() {
    if (!prompt) return;
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function checkResponse() {
    if (!pasteText.trim()) return;
    setChecking(true);
    setParseResult(null);
    try {
      const res = await api.parseAiResponse(pasteText);
      setParseResult(res);
    } catch (e: any) {
      toast.error(`Failed to read: ${e.message}`);
    } finally {
      setChecking(false);
    }
  }

  async function confirmImport() {
    setImporting(true);
    try {
      const updated = await api.importAiResponse(pasteText);
      setLearnings(updated);
      setPasteText("");
      setParseResult(null);
      toast.success("Learnings imported");
    } catch (e: any) {
      toast.error(`Failed to import: ${e.message}`);
    } finally {
      setImporting(false);
    }
  }

  if (!cfg) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> loading…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-xl border border-border p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          1. Context and data confidence
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Objective</Label>
            <Input
              value={cfg.contexto.objetivo}
              placeholder="e.g. leads"
              onChange={(e) => setCfg({ ...cfg, contexto: { ...cfg.contexto, objetivo: e.target.value } })}
            />
          </div>
          <div className="space-y-1">
            <Label>Result type tracked</Label>
            <Input
              value={cfg.contexto.tipo_resultado}
              placeholder="e.g. Lead (form)"
              onChange={(e) => setCfg({ ...cfg, contexto: { ...cfg.contexto, tipo_resultado: e.target.value } })}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Offer</Label>
            <Input
              value={cfg.contexto.oferta}
              placeholder="what's being sold/offered"
              onChange={(e) => setCfg({ ...cfg, contexto: { ...cfg.contexto, oferta: e.target.value } })}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Audience</Label>
            <Input
              value={cfg.contexto.publico}
              placeholder="who you're trying to reach"
              onChange={(e) => setCfg({ ...cfg, contexto: { ...cfg.contexto, publico: e.target.value } })}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="space-y-1">
            <Label>tier 3 · min spend ($)</Label>
            <Input
              type="number"
              value={cfg.tiers.t3_min_spend}
              onChange={(e) => setCfg({ ...cfg, tiers: { ...cfg.tiers, t3_min_spend: +e.target.value } })}
            />
          </div>
          <div className="space-y-1">
            <Label>tier 3 · min results</Label>
            <Input
              type="number"
              value={cfg.tiers.t3_min_results}
              onChange={(e) => setCfg({ ...cfg, tiers: { ...cfg.tiers, t3_min_results: +e.target.value } })}
            />
          </div>
          <div className="space-y-1">
            <Label>tier 2 · min spend ($)</Label>
            <Input
              type="number"
              value={cfg.tiers.t2_min_spend}
              onChange={(e) => setCfg({ ...cfg, tiers: { ...cfg.tiers, t2_min_spend: +e.target.value } })}
            />
          </div>
          <div className="space-y-1">
            <Label>tier 2 · min results</Label>
            <Input
              type="number"
              value={cfg.tiers.t2_min_results}
              onChange={(e) => setCfg({ ...cfg, tiers: { ...cfg.tiers, t2_min_results: +e.target.value } })}
            />
          </div>
        </div>
        <Button size="sm" onClick={saveCfg} disabled={savingCfg}>
          {savingCfg ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          save
        </Button>
      </section>

      <section className="space-y-3 rounded-xl border border-border p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          2. Generate learning prompt
        </p>
        <p className="text-sm text-muted-foreground">
          Builds a text with everything already tested (what worked and what didn't) for you
          to paste into the AI of your choice.
        </p>
        <Button onClick={generate} disabled={generating}>
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          generate prompt
        </Button>
        {prompt && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                saved to results/prompts/ — paste it into the AI you prefer
              </span>
              <Button size="sm" variant="outline" onClick={copyPrompt}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "copied" : "copy"}
              </Button>
            </div>
            <Textarea value={prompt} readOnly className="h-48 font-mono text-[11px]" />
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-xl border border-border p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          3. Paste the AI's response
        </p>
        <Textarea
          value={pasteText}
          onChange={(e) => {
            setPasteText(e.target.value);
            setParseResult(null);
          }}
          placeholder="paste the full response here (part A + the ===LEARNINGS_UPDATE=== block)"
          className="h-40"
        />
        <Button variant="outline" onClick={checkResponse} disabled={checking || !pasteText.trim()}>
          {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          review
        </Button>

        {parseResult && !parseResult.valid && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {parseResult.errors.map((e, i) => (
              <div key={i}>{e}</div>
            ))}
          </div>
        )}

        {parseResult?.valid && parseResult.diff && (
          <div className="space-y-2 rounded-lg border border-border bg-secondary/20 p-3">
            <p className="text-xs text-muted-foreground">preview before confirming</p>
            {parseResult.diff.created.map((c: any) => (
              <div key={c.id} className="text-[12.5px]">
                <Badge variant="success">new</Badge> <b>{c.id}</b> — {c.pattern}
              </div>
            ))}
            {parseResult.diff.updated.map((u: any) => (
              <div key={u.id} className="text-[12.5px]">
                <Badge variant="secondary">updated</Badge> <b>{u.id}</b>: {u.from} → {u.to}
              </div>
            ))}
            {parseResult.diff.retired.map((r: any) => (
              <div key={r.id} className="text-[12.5px]">
                <Badge variant="danger">retired</Badge> <b>{r.id}</b> — {r.reason}
              </div>
            ))}
            {parseResult.diff.newSuggestions.length > 0 && (
              <div className="text-[12.5px] text-muted-foreground">
                {parseResult.diff.newSuggestions.length} new suggestion(s):{" "}
                {parseResult.diff.newSuggestions.map((s: any) => s.id).join(", ")}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={confirmImport} disabled={importing}>
                {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                confirm and import
              </Button>
              <Button size="sm" variant="outline" onClick={() => setParseResult(null)}>
                <X className="h-3.5 w-3.5" />
                cancel
              </Button>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-2 rounded-xl border border-border p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          4. Accumulated learnings
        </p>
        {!learnings?.learnings.length ? (
          <p className="text-sm text-muted-foreground">none yet — generate a prompt and bring back the response.</p>
        ) : (
          <div className="space-y-2">
            {learnings.learnings
              .slice()
              .sort((a, b) => b.confidence - a.confidence)
              .map((l) => (
                <div key={l.id} className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                  <div>
                    <p className="text-[12.5px]">{l.pattern}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {l.evidence.n_tier3 ?? l.evidence.supporting.length} piece(s) of evidence · since run{" "}
                      {l.first_seen_run}
                    </p>
                  </div>
                  <Badge variant={statusVariant(l.status)} className="whitespace-nowrap">
                    {l.status} · {l.confidence}
                  </Badge>
                </div>
              ))}
            {learnings.retired.map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2.5 opacity-60">
                <div>
                  <p className="text-[12.5px] line-through">{r.reason}</p>
                </div>
                <Badge variant="danger">retired</Badge>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
