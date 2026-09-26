"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import type { Config } from "@/lib/types";
import { api, TRANSITIONS, EDGE_EFFECTS } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Segmented } from "@/components/ui/segmented";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

// deep set on a cloned object via dot path
function setPath(obj: any, path: string, value: any): any {
  const clone = structuredClone(obj);
  const keys = path.split(".");
  let cur = clone;
  for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]];
  cur[keys[keys.length - 1]] = value;
  return clone;
}
function getPath(obj: any, path: string): any {
  return path.split(".").reduce((a, k) => a?.[k], obj);
}

export function ConfigSection({
  config,
  setConfig,
}: {
  config: Config;
  setConfig: (c: Config) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const upd = (path: string, value: any) => {
    setConfig(setPath(config, path, value));
    setDirty(true);
  };

  async function save() {
    setSaving(true);
    try {
      const saved = await api.saveConfig(config);
      setConfig(saved);
      setDirty(false);
      toast.success("config.json saved");
    } catch (e: any) {
      toast.error(`Failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  const num = (path: string, label: string, step = "1") => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input
        type="number"
        step={step}
        value={getPath(config, path) ?? 0}
        onChange={(e) => upd(path, parseFloat(e.target.value))}
      />
    </div>
  );
  const txt = (path: string, label: string, placeholder = "") => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input
        value={getPath(config, path) ?? ""}
        placeholder={placeholder}
        onChange={(e) => upd(path, e.target.value)}
      />
    </div>
  );
  const color = (path: string, label: string) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <input
          type="color"
          value={(getPath(config, path) ?? "#000000").slice(0, 7)}
          onChange={(e) => upd(path, e.target.value.toUpperCase())}
          className="h-9 w-10 rounded border border-input bg-background"
        />
        <Input
          value={getPath(config, path) ?? ""}
          onChange={(e) => upd(path, e.target.value)}
          className="mono"
        />
      </div>
    </div>
  );
  const toggle = (path: string, label: string) => (
    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
      <Label>{label}</Label>
      <Switch
        checked={!!getPath(config, path)}
        onCheckedChange={(v) => upd(path, v)}
      />
    </div>
  );

  const transDesc =
    TRANSITIONS.find((t) => t.value === config.transicao.tipo)?.desc ?? "";

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Settings</CardTitle>
          <CardDescription>Writes straight to config.json</CardDescription>
        </div>
        <Button size="sm" onClick={save} disabled={saving || !dirty}>
          <Save className="h-3.5 w-3.5" />
          {dirty ? "Save" : "Saved"}
        </Button>
      </CardHeader>
      <CardContent>
       <Tabs defaultValue="leva">
        <TabsList className="mb-4">
          <TabsTrigger value="leva">Batch style</TabsTrigger>
          <TabsTrigger value="gerais">Advanced</TabsTrigger>
        </TabsList>

        {/* ---- only what matters per batch ---- */}
        <TabsContent value="leva" className="space-y-8">
          <p className="text-xs text-muted-foreground">
            The few settings you change per campaign. Everything else (folders,
            binaries, video, audio, whisper) lives under Advanced.
          </p>
          <Group title="Transition">
            <div className="space-y-1 sm:col-span-2">
              <Label>type (between segments)</Label>
              <Select
                value={config.transicao.tipo}
                onValueChange={(v) => upd("transicao.tipo", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRANSITIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label} — {t.desc}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{transDesc}</p>
            </div>
            {num("transicao.duracao", "duration (s)", "0.05")}
          </Group>

          <Group title="Caption">
            <div className="space-y-1">
              <Label>size</Label>
              <Segmented
                value={String(config.legenda.tamanho)}
                onChange={(v) => upd("legenda.tamanho", parseInt(v, 10))}
                options={[
                  { value: "80", label: "S" },
                  { value: "96", label: "M" },
                  { value: "112", label: "L" },
                ]}
              />
            </div>
            <div className="sm:col-span-2">
              <Slider
                label="vertical position"
                value={config.legenda.posicao_vertical}
                min={0.4}
                max={0.7}
                step={0.01}
                onChange={(v) => upd("legenda.posicao_vertical", v)}
                format={(v) => `${Math.round(v * 100)}%`}
              />
            </div>
            {color("legenda.cor_destaque", "highlight color")}
          </Group>

          <Group title="Bar">
            {color("tarja.cor_inicio", "start color")}
            {color("tarja.cor_fim", "end color")}
          </Group>

          <Group title="Punch-in (auto zoom)">
            {toggle("edicao.punch_in.ativo", "on by default")}
            <div className="space-y-1">
              <Label>every</Label>
              <Select
                value={config.edicao.punch_in.a_cada}
                onValueChange={(v) => upd("edicao.punch_in.a_cada", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="frase">phrase change</SelectItem>
                  <SelectItem value="segundos">fixed interval</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {num("edicao.punch_in.segundos", "interval (s)", "1")}
            {num("edicao.punch_in.zoom", "zoom (1.08 = 8%)", "0.01")}
            <p className="text-xs text-muted-foreground sm:col-span-2">
              a hard zoom cut on the component's own video, without affecting the
              caption. Can be turned on/off per component on each card.
            </p>
          </Group>

          <Group title="Speech language">
            <div className="space-y-1 sm:col-span-2">
              <Label>whisper.language</Label>
              <Select
                value={config.whisper.language}
                onValueChange={(v) => {
                  if (v !== config.whisper.language) {
                    toast.message("Transcripts will be redone for clips already ingested in the new language.");
                  }
                  upd("whisper.language", v);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pt">Portuguese</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="auto">Automatic</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Group>
        </TabsContent>

        {/* ---- everything (global defaults) ---- */}
        <TabsContent value="gerais" className="space-y-8">
        <Group title="Folders & binaries">
          {txt("input_dir", "input_dir", "./input or a Drive path")}
          {txt("output_dir", "output_dir")}
          {txt("bin.ffmpeg", "ffmpeg")}
          {txt("bin.ffprobe", "ffprobe")}
          {txt("bin.whisper", "whisper-cli")}
          {txt("whisper.model_path", "whisper model")}
          {txt("whisper.language", "language (en / auto)")}
          {num("whisper.threads", "whisper threads")}
        </Group>

        <Group title="Video">
          {num("video.width", "width")}
          {num("video.height", "height")}
          {num("video.fps", "fps")}
          <div className="space-y-1">
            <Label>encoder</Label>
            <Select
              value={config.video.encoder}
              onValueChange={(v) => upd("video.encoder", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="h264_videotoolbox">
                  h264_videotoolbox (Apple)
                </SelectItem>
                <SelectItem value="libx264">libx264 veryfast</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {txt("video.bitrate_final", "final bitrate", "10M")}
          {num("video.crf_master", "crf master")}
        </Group>

        <Group title="Audio">
          {num("audio.loudnorm_target_i", "target LUFS (I)")}
          {num("audio.loudnorm_target_tp", "true peak (TP)", "0.1")}
          {num("audio.loudnorm_target_lra", "LRA")}
          {num("audio.denoise_strength", "denoise (0-1)", "0.01")}
          {toggle("audio.denoise", "denoise on")}
        </Group>

        <Group title="Silence trim">
          {toggle("trim.auto_trim_silence", "auto trim")}
          {num("trim.silence_threshold_db", "threshold (dB)")}
          {num("trim.silence_min_duration", "min duration (s)", "0.05")}
          {num("trim.padding_start", "padding start (s)", "0.01")}
          {num("trim.padding_end", "padding end (s)", "0.01")}
        </Group>

        <Group title="Transition">
          <div className="space-y-1 sm:col-span-2">
            <Label>type (between segments)</Label>
            <Select
              value={config.transicao.tipo}
              onValueChange={(v) => upd("transicao.tipo", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRANSITIONS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label} — {t.desc}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{transDesc}</p>
          </div>
          {num("transicao.duracao", "duration (s)", "0.05")}
          <div className="space-y-1">
            <Label>opener (video start)</Label>
            <Select
              value={config.transicao.abertura}
              onValueChange={(v) => upd("transicao.abertura", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EDGE_EFFECTS.map((e) => (
                  <SelectItem key={e.value} value={e.value}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {num("transicao.abertura_duracao", "opener dur (s)", "0.05")}
          <div className="space-y-1">
            <Label>closer (video end)</Label>
            <Select
              value={config.transicao.fechamento}
              onValueChange={(v) => upd("transicao.fechamento", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EDGE_EFFECTS.map((e) => (
                  <SelectItem key={e.value} value={e.value}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {num("transicao.fechamento_duracao", "closer dur (s)", "0.05")}
        </Group>

        <Group title="Caption (per-word karaoke)">
          {txt("legenda.fonte", "font")}
          {num("legenda.tamanho", "size")}
          {color("legenda.cor", "color")}
          {color("legenda.cor_destaque", "highlight color")}
          {color("legenda.contorno_cor", "outline")}
          {num("legenda.contorno_largura", "outline width")}
          {num("legenda.sombra", "shadow")}
          {num("legenda.posicao_vertical", "vertical position (0-1)", "0.01")}
          {num("legenda.max_palavras_linha", "max words/line")}
        </Group>

        <Group title="Hook overlay">
          {txt("overlay_hook.fonte", "font")}
          {num("overlay_hook.tamanho", "size")}
          {color("overlay_hook.cor", "color")}
          {color("overlay_hook.contorno_cor", "outline")}
          {num("overlay_hook.contorno_largura", "outline width")}
          {num("overlay_hook.posicao_vertical", "vertical position (0-1)", "0.01")}
          <div className="space-y-1">
            <Label>alignment</Label>
            <Select
              value={config.overlay_hook.alinhamento}
              onValueChange={(v) => upd("overlay_hook.alinhamento", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left">left</SelectItem>
                <SelectItem value="center">center</SelectItem>
                <SelectItem value="right">right</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {toggle("overlay_hook.fundo_caixa", "box background")}
          {color("overlay_hook.fundo_cor", "background color")}
        </Group>

        <Group title="Bar (orange banner)">
          {color("tarja.cor_inicio", "start color (left)")}
          {color("tarja.cor_fim", "end color (right)")}
          {txt("tarja.fonte", "font")}
          {num("tarja.tamanho", "size")}
          {color("tarja.cor_texto", "text color")}
          {num("tarja.padding_vertical", "vertical padding")}
          {num("tarja.espaco_linha", "line spacing")}
          {num("tarja.largura", "width (0-1)", "0.05")}
          {num("tarja.sombra_offset", "shadow (offset)")}
          {num("tarja.contorno_largura", "outline (width)")}
          {num("tarja.posicao_vertical", "default position (0-1)", "0.01")}
        </Group>

        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 p-3">
          <div
            className="h-10 flex-1 rounded-md"
            style={{
              backgroundImage: `linear-gradient(90deg, ${config.tarja.cor_inicio}, ${config.tarja.cor_fim})`,
            }}
          />
          <span className="text-xs text-muted-foreground">
            bar gradient preview
          </span>
        </div>

        <Group title="Layout (split defaults)">
          {num("layout.divisao_padrao", "default split (0-1)", "0.05")}
          {num("layout.foco_video_padrao", "default video focus", "0.05")}
          {num("layout.foco_imagem_padrao", "default image focus", "0.05")}
        </Group>

        <Group title="Render & filename">
          {num("render.concorrencia", "concurrency")}
          {toggle("render.sobrescrever_existentes", "overwrite existing")}
          {txt("render.prefixo", "prefix (e.g. promoJan)")}
          <div className="space-y-1 sm:col-span-2">
            {txt("render.padrao_nome", "name pattern")}
            <p className="text-xs text-muted-foreground">
              tokens: {"{hook}"} {"{body}"} {"{cta}"} {"{n}"} {"{prefixo}"} ·
              becomes the saved filename
            </p>
          </div>
        </Group>
        </TabsContent>
       </Tabs>
      </CardContent>
    </Card>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {children}
      </div>
    </div>
  );
}
