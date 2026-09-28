import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { EASE_GLIDE } from '../../lib/motion';
import { GooDefs } from './GooeyFilter';

/* ---------------------------------------------------------------------------
 * Geometry (viewBox units). The 440px rail holds four 40px icon buttons with
 * `space-between`, whose centres land at 22 / 154 / 286 / 418. The droplets are
 * drawn at exactly those centres so the liquid visibly *becomes* the buttons.
 * ------------------------------------------------------------------------- */
const VB_W = 440;
const VB_H = 72;
const CY = VB_H / 2;
const R = 22;
const GAP = 132;
const CAPSULE_H = 52;
const CAPSULE_RX = 28;

/** Visible, translucent liquid fill — light blue on the light page background. */
const FILL = '#b9d4ff';

export interface LiquidSplitRevealProps {
  children: ReactNode[];
  /** Intro delay before the one-shot split starts. */
  delay?: number;
  /** false (reduced motion / compact viewport) → show the buttons immediately. */
  enabled?: boolean;
  className?: string;
  label?: string;
}

/**
 * One horizontal liquid capsule → stretches → thins → breaks into N glass icon
 * buttons. A single `progress` motion value drives *everything* (geometry and
 * the final buttons), so there is no fixed `setTimeout` guessing when to swap
 * layers. When `enabled` is false the goo never renders and the buttons are
 * usable straight away.
 */
export function LiquidSplitReveal({
  children,
  delay = 0,
  enabled = true,
  className,
  label,
}: LiquidSplitRevealProps) {
  const count = children.length;
  const [done, setDone] = useState(!enabled);
  const progress = useMotionValue(enabled ? 0 : 1);

  useEffect(() => {
    if (!enabled) {
      setDone(true);
      progress.set(1);
      return;
    }
    setDone(false);
    progress.set(0);
    const controls = animate(progress, 1, {
      duration: 0.92,
      delay,
      ease: EASE_GLIDE,
      onComplete: () => setDone(true),
    });
    return () => controls.stop();
  }, [enabled, delay, progress]);

  /* -------- geometry transforms (all derived from the one progress value) --- */
  const capsuleOpacity = useTransform(progress, [0.16, 0.34], [1, 0]);
  const capsuleScaleX = useTransform(progress, [0.1, 0.36], [1, 0.9]);
  const neckScaleY = useTransform(progress, [0.2, 0.62], [1, 0.05]);
  const neckOpacity = useTransform(progress, [0.18, 0.3, 0.55, 0.68], [0, 1, 1, 0]);
  const dropScale = useTransform(progress, [0.06, 0.26, 0.66, 0.82, 1], [0.4, 1, 1, 1.035, 1]);
  const gooOpacity = useTransform(progress, [0.8, 0.98], [1, 0]);

  const drops = Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * GAP);
  const capsuleW = (count - 1) * GAP + R * 2;

  /* Hooks are called unconditionally (max 4 droplets) — never inside a loop. */
  const dx0 = useTransform(progress, [0.18, 0.72], [0, drops[0] ?? 0]);
  const dx1 = useTransform(progress, [0.18, 0.72], [0, drops[1] ?? 0]);
  const dx2 = useTransform(progress, [0.18, 0.72], [0, drops[2] ?? 0]);
  const dx3 = useTransform(progress, [0.18, 0.72], [0, drops[3] ?? 0]);
  const dropX = [dx0, dx1, dx2, dx3].slice(0, count);

  /* The buttons fade in as each droplet settles — same timeline, no guesswork. */
  const o0 = useTransform(progress, [0.6, 0.78], [0, 1]);
  const o1 = useTransform(progress, [0.64, 0.82], [0, 1]);
  const o2 = useTransform(progress, [0.68, 0.86], [0, 1]);
  const o3 = useTransform(progress, [0.72, 0.9], [0, 1]);
  const itemOpacity = [o0, o1, o2, o3].slice(0, count);
  const itemScale = useTransform(progress, [0.58, 0.9], [0.86, 1]);

  const showGoo = enabled && !done;

  return (
    <div className={['lq-reveal', done ? 'is-done' : '', className ?? ''].filter(Boolean).join(' ')}>
      {showGoo ? (
        <motion.div className="lq-reveal__goo" style={{ opacity: gooOpacity }} aria-hidden="true">
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            preserveAspectRatio="none"
            style={{ width: '100%', height: '100%' }}
          >
            <GooDefs id="bls-reveal-goo" />
            <g style={{ filter: 'url(#bls-reveal-goo)' }}>
              <motion.rect
                x={(VB_W - capsuleW) / 2}
                y={CY - CAPSULE_H / 2}
                width={capsuleW}
                height={CAPSULE_H}
                rx={CAPSULE_RX}
                fill={FILL}
                style={{
                  opacity: capsuleOpacity,
                  scaleX: capsuleScaleX,
                  transformBox: 'fill-box',
                  transformOrigin: 'center',
                }}
              />

              {drops.slice(0, -1).map((target, index) => (
                <motion.rect
                  key={`neck-${index}`}
                  x={VB_W / 2 + target}
                  y={CY - R}
                  width={GAP}
                  height={R * 2}
                  fill={FILL}
                  style={{
                    scaleY: neckScaleY,
                    opacity: neckOpacity,
                    transformBox: 'fill-box',
                    transformOrigin: 'center',
                  }}
                />
              ))}

              {dropX.map((x, index) => (
                <motion.circle
                  key={`drop-${index}`}
                  cx={VB_W / 2}
                  cy={CY}
                  r={R}
                  fill={FILL}
                  style={{ x, scale: dropScale, transformBox: 'fill-box', transformOrigin: 'center' }}
                />
              ))}
            </g>
          </svg>
        </motion.div>
      ) : null}

      <div className="lq-reveal__items" role={label ? 'group' : undefined} aria-label={label}>
        {children.map((child, index) => (
          <motion.span
            key={index}
            className="lq-reveal__item"
            style={{ opacity: enabled ? itemOpacity[index] : 1, scale: enabled ? itemScale : 1 }}
          >
            {child}
          </motion.span>
        ))}
      </div>
    </div>
  );
}
