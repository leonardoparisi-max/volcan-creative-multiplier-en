"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X, Trash2, Bookmark, Loader2, Check } from "lucide-react";
import type { Config } from "@/lib/types";
import { api } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfigSection } from "@/components/sections/ConfigSection";

export function ConfigDrawer({
  config,
  setConfig,
  onClose,
}: {
  config: Config;
  setConfig: (c: Config) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[460px] flex-col border-l border-border bg-card shadow-2xl">
        <header className="flex items-center gap-3 border-b border-border px-5 py-4">
          <div className="flex-1">
            <div className="text-base font-semibold">Settings</div>
            <div className="text-xs text-muted-foreground">
              style applied to the whole batch
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <Presets config={config} setConfig={setConfig} />
          <ConfigSection config={config} setConfig={setConfig} />
          <Maintenance />
        </div>
      </aside>
    </>
  );
}

function Presets({
  config,
  setConfig,
}: {
  config: Config;
  setConfig: (c: Config) => void;
}) {
  const [names, setNames] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const { presets } = await api.listPresets();
      setNames(presets);
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.savePreset(name.trim(), config);
      setName("");
      await load();
      toast.success("Preset saved");
    } catch (e: any) {
      toast.error(`Failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }
  async function apply(n: string) {
    try {
      const { config: cfg } = await api.loadPreset(n);
      setConfig(cfg);
      await api.saveConfig(cfg);
      toast.success(`Preset "${n}" applied`);
    } catch (e: any) {
      toast.error(`Failed: ${e.message}`);
    }
  }

  return (
    <div className="space-y-2.5 rounded-xl border border-border bg-background/40 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Bookmark className="h-3.5 w-3.5" /> Style presets
      </div>
      <div className="flex gap-2">
        <Input
          value={name}
          placeholder="preset name (e.g. SaaS Q4)"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
        <Button size="sm" onClick={save} disabled={busy || !name.trim()}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Save
        </Button>
      </div>
      {names.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {names.map((n) => (
            <button
              key={n}
              onClick={() => apply(n)}
              className="rounded-md border border-border bg-secondary px-2.5 py-1 text-xs transition hover:border-primary hover:text-primary"
            >
              {n}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Maintenance() {
  const [busy, setBusy] = useState<string | null>(null);
  async function clean(target: "cache" | "output") {
    const label = target === "cache" ? "cache" : "outputs";
    if (!confirm(`Clear ${label}? This deletes generated files (your original clips are untouched).`))
      return;
    setBusy(target);
    try {
      const { freedMb } = await api.clean(target);
      toast.success(`${label} cleared · ~${freedMb} MB freed`);
    } catch (e: any) {
      toast.error(`Failed: ${e.message}`);
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="space-y-2.5 rounded-xl border border-border bg-background/40 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Trash2 className="h-3.5 w-3.5" /> Disk maintenance
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => clean("cache")}
          disabled={!!busy}
        >
          {busy === "cache" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          Clear cache
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => clean("output")}
          disabled={!!busy}
        >
          {busy === "output" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          Clear outputs
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Cache = normalized masters and thumbnails (rebuilt on the next render).
        Outputs = every batch in output/.
      </p>
    </div>
  );
}
