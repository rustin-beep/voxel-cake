// Three letters before the cake.
//
// The overlay is pure DOM (the 3D scene is independent), so it also works when
// WebGL is unavailable — the static cake simply waits behind the paper.
// It publishes `window.__intro = { done, onDone }` so main.js can hold the
// auto-spin until the last letter is closed.

const root = document.getElementById('letters');

const intro = (window.__intro = {
  done: !root || document.body.classList.contains('is-intro') === false,
  onDone: null,
});

if (!root) {
  document.body.classList.remove('is-intro');
} else {
  const cards = Array.from(root.querySelectorAll('.letter'));
  const dots = Array.from(root.querySelectorAll('.dot'));
  const skipBtn = document.getElementById('letters-skip');
  let step = -1;
  let finished = false;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const setInert = (el, inert) => {
    if ('inert' in el) el.inert = inert;
    el.setAttribute('aria-hidden', inert ? 'true' : 'false');
  };

  cards.forEach((card) => setInert(card, true));

  function activate(index) {
    const next = cards[index];
    if (!next) return;

    const prev = cards[step];
    if (prev && prev !== next) {
      prev.classList.remove('is-active');
      prev.classList.add('is-gone');
      setInert(prev, true);
    }

    step = index;
    next.classList.remove('is-gone');
    setInert(next, false);
    // force a reflow so the entry transition restarts on every step
    void next.offsetWidth;
    next.classList.add('is-active');

    dots.forEach((dot, i) => dot.classList.toggle('is-on', i <= index));

    // keyboard users land on the button; on touch/pen we leave focus alone so
    // the ring does not sit on the card for no reason
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      window.setTimeout(() => {
        next.querySelector('.btn')?.focus({ preventScroll: true });
      }, reduceMotion ? 0 : 260);
    }
  }

  function finish() {
    if (finished) return;
    finished = true;
    intro.done = true;

    root.classList.add('is-done');
    document.body.classList.remove('is-intro');
    document.body.classList.add('is-revealed');

    cards.forEach((card) => setInert(card, true));

    window.setTimeout(() => {
      root.hidden = true;
    }, 700);

    if (typeof intro.onDone === 'function') intro.onDone();
    window.dispatchEvent(new Event('intro:done'));
  }

  // exposed for the screenshot harness and for "skip"
  window.__skipIntro = finish;

  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-next]');
    if (!button) return;
    const next = Number(button.dataset.next);
    if (Number.isFinite(next) && next < cards.length) activate(next);
    else finish();
  });

  skipBtn?.addEventListener('click', finish);

  document.addEventListener('keydown', (event) => {
    if (finished) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      finish();
    }
  });

  // first letter, after the room has painted
  window.setTimeout(() => activate(0), reduceMotion ? 120 : 460);
}
