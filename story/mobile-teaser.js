export class MobileTeaser {
  constructor() {
    this._container = null;
    this._currentSlide = -1;
    this._slides = [];
    this._gsap = window.gsap;
    this._raf = null;
  }

  init({ onDone }) {
    this._onDone = onDone;
    this._createStructure();
    this._buildSlides();
    this._show(0);
    this._startParticle();
  }

  _createStructure() {
    this._container = document.createElement('div');
    this._container.className = 'mobile-teaser';
    this._container.innerHTML = `
      <div class="mobile-teaser-slides"></div>
      <div class="mobile-teaser-progress"><span class="mobile-teaser-progress-fill"></span></div>
      <canvas class="mobile-teaser-canvas"></canvas>
      <div class="mobile-teaser-landing" style="display:none"></div>
    `;
    document.body.appendChild(this._container);
    this._slidesEl = this._container.querySelector('.mobile-teaser-slides');
    this._progressFill = this._container.querySelector('.mobile-teaser-progress-fill');
    this._canvas = this._container.querySelector('.mobile-teaser-canvas');
    this._landingEl = this._container.querySelector('.mobile-teaser-landing');
    this._ctx = this._canvas.getContext('2d');
    this._resizeCanvas();
  }

  _resizeCanvas() {
    this._canvas.width = window.innerWidth;
    this._canvas.height = window.innerHeight;
  }

  _buildSlides() {
    this._slides = [
      { text: 'A city built from pixels…', sub: '', duration: 2500 },
      { text: 'Every project. Every story.', sub: 'Compiled into one place.', duration: 3000 },
      { text: 'This film needs a big screen.', sub: 'Open it on your desktop.', duration: 3000 },
    ];
  }

  _show(index) {
    if (index >= this._slides.length) {
      this._showLanding();
      return;
    }
    this._currentSlide = index;
    const slide = this._slides[index];
    const el = document.createElement('div');
    el.className = 'mobile-teaser-slide';
    el.innerHTML = `<p class="mobile-teaser-slide-text">${slide.text}</p>${slide.sub ? `<p class="mobile-teaser-slide-sub">${slide.sub}</p>` : ''}`;
    this._slidesEl.appendChild(el);

    if (this._gsap) {
      this._gsap.fromTo(el,
        { opacity: 0, y: 40 },
        { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', delay: 0.1 }
      );
    }

    if (this._progressFill) {
      this._progressFill.style.width = `${((index + 1) / this._slides.length) * 70}%`;
    }

    // Remove previous slide
    const prev = el.previousElementSibling;
    if (prev && prev.matches('.mobile-teaser-slide')) {
      if (this._gsap) {
        this._gsap.to(prev, { opacity: 0, y: -30, duration: 0.5, onComplete: () => prev.remove() });
      } else {
        prev.remove();
      }
    }

    this._slideTimer = setTimeout(() => this._show(index + 1), slide.duration);
  }

  _showLanding() {
    if (this._slideTimer) clearTimeout(this._slideTimer);
    this._slidesEl.style.display = 'none';
    this._landingEl.style.display = 'flex';
    this._landingEl.innerHTML = `
      <div class="mobile-teaser-landing-card">
        <div class="mobile-teaser-landing-orb"></div>
        <h2 class="mobile-teaser-landing-title">Built for a big screen</h2>
        <p class="mobile-teaser-landing-desc">Copy the link and open it on your laptop or desktop to experience the full film.</p>
        <div class="mobile-teaser-landing-actions">
          <button class="mobile-teaser-landing-copy" id="mobileTeaserCopy">Copy link</button>
          <button class="mobile-teaser-landing-archive" id="mobileTeaserArchive">Explore archive</button>
        </div>
        <p class="mobile-teaser-landing-url" id="mobileTeaserUrl"></p>
      </div>
    `;

    const copyBtn = this._landingEl.querySelector('#mobileTeaserCopy');
    const archiveBtn = this._landingEl.querySelector('#mobileTeaserArchive');
    const urlEl = this._landingEl.querySelector('#mobileTeaserUrl');
    urlEl.textContent = window.location.href;

    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(window.location.href).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => copyBtn.textContent = 'Copy link', 2000);
      }).catch(() => {
        urlEl.style.display = 'block';
        urlEl.select?.();
      });
    });

    archiveBtn.addEventListener('click', () => this._teardown());

    if (this._gsap) {
      this._gsap.fromTo(this._landingEl,
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }
      );
    }

    if (this._progressFill) {
      this._progressFill.style.width = '100%';
    }
  }

  _startParticle() {
    const dots = [];
    const count = 40;
    for (let i = 0; i < count; i++) {
      dots.push({
        x: Math.random() * this._canvas.width,
        y: Math.random() * this._canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        r: Math.random() * 1.5 + 0.5,
        o: Math.random() * 0.4 + 0.1,
      });
    }
    const tick = () => {
      const ctx = this._ctx;
      ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
      const cx = this._canvas.width / 2;
      const cy = this._canvas.height / 2;
      for (const d of dots) {
        d.x += d.vx;
        d.y += d.vy;
        if (d.x < 0 || d.x > this._canvas.width) d.vx *= -1;
        if (d.y < 0 || d.y > this._canvas.height) d.vy *= -1;
        const dx = d.x - cx;
        const dy = d.y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const brightness = Math.max(0.1, 1 - dist / (this._canvas.width * 0.5));
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 200, 100, ${d.o * brightness})`;
        ctx.fill();
      }
      this._raf = requestAnimationFrame(tick);
    };
    tick();
  }

  _teardown() {
    if (this._slideTimer) clearTimeout(this._slideTimer);
    if (this._raf) cancelAnimationFrame(this._raf);
    this._container?.remove();
    this._onDone?.();
  }
}
