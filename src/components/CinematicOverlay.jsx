import { useEffect, useRef } from 'react';
import gsap from 'gsap';

import { DUR, EASE, scaled } from '../lib/motion.js';
import { projectNumber } from '../data/vehicles.js';

/**
 * The film view.
 *
 * There is no video in the supplied assets, so rather than inventing one the
 * play control clears the interface and lets the camera take a slow pass around
 * the real model — the thing the film would have been about. Letterbox bars and
 * a single caption; nothing else earns a place on screen.
 */
export default function CinematicOverlay({ open, vehicle, onClose, reducedMotion }) {
  const rootRef = useRef(null);
  const timelineRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const context = gsap.context(() => {
      const timeline = gsap.timeline({ paused: true });
      timeline
        .fromTo(root, { opacity: 0 }, { opacity: 1, duration: scaled(DUR.short, reducedMotion), ease: EASE.outSoft }, 0)
        .fromTo(
          '[data-cinematic-bar]',
          { scaleY: 0 },
          { scaleY: 1, duration: scaled(DUR.base, reducedMotion), ease: EASE.outLong },
          0,
        )
        .fromTo(
          '[data-cinematic-caption]',
          { opacity: 0, y: 12 },
          { opacity: 1, y: 0, duration: scaled(DUR.base, reducedMotion), ease: EASE.out },
          scaled(0.3, reducedMotion),
        );
      timelineRef.current = timeline;
    }, root);

    return () => context.revert();
  }, [reducedMotion]);

  useEffect(() => {
    const timeline = timelineRef.current;
    if (!timeline) return;
    if (open) timeline.play();
    else timeline.reverse();
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
      className={`cinematic${open ? ' is-open' : ''}`}
      ref={rootRef}
      inert={open ? undefined : ''}
      aria-hidden={!open}
    >
      <span className="cinematic__bar cinematic__bar--top" data-cinematic-bar aria-hidden="true" />
      <span className="cinematic__bar cinematic__bar--bottom" data-cinematic-bar aria-hidden="true" />

      <div className="cinematic__caption" data-cinematic-caption>
        <span className="cinematic__index">{projectNumber(vehicle.index)}</span>
        <span className="cinematic__name">{vehicle.name}</span>
        <span className="cinematic__year">{vehicle.year}</span>
      </div>

      <button type="button" className="cinematic__close" onClick={onClose} data-cinematic-caption>
        <span aria-hidden="true">Close</span>
        <span className="visually-hidden">Close the film view</span>
      </button>
    </div>
  );
}
