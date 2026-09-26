"use client";
import type { Config, ComponentRow } from "@/lib/types";
import { cn } from "@/lib/cn";

/**
 * Live CSS mock of a component's composed frame (9:16). Not a render — it just
 * mirrors the layout, tarja position and focus so the user can dial placement
 * before committing to a real ffmpeg pass. Uses the locally-installed Montserrat
 * so the tarja text matches the burn-in closely.
 */
export function CompositionPreview({
  row,
  config,
  imageHash,
  className,
}: {
  row: ComponentRow;
  config: Config;
  imageHash?: string;
  className?: string;
}) {
  const split = row.layout === "imagem_cima" || row.layout === "imagem_baixo";
  const imageTop = row.layout === "imagem_cima";
  const topPct = Math.round((row.divisao ?? 0.55) * 100);

  const videoThumb = row.hash ? `/api/thumb?hash=${row.hash}` : "";
  const imgThumb = imageHash ? `/api/thumb?hash=${imageHash}` : "";

  const hasOverlay = (row.texto_overlay ?? "").trim().length > 0;
  const isTarja = hasOverlay && row.texto_estilo === "tarja";
  const isSimples = hasOverlay && row.texto_estilo === "simples";
  const isLegenda = !hasOverlay && row.legenda_ativa;

  const lines = (row.texto_overlay ?? "").split("|").map((l) => l.trim());

  const Region = ({ thumb, foco }: { thumb: string; foco: number }) =>
    thumb ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={thumb}
        alt=""
        className="h-full w-full object-cover"
        style={{ objectPosition: `50% ${Math.round((foco ?? 0.5) * 100)}%` }}
      />
    ) : (
      <div className="flex h-full w-full items-center justify-center bg-black text-[10px] text-muted-foreground">
        sem clipe
      </div>
    );

  return (
    <div
      className={cn(
        "relative aspect-[9/16] w-full overflow-hidden rounded-lg border border-border bg-black",
        className
      )}
      style={{ containerType: "inline-size" }}
    >
      {/* layout regions */}
      {!split ? (
        <Region thumb={videoThumb} foco={row.foco_video} />
      ) : (
        <div className="flex h-full w-full flex-col">
          <div style={{ height: `${topPct}%` }} className="relative overflow-hidden">
            <Region
              thumb={imageTop ? imgThumb : videoThumb}
              foco={imageTop ? row.foco_imagem : row.foco_video}
            />
          </div>
          <div className="h-px bg-white/20" />
          <div style={{ height: `${100 - topPct}%` }} className="relative overflow-hidden">
            <Region
              thumb={imageTop ? videoThumb : imgThumb}
              foco={imageTop ? row.foco_video : row.foco_imagem}
            />
          </div>
        </div>
      )}

      {/* text layer */}
      {isTarja && (
        <div
          className="cc-grad absolute left-0 right-0 flex flex-col items-center justify-center px-3 py-2 text-center"
          style={{ top: `${(row.texto_posicao ?? 0.66) * 100}%`, transform: "translateY(-50%)" }}
        >
          {lines.map((l, i) => (
            <span
              key={i}
              className="leading-tight text-white"
              style={{
                fontFamily: "Montserrat, system-ui, sans-serif",
                fontWeight: 800,
                fontSize: "clamp(11px, 5.2cqw, 22px)",
                textShadow: "0 2px 3px rgba(0,0,0,.35)",
              }}
            >
              {l || " "}
            </span>
          ))}
        </div>
      )}

      {isSimples && (
        <div
          className="absolute left-0 right-0 flex flex-col items-center px-3 text-center"
          style={{ top: `${(row.texto_posicao ?? 0.3) * 100}%`, transform: "translateY(-50%)" }}
        >
          {lines.map((l, i) => (
            <span
              key={i}
              className="leading-tight text-white"
              style={{
                fontFamily: "Montserrat, system-ui, sans-serif",
                fontWeight: 800,
                fontSize: "clamp(12px, 6cqw, 26px)",
                textShadow: "0 0 4px #000, 0 2px 4px #000",
              }}
            >
              {l || " "}
            </span>
          ))}
        </div>
      )}

      {isLegenda && (
        <div
          className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded px-1.5 py-0.5 text-center text-white"
          style={{
            top: `${(config.legenda.posicao_vertical ?? 0.6) * 100}%`,
            fontFamily: "Montserrat, system-ui, sans-serif",
            fontWeight: 800,
            fontSize: `${((config.legenda.tamanho ?? 96) / (config.video.height || 1920)) * 100 * 1.78}cqw`,
            textShadow: "0 0 3px #000, 0 1px 3px #000",
          }}
        >
          caption <span style={{ color: config.legenda.cor_destaque }}>karaoke</span> here
        </div>
      )}

      {/* safe zone: where Reels/TikTok/Shorts draw their own UI */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute inset-x-0 top-0 h-[14%] bg-red-500/15" />
        <div className="absolute inset-x-0 bottom-0 h-[22%] bg-red-500/15" />
        <div className="absolute right-0 top-1/2 h-[35%] w-[12%] bg-red-500/15" />
        <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[8px] text-red-200">
          covered by the app UI
        </span>
      </div>
    </div>
  );
}
