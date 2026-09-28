import type { Transition, Variants } from 'framer-motion';

/**
 * One spring vocabulary for the whole site.
 * stiffness 180–350 / damping 22–32 — never bouncy.
 */
export const spring: Record<'micro' | 'hover' | 'split' | 'section' | 'nav', Transition> = {
  micro: { type: 'spring', stiffness: 340, damping: 30, mass: 0.6 },
  hover: { type: 'spring', stiffness: 280, damping: 26, mass: 0.8 },
  split: { type: 'spring', stiffness: 220, damping: 24, mass: 1 },
  section: { type: 'spring', stiffness: 180, damping: 28, mass: 1.1 },
  nav: { type: 'spring', stiffness: 300, damping: 28, mass: 0.7 },
};

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
export const EASE_GLIDE = [0.16, 1, 0.3, 1] as const;

export const tween = (duration: number, ease: readonly number[] = EASE_OUT): Transition => ({
  duration,
  ease: ease as unknown as [number, number, number, number],
});

/** Reveal that is not a plain fadeInUp: clip + slight scale + blur-free fade. */
export const revealMask: Variants = {
  hidden: { opacity: 0, y: 22, clipPath: 'inset(0 0 22% 0)' },
  show: {
    opacity: 1,
    y: 0,
    clipPath: 'inset(0 0 0% 0)',
    transition: { duration: 0.85, ease: EASE_GLIDE as unknown as [number, number, number, number] },
  },
};

export const stagger = (each = 0.07, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: each, delayChildren: delay } },
});
