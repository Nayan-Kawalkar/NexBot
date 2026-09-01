import { VEHICLES } from '../data/vehicles.js';

/**
 * One ringed dot for the live project, quiet dots for the rest. Doubles as the
 * loading tell: a project still downloading shows a dimmed, pulsing dot.
 */
export default function ProjectIndicators({ activeIndex, readyIds, onSelect, disabled }) {
  return (
    <nav className="indicators" aria-label="Projects" data-anim="chrome" data-cinematic-hide data-menu-hide>
      <ul className="indicators__list">
        {VEHICLES.map((vehicle, index) => {
          const active = index === activeIndex;
          const ready = readyIds.has(vehicle.id);
          return (
            <li key={vehicle.id}>
              <button
                type="button"
                className={`indicator${active ? ' is-active' : ''}${ready ? '' : ' is-pending'}`}
                onClick={() => onSelect(index)}
                aria-disabled={disabled || undefined}
                aria-current={active ? 'true' : undefined}
              >
                <span className="visually-hidden">
                  {`${vehicle.name}, project ${index + 1}`}
                </span>
                <span className="indicator__ring" aria-hidden="true" />
                <span className="indicator__dot" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
