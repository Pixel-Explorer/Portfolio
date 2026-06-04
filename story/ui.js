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
    }
    this._skipLinkEl.style.display = 'none';
    document.body.appendChild(this._skipLinkEl);

    this._restOverlay = document.getElementById('storyRestIndicator');
    if (!this._restOverlay) {
      this._restOverlay = document.createElement('div');
      this._restOverlay.id = 'storyRestIndicator';
      this._restOverlay.textContent = '↓ Scroll to continue';
      document.body.appendChild(this._restOverlay);
    }
    this._restOverlay.style.display = 'none';

    // Subtitle element — VO text as on-screen captions
    this._subtitleEl = document.getElementById('storySubtitle');
    if (!this._subtitleEl) {
      this._subtitleEl = document.createElement('div');
      this._subtitleEl.id = 'storySubtitle';
      this._subtitleEl.className = 'story-subtitle';
      const textSpan = document.createElement('span');
      textSpan.id = 'storySubtitleText';
      textSpan.className = 'story-subtitle-text';
      this._subtitleEl.appendChild(textSpan);
      document.body.appendChild(this._subtitleEl);
    }
    this._subtitleTextEl = document.getElementById('storySubtitleText') || this._subtitleEl.querySelector('.story-subtitle-text');
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
  }

  hideSkipLink() {
    if (!this._skipLinkEl) return;
    this._skipLinkEl.style.display = 'none';
  }

  showSubtitle(text, { duration = 0.4 } = {}) {
    if (!this._subtitleTextEl || !this._subtitleEl) return;
    if (this._subtitleTimeout) clearTimeout(this._subtitleTimeout);
    this._subtitleTextEl.textContent = text;
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

  showModeSelect() {
    return new Promise(resolve => {
      const overlay = document.getElementById('storyModeSelect');
      if (!overlay) {
        resolve('archive');
        return;
      }
      overlay.style.display = 'flex';
      const playBtn = document.getElementById('storyPlayFilm');
      const exploreBtn = document.getElementById('storyExploreArchive');

      const cleanup = (choice) => {
        overlay.style.display = 'none';
        resolve(choice);
      };

      playBtn?.addEventListener('click', () => cleanup('story'), { once: true });
      exploreBtn?.addEventListener('click', () => cleanup('archive'), { once: true });
    });
  }

  showTitleCard() {
    const el = document.getElementById('storyTitleCard');
    if (!el) return;
    el.style.display = 'flex';
    if (this._gsap) {
      this._gsap.fromTo(el,
        { opacity: 0 },
        { opacity: 1, duration: 0.6, ease: 'power2.out' }
      );
    }
  }

  hideTitleCard() {
    const el = document.getElementById('storyTitleCard');
    if (!el || !this._gsap) return;
    this._gsap.to(el, {
      opacity: 0, duration: 0.3,
      onComplete: () => { el.style.display = 'none'; },
    });
  }

  destroy() {
    if (this._subtitleTimeout) clearTimeout(this._subtitleTimeout);
    this._hookLineEl?.remove();
    this._skipLinkEl?.remove();
    this._restOverlay?.remove();
    this._subtitleEl?.remove();
    this._initialized = false;
  }
}
