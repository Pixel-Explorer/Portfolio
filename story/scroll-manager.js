export class ScrollManager {
  constructor() {
    this.progress = 0;
    this._smoothedProgress = 0;
    this.isLocked = false;
    this._listeners = [];
    this._rafId = null;
    this._originalBodyOverflow = '';
    this._originalHtmlOverflow = '';
    this._originalMinHeight = '';
  }

  init(container = window) {
    this._originalBodyOverflow = document.body.style.overflow;
    this._originalHtmlOverflow = document.documentElement.style.overflow;
    this._originalMinHeight = document.body.style.minHeight;

    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';

    const totalHeight = window.innerHeight * 12;
    document.body.style.minHeight = `${totalHeight}px`;

    this._onScroll = this._onScroll.bind(this);
    window.addEventListener('scroll', this._onScroll, { passive: true });
    this._tick();
  }

  _onScroll() {
    const scrollY = window.scrollY;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    this.progress = Math.min(1, Math.max(0, scrollY / maxScroll));
  }

  _tick() {
    this._rafId = requestAnimationFrame(() => this._tick());
    this._onScroll();
    this._smoothedProgress += (this.progress - this._smoothedProgress) * 0.08;
    this._notify();
  }

  getSmoothedProgress() {
    return this._smoothedProgress;
  }

  _notify() {
    for (const cb of this._listeners) cb(this._smoothedProgress);
  }

  onProgress(cb) {
    this._listeners.push(cb);
    return () => {
      this._listeners = this._listeners.filter(l => l !== cb);
    };
  }

  lock() {
    this.isLocked = true;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
  }

  unlock() {
    this.isLocked = false;
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';
  }

  snapTo(targetProgress, duration = 600) {
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const targetY = targetProgress * maxScroll;
    window.scrollTo({ top: targetY, behavior: 'smooth' });
    return new Promise(resolve => setTimeout(resolve, duration));
  }

  recomputeHeight() {
    const totalHeight = window.innerHeight * 12;
    document.body.style.minHeight = `${totalHeight}px`;
  }

  destroy() {
    window.removeEventListener('scroll', this._onScroll);
    if (this._rafId) cancelAnimationFrame(this._rafId);
    document.body.style.overflow = this._originalBodyOverflow;
    document.documentElement.style.overflow = this._originalHtmlOverflow;
    document.body.style.minHeight = this._originalMinHeight || '';
    this._listeners = [];
  }
}
