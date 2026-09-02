/**
 * The studio mark: a robot head reduced to its two constants across the range —
 * the rounded crown and the pair of eyes set in it.
 *
 * Drawn rather than imported so it inherits `currentColor` and the surrounding
 * type size, which is what lets the same glyph sit in the header, the loader and
 * the menu signature without three separate assets. Stroke weight is set for the
 * size it is actually used at; the antenna and side vents are the first things
 * to disappear at favicon scale, which is why neither carries the recognition.
 */
export default function BrandMark({ className = '', size = '1em' }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 2.6v2.5" />
        <rect x="4.1" y="5.1" width="15.8" height="13.4" rx="4.6" />
        {/* Side vents: they give the silhouette its width at large sizes. */}
        <path d="M2.2 10.6v3.2M21.8 10.6v3.2" />
      </g>
      <g fill="currentColor">
        <circle cx="12" cy="2.2" r="1.3" />
        <circle cx="9.2" cy="11.9" r="1.75" />
        <circle cx="14.8" cy="11.9" r="1.75" />
      </g>
    </svg>
  );
}
