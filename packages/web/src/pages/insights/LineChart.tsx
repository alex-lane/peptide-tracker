// Tiny inline-SVG line chart. No deps. Lab-notebook styling: thin stroke,
// labeled axes, no gridlines, no legend (caller supplies the title).

interface Point {
  readonly x: number;
  readonly y: number;
  readonly label?: string;
}

interface Props {
  points: readonly Point[];
  width?: number;
  height?: number;
  yMin?: number;
  yMax?: number;
  yLabel?: string;
  className?: string;
  /** Optional ARIA label for the chart as a whole. */
  ariaLabel?: string;
}

export function LineChart({
  points,
  width = 320,
  height = 120,
  yMin: yMinProp,
  yMax: yMaxProp,
  yLabel,
  className,
  ariaLabel,
}: Props) {
  if (points.length === 0) return null;

  const padL = 32;
  const padR = 8;
  const padT = 8;
  const padB = 22;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = yMinProp ?? Math.min(...ys, 0);
  const yMax = yMaxProp ?? Math.max(...ys, 1);
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;

  const projX = (x: number) => padL + ((x - xMin) / xRange) * innerW;
  const projY = (y: number) => padT + (1 - (y - yMin) / yRange) * innerH;

  const polyline = points.map((p) => `${projX(p.x).toFixed(1)},${projY(p.y).toFixed(1)}`).join(' ');

  // Three Y ticks: min, mid, max.
  const yTicks = [yMin, (yMin + yMax) / 2, yMax];

  return (
    <svg
      role="img"
      aria-label={ariaLabel ?? `Line chart, ${points.length} points`}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
    >
      {/* Axes */}
      <line
        x1={padL}
        y1={padT}
        x2={padL}
        y2={padT + innerH}
        stroke="currentColor"
        strokeOpacity="0.3"
        strokeWidth="1"
      />
      <line
        x1={padL}
        y1={padT + innerH}
        x2={padL + innerW}
        y2={padT + innerH}
        stroke="currentColor"
        strokeOpacity="0.3"
        strokeWidth="1"
      />
      {/* Y-axis ticks + labels */}
      {yTicks.map((y, i) => (
        <g key={i}>
          <line
            x1={padL - 3}
            y1={projY(y)}
            x2={padL}
            y2={projY(y)}
            stroke="currentColor"
            strokeOpacity="0.3"
          />
          <text
            x={padL - 5}
            y={projY(y) + 3}
            textAnchor="end"
            fontSize="9"
            fill="currentColor"
            fillOpacity="0.6"
            fontFamily="monospace"
          >
            {formatNum(y)}
          </text>
        </g>
      ))}
      {/* X-axis labels: first and last point dates if provided */}
      {points[0]?.label && (
        <text
          x={padL}
          y={height - 6}
          textAnchor="start"
          fontSize="9"
          fill="currentColor"
          fillOpacity="0.6"
          fontFamily="monospace"
        >
          {points[0].label}
        </text>
      )}
      {points[points.length - 1]?.label && points.length > 1 && (
        <text
          x={padL + innerW}
          y={height - 6}
          textAnchor="end"
          fontSize="9"
          fill="currentColor"
          fillOpacity="0.6"
          fontFamily="monospace"
        >
          {points[points.length - 1]!.label}
        </text>
      )}
      {/* Y label (rotated) */}
      {yLabel && (
        <text
          x={6}
          y={padT + innerH / 2}
          textAnchor="middle"
          fontSize="9"
          fill="currentColor"
          fillOpacity="0.6"
          transform={`rotate(-90, 6, ${padT + innerH / 2})`}
        >
          {yLabel}
        </text>
      )}
      {/* The line */}
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={polyline}
      />
    </svg>
  );
}

function formatNum(n: number): string {
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (Math.abs(n) < 1) return n.toFixed(2);
  return n.toFixed(1);
}
