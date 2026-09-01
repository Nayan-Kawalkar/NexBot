/**
 * The reference's scroll cue, given something to actually do: this page has no
 * length to scroll, so the affordance advances to the next project instead.
 */
export default function ScrollIndicator({ onAdvance, disabled }) {
  return (
    <button type="button" className="scroll-cue" onClick={onAdvance} disabled={disabled}>
      <span className="scroll-cue__label">Scroll</span>
      <span className="scroll-cue__rule" aria-hidden="true" />
    </button>
  );
}
