import { useState } from 'react';
import {
  Activity,
  Boxes,
  CircuitBoard,
  Cpu,
  Database,
  HardDrive,
  Network,
  Server,
  Zap,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { ARCHITECTURE, ARCH_NODES, LAYERS } from '../content/site';
import type { ArchNode, ArchNodeId } from '../content/site';
import { LiquidPanel } from '../components/liquid/LiquidPanel';
import { LiquidConnector } from '../components/liquid/LiquidConnector';
import { SystemNode } from '../components/liquid/SystemNode';
import { SectionHead } from '../components/common/SectionHead';

/* ------------------------------------------------------------------ board ---
   One coordinate system for both layers of the map: an SVG underlay using
   viewBox="0 0 BOARD.w BOARD.h" with preserveAspectRatio="none", and HTML nodes
   positioned with the very same numbers as percentages. They can never drift.
   ------------------------------------------------------------------------- */

const BOARD = { w: 1400, h: 800 };
const NODE_W = 148;
const NODE_H = 66;

const POS: Record<ArchNodeId, { x: number; y: number }> = {
  frontend: { x: 780, y: 96 },
  nginx: { x: 780, y: 250 },
  koa: { x: 300, y: 452 },
  java: { x: 620, y: 452 },
  rust: { x: 940, y: 452 },
  ai: { x: 1260, y: 452 },
  mysql: { x: 300, y: 690 },
  redis: { x: 620, y: 690 },
  minio: { x: 940, y: 690 },
  prometheus: { x: 1260, y: 690 },
};

const ROW_Y: Record<string, number> = { client: 96, edge: 250, service: 452, infra: 690 };

const EDGES: { from: ArchNodeId; to: ArchNodeId }[] = [
  { from: 'frontend', to: 'nginx' },
  { from: 'nginx', to: 'koa' },
  { from: 'nginx', to: 'java' },
  { from: 'nginx', to: 'rust' },
  { from: 'nginx', to: 'ai' },
  { from: 'koa', to: 'mysql' },
  { from: 'koa', to: 'redis' },
  { from: 'koa', to: 'minio' },
  { from: 'koa', to: 'prometheus' },
  { from: 'java', to: 'mysql' },
  { from: 'java', to: 'redis' },
  { from: 'rust', to: 'mysql' },
  { from: 'rust', to: 'redis' },
  { from: 'ai', to: 'koa' },
];

function edgePath(from: ArchNodeId, to: ArchNodeId): string {
  const a = POS[from];
  const b = POS[to];

  /* Same row (service → service internal call): arc above the row. */
  if (a.y === b.y) {
    const x1 = a.x + NODE_W / 2;
    const x2 = b.x - NODE_W / 2;
    const lift = 118;
    return `M ${x1} ${a.y} C ${x1 + 150} ${a.y - lift}, ${x2 - 150} ${b.y - lift}, ${x2} ${b.y}`;
  }

  const y1 = a.y + NODE_H / 2;
  const y2 = b.y - NODE_H / 2;
  const dy = y2 - y1;

  if (Math.abs(a.x - b.x) < 1) return `M ${a.x} ${y1} L ${a.x} ${y2}`;

  return `M ${a.x} ${y1} C ${a.x} ${y1 + dy * 0.56}, ${b.x} ${y2 - dy * 0.44}, ${b.x} ${y2}`;
}

const NODE_ICONS: Partial<Record<ArchNodeId, ReactNode>> = {
  frontend: <Boxes size={17} strokeWidth={1.85} />,
  nginx: <Network size={17} strokeWidth={1.85} />,
  koa: <Server size={17} strokeWidth={1.85} />,
  java: <Server size={17} strokeWidth={1.85} />,
  rust: <CircuitBoard size={17} strokeWidth={1.85} />,
  ai: <Cpu size={17} strokeWidth={1.85} />,
  mysql: <Database size={17} strokeWidth={1.85} />,
  redis: <Zap size={17} strokeWidth={1.85} />,
  minio: <HardDrive size={17} strokeWidth={1.85} />,
  prometheus: <Activity size={17} strokeWidth={1.85} />,
};

const SIDE: Partial<Record<ArchNodeId, 'left' | 'right'>> = {
  ai: 'left',
  prometheus: 'left',
};

const pct = (value: number, total: number) => `${(value / total) * 100}%`;

/* ------------------------------------------------------------------- view --- */

export function Architecture() {
  const [active, setActive] = useState<ArchNodeId | null>(null);

  return (
    <section className="section architecture" id="architecture" aria-labelledby="architecture-title">
      <div className="shell shell-wide">
        <SectionHead
          eyebrow={ARCHITECTURE.eyebrow}
          title={ARCHITECTURE.title}
          lede={ARCHITECTURE.lede}
          headingId="architecture-title"
        />

        {/* ---------------- desktop board ---------------- */}
        <div className="arch-board-wrap">
          <div
            className="arch-board"
            style={{ aspectRatio: `${BOARD.w} / ${BOARD.h}` }}
            onPointerLeave={() => setActive(null)}
          >
            {/* layer bands + labels */}
            {LAYERS.map((layer) => (
              <div
                key={layer.id}
                className="arch-band"
                style={{ top: pct(ROW_Y[layer.id] - 92, BOARD.h), height: pct(184, BOARD.h) }}
                aria-hidden="true"
              />
            ))}
            {LAYERS.map((layer) => (
              <div
                key={`label-${layer.id}`}
                className="arch-layer-label"
                style={{ top: pct(ROW_Y[layer.id], BOARD.h) }}
                aria-hidden="true"
              >
                {layer.label}
              </div>
            ))}

            {/* connectors */}
            <svg
              className="arch-links"
              viewBox={`0 0 ${BOARD.w} ${BOARD.h}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {EDGES.map((edge) => {
                const lit = active !== null && (edge.from === active || edge.to === active);
                const dim = active !== null && !lit;
                return (
                  <LiquidConnector
                    key={`${edge.from}-${edge.to}`}
                    d={edgePath(edge.from, edge.to)}
                    lit={lit}
                    dim={dim}
                  />
                );
              })}
            </svg>

            {/* nodes */}
            {ARCH_NODES.map((node: ArchNode) => (
              <div
                key={node.id}
                className="arch-node"
                style={{
                  left: pct(POS[node.id].x, BOARD.w),
                  top: pct(POS[node.id].y, BOARD.h),
                  width: pct(NODE_W, BOARD.w),
                  zIndex: active === node.id ? 30 : 10,
                }}
              >
                <SystemNode
                  node={node}
                  icon={NODE_ICONS[node.id]}
                  active={active === node.id}
                  dim={active !== null && active !== node.id && !node.links.includes(active)}
                  side={SIDE[node.id] ?? 'right'}
                  onInspect={() => setActive(node.id)}
                  onRelease={() => setActive((current) => (current === node.id ? null : current))}
                />
              </div>
            ))}
          </div>
        </div>

        {/* ---------------- compact flow ---------------- */}
        <div className="arch-flow">
          {LAYERS.map((layer) => (
            <div className="arch-flow__group" key={layer.id}>
              <p className="arch-flow__layer">{layer.label}</p>
              {ARCH_NODES.filter((node) => node.layer === layer.id).map((node) => (
                <LiquidPanel key={node.id} className="arch-flow__card" variant="soft" radius="lg" glow>
                  <div className="sn__head">
                    <span className="sn__icon">{NODE_ICONS[node.id]}</span>
                    <span className="sn__names">
                      <span className="sn__name">{node.name}</span>
                      <span className="sn__caption">{node.caption}</span>
                    </span>
                  </div>
                  <dl className="sn__rows">
                    {node.panel.rows.slice(0, 3).map((row) => (
                      <div className="sn__row" key={row.k}>
                        <dt>{row.k}</dt>
                        <dd>{row.v}</dd>
                      </div>
                    ))}
                  </dl>
                </LiquidPanel>
              ))}
            </div>
          ))}
        </div>

        <p className="arch-footnote">
          <span className="arch-footnote__dot" aria-hidden="true" />
          {ARCHITECTURE.footnote}
        </p>
      </div>
    </section>
  );
}
