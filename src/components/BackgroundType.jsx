/**
 * The vehicle's name, set enormous and sitting behind the model.
 *
 * It lives in the DOM rather than in the scene so it stays properly typeset and
 * properly selectable; the WebGL canvas above it is transparent, which is what
 * lets the vehicle genuinely occlude the letterforms — and lets its shadow fall
 * across them — instead of faking the layering.
 */
export default function BackgroundType({ name, scale = 1 }) {
  return (
    <div className="hero-type" aria-hidden="true">
      <span className="hero-type__word" data-anim="type" style={{ '--type-scale': scale }}>
        {name}
      </span>
    </div>
  );
}
