// Visual U-100 insulin syringe. Capacity-aware (30u / 50u / 100u), with
// graduated tick marks, a liquid fill column, and an animated plunger.
// Pure SVG, no deps. Uses currentColor for the barrel outline so it
// adapts to dark / light themes.

import { useId } from 'react';
import { cn } from '@/lib/cn';

interface Props {
  /** Syringe total capacity in U-100 units. */
  capacityUnits: 30 | 50 | 100;
  /** Volume to draw, in U-100 units. Clamped to [0, capacity] for display. */
  fillUnits: number;
  className?: string;
}

const TICK_MAJOR_EVERY: Record<30 | 50 | 100, number> = {
  30: 5,
  50: 5,
  100: 10,
};
const TICK_MINOR_EVERY: Record<30 | 50 | 100, number> = {
  30: 1,
  50: 1,
  100: 2,
};

export function SyringeVisualization({ capacityUnits, fillUnits, className }: Props) {
  const gradId = useId();
  const fillSafe = Math.max(0, Math.min(capacityUnits, fillUnits));
  const overflow = fillUnits > capacityUnits;

  // SVG geometry. Horizontal layout: needle on the right.
  const W = 360;
  const H = 80;
  const padX = 24;
  const barrelLeft = padX;
  const barrelRight = W - padX - 60; // leave room for needle + flange labels
  const barrelTop = 24;
  const barrelBottom = H - 16;
  const barrelW = barrelRight - barrelLeft;
  const barrelH = barrelBottom - barrelTop;

  // Map units → x position. 0 units at barrelLeft, capacity at barrelRight.
  const unitsToX = (u: number) => barrelLeft + (u / capacityUnits) * barrelW;
  const fillX = unitsToX(fillSafe);

  // Tick marks
  const minor = TICK_MINOR_EVERY[capacityUnits];
  const major = TICK_MAJOR_EVERY[capacityUnits];
  const ticks: Array<{ u: number; isMajor: boolean }> = [];
  for (let u = 0; u <= capacityUnits; u += minor) {
    ticks.push({ u, isMajor: u % major === 0 });
  }

  // Volume in mL for the secondary readout
  const volumeMl = fillSafe * 0.01;

  return (
    <figure
      role="img"
      aria-label={`U-100 ${capacityUnits}u syringe, drawn to ${fillSafe.toFixed(1)} units (${volumeMl.toFixed(2)} mL)`}
      className={cn('rounded-lg border border-border-subtle bg-bg-surface p-3', className)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id={gradId} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="rgb(124 92 255)" stopOpacity="0.85" />
            <stop offset="100%" stopColor="rgb(244 114 182)" stopOpacity="0.85" />
          </linearGradient>
        </defs>

        {/* Plunger thumbrest (left) */}
        <rect
          x={barrelLeft - 14}
          y={barrelTop - 4}
          width="6"
          height={barrelH + 8}
          rx="2"
          className="fill-text-muted"
          opacity="0.6"
        />

        {/* Liquid fill — gradient from purple to pink */}
        {fillSafe > 0 && (
          <rect
            x={barrelLeft}
            y={barrelTop + 1}
            width={fillX - barrelLeft}
            height={barrelH - 2}
            fill={`url(#${gradId})`}
            className="transition-[width] duration-240 ease-out"
          />
        )}

        {/* Plunger position indicator (vertical line at fill front) */}
        {fillSafe > 0 && (
          <line
            x1={fillX}
            x2={fillX}
            y1={barrelTop - 6}
            y2={barrelBottom + 6}
            stroke={overflow ? 'rgb(244 63 94)' : 'rgb(244 114 182)'}
            strokeWidth="2"
            strokeLinecap="round"
            className="transition-[x1,x2] duration-240 ease-out"
          />
        )}

        {/* Barrel outline */}
        <rect
          x={barrelLeft}
          y={barrelTop}
          width={barrelW}
          height={barrelH}
          rx="3"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.45"
          strokeWidth="1.5"
        />

        {/* Tick marks + labels */}
        {ticks.map((t) => {
          const x = unitsToX(t.u);
          const tickH = t.isMajor ? 8 : 4;
          return (
            <g key={t.u}>
              <line
                x1={x}
                x2={x}
                y1={barrelBottom}
                y2={barrelBottom + tickH}
                stroke="currentColor"
                strokeOpacity={t.isMajor ? 0.7 : 0.35}
                strokeWidth="1"
              />
              {t.isMajor && (
                <text
                  x={x}
                  y={barrelBottom + tickH + 8}
                  textAnchor="middle"
                  fontSize="9"
                  fontFamily="JetBrains Mono, monospace"
                  fill="currentColor"
                  fillOpacity="0.6"
                >
                  {t.u}
                </text>
              )}
            </g>
          );
        })}

        {/* Needle (right side) */}
        <g>
          {/* Needle hub */}
          <rect
            x={barrelRight}
            y={barrelTop + barrelH / 2 - 5}
            width="10"
            height="10"
            rx="1"
            className="fill-text-muted"
            opacity="0.8"
          />
          {/* Needle shaft */}
          <rect
            x={barrelRight + 10}
            y={barrelTop + barrelH / 2 - 1}
            width="40"
            height="2"
            className="fill-text-secondary"
          />
          {/* Needle tip */}
          <polygon
            points={`${barrelRight + 50},${barrelTop + barrelH / 2 - 2} ${barrelRight + 56},${barrelTop + barrelH / 2} ${barrelRight + 50},${barrelTop + barrelH / 2 + 2}`}
            className="fill-text-secondary"
          />
        </g>

        {/* Top legend: capacity */}
        <text
          x={barrelLeft}
          y={barrelTop - 8}
          fontSize="10"
          fontFamily="Inter, system-ui, sans-serif"
          fill="currentColor"
          fillOpacity="0.5"
        >
          U-100 · {capacityUnits}u capacity ({(capacityUnits * 0.01).toFixed(1)} mL)
        </text>

        {/* Bottom legend: fill readout */}
        <text
          x={barrelRight}
          y={barrelTop - 8}
          fontSize="10"
          textAnchor="end"
          fontFamily="JetBrains Mono, monospace"
          fill={overflow ? 'rgb(244 63 94)' : 'currentColor'}
          fillOpacity={overflow ? 1 : 0.85}
        >
          {fillUnits.toFixed(1)} u · {volumeMl.toFixed(2)} mL
          {overflow && ' · OVER CAPACITY'}
        </text>
      </svg>
    </figure>
  );
}
