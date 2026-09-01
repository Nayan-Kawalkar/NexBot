/**
 * The studio mark: an eight-arm asterisk, the same symbol that appears
 * moulded into the seat backs of the vehicles themselves.
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
      <g stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
        {Array.from({ length: 8 }, (_, i) => {
          const angle = (Math.PI / 4) * i;
          const inner = 2.4;
          const outer = 10.2;
          return (
            <line
              key={i}
              x1={12 + Math.cos(angle) * inner}
              y1={12 + Math.sin(angle) * inner}
              x2={12 + Math.cos(angle) * outer}
              y2={12 + Math.sin(angle) * outer}
            />
          );
        })}
      </g>
    </svg>
  );
}
