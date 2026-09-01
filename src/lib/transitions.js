import gsap from 'gsap';

import { DUR, EASE, STAGGER, scaled } from './motion.js';

/**
 * The interface half of a project change.
 *
 * These build timelines rather than playing them, so the caller can fold them
 * into the same master timeline that drives the vehicle. That is the whole
 * point: the word behind the model, the copy beside it and the model itself all
 * move on one clock.
 */

export function buildContentExit(q, direction, reduced) {
  const timeline = gsap.timeline();
  const duration = scaled(DUR.short, reduced);

  timeline
    .to(q('[data-anim="type"]'), {
      scale: 1.07,
      xPercent: -2.5 * direction,
      opacity: 0,
      duration: scaled(DUR.base, reduced),
      ease: EASE.in,
    }, 0)
    .to(q('[data-anim="info"]'), {
      y: -16,
      opacity: 0,
      duration,
      ease: EASE.in,
      stagger: reduced ? 0 : STAGGER * 0.6,
    }, 0)
    .to(q('[data-anim="rail"]'), {
      y: -14,
      opacity: 0,
      duration,
      ease: EASE.in,
      stagger: reduced ? 0 : STAGGER * 0.6,
    }, 0.03)
    .to(q('[data-anim="counter"]'), {
      yPercent: -100,
      opacity: 0,
      duration: scaled(DUR.micro, reduced),
      ease: EASE.in,
    }, 0);

  return timeline;
}

export function buildContentEnter(q, direction, reduced) {
  const timeline = gsap.timeline();

  timeline
    .fromTo(q('[data-anim="type"]'), {
      scale: 0.93,
      xPercent: 2.5 * direction,
      opacity: 0,
    }, {
      scale: 1,
      xPercent: 0,
      opacity: 1,
      duration: scaled(DUR.hero, reduced),
      ease: EASE.outLong,
    }, 0)
    .fromTo(q('[data-anim="info"]'), { y: 22, opacity: 0 }, {
      y: 0,
      opacity: 1,
      duration: scaled(DUR.base, reduced),
      ease: EASE.out,
      stagger: reduced ? 0 : STAGGER,
    }, 0.08)
    .fromTo(q('[data-anim="rail"]'), { y: 20, opacity: 0 }, {
      y: 0,
      opacity: 1,
      duration: scaled(DUR.base, reduced),
      ease: EASE.out,
      stagger: reduced ? 0 : STAGGER,
    }, 0.14)
    .fromTo(q('[data-anim="counter"]'), { yPercent: 100, opacity: 0 }, {
      yPercent: 0,
      opacity: 1,
      duration: scaled(DUR.short, reduced),
      ease: EASE.out,
    }, 0.06);

  return timeline;
}

/** First paint: the same choreography, opened up a little. */
export function buildIntro(q, reduced) {
  const timeline = gsap.timeline();

  timeline
    .fromTo(q('[data-anim="type"]'), { scale: 0.9, opacity: 0 }, {
      scale: 1,
      opacity: 1,
      duration: scaled(DUR.hero, reduced),
      ease: EASE.outLong,
    }, 0)
    .fromTo(q('[data-anim="chrome"]'), { y: -14, opacity: 0 }, {
      y: 0,
      opacity: 1,
      duration: scaled(DUR.base, reduced),
      ease: EASE.out,
      stagger: reduced ? 0 : STAGGER * 0.8,
    }, 0.1)
    .fromTo(q('[data-anim="info"]'), { y: 26, opacity: 0 }, {
      y: 0,
      opacity: 1,
      duration: scaled(DUR.long, reduced),
      ease: EASE.out,
      stagger: reduced ? 0 : STAGGER,
    }, 0.24)
    .fromTo(q('[data-anim="rail"]'), { y: 24, opacity: 0 }, {
      y: 0,
      opacity: 1,
      duration: scaled(DUR.long, reduced),
      ease: EASE.out,
      stagger: reduced ? 0 : STAGGER,
    }, 0.3)
    .fromTo(q('[data-anim="foot"]'), { y: 16, opacity: 0 }, {
      y: 0,
      opacity: 1,
      duration: scaled(DUR.base, reduced),
      ease: EASE.out,
      stagger: reduced ? 0 : STAGGER * 0.8,
    }, 0.42);

  return timeline;
}
