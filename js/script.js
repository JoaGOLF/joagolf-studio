(() => {
  'use strict';

  // ---------- Header scroll state ----------
  const header = document.getElementById('header');
  if (!header) return;
  const onScroll = () => {
    if (window.scrollY > 8) {
      header.classList.add('is-scrolled');
    } else {
      header.classList.remove('is-scrolled');
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---------- Hamburger / Nav ----------
  const hamburger = document.getElementById('hamburger');
  const nav = document.getElementById('nav');

  const closeNav = () => {
    hamburger.classList.remove('is-open');
    nav.classList.remove('is-open');
    hamburger.setAttribute('aria-expanded', 'false');
    hamburger.setAttribute('aria-label', 'メニューを開く');
    document.body.style.overflow = '';
  };

  const openNav = () => {
    hamburger.classList.add('is-open');
    nav.classList.add('is-open');
    hamburger.setAttribute('aria-expanded', 'true');
    hamburger.setAttribute('aria-label', 'メニューを閉じる');
    document.body.style.overflow = 'hidden';
  };

  hamburger.addEventListener('click', () => {
    if (nav.classList.contains('is-open')) {
      closeNav();
    } else {
      openNav();
    }
  });

  // Close nav when a link is clicked
  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      if (nav.classList.contains('is-open')) closeNav();
    });
  });

  // Close nav on resize to desktop
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (window.innerWidth > 1024 && nav.classList.contains('is-open')) {
        closeNav();
      }
    }, 120);
  });

  // Close nav on Esc
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) closeNav();
  });

  // ---------- FAQ accordion ----------
  document.querySelectorAll('.faq-item').forEach((item) => {
    const btn = item.querySelector('.faq-item__q');
    btn.addEventListener('click', () => {
      const isOpen = item.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', String(isOpen));
    });
  });

  // ---------- FAQ category tabs ----------
  const tabs = document.querySelectorAll('.faq-tab');
  const groups = document.querySelectorAll('.faq-group');
  if (tabs.length && groups.length) {
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.target;
        tabs.forEach((t) => t.classList.toggle('is-active', t === tab));
        groups.forEach((g) => g.classList.toggle('is-active', g.id === target));
      });
    });
  }

  // ---------- Instructor carousel (infinite loop) ----------
  const carousel = document.querySelector('.instructors__carousel');
  if (carousel) {
    const track = carousel.querySelector('.instructors__track');
    const prev = carousel.querySelector('.instructors__nav--prev');
    const next = carousel.querySelector('.instructors__nav--next');
    const realSlides = Array.from(track.children);
    const total = realSlides.length;
    const DUR = 500; // must match CSS transition duration

    // Clone last → prepend, clone first → append (seamless wrap-around)
    const firstClone = realSlides[0].cloneNode(true);
    const lastClone = realSlides[total - 1].cloneNode(true);
    firstClone.setAttribute('aria-hidden', 'true');
    lastClone.setAttribute('aria-hidden', 'true');
    track.insertBefore(lastClone, realSlides[0]);
    track.appendChild(firstClone);

    let index = 0;
    let timer = null;
    let isAnimating = false;

    const setPos = (visualIdx, animate) => {
      track.style.transition = animate ? '' : 'none';
      track.style.transform = `translateX(-${visualIdx * 100}%)`;
      if (!animate) {
        void track.offsetHeight; // force reflow so next change animates
        track.style.transition = '';
      }
    };

    // Start on the real first slide (visual index 1 because of prepended clone).
    setPos(1, false);

    const go = (delta) => {
      if (isAnimating) return;
      isAnimating = true;
      index += delta;

      if (delta > 0 && index === total) {
        // Past the last → animate into the first-clone, then snap to real first.
        setPos(total + 1, true);
        setTimeout(() => {
          index = 0;
          setPos(1, false);
          isAnimating = false;
        }, DUR + 20);
      } else if (delta < 0 && index === -1) {
        // Before the first → animate into the last-clone, then snap to real last.
        setPos(0, true);
        setTimeout(() => {
          index = total - 1;
          setPos(total, false);
          isAnimating = false;
        }, DUR + 20);
      } else {
        setPos(index + 1, true);
        setTimeout(() => { isAnimating = false; }, DUR + 20);
      }
    };

    const stop = () => {
      if (timer) { clearInterval(timer); timer = null; }
    };
    const start = () => {
      stop();
      timer = setInterval(() => go(1), 3000);
    };

    prev.addEventListener('click', () => { go(-1); start(); });
    next.addEventListener('click', () => { go(1); start(); });
    carousel.addEventListener('mouseenter', stop);
    carousel.addEventListener('mouseleave', start);
    carousel.addEventListener('focusin', stop);
    carousel.addEventListener('focusout', start);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stop(); else start();
    });

    start();
  }

  // ---------- Scroll reveal (fade-up as sections enter the viewport) ----------
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduceMotion && 'IntersectionObserver' in window) {
    const revealSelector = [
      '.section__head',
      '.concept__text', '.concept__image',
      '.feature',
      '.message__image', '.message__text',
      '.store-card',
      '.instructors__carousel',
      '.voice-card',
      '.news-item',
      '.faq-item',
      '.price-card', '.access-card',
    ].join(',');

    const items = Array.from(document.querySelectorAll(revealSelector));
    items.forEach((el) => el.classList.add('reveal'));

    // Stagger siblings that share a parent (e.g. feature / store-card grids).
    const groups = new Map();
    items.forEach((el) => {
      const parent = el.parentElement;
      if (!groups.has(parent)) groups.set(parent, []);
      groups.get(parent).push(el);
    });
    groups.forEach((els) => {
      if (els.length > 1) {
        els.forEach((el, i) => {
          el.style.setProperty('--reveal-delay', `${Math.min(i, 6) * 0.08}s`);
        });
      }
    });

    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    items.forEach((el) => io.observe(el));
  }

  // ---------- Sticky CTA (show after scrolling past KV) ----------
  const stickyCta = document.querySelector('.sticky-cta');
  if (stickyCta) {
    const trigger = document.querySelector('.store-hero, .page-hero, .kv') || header;
    const onStickyScroll = () => {
      const triggerBottom = trigger.getBoundingClientRect().bottom;
      const nearFooter = (() => {
        const footer = document.querySelector('.footer');
        if (!footer) return false;
        return footer.getBoundingClientRect().top < window.innerHeight - 80;
      })();
      const shouldShow = triggerBottom < 0 && !nearFooter;
      stickyCta.classList.toggle('is-visible', shouldShow);
    };
    window.addEventListener('scroll', onStickyScroll, { passive: true });
    onStickyScroll();
  }
})();
