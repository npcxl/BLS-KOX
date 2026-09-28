/**
 * Inline gooey-filter definition (place inside the very SVG that draws the
 * liquid shapes — avoids cross-SVG `url(#id)` resolution issues).
 *
 * The standard gooey recipe is: Gaussian blur → high alpha contrast.
 * There is intentionally NO `feBlend in="SourceGraphic"` — blending the sharp
 * source back in keeps every shape's own edge and destroys the "one blob"
 * merge, which is exactly what was making the split look like four separate
 * circles instead of one stretching liquid.
 */

export function GooDefs({ id }: { id: string }) {
  return (
    <defs>
      {/* widened filter region so the blur is never clipped at the shape edges */}
      <filter
        id={id}
        x="-40%"
        y="-40%"
        width="180%"
        height="180%"
        colorInterpolationFilters="sRGB"
      >
        <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
        <feColorMatrix
          in="blur"
          mode="matrix"
          values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -12"
        />
      </filter>
    </defs>
  );
}

export const GOO_FILTER_ID = 'bls-goo';
