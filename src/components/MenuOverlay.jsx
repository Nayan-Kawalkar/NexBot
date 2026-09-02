import { useEffect, useRef } from 'react';
import gsap from 'gsap';

import BrandMark from './BrandMark.jsx';
import { VEHICLES, projectNumber } from '../data/vehicles.js';
import { DUR, EASE, STAGGER, scaled } from '../lib/motion.js';

/**
 * The menu is the same studio, brought forward — same palette, same rules, same
 * accent. It wipes down over the composition rather than sliding in as a
 * separate surface, so the page never feels like it changed systems.
 *
 * It lists the work rather than inventing sections. This is a single-screen
 * showcase: a "Studio" or "About" entry would have nowhere to go, and a menu
 * full of dead links is worse than a short one where everything works.
 */
export default function MenuOverlay({ open, activeIndex, onSelect, onClose, reducedMotion }) {
  const rootRef = useRef(null);
  const timelineRef = useRef(null);
  const firstItemRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const context = gsap.context(() => {
      const timeline = gsap.timeline({ paused: true });
      timeline
        .fromTo(
          root,
          { clipPath: 'inset(0% 0% 100% 0%)' },
          { clipPath: 'inset(0% 0% 0% 0%)', duration: scaled(DUR.base, reducedMotion), ease: EASE.outLong },
          0,
        )
        .fromTo(
          '[data-menu-item]',
          { yPercent: 118, opacity: 0 },
          {
            yPercent: 0,
            opacity: 1,
            duration: scaled(DUR.base, reducedMotion),
            ease: EASE.out,
            stagger: reducedMotion ? 0 : STAGGER,
          },
          scaled(0.16, reducedMotion),
        )
        .fromTo(
          '[data-menu-meta]',
          { opacity: 0, y: 14 },
          { opacity: 1, y: 0, duration: scaled(DUR.short, reducedMotion), ease: EASE.out, stagger: 0.06 },
          scaled(0.32, reducedMotion),
        );
      timelineRef.current = timeline;
    }, root);

    return () => context.revert();
  }, [reducedMotion]);

  useEffect(() => {
    const timeline = timelineRef.current;
    if (!timeline) return;
    if (open) {
      timeline.play();
      firstItemRef.current?.focus({ preventScroll: true });
    } else {
      timeline.reverse();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div
      id="menu-overlay"
      className={`menu${open ? ' is-open' : ''}`}
      ref={rootRef}
      inert={open ? undefined : ''}
      aria-hidden={!open}
    >
      <div className="menu__inner">
        <nav className="menu__nav" aria-label="Projects">
          <p className="menu__label" data-menu-meta>Selected work</p>
          <ul>
            {VEHICLES.map((vehicle, index) => (
              <li key={vehicle.id}>
                <span className="menu__item-mask">
                  <button
                    type="button"
                    className={`menu__item${index === activeIndex ? ' is-active' : ''}`}
                    data-menu-item
                    ref={index === 0 ? firstItemRef : undefined}
                    onClick={() => onSelect(index)}
                    aria-current={index === activeIndex ? 'true' : undefined}
                  >
                    <span className="menu__item-index">{projectNumber(index)}</span>
                    <span className="menu__item-name">{vehicle.name}</span>
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </nav>

        <div className="menu__aside">
          <dl className="menu__facts" data-menu-meta>
            {VEHICLES.map((vehicle) => (
              <div className="menu__fact" key={vehicle.id}>
                <dt>{vehicle.name}</dt>
                <dd>{vehicle.title}</dd>
                <dd className="menu__fact-year">{vehicle.year}</dd>
              </div>
            ))}
          </dl>

          <a className="menu__contact" href="mailto:studio@nexbot.design" data-menu-meta>
            studio@nexbot.design
          </a>
        </div>

        <p className="menu__sign" data-menu-meta>
          <BrandMark className="menu__sign-mark" />
          <span>Robotics for the places people already live and work, since 2016</span>
        </p>
      </div>
    </div>
  );
}
