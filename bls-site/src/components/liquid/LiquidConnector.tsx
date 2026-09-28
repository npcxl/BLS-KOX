export interface LiquidConnectorProps {
  d: string;
  /** On the active path: opacity rises to 0.9 and the stroke warms to brand blue. */
  lit?: boolean;
  /** A sibling node is active — step back to near-invisible. */
  dim?: boolean;
  dashed?: boolean;
  className?: string;
}

/**
 * One very thin light-blue link between two system nodes.
 * Default opacity 0.15–0.25; only the active path lights up.
 */
export function LiquidConnector({ d, lit = false, dim = false, dashed = false, className }: LiquidConnectorProps) {
  return (
    <path
      className={['lq-link', lit ? 'is-lit' : '', dim ? 'is-dim' : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
      d={d}
      fill="none"
      stroke="currentColor"
      strokeWidth={lit ? 1.4 : 1}
      strokeLinecap="round"
      strokeDasharray={dashed ? '4 7' : undefined}
      vectorEffect="non-scaling-stroke"
    />
  );
}
