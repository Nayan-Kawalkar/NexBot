import { projectNumber } from '../data/vehicles.js';

/** `01 ——— 03`: current project weighted, total held back. */
export default function ProjectCounter({ current, total }) {
  return (
    <p className="counter" aria-label={`Project ${current} of ${total}`} data-anim="chrome" data-menu-hide>
      <span className="counter__mask">
        <span className="counter__current" data-anim="counter">
          {projectNumber(current - 1)}
        </span>
      </span>
      <span className="counter__rule" aria-hidden="true" />
      <span className="counter__total">{projectNumber(total - 1)}</span>
    </p>
  );
}
