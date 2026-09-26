"use client";
import { cn } from "@/lib/cn";

/** Lightweight labeled range slider with a live value read-out. */
export function Slider({
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  label,
  format,
  className,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  label?: string;
  format?: (v: number) => string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      {label && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <span className="mono text-xs tabular-nums text-foreground">
            {format ? format(value) : value.toFixed(2)}
          </span>
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="cc-range w-full"
      />
    </div>
  );
}
