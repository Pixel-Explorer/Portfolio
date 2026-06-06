export class StoryUI {
  constructor() {
    this._gsap = window.gsap;
    this._hookLineEl = null;
    this._skipLinkEl = null;
    this._restOverlay = null;
    this._subtitleEl = null;
    this._subtitleTextEl = null;
    this._initialized = false;
    this._subtitleTimeout = null;
    this._yearTicker = null;
    this._letterboxTop = null;
    this._letterboxBottom = null;
    this._modeToggle = null;
  }

  init() {
    if (this._initialized) return;
    this._initialized = true;
    this._createElements();
  }

  _createElements() {
    this._hookLineEl = document.getElementById('storyHookLine');
    if (!this._hookLineEl) {
      this._hookLineEl = document.createElement('div');
      this._hookLineEl.id = 'storyHookLine';
      document.body.appendChild(this._hookLineEl);
    }

    this._skipLinkEl = document.getElementById('storySkipLink');
    if (!this._skipLinkEl) {
      this._skipLinkEl = document.createElement('button');
      this._skipLinkEl.id = 'storySkipLink';
      this._skipLinkEl.textContent = 'Skip film → archive';
      document.body.appendChild(this._skipLinkEl);
    }

    this._restOverlay = document.getElementById('storyRestIndicator');
    if (!this._restOverlay) {
      this._restOverlay = document.createElement('div');
      this._restOverlay.id = 'storyRestIndicator';
      this._restOverlay.textContent = '↓ Scroll to continue';
      document.body.appendChild(this._restOverlay);
    }

    this._subtitleEl = document.getElementById('storySubtitle');
    if (!this._subtitleEl) {
      this._subtitleEl = document.createElement('div');
      this._subtitleEl.id = 'storySubtitle';
      this._subtitleEl.className = 'story-subtitle';
      const inner = document.createElement('div');
      inner.className = 'story-subtitle-inner';
      const textSpan = document.createElement('span');
      textSpan.id = 'storySubtitleText';
      textSpan.className = 'story-subtitle-text';
      inner.appendChild(textSpan);
      this._subtitleEl.appendChild(inner);
      document.body.appendChild(this._subtitleEl);
    }
    this._subtitleTextEl = document.getElementById('storySubtitleText') || this._subtitleEl.querySelector('.story-subtitle-text');

    // Year ticker
    this._yearTicker = document.getElementById('storyYearTicker');
    if (!this._yearTicker) {
      this._yearTicker = document.createElement('div');
      this._yearTicker.id = 'storyYearTicker';
      this._yearTicker.className = 'story-year-ticker';
      document.body.appendChild(this._yearTicker);
    }

    // Letterbox bars
    this._letterboxTop = document.getElementById('storyLetterboxTop');
    if (!this._letterboxTop) {
      this._letterboxTop = document.createElement('div');
      this._letterboxTop.id = 'storyLetterboxTop';
      this._letterboxTop.className = 'story-letterbox story-letterbox--top';
      document.body.appendChild(this._letterboxTop);
    }
    this._letterboxBottom = document.getElementById('storyLetterboxBottom');
    if (!this._letterboxBottom) {
      this._letterboxBottom = document.createElement('div');
      this._letterboxBottom.id = 'storyLetterboxBottom';
      this._letterboxBottom.className = 'story-letterbox story-letterbox--bottom';
      document.body.appendChild(this._letterboxBottom);
    }

    // Mode toggle
    this._modeToggle = document.getElementById('storyModeToggle');
    if (!this._modeToggle) {
      this._modeToggle = document.createElement('button');
      this._modeToggle.id = 'storyModeToggle';
      this._modeToggle.className = 'story-mode-toggle';
      this._modeToggle.textContent = 'Archive';
      document.body.appendChild(this._modeToggle);
    }

    // Position overlays
    this._applyStyles();
  }

  _applyStyles() {
    if (this._yearTicker) {
      this._yearTicker.style.cssText = 'position:fixed;top:24px;left:24px;z-index:100;font-family:"Cascadia Code",monospace;font-size:14px;color:rgba(255,255,255,0.7);letter-spacing:0.08em;text-transform:uppercase;pointer-events:none;transition:opacity 0.4s ease;opacity:0;';
    }
    if (this._letterboxTop) {
      this._letterboxTop.className = 'story-letterbox story-letterbox--top';
    }
    if (this._letterboxBottom) {
      this._letterboxBottom.className = 'story-letterbox story-letterbox--bottom';
    }
    if (this._modeToggle) {
      this._modeToggle.style.cssText = 'position:fixed;top:24px;right:24px;z-index:100;font-family:"Cascadia Code",monospace;font-size:12px;color:rgba(255,255,255,0.6);background:transparent;border:1px solid rgba(255,255,255,0.2);padding:6px 14px;cursor:pointer;text-transform:uppercase;letter-spacing:0.06em;transition:opacity 0.3s ease,color 0.3s ease;opacity:0;';
      this._modeToggle.addEventListener('click', () => {
        const event = new CustomEvent('story-skip');
        window.dispatchEvent(event);
      });
    }
  }

  setYear(year) {
    if (!this._yearTicker) return;
    this._yearTicker.textContent = year;
    this._yearTicker.style.opacity = year ? '1' : '0';
  }

  showLetterbox(closed = false) {
    const h = closed ? '8vh' : '6vh';
    if (this._letterboxTop) this._letterboxTop.style.height = h;
    if (this._letterboxBottom) this._letterboxBottom.style.height = h;
  }

  showHookLine(text) {
    if (!this._hookLineEl || !this._gsap) return;
    const el = this._hookLineEl;
    el.textContent = text;
    el.style.display = 'block';
    this._gsap.fromTo(el,
      { opacity: 0, y: 30 },
      { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }
    );
  }

  hideHookLine() {
    if (!this._hookLineEl || !this._gsap) return;
    this._gsap.to(this._hookLineEl, {
      opacity: 0, y: -20, duration: 0.4, ease: 'power2.in',
      onComplete: () => { this._hookLineEl.style.display = 'none'; },
    });
  }

  showRest() {
    if (!this._restOverlay) return;
    this._restOverlay.style.display = 'flex';
    if (this._gsap) {
      this._gsap.killTweensOf(this._restOverlay);
      this._gsap.fromTo(this._restOverlay,
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }
      );
    }
  }

  hideRest() {
    if (!this._restOverlay || !this._gsap) return;
    this._gsap.killTweensOf(this._restOverlay);
    this._gsap.to(this._restOverlay, {
      opacity: 0, y: 8, duration: 0.3,
      onComplete: () => { this._restOverlay.style.display = 'none'; },
    });
  }

  showSkipLink() {
    if (!this._skipLinkEl) return;
    this._skipLinkEl.style.display = 'block';
    if (this._gsap) {
      this._gsap.fromTo(this._skipLinkEl,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }
      );
    }
    if (this._modeToggle) {
      this._modeToggle.style.opacity = '1';
    }
  }

  hideSkipLink() {
    if (!this._skipLinkEl) return;
    this._skipLinkEl.style.display = 'none';
    if (this._modeToggle) {
      this._modeToggle.style.opacity = '0';
    }
  }

  showSubtitle(text, { duration = 0.4, position = 'bottom' } = {}) {
    if (!this._subtitleTextEl || !this._subtitleEl) return;
    if (this._subtitleTimeout) clearTimeout(this._subtitleTimeout);
    this._subtitleTextEl.textContent = text.replace(/\s*\[[^\]]*\]\s*/g, ' ').replace(/\s+/g, ' ').trim();
    this._subtitleEl.className = 'story-subtitle' + (position === 'corner' ? ' story-subtitle--corner' : '');
    this._subtitleEl.style.display = 'flex';
    if (this._gsap) {
      this._gsap.fromTo(this._subtitleEl,
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration, ease: 'power2.out' }
      );
    }
  }

  hideSubtitle({ duration = 0.3 } = {}) {
    if (!this._subtitleEl || !this._gsap) return;
    this._gsap.to(this._subtitleEl, {
      opacity: 0, y: -8, duration,
      ease: 'power2.in',
      onComplete: () => {
        this._subtitleEl.style.display = 'none';
      },
    });
  }

  destroy() {
    if (this._subtitleTimeout) clearTimeout(this._subtitleTimeout);
    if (this._gsap) {
      this._gsap.killTweensOf(this._hookLineEl);
      this._gsap.killTweensOf(this._skipLinkEl);
      this._gsap.killTweensOf(this._restOverlay);
      this._gsap.killTweensOf(this._subtitleEl);
    }
    this._hookLineEl?.remove();
    this._skipLinkEl?.remove();
    this._restOverlay?.remove();
    this._subtitleEl?.remove();
    this._yearTicker?.remove();
    this._letterboxTop?.remove();
    this._letterboxBottom?.remove();
    this._modeToggle?.remove();
    this._initialized = false;
  }
}
