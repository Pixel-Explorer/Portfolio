// story/tune-panel.js — Live tuning overlay gated behind `?story&tune`.
// Provides sliders for the current beat's camera + global orb/camera params.
// Changes apply live. Copy-beat-JSON and copy-all-TUNING buttons.
import { GLOBAL_TUNING, BEAT_TUNING } from './tuning.js';

export class TunePanel {
  constructor() {
    this._el = null;
    this._visible = false;
    this._engine = null;
    this._fields = [];
  }

  init(engine) {
    if (!new URLSearchParams(window.location.search).has('tune')) return;
    this._engine = engine;
    this._create();
    this._bindBeatChange();
  }

  _create() {
    this._el = document.createElement('div');
    this._el.id = 'storyTunePanel';
    this._el.innerHTML = `<div class="tune-header"><span>TUNE</span><button class="tune-close">×</button></div><div class="tune-body"></div>`;
    this._el.style.cssText = `position:fixed;top:0;right:0;z-index:99999;width:320px;max-height:100vh;overflow-y:auto;background:rgba(10,10,10,0.92);color:#ede4ce;font-family:'Cascadia Code',monospace;font-size:11px;border-left:1px solid rgba(255,255,255,0.1);display:none;`;
    this._el.querySelector('.tune-close').addEventListener('click', () => this.toggle());
    document.body.appendChild(this._el);
    this._buildGlobalSection();
    this._visible = false;
  }

  _buildGlobalSection() {
    const body = this._el.querySelector('.tune-body');
    const sec = document.createElement('div');
    sec.innerHTML = '<div class="tune-section-label">GLOBAL</div>';
    this._addSlider(sec, 'orb.lightIntensity', GLOBAL_TUNING.orb, 'lightIntensity', 0, 5, 0.1);
    this._addSlider(sec, 'orb.lightDistance', GLOBAL_TUNING.orb, 'lightDistance', 10, 200, 5);
    this._addSlider(sec, 'orb.haloScale', GLOBAL_TUNING.orb, 'haloScale', 0.5, 6, 0.1);
    this._addSlider(sec, 'camera.chaseLerp', GLOBAL_TUNING.camera, 'chaseLerp', 0.5, 8, 0.1);
    this._addSlider(sec, 'camera.microShake', GLOBAL_TUNING.camera, 'microShake', 0, 0.2, 0.005);
    this._addSlider(sec, 'proximity.falloffRadius', GLOBAL_TUNING.proximity, 'falloffRadius', 2, 30, 1);
    this._addSlider(sec, 'proximity.maxBoost', GLOBAL_TUNING.proximity, 'maxBoost', 0, 5, 0.1);
    body.appendChild(sec);
  }

  rebuildBeatSection() {
    const body = this._el.querySelector('.tune-body');
    const old = body.querySelector('.tune-beat-section');
    if (old) old.remove();
    const beat = this._engine?.beats?.[this._engine._currentBeatIndex];
    if (!beat) return;
    const sec = document.createElement('div');
    sec.className = 'tune-beat-section';
    sec.innerHTML = `<div class="tune-section-label">BEAT: ${beat.id} (${beat.title})</div>`;
    const t = BEAT_TUNING[beat.id] || {};
    this._addSlider(sec, 'camPos.x', t, ['camPos', 0], -30, 30, 0.5);
    this._addSlider(sec, 'camPos.y', t, ['camPos', 1], -10, 40, 0.5);
    this._addSlider(sec, 'camPos.z', t, ['camPos', 2], -40, 40, 0.5);
    this._addSlider(sec, 'camTarget.x', t, ['camTarget', 0], -20, 20, 0.5);
    this._addSlider(sec, 'camTarget.y', t, ['camTarget', 1], -10, 30, 0.5);
    this._addSlider(sec, 'camTarget.z', t, ['camTarget', 2], -20, 20, 0.5);
    this._addSlider(sec, 'fov', t, 'fov', 10, 90, 1);

    // Copy buttons
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:6px;padding:8px;';
    const copyBeat = document.createElement('button');
    copyBeat.textContent = 'Copy this beat';
    copyBeat.className = 'tune-btn';
    copyBeat.addEventListener('click', () => {
      navigator.clipboard.writeText(JSON.stringify(t, null, 2));
    });
    const copyAll = document.createElement('button');
    copyAll.textContent = 'Copy all TUNING';
    copyAll.className = 'tune-btn';
    copyAll.addEventListener('click', () => {
      navigator.clipboard.writeText(JSON.stringify({ GLOBAL_TUNING, BEAT_TUNING }, null, 2));
    });
    btnRow.appendChild(copyBeat);
    btnRow.appendChild(copyAll);
    sec.appendChild(btnRow);
    body.appendChild(sec);
    this._bindBeatSliders(t);
  }

  _addSlider(container, label, obj, path, min, max, step) {
    const row = document.createElement('div');
    row.className = 'tune-row';
    const getVal = () => {
      if (Array.isArray(path)) return (obj[path[0]] || [])[path[1]] ?? 0;
      return obj[path] ?? 0;
    };
    const setVal = (v) => {
      if (Array.isArray(path)) {
        if (!obj[path[0]]) obj[path[0]] = [0, 0, 0];
        obj[path[0]][path[1]] = v;
      } else {
        obj[path] = v;
      }
    };
    const lbl = document.createElement('span');
    lbl.className = 'tune-label';
    lbl.textContent = label;
    const val = document.createElement('span');
    val.className = 'tune-value';
    val.textContent = getVal();
    const input = document.createElement('input');
    input.type = 'range';
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = getVal();
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      setVal(v);
      val.textContent = v;
      this._applyInput(label);
    });
    row.appendChild(lbl);
    row.appendChild(val);
    row.appendChild(input);
    container.appendChild(row);
    this._fields.push({ label, obj, path, getVal, setVal, input, val });
  }

  _applyInput(label) {
    const parts = label.split('.');
    // If it's a beat cam field, refresh the camera
    if (['camPos', 'camTarget', 'fov'].includes(parts[0]) || parts[0] === 'camPos' || parts[0] === 'camTarget') {
      this._reapplyBeatCamera();
    }
    if (parts[0] === 'orb') {
      this._updateOrb();
    }
  }

  _reapplyBeatCamera() {
    const beat = this._engine?.beats?.[this._engine._currentBeatIndex];
    if (!beat?.camera) return;
    this._engine.camera.kill();
    this._engine.camera.animateTo(beat.camera, { duration: 0.4 });
  }

  _updateOrb() {
    if (this._engine?.orb?.light) {
      this._engine.orb.light.intensity = GLOBAL_TUNING.orb.lightIntensity;
    }
  }

  _bindBeatChange() {
    // Poll for beat index change (simpler than wiring through engine)
    let lastIdx = -1;
    setInterval(() => {
      if (!this._visible) return;
      const idx = this._engine?._currentBeatIndex ?? -1;
      if (idx !== lastIdx) {
        lastIdx = idx;
        this.rebuildBeatSection();
      }
    }, 500);
  }

  _bindBeatSliders(t) {
    // Ensure arrays exist for array paths
    if (!t.camPos) t.camPos = [0, 5, 10];
    if (!t.camTarget) t.camTarget = [0, 5, 0];
    if (t.fov == null) t.fov = 40;
  }

  toggle() {
    this._visible = !this._visible;
    this._el.style.display = this._visible ? 'block' : 'none';
    if (this._visible) {
      this.rebuildBeatSection();
    }
  }
}
