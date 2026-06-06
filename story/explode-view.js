import * as THREE from 'three';

export class ExplodeView {
  constructor() {
    this._panelMeshes = [];
    this._gsap = window.gsap;
    this._scene = null;
    this._active = false;
    this._anchorPos = new THREE.Vector3();
    this._reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  destroy() {
    this.collapse();
    this._refs = null;
    this._panelMeshes = [];
  }

  setRefs(refs) {
    this._scene = refs?.scene;
  }

  async explode(entries, { anchor, radius = 6, stagger = 0.07 } = {}) {
    if (!this._scene || this._active) return;
    this._active = true;

    this._panelMeshes.forEach(m => {
      this._scene.remove(m);
      m.geometry?.dispose();
      m.material?.dispose();
    });
    this._panelMeshes = [];

    if (anchor) {
      this._anchorPos.copy(anchor);
    }

    const tl = this._gsap?.timeline();

    entries.slice(0, 6).forEach((entry, i) => {
      // Skip entries with no usable content (all fields empty)
      const title = entry.title || entry.role || 'Project';
      if (!title && !entry.org && !entry.tags?.length) return;

      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 200;
      const ctx = canvas.getContext('2d');

      // Paper-cream card background
      ctx.fillStyle = '#ede4ce';
      ctx.fillRect(0, 0, 320, 200);

      // Try to load a proof image from public/proof/<entryId>/thumb.jpg
      const img = new Image();
      if (entry.id) {
        img.crossOrigin = 'anonymous';
        img.src = `public/proof/${entry.id}/thumb.jpg`;
      }

      // Draw image in left 120px column if it loads
      let imageLoaded = false;
      if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, 4, 4, 112, 112);
        imageLoaded = true;
      } else {
        img.onload = () => {
          ctx.drawImage(img, 4, 4, 112, 112);
          texture.needsUpdate = true;
          this._refs?.scheduleRender?.();
        };
        img.onerror = () => { /* no image — text-only card */ };
      }
      const leftCol = imageLoaded ? 124 : 12;

      // Hard card edge
      ctx.strokeStyle = '#1a1714';
      ctx.lineWidth = 2;
      ctx.strokeRect(2, 2, 316, 196);

      // Title (bold, dark)
      ctx.fillStyle = '#1a1714';
      ctx.font = 'bold 16px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      this._wrapText(ctx, title, leftCol, 12, 308 - leftCol, 20);

      // Role + org (mono, smaller)
      ctx.font = '11px "Cascadia Code", monospace';
      ctx.fillStyle = '#5a5a5a';
      const meta = [entry.role, entry.org].filter(Boolean).join(' · ');
      ctx.fillText(meta, leftCol, 52);

      // Date (mono)
      const dateStr = entry.year ? `${entry.year}${entry.month ? '-' + String(entry.month).padStart(2, '0') : ''}` : '';
      ctx.fillText(dateStr, leftCol, 72);

      // Tag pills
      if (entry.tags && entry.tags.length) {
        const tags = entry.tags.slice(0, 3);
        let tx = leftCol;
        for (const tag of tags) {
          const tw = ctx.measureText(tag).width + 14;
          ctx.fillStyle = '#1a1714';
          ctx.fillRect(tx, 88, tw, 20);
          ctx.fillStyle = '#ede4ce';
          ctx.font = '10px "Cascadia Code", monospace';
          ctx.fillText(tag, tx + 7, 102);
          ctx.font = '11px "Cascadia Code", monospace';
          tx += tw + 6;
        }
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      const geo = new THREE.PlaneGeometry(2.4, 1.5);
      const mat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);

      const angle = (i / 6) * Math.PI * 2 + 0.2;
      const r = radius;
      const worldPos = this._anchorPos.clone();
      mesh.position.set(
        worldPos.x + Math.cos(angle) * r,
        worldPos.y + 1 + Math.sin(i * 2.0) * 1.5,
        worldPos.z + Math.sin(angle) * r
      );
      mesh.lookAt(worldPos.x, worldPos.y + 1, worldPos.z);

      this._scene.add(mesh);
      this._panelMeshes.push(mesh);

      if (tl) {
        if (this._reduceMotion) {
          mat.opacity = 1;
        } else {
          tl.to(mat, { opacity: 1, duration: 0.4, ease: 'power2.out' }, i * stagger);
          tl.fromTo(mesh.position, {
            x: worldPos.x, y: worldPos.y, z: worldPos.z,
          }, {
            x: mesh.position.x, y: mesh.position.y, z: mesh.position.z,
            duration: 0.5, ease: 'power3.out',
          }, i * stagger);
        }
      }
    });

    if (tl) return tl;
  }

  async collapse({ duration = 0.5 } = {}) {
    if (!this._active) return;

    if (this._reduceMotion) {
      this._panelMeshes.forEach(m => {
        this._scene?.remove(m);
        m.geometry?.dispose();
        m.material?.dispose();
      });
      this._panelMeshes = [];
      this._active = false;
      return;
    }

    const tl = this._gsap?.timeline({
      onComplete: () => {
        this._panelMeshes.forEach(m => {
          this._scene?.remove(m);
          m.geometry?.dispose();
          m.material?.dispose();
        });
        this._panelMeshes = [];
        this._active = false;
      },
    });

    this._panelMeshes.forEach((mesh, i) => {
      if (tl) {
        const target = this._anchorPos.clone();
        tl.to(mesh.position, {
          x: target.x, y: target.y, z: target.z,
          duration: 0.3, ease: 'power2.in',
        }, i * 0.02);
        tl.to(mesh.material, { opacity: 0, duration: 0.15, ease: 'power2.in' }, i * 0.02);
      }
    });
    return tl;
  }

  _wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    for (const word of words) {
      const testLine = line + word + ' ';
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && line !== '') {
        ctx.fillText(line, x, y);
        line = word + ' ';
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, y);
  }
}
