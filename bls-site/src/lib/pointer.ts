import { useCallback } from 'react';

/**
 * Local pointer highlight: writes --px / --py (%) on the element so a CSS
 * radial-gradient can follow the cursor *inside that element only*.
 * The page itself never tracks the mouse.
 */
export function usePointerHighlight<T extends HTMLElement>(enabled = true) {
  const onPointerMove = useCallback(
    (event: React.PointerEvent<T>) => {
      if (!enabled || event.pointerType === 'touch') return;
      const el = event.currentTarget;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      el.style.setProperty('--px', `${((event.clientX - rect.left) / rect.width) * 100}%`);
      el.style.setProperty('--py', `${((event.clientY - rect.top) / rect.height) * 100}%`);
    },
    [enabled],
  );

  const onPointerLeave = useCallback(
    (event: React.PointerEvent<T>) => {
      const el = event.currentTarget;
      el.style.setProperty('--px', '50%');
      el.style.setProperty('--py', '50%');
    },
    [],
  );

  return { onPointerMove, onPointerLeave };
}
