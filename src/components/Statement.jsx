/** The studio's position on the project — a compact statement, not a paragraph. */
export default function Statement({ text }) {
  return (
    <p className="statement" data-anim="rail">
      {text}
      <span className="statement__rule" aria-hidden="true" />
    </p>
  );
}
