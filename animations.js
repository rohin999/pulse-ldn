/**
 * animations.js — Pulse LDN
 * GSAP + ScrollTrigger entrance animations.
 * Loaded after GSAP scripts on all three pages.
 */

(function () {

  // ─── Respect prefers-reduced-motion ─────────────────────────────────────────
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) {
    window.animateFeedItems = function () {};
    window.animateDjGrid    = function () {};
    window.animateProfile   = function () {};
    return;
  }

  // ─── Register plugin ─────────────────────────────────────────────────────────
  gsap.registerPlugin(ScrollTrigger);

  // ─── Constants ───────────────────────────────────────────────────────────────
  const EASE_ENTER   = 'power3.out';
  const EASE_STAGGER = 'power2.out';
  const Y            = 20;     // px offset for fade-up
  const DUR          = 0.5;    // entrance duration (s)
  const STAGGER      = 0.04;   // per-item stagger (s)

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  function hide(sel, yOffset) {
    const els = gsap.utils.toArray(sel);
    if (els.length) gsap.set(els, { opacity: 0, y: yOffset !== undefined ? yOffset : Y });
    return els;
  }

  // ─── Page detection ──────────────────────────────────────────────────────────
  const page = location.pathname.split('/').pop() || 'index.html';
  const isIndex   = page === '' || page === 'index.html';
  const isDjs     = page === 'djs.html';
  const isProfile = page === 'dj.html';

  // ════════════════════════════════════════════════════════════════════════════
  // index.html
  // ════════════════════════════════════════════════════════════════════════════
  if (isIndex) {
    gsap.set('nav', { y: -52, opacity: 0 });
    hide('.hero-title');
    hide('.hero-sub');
    hide('.filters');

    // Nav slides down
    gsap.to('nav', { y: 0, opacity: 1, duration: 0.45, ease: EASE_ENTER, overwrite: 'auto' });

    // Hero + filters sequence
    gsap.timeline({ delay: 0.1 })
      .to('.hero-title', { opacity: 1, y: 0, duration: DUR,  ease: EASE_ENTER,   overwrite: 'auto' })
      .to('.hero-sub',   { opacity: 1, y: 0, duration: DUR,  ease: EASE_ENTER,   overwrite: 'auto' }, '-=0.3')
      .to('.filters',    { opacity: 1, y: 0, duration: DUR,  ease: EASE_ENTER,   overwrite: 'auto' }, '-=0.25');

    // Called by app.js renderTable() after each DOM injection
    window.animateFeedItems = function () {
      const rows  = gsap.utils.toArray('#tableBody tr:not(.loading-row)');
      const cards = gsap.utils.toArray('#mobileCards .event-card');

      if (rows.length) {
        gsap.fromTo(rows,
          { opacity: 0, y: Y },
          { opacity: 1, y: 0, duration: 0.4, ease: EASE_STAGGER, stagger: STAGGER, overwrite: 'auto' }
        );
      }
      if (cards.length) {
        gsap.fromTo(cards,
          { opacity: 0, y: Y },
          { opacity: 1, y: 0, duration: 0.4, ease: EASE_STAGGER, stagger: STAGGER, overwrite: 'auto' }
        );
      }
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // djs.html
  // ════════════════════════════════════════════════════════════════════════════
  if (isDjs) {
    gsap.set('nav', { y: -52, opacity: 0 });
    hide('.page-header');

    gsap.to('nav', { y: 0, opacity: 1, duration: 0.45, ease: EASE_ENTER, overwrite: 'auto' });
    gsap.to('.page-header', { opacity: 1, y: 0, duration: DUR, ease: EASE_ENTER, delay: 0.15, overwrite: 'auto' });

    // Called by djs.html init() after grid injection
    window.animateDjGrid = function () {
      const cards = gsap.utils.toArray('.dj-card');
      if (!cards.length) return;
      gsap.fromTo(cards,
        { opacity: 0, y: Y },
        {
          opacity: 1, y: 0,
          duration: 0.45,
          ease: EASE_STAGGER,
          stagger: { amount: Math.min(cards.length * STAGGER, 0.7), from: 'start' },
          overwrite: 'auto',
          scrollTrigger: { trigger: '#djGrid', start: 'top 88%', once: true },
        }
      );
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // dj.html
  // ════════════════════════════════════════════════════════════════════════════
  if (isProfile) {
    gsap.set('nav',        { y: -52, opacity: 0 });
    gsap.set('.back-link', { opacity: 0 });

    gsap.to('nav',        { y: 0, opacity: 1, duration: 0.45, ease: EASE_ENTER, overwrite: 'auto' });
    gsap.to('.back-link', { opacity: 1, duration: 0.4, ease: EASE_ENTER, delay: 0.1, overwrite: 'auto' });

    // Called by dj.html init() after container.innerHTML is set
    window.animateProfile = function () {
      const name    = document.querySelector('.dj-profile-name');
      const blurb   = document.querySelector('.dj-profile-blurb');
      const socials = gsap.utils.toArray('.dj-socials .social-link');
      const bio     = document.querySelector('.dj-profile-bio');
      const rows    = gsap.utils.toArray('#profileContainer tbody tr');
      const cards   = gsap.utils.toArray('#profileContainer .event-card');

      // Set initial states for injected content
      [name, blurb, bio].forEach(el => { if (el) gsap.set(el, { opacity: 0, y: Y }); });
      if (socials.length) gsap.set(socials, { opacity: 0, y: 8 });
      if (rows.length)    gsap.set(rows,    { opacity: 0, y: Y });
      if (cards.length)   gsap.set(cards,   { opacity: 0, y: Y });

      // Profile header sequence
      const tl = gsap.timeline({ delay: 0.05 });
      if (name)  tl.to(name,  { opacity: 1, y: 0, duration: DUR,  ease: EASE_ENTER,   overwrite: 'auto' });
      if (blurb) tl.to(blurb, { opacity: 1, y: 0, duration: DUR,  ease: EASE_ENTER,   overwrite: 'auto' }, '-=0.3');
      if (socials.length) {
        tl.to(socials, { opacity: 1, y: 0, duration: 0.35, ease: EASE_STAGGER, stagger: 0.05, overwrite: 'auto' }, '-=0.2');
      }

      // Bio — ScrollTrigger
      if (bio) {
        gsap.to(bio, {
          opacity: 1, y: 0, duration: DUR, ease: EASE_ENTER, overwrite: 'auto',
          scrollTrigger: { trigger: bio, start: 'top 88%', once: true },
        });
      }

      // Table rows — ScrollTrigger
      if (rows.length) {
        gsap.to(rows, {
          opacity: 1, y: 0, duration: 0.4, ease: EASE_STAGGER, stagger: STAGGER, overwrite: 'auto',
          scrollTrigger: { trigger: rows[0].closest('table') || rows[0], start: 'top 88%', once: true },
        });
      }

      // Mobile cards — ScrollTrigger
      if (cards.length) {
        gsap.to(cards, {
          opacity: 1, y: 0, duration: 0.4, ease: EASE_STAGGER, stagger: STAGGER, overwrite: 'auto',
          scrollTrigger: { trigger: cards[0], start: 'top 88%', once: true },
        });
      }
    };
  }

})();
