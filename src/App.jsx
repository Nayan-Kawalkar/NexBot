import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import gsap from 'gsap';

import Experience from './three/Experience.js';
import { VEHICLES, VEHICLE_COUNT } from './data/vehicles.js';
import { DUR, EASE, scaled } from './lib/motion.js';
import useReducedMotion from './lib/useReducedMotion.js';
import { buildContentEnter, buildContentExit, buildIntro } from './lib/transitions.js';

import BackgroundType from './components/BackgroundType.jsx';
import CinematicOverlay from './components/CinematicOverlay.jsx';
import Header from './components/Header.jsx';
import Loader from './components/Loader.jsx';
import MediaPreview from './components/MediaPreview.jsx';
import MenuOverlay from './components/MenuOverlay.jsx';
import ProjectIndicators from './components/ProjectIndicators.jsx';
import ProjectInfo from './components/ProjectInfo.jsx';
import ScrollIndicator from './components/ScrollIndicator.jsx';
import SocialLinks from './components/SocialLinks.jsx';
import Statement from './components/Statement.jsx';
import YearMeta from './components/YearMeta.jsx';

/* --- wheel tuning ---------------------------------------------------------
   A wheel is not one input. A notched mouse sends a handful of large deltas, a
   trackpad sends a continuous stream of small ones and then keeps sending them
   as momentum long after the fingers have lifted, and Firefox reports lines
   rather than pixels. All three have to arrive at the same gesture. */

/** Travel, in pixels, that counts as a deliberate flick. */
const WHEEL_THRESHOLD = 62;
/** `deltaMode` conversions: 1 is lines, 2 is pages. */
const WHEEL_LINE = 16;
const WHEEL_PAGE = 400;
/** A gap this long ends a gesture: part-built travel is dropped and the next
    flick is armed again. Anything shorter is the same gesture still arriving —
    which is what stops trackpad momentum from firing a second change. */
const WHEEL_GAP = 220;
/** Floor between two changes, once momentum has actually stopped. */
const WHEEL_COOLDOWN = 260;

/** Normalises a wheel event to pixels, whatever the device reports in. */
const wheelPixels = (event) => {
  if (event.deltaMode === 1) return event.deltaY * WHEEL_LINE;
  if (event.deltaMode === 2) return event.deltaY * WHEEL_PAGE;
  return event.deltaY;
};

/**
 * Paints the project's grade onto the root.
 *
 * The transition lives in CSS (`--dur-atm`), so setting the values is enough —
 * the room cross-fades on the same clock as the model swap.
 */
const applyAtmosphere = ({ glow, stops, deep }) => {
  const root = document.documentElement.style;
  root.setProperty('--atm-glow', `rgba(${glow.join(', ')}, 0.4)`);
  root.setProperty('--atm-glow-0', `rgba(${glow.join(', ')}, 0)`);
  stops.forEach((stop, index) => root.setProperty(`--atm-${index + 1}`, stop));
  root.setProperty('--atm-deep', deep);
};

const indexFromHash = () => {
  const id = window.location.hash.replace('#/', '').trim();
  const found = VEHICLES.findIndex((vehicle) => vehicle.id === id);
  return found >= 0 ? found : 0;
};

export default function App() {
  const reducedMotion = useReducedMotion();

  const rootRef = useRef(null);
  const canvasRef = useRef(null);
  const experienceRef = useRef(null);
  const transitionRef = useRef(false);
  const activeRef = useRef(0);
  /** Flips 0/1 on every project change so the two swap choreographies alternate. */
  const variantRef = useRef(0);
  /* A flick made during a transition is remembered rather than dropped: the
     interface is busy for a second or so, and swallowing input in that window
     is what reads as lag. It is played the moment the current change lands. */
  const pendingRef = useRef(0);

  const initialIndex = useMemo(indexFromHash, []);

  /** What the dots and counter show — updates the instant a project is picked. */
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  /** What the copy shows — swaps at the midpoint of the transition. */
  const [displayIndex, setDisplayIndex] = useState(initialIndex);
  const [locked, setLocked] = useState(false);

  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [readyIds, setReadyIds] = useState(() => new Set());

  const [menuOpen, setMenuOpen] = useState(false);
  const [cinematicOpen, setCinematicOpen] = useState(false);

  const displayed = VEHICLES[displayIndex];

  /* --- boot ---------------------------------------------------------------- */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const first = VEHICLES[initialIndex];
    applyAtmosphere(first.atmosphere);
    const progressTarget = { value: 0 };
    // A GLB served without a content-length reports nothing useful, so the bar
    // creeps on its own and the real signal only ever pulls it forward.
    const creep = gsap.to(progressTarget, {
      value: 0.82,
      duration: 5,
      ease: 'power2.out',
      onUpdate: () => setProgress((current) => Math.max(current, progressTarget.value)),
    });

    const experience = new Experience(canvas, {
      reducedMotion,
      // The 3D layer asks the interface where it may put the vehicle, rather
      // than guessing from the viewport. `stacked` is the layout's own answer
      // to whether the rails still sit either side of the hero.
      measureStage: () => {
        const root = rootRef.current;
        const rail = root?.querySelector('.rail');
        const column = root?.querySelector('.column');
        if (!rail || !column) return null;
        const left = rail.getBoundingClientRect();
        const right = column.getBoundingClientRect();
        if (right.left <= left.right) return { stacked: true };
        return { stacked: false, left: left.right, right: right.left };
      },
      onProgress: (id, ratio) => {
        if (id !== first.id) return;
        setProgress((current) => Math.max(current, ratio * 0.9));
      },
      onVehicleReady: (id) => {
        setReadyIds((current) => new Set(current).add(id));
      },
    });
    experienceRef.current = experience;

    // Handles for profiling and for stepping transitions frame by frame in
    // development only — neither is shipped.
    if (import.meta.env.DEV) {
      window.__experience = experience;
      window.__gsap = gsap;
    }

    let cancelled = false;

    (async () => {
      try {
        const entry = await experience.load(first);
        if (cancelled) return;

        creep.kill();
        setProgress(1);
        setReadyIds((current) => new Set(current).add(first.id));

        experience.commit(first, entry);
        experience.start();

        // One frame of settled render before the curtain lifts, so the reveal
        // never shows a half-composed scene.
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        if (cancelled) return;

        setReady(true);

        const q = gsap.utils.selector(rootRef.current);
        const intro = gsap.timeline({ delay: scaled(0.25, reducedMotion) });
        intro.add(experience.createEnterTimeline(1), 0);
        intro.add(buildIntro(q, reducedMotion), 0.18);

        experience.preload(VEHICLES.filter((vehicle) => vehicle.id !== first.id));
      } catch (error) {
        console.error('[app] failed to start the experience', error);
        creep.kill();
        setProgress(1);
        setReady(true);
      }
    })();

    return () => {
      cancelled = true;
      creep.kill();
      experience.dispose();
      experienceRef.current = null;
    };
    // Built once: the experience owns its own lifecycle from here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    experienceRef.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion]);

  /* --- project switching --------------------------------------------------- */

  const goTo = useCallback(
    async (index) => {
      const experience = experienceRef.current;
      const target = ((index % VEHICLE_COUNT) + VEHICLE_COUNT) % VEHICLE_COUNT;
      if (!experience || transitionRef.current || target === activeRef.current) return;

      const previous = activeRef.current;
      const direction = target > previous ? 1 : -1;
      // Alternate the choreography on every change, so scrolling through the
      // work never plays the same entrance twice in a row.
      const variant = variantRef.current;
      variantRef.current = variant === 0 ? 1 : 0;
      transitionRef.current = true;
      setLocked(true);
      setActiveIndex(target);
      activeRef.current = target;

      const vehicle = VEHICLES[target];
      const entryPromise = experience.load(vehicle);
      const q = gsap.utils.selector(rootRef.current);

      // One master timeline. The vehicle, the word behind it and every line of
      // copy are children of the same clock, which is what stops a project
      // change from reading as several animations that happen to overlap.
      const master = gsap.timeline({
        onComplete: () => {
          transitionRef.current = false;
          setLocked(false);
          const queued = pendingRef.current;
          pendingRef.current = 0;
          if (queued) goTo(activeRef.current + queued);
        },
      });

      const exit3D = experience.createExitTimeline(direction, variant);
      const exitContent = buildContentExit(q, direction, reducedMotion, variant);
      master.add(exit3D, 0).add(exitContent, 0);

      // Hand over slightly before the exit fully lands: by then the outgoing
      // model has already dissolved, and the overlap keeps the change fluid.
      const swapAt = Math.max(exit3D.duration(), exitContent.duration()) * 0.88;

      let reachedSwap;
      const swapReady = new Promise((resolve) => { reachedSwap = resolve; });
      master.addPause(swapAt, reachedSwap);

      try {
        const [entry] = await Promise.all([entryPromise, swapReady]);

        // flushSync so the copy is already updated when the entrance tween reads
        // the DOM — otherwise React would batch the swap into the next frame and
        // the first frame of the entrance would animate stale text.
        applyAtmosphere(vehicle.atmosphere);
        flushSync(() => setDisplayIndex(target));
        setReadyIds((current) => new Set(current).add(vehicle.id));
        experience.commit(vehicle, entry);

        master.add(experience.createEnterTimeline(direction, variant), swapAt);
        master.add(buildContentEnter(q, direction, reducedMotion, variant), swapAt + 0.06);
        master.resume();

        window.history.replaceState(null, '', `#/${vehicle.id}`);
      } catch (error) {
        // A model that never arrives must not leave the interface mid-exit and
        // permanently locked; put the previous project back and hand control
        // over to the user again.
        console.error(`[app] could not switch to ${vehicle.id}`, error);
        master.kill();
        setActiveIndex(previous);
        activeRef.current = previous;
        transitionRef.current = false;
        setLocked(false);
        experience.restore();
      }
    },
    [reducedMotion],
  );

  const advance = useCallback(() => goTo(activeRef.current + 1), [goTo]);

  /* --- wheel and keyboard navigation --------------------------------------- */

  useEffect(() => {
    if (menuOpen || cinematicOpen) return undefined;

    let accumulated = 0;
    let cooldownUntil = 0;
    let lastEvent = 0;
    /* False while a gesture is still arriving — including its momentum tail. */
    let armed = true;

    const step = (direction) => {
      if (transitionRef.current) pendingRef.current = direction;
      else goTo(activeRef.current + direction);
    };

    const onWheel = (event) => {
      // Inside the mobile sheet a wheel gesture means "read on", not "next".
      if (event.target instanceof Node && rootRef.current?.querySelector('.sheet')?.contains(event.target)) {
        return;
      }

      const now = performance.now();
      if (now - lastEvent > WHEEL_GAP) {
        accumulated = 0;
        armed = true;
      }
      lastEvent = now;

      if (!armed || now < cooldownUntil) return;

      accumulated += wheelPixels(event);
      if (Math.abs(accumulated) < WHEEL_THRESHOLD) return;

      const direction = Math.sign(accumulated);
      accumulated = 0;
      armed = false;
      cooldownUntil = now + WHEEL_COOLDOWN;
      step(direction);
    };

    const onKey = (event) => {
      if (event.target instanceof HTMLElement && event.target.closest('.stage-canvas')) return;
      if (event.key === 'ArrowRight' || event.key === 'PageDown') step(1);
      else if (event.key === 'ArrowLeft' || event.key === 'PageUp') step(-1);
    };

    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
  }, [goTo, menuOpen, cinematicOpen]);

  /* --- overlays ------------------------------------------------------------ */

  const onMenuSelect = useCallback(
    (index) => {
      setMenuOpen(false);
      goTo(index);
    },
    [goTo],
  );

  // The interface steps back behind the menu. Driven by GSAP rather than a
  // class, because the intro and the project transitions leave inline opacity
  // on these elements that a stylesheet rule could not override.
  useEffect(() => {
    if (!ready) return;
    const q = gsap.utils.selector(rootRef.current);
    gsap.to(q('[data-menu-hide]'), {
      opacity: menuOpen ? 0 : 1,
      duration: scaled(menuOpen ? DUR.micro : DUR.short, reducedMotion),
      ease: menuOpen ? EASE.in : EASE.out,
      overwrite: 'auto',
    });
  }, [menuOpen, ready, reducedMotion]);

  const toggleCinematic = useCallback(
    (open) => {
      const experience = experienceRef.current;
      if (!experience || transitionRef.current) return;
      setCinematicOpen(open);
      experience.setCinematic(open);

      const q = gsap.utils.selector(rootRef.current);
      gsap.to(q('[data-cinematic-hide]'), {
        opacity: open ? 0 : 1,
        y: open ? 10 : 0,
        pointerEvents: open ? 'none' : 'auto',
        duration: scaled(open ? DUR.short : DUR.base, reducedMotion),
        ease: open ? EASE.in : EASE.out,
        stagger: reducedMotion ? 0 : 0.02,
      });
    },
    [reducedMotion],
  );

  return (
    <div
      className={`app${ready ? ' is-ready' : ''}${locked ? ' is-locked' : ''}${
        cinematicOpen ? ' is-cinematic' : ''
      }${menuOpen ? ' is-menu-open' : ''}`}
      ref={rootRef}
    >
      <div className="atmosphere" aria-hidden="true" />

      <BackgroundType name={displayed.name} scale={displayed.presentation.typeScale} />

      <canvas
        className="stage-canvas"
        ref={canvasRef}
        tabIndex={0}
        role="application"
        aria-label={`${displayed.name} — drag to rotate the vehicle, arrow keys to inspect`}
      />

      <div className="ui">
        <Header
          activeIndex={activeIndex}
          menuOpen={menuOpen}
          onMenuToggle={() => setMenuOpen((open) => !open)}
          onHome={() => goTo(0)}
        />

        <ProjectIndicators
          activeIndex={activeIndex}
          readyIds={readyIds}
          onSelect={goTo}
          disabled={locked}
        />

        {/* Reserves the upper half of a portrait layout for the vehicle. */}
        <div className="stage-gap" aria-hidden="true" />

        <div className="sheet">
          <div className="column" data-cinematic-hide data-menu-hide>
            <ProjectInfo vehicle={displayed} />
          </div>

          <div className="rail" data-cinematic-hide data-menu-hide>
            <YearMeta year={displayed.year} />
            <Statement text={displayed.statement} />
            <MediaPreview
              vehicle={displayed}
              onPlay={() => toggleCinematic(true)}
              disabled={locked}
            />
          </div>
        </div>

        <div className="footer" data-cinematic-hide data-menu-hide>
          <span data-anim="foot">
            <ScrollIndicator onAdvance={advance} disabled={locked} />
          </span>
          <span data-anim="foot">
            <SocialLinks />
          </span>
        </div>
      </div>

      <MenuOverlay
        open={menuOpen}
        activeIndex={activeIndex}
        onSelect={onMenuSelect}
        onClose={() => setMenuOpen(false)}
        reducedMotion={reducedMotion}
      />

      <CinematicOverlay
        open={cinematicOpen}
        vehicle={displayed}
        onClose={() => toggleCinematic(false)}
        reducedMotion={reducedMotion}
      />

      <Loader progress={progress} done={ready} />
    </div>
  );
}
