"use client";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, LayoutGrid, FolderOutput, Settings2, BarChart3 } from "lucide-react";
import type { Config, ComponentRow, ImageAsset, Connections } from "@/lib/types";
import { api } from "@/lib/client";
import { planCombinations } from "@/lib/combinations";
import { VolcanMark, VolcanWordmark } from "@/components/Logo";
import { DoctorBanner } from "@/components/DoctorBanner";
import { Kanban } from "@/components/creation/Kanban";
import { Connections as ConnectionsView } from "@/components/creation/Connections";
import { RenderBar } from "@/components/creation/RenderBar";
import { ConfigDrawer } from "@/components/creation/ConfigDrawer";
import { PreviewSection } from "@/components/sections/PreviewSection";
import { SaidaSection } from "@/components/sections/SaidaSection";
import { ResultsSection } from "@/components/sections/ResultsSection";

type View = "criacao" | "saida" | "resultados";

export default function Page() {
  const [config, setConfig] = useState<Config | null>(null);
  const [rows, setRows] = useState<ComponentRow[]>([]);
  const [images, setImages] = useState<ImageAsset[]>([]);
  const [connections, setConns] = useState<Connections>({
    cutsHookBody: [],
    cutsBodyCta: [],
  });
  const [booted, setBooted] = useState(false);
  const [view, setView] = useState<View>("criacao");
  const [onlyActive, setOnlyActive] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [outputKey, setOutputKey] = useState(0);
  const [depsOk, setDepsOk] = useState<boolean | null>(null);

  async function loadComponents() {
    try {
      const [{ rows }, { images }, conns] = await Promise.all([
        api.getComponents(),
        api.getImages(),
        api.getConnections(),
      ]);
      setRows(rows);
      setImages(images);
      setConns(conns);
    } catch (e: any) {
      toast.error(`Failed to load: ${e.message}`);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        setConfig(await api.getConfig());
      } catch (e: any) {
        toast.error(`Failed to load config: ${e.message}`);
      }
      await loadComponents();
      setBooted(true);
    })();
  }, []);

  function setConnections(c: Connections) {
    setConns(c);
    api.saveConnections(c).catch(() => {});
  }

  function toggleUnique(v: boolean) {
    if (!config) return;
    const next = { ...config, render: { ...config.render, arquivos_unicos: v } };
    setConfig(next);
    api.saveConfig(next).catch(() => {});
  }

  function setLeva(v: string) {
    if (!config) return;
    const next = { ...config, render: { ...config.render, leva_atual: v } };
    setConfig(next);
    api.saveConfig(next).catch(() => {});
  }

  const count = useMemo(
    () => (rows.length ? planCombinations(rows, { connections }).count : 0),
    [rows, connections]
  );

  return (
    <div className="flex min-h-screen">
      {/* rail */}
      <aside className="sticky top-0 flex h-screen w-[76px] flex-col items-center gap-7 border-r border-border bg-card/60 py-5">
        <VolcanMark className="h-9 w-9" />
        <nav className="flex flex-col gap-2">
          <RailButton
            active={view === "criacao"}
            onClick={() => setView("criacao")}
            icon={<LayoutGrid className="h-[18px] w-[18px]" />}
            label="Create"
          />
          <RailButton
            active={view === "saida"}
            onClick={() => setView("saida")}
            icon={<FolderOutput className="h-[18px] w-[18px]" />}
            label="Output"
          />
          <RailButton
            active={view === "resultados"}
            onClick={() => setView("resultados")}
            icon={<BarChart3 className="h-[18px] w-[18px]" />}
            label="Results"
          />
        </nav>
        <div className="mt-auto flex flex-col items-center gap-1 text-[9px] text-muted-foreground">
          <span
            className={`h-2 w-2 rounded-full shadow-[0_0_8px] ${
              depsOk === null
                ? "bg-muted-foreground/40 shadow-transparent"
                : depsOk
                ? "bg-emerald-500 shadow-emerald-500"
                : "bg-amber-500 shadow-amber-500"
            }`}
          />
          deps
        </div>
      </aside>

      {/* main */}
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="mx-auto w-full max-w-[1200px] flex-1 space-y-7 px-6 py-5">
          {/* header */}
          <header className="flex flex-wrap items-center gap-4">
            <div>
              <VolcanWordmark />
              <h1 className="mt-1 text-lg font-semibold tracking-tight">
                Creative Multiplier
              </h1>
              <p className="text-[13px] text-muted-foreground">
                hooks × bodies × ctas → ad-ready creatives
              </p>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <div className="inline-flex rounded-lg border border-border bg-card p-1">
                <ToggleChip active={!onlyActive} onClick={() => setOnlyActive(false)}>
                  Components
                </ToggleChip>
                <ToggleChip active={onlyActive} onClick={() => setOnlyActive(true)}>
                  Current batch
                </ToggleChip>
              </div>
              <button
                onClick={() => setConfigOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2.5 text-[13px] font-medium transition hover:border-muted-foreground/50"
              >
                <Settings2 className="h-[15px] w-[15px] text-muted-foreground" />
                Settings
              </button>
            </div>
          </header>

          {!booted || !config ? (
            <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> loading…
            </div>
          ) : view === "saida" ? (
            <SaidaSection refreshKey={outputKey} />
          ) : view === "resultados" ? (
            <ResultsSection />
          ) : (
            <>
              <DoctorBanner onStatus={setDepsOk} />
              <Section n={1} title="Components" hint="add, import and edit each piece">
                <Kanban
                  rows={rows}
                  setRows={setRows}
                  images={images}
                  config={config}
                  reload={loadComponents}
                  onlyActive={onlyActive}
                />
              </Section>
              <Section
                n={2}
                title="Connections"
                hint="click a hook to build your combinations"
              >
                <ConnectionsView
                  rows={rows}
                  connections={connections}
                  setConnections={setConnections}
                  onlyActive={onlyActive}
                />
              </Section>
              <Section
                n={3}
                title="Preview"
                hint="check the style on one combination before rendering everything"
              >
                <PreviewSection rows={rows} />
              </Section>
            </>
          )}
        </div>

        {view === "criacao" && booted && config && (
          <RenderBar
            count={count}
            config={config}
            onToggleUnique={toggleUnique}
            onSetLeva={setLeva}
            onRendered={() => setOutputKey((k) => k + 1)}
          />
        )}
      </main>

      {configOpen && config && (
        <ConfigDrawer
          config={config}
          setConfig={setConfig}
          onClose={() => setConfigOpen(false)}
        />
      )}
    </div>
  );
}

function RailButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex h-[52px] w-[52px] flex-col items-center justify-center gap-1 rounded-xl text-[10px] transition ${
        active
          ? "bg-secondary text-foreground ring-1 ring-border"
          : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
      }`}
    >
      {active && (
        <span className="cc-grad absolute left-0 h-6 w-[3px] rounded-r" />
      )}
      {icon}
      {label}
    </button>
  );
}

function ToggleChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-[12.5px] font-medium transition ${
        active
          ? "bg-secondary text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Section({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2.5">
        <span className="grid h-[22px] w-[22px] place-items-center rounded-md border border-border bg-secondary text-[11px] font-bold text-primary">
          {n}
        </span>
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        {hint && (
          <span className="ml-auto text-xs text-muted-foreground/70">{hint}</span>
        )}
      </div>
      {children}
    </section>
  );
}
