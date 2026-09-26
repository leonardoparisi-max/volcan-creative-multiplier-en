/**
 * Volcan brand mark — the gradient "A" triangle from the real logo, adapted for
 * the dark console. `wordmark` renders VOLCAN + GROWTH TECH next to the mark.
 */
export function VolcanMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className={className} aria-label="Volcan">
      <defs>
        <linearGradient id="volcan-mark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E8542A" />
          <stop offset="1" stopColor="#F49B3C" />
        </linearGradient>
      </defs>
      <path
        d="M20 5 L37 35 L28 35 L20 21 L12 35 L3 35 Z"
        fill="url(#volcan-mark)"
      />
    </svg>
  );
}

export function VolcanWordmark() {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[13px] font-extrabold tracking-[0.14em] text-foreground">
        VOLC<span className="cc-grad-text">A</span>N
      </span>
      <span className="text-[9.5px] font-bold tracking-[0.22em] text-muted-foreground">
        GROWTH TECH
      </span>
    </div>
  );
}
