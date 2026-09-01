/** `Year ——— 2021`. Quiet, editorial, aligned with the project dots opposite. */
export default function YearMeta({ year }) {
  return (
    <p className="year" data-anim="rail">
      <span className="year__label">Year</span>
      <span className="year__rule" aria-hidden="true" />
      <span className="year__value">{year}</span>
    </p>
  );
}
