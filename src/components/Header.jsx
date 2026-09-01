import BrandMark from './BrandMark.jsx';
import ProjectCounter from './ProjectCounter.jsx';
import { VEHICLE_COUNT } from '../data/vehicles.js';

/**
 * Deliberately not a navbar — four marks floating on the composition. Anything
 * heavier would start competing with the vehicle for the top of the frame.
 */
export default function Header({ activeIndex, menuOpen, onMenuToggle, onHome }) {
  return (
    <header className="header" data-cinematic-hide>
      <a
        className="header__brand"
        href="#/"
        aria-label="Phenomenon — first project"
        data-anim="chrome"
        onClick={(event) => {
          event.preventDefault();
          onHome?.();
        }}
      >
        <BrandMark className="header__brand-mark" />
        <span className="header__brand-name">Phenomenon</span>
      </a>

      <p className="header__section" aria-hidden="true" data-anim="chrome" data-menu-hide>
        <span className="header__section-icon" />
        <span>Projects</span>
      </p>

      <ProjectCounter current={activeIndex + 1} total={VEHICLE_COUNT} />

      <button
        type="button"
        className={`menu-button${menuOpen ? ' is-open' : ''}`}
        data-anim="chrome"
        onClick={onMenuToggle}
        aria-expanded={menuOpen}
        aria-controls="menu-overlay"
      >
        <span className="visually-hidden">{menuOpen ? 'Close menu' : 'Open menu'}</span>
        <span className="menu-button__lines" aria-hidden="true">
          <i /><i /><i />
        </span>
      </button>
    </header>
  );
}
