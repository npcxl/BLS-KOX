export const GOO_FILTER_ID = 'bls-goo';

/**
 * A single SVG gooey filter definition, mounted once at the app root.
 * Only ever applied to small, local SVG layers (never a full-page subtree).
 */
export function GooeyFilter({ id = GOO_FILTER_ID }: { id?: string }) {
  return (
    <svg className="lq-goo-defs" aria-hidden="true" focusable="false" width="0" height="0">
      <defs>
        <filter id={id} colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
          <feColorMatrix
            in="blur"
            mode="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10"
            result="goo"
          />
          <feBlend in="SourceGraphic" in2="goo" />
        </filter>
      </defs>
    </svg>
  );
}
