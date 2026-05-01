// Tiny inline SVG sparkline. No deps. Used for upcoming burn-down on the
// dashboard until the M10 Insights tab brings full Recharts.

interface Props {
  values: readonly number[];
  width?: number;
  height?: number;
  className?: string;
  /** Optional ARIA label. */
  ariaLabel?: string;
}

export function Sparkline({
  values,
  width = 80,
  height = 20,
  className,
  ariaLabel,
}: Props) {
  if (values.length === 0) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg
      role="img"
      aria-label={ariaLabel ?? `Trend: ${values.join(', ')}`}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.join(' ')}
      />
    </svg>
  );
}
