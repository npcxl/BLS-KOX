import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { CORE_NODES } from '../../content/site';
import { useInViewOnce, useIsCompact, usePrefersReducedMotion } from '../../lib/hooks';
import type { SystemCoreModelSource } from './model';

const Scene = lazy(() => import('./Scene'));

export interface SystemCoreProps {
  /** Reserved for a future GLB export (Tripo3D / Blender). Unused today. */
  model?: SystemCoreModelSource;
  className?: string;
}

export interface ProjectedLabel {
  id: string;
  x: number;
  y: number;
}

/** Static SVG core — used for compact viewports, reduced motion, SSR and lazy fallback. */
export function CoreGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={['core-glyph', className ?? ''].filter(Boolean).join(' ')}
      viewBox="0 0 420 420"
      role="img"
      aria-label="BLS-KOX system core"
    >
      <defs>
        <radialGradient id="cg-core" cx="36%" cy="30%" r="76%">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="52%" stopColor="#69B1FF" />
          <stop offset="100%" stopColor="#1677FF" />
        </radialGradient>
        <radialGradient id="cg-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#4096FF" stopOpacity="0.16" />
          <stop offset="1" stopColor="#4096FF" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="210" cy="210" r="196" fill="url(#cg-halo)" />
      <g fill="none" stroke="#4096FF" strokeWidth="1.1">
        <ellipse cx="210" cy="210" rx="168" ry="62" opacity="0.24" />
        <ellipse cx="210" cy="210" rx="168" ry="62" opacity="0.34" transform="rotate(60 210 210)" />
        <ellipse cx="210" cy="210" rx="168" ry="62" opacity="0.44" transform="rotate(120 210 210)" />
      </g>
      <circle cx="210" cy="210" r="186" fill="rgba(255,255,255,0.45)" stroke="rgba(20,50,90,0.08)" />
      <circle cx="210" cy="210" r="62" fill="url(#cg-core)" />
      <circle cx="210" cy="210" r="62" fill="none" stroke="#FFFFFF" strokeOpacity="0.7" />
      <circle cx="192" cy="190" r="14" fill="#FFFFFF" fillOpacity="0.85" />
      {CORE_NODES.map((node) => {
        const rad = (node.angle * Math.PI) / 180;
        return (
          <g key={node.id}>
            <line
              x1="210"
              y1="210"
              x2={210 + Math.cos(rad) * 168}
              y2={210 + Math.sin(rad) * 168}
              stroke="#4096FF"
              strokeOpacity="0.18"
            />
            <circle cx={210 + Math.cos(rad) * 168} cy={210 + Math.sin(rad) * 168} r="6" fill="#69B1FF" />
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Hero visual core. Not an "AI core" — it represents the whole BLS-KOX system:
 * one glass core, three orbits (Koa / Spring Boot / Rust) and a few outer nodes.
 */
export function SystemCore({ model, className }: SystemCoreProps) {
  const [holderRef, inView] = useInViewOnce<HTMLDivElement>('120px 0px 120px 0px', 0.01);
  const compact = useIsCompact();
  const reduceMotion = usePrefersReducedMotion();
  const [labelsReady, setLabelsReady] = useState(false);
  const labelRefs = useRef<Record<string, HTMLSpanElement | null>>({});

  const use3d = inView && !compact;

  useEffect(() => {
    if (!use3d) return;
    const id = window.setTimeout(() => setLabelsReady(true), 1750);
    return () => window.clearTimeout(id);
  }, [use3d]);

  /* Labels are positioned from the real camera projection — no guessing. */
  const handleProject = useCallback((points: ProjectedLabel[]) => {
    for (const point of points) {
      const el = labelRefs.current[point.id];
      if (!el) continue;
      el.style.transform = `translate3d(${point.x}px, ${point.y}px, 0) translate(-50%, -50%)`;
    }
  }, []);

  return (
    <div
      ref={holderRef}
      className={['sys-core', className ?? ''].filter(Boolean).join(' ')}
      data-labels={labelsReady ? 'ready' : 'hidden'}
    >
      <div className="sys-core__frame" aria-hidden="true" />
      {use3d ? (
        <Suspense fallback={<CoreGlyph />}>
          <ScenePaths model={model} onProject={handleProject} reduceMotion={reduceMotion} />
        </Suspense>
      ) : (
        <CoreGlyph />
      )}

      {use3d ? (
        <div className="sys-core__labels" aria-hidden="true">
          {CORE_NODES.map((node) => (
            <span
              key={node.id}
              className="sys-core__label"
              ref={(el) => {
                labelRefs.current[node.id] = el;
              }}
            >
              {node.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Thin adapter so `onProject` does not force the whole scene chunk to re-render. */
function ScenePaths({
  model,
  reduceMotion,
  onProject,
}: {
  model?: SystemCoreModelSource;
  reduceMotion: boolean;
  onProject: (points: ProjectedLabel[]) => void;
}) {
  return <Scene model={model} reduceMotion={reduceMotion} onProject={onProject} />;
}
