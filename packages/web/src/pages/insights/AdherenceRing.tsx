// Adherence ring: SVG donut showing logged ÷ due. Neutral colors (ink-300 on
// paper-300) — no clinical green/red signaling. The number speaks for itself.

interface Props {
  /** 0..1 fraction; null renders a placeholder. */
  rate: number | null;
  /** Inner label, e.g. "30d". */
  label: string;
  size?: number;
  className?: string;
}

export function AdherenceRing({ rate, label, size = 96, className }: Props) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = rate === null ? c : c * (1 - rate);

  const pct = rate === null ? '—' : `${Math.round(rate * 100)}%`;

  return (
    <svg
      role="img"
      aria-label={`Adherence: ${pct} over ${label}`}
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className={className}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.2"
        strokeWidth={stroke}
      />
      {rate !== null && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={dash}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
      <text
        x={size / 2}
        y={size / 2 + 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="18"
        fontFamily="monospace"
        fill="currentColor"
      >
        {pct}
      </text>
      <text
        x={size / 2}
        y={size / 2 + 18}
        textAnchor="middle"
        fontSize="9"
        fill="currentColor"
        fillOpacity="0.6"
      >
        {label}
      </text>
    </svg>
  );
}
