export class Transitions {
  constructor() {
    this._overlay = null;
    this._active = false;
    this._transitionSeq = 0;
  }

  init() {
    this._overlay = document.getElementById('storyTransitionOverlay');
    if (!this._overlay) {
      this._overlay = document.createElement('div');
      this._overlay.id = 'storyTransitionOverlay';
      this._overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 99990;
        pointer-events: none; opacity: 0; background: transparent;
        transition: opacity 0.3s ease, background 0.3s ease;
      `;
      document.body.appendChild(this._overlay);
    }
  }

  cancel() {
    this._transitionSeq++;
    if (this._overlay) {
      this._overlay.style.transition = 'none';
      void this._overlay.offsetHeight;
      this._overlay.style.background = 'transparent';
      this._overlay.style.opacity = 0;
    }
  }

  _setOverlay(color, opacity, transition = 'none') {
    if (!this._overlay) return;
    this._overlay.style.transition = transition;
    void this._overlay.offsetHeight;
    this._overlay.style.background = color;
    this._overlay.style.opacity = opacity;
  }

  // FLOW — dissolve/no-op, the continuous through-line
  async flow() {
    return Promise.resolve();
  }

  // VEER — match-on-motion: no overlay flash, the cut is hidden by movement
  async veer() {
    return Promise.resolve();
  }

  // DRAIN — desaturation wipe before a decline
  // Color grader handles the saturation ramp; this is a subtle overlay
  async drain(duration = 0.8) {
    const seq = this._transitionSeq;
    this._setOverlay('#000000', 0);
    this._fade(0.06, duration * 0.4);
    await this._wait(duration * 0.4);
    if (this._transitionSeq !== seq) return;
    this._fade(0, duration * 0.6);
    await this._wait(duration * 0.6);
  }

  // BREAK — true hard cut to black + silence
  async break(duration = 0.5) {
    const seq = this._transitionSeq;
    // Instant black (no ease)
    this._setOverlay('#000000', 1, 'none');
    await this._wait(0.15);
    if (this._transitionSeq !== seq) return;
    // Brief hold in black
    await this._wait(0.4);
    if (this._transitionSeq !== seq) return;
    // Reveal
    this._fade(0, 0.3);
    await this._wait(0.3);
  }

  // BLOOM — whiteout flood for birth/comeback/arrival
  async bloom(duration = 0.7) {
    const seq = this._transitionSeq;
    this._setOverlay('#ffffff', 0);
    this._fade(0.8, duration * 0.35);
    await this._wait(duration * 0.35);
    if (this._transitionSeq !== seq) return;
    this._fade(0, duration * 0.65);
    await this._wait(duration * 0.65);
  }

  _fade(opacity, durSec) {
    if (!this._overlay) return;
    this._overlay.style.transition = `opacity ${durSec}s ease`;
    this._overlay.style.opacity = opacity;
  }

  _wait(sec) {
    return new Promise(r => setTimeout(r, sec * 1000));
  }
}
