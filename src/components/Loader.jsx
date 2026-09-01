import BrandMark from './BrandMark.jsx';

/**
 * The loading state is part of the design, not a gap in it: the mark, a hairline
 * that fills, and nothing else. No spinner, no percentage shouting at the user.
 */
export default function Loader({ progress, done }) {
  return (
    <div className={`loader${done ? ' is-done' : ''}`} aria-hidden={done} role="status">
      <div className="loader__inner">
        <BrandMark className="loader__mark" />
        <span className="loader__word">Phenomenon</span>
        <span className="loader__track" aria-hidden="true">
          <span className="loader__bar" style={{ transform: `scaleX(${progress})` }} />
        </span>
      </div>
    </div>
  );
}
