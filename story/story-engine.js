import * as THREE from 'three';
import { BEATS, ERA_COLORS } from './beat-data.js';
import { ScrollManager } from './scroll-manager.js';
import { AudioManager } from './audio-manager.js';
import { CameraRig } from './camera-rig.js';
import { Orb } from './orb.js';
import { Transitions } from './transitions.js';
import { BeatBuildings } from './beat-buildings.js';
import { ColorGrader } from './color-grader.js';
import { ExplodeView } from './explode-view.js';
import { StoryUI } from './ui.js';
import { GLOBAL_TUNING, BEAT_TUNING } from './tuning.js';
import { TunePanel } from './tune-panel.js';
import { SelfTest } from './selftest.js';
const T = GLOBAL_TUNING;

// Per-beat background colors mapped from ERA_COLORS tints
const BG_COLORS = {
  void:         0x0a0a0f,
  cream:        0x1e1a14,
  acid_yellow:  0x1e1e12,
  sour_noon:    0x1e1610,
  graphite:     0x111112,
  film_warm:    0x1e1612,
  red_neon:     0x161010,
  full_palette: 0x141210,
  tropical_warm:0x141612,
  full_glow:    0x0f0f0f,
};

// Merge per-beat tuning over beat-data camera defaults
function tunedBeat(beat) {
  const t = BEAT_TUNING[beat.id];
  if (!t) return beat;
  const cam = { ...(beat.camera || {}) };
  if (t.camPos) cam.pos = t.camPos;
  if (t.camTarget) cam.target = t.camTarget;
  if (t.fov != null) cam.fov = t.fov;
  return { ...beat, camera: cam };
}

export class StoryEngine {
  constructor() {
    this.beats = BEATS.map(tunedBeat);
    this.scroll = new ScrollManager();
    this.audio = new AudioManager();
    this.camera = new CameraRig();
    this.orb = new Orb();
    this.transitions = new Transitions();
    this.buildings = new BeatBuildings();
    this.colorGrader = new ColorGrader();
    this.explodeView = new ExplodeView();
    this.ui = new StoryUI();

    this._refs = null;
    this._currentBeatIndex = -1;
    this._progress = 0;
    this._running = false;
    this._destroyed = false;
    this._restActive = false;
    this._onComplete = null;
    this._lastBeatId = null;
    this._rafId = null;
    this._autoRafId = null;
    this._restTimeout = null;
    this._scrollUnsub = null;
    this._autoProgress = 0;
    this._autoAdvancing = false;
    this._gsap = window.gsap;
    this._mouseNorm = { x: 0, y: 0 };
    this._cursorActive = false;
    this._savedSceneBg = 0x0f0f0f;
    this._ambientLight = null;
    this._hemiLight = null;
    this._exploredCount = 0;
    this._reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this._nodeCache = new Map();
    this._vec3 = new THREE.Vector3();
    this._vRight = new THREE.Vector3();
    this._vUp = new THREE.Vector3();
  }

  init(refs, { onComplete } = {}) {
    this._refs = refs;
    this._onComplete = onComplete;

    const cam = refs.camera;
    this._savedFov = cam.fov;
    cam.fov = 40;
    cam.updateProjectionMatrix();

    this.transitions.init();
    this.transitions._setOverlay('transparent', 0);
    if (this.transitions._overlay) {
      this.transitions._overlay.style.transition = 'none';
    }
    this.ui.init();
    this.audio.init();
    this.camera.setRefs(refs);
    this.buildings.setRefs(refs);
    this.explodeView.setRefs(refs);

    // Save original scene background and set initial dark bg
    if (refs.scene) {
      this._savedSceneBg = refs.scene.background instanceof THREE.Color
        ? refs.scene.background.getHex() : 0x0f0f0f;
      refs.scene.background = new THREE.Color(BG_COLORS.void);
      refs.scheduleRender?.();
    }

    // Add readable ambient base for story mode (orb is additive)
    if (refs.scene) {
      this._ambientLight = new THREE.AmbientLight(0x404060, 0.35);
      refs.scene.add(this._ambientLight);
      this._hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x362f1e, 0.25);
      refs.scene.add(this._hemiLight);
    }

    // Tone the plinth (ground plane) toward neutral warm during story
    this._plinthOrigColor = null;
    if (refs.scene) {
      refs.scene.traverse(node => {
        if (node.isMesh && node.material && node.geometry?.type === 'PlaneGeometry') {
          if (node.material.color) {
            this._plinthOrigColor = node.material.color.getHex();
            node.material.color.setHex(0x1a1814);
          }
        }
      });
    }

    // Start with all city buildings hidden
    this.buildings.hideAllBuildings();

    window._storyEngine = this;

    if (this._refs.scene && this._refs.composer) {
      const existingPasses = this._refs.composer.passes;
      for (let i = 0; i < existingPasses.length; i++) {
        existingPasses[i].renderToScreen = false;
      }

      try {
        this.colorGrader.init(this._refs.composer, this._refs.scene, this._refs.camera);
        console.log('[story] color grader initialized');
      } catch (e) {
        console.warn('[story] color grader failed, continuing without it:', e);
      }

      const orbGroup = this.orb.create();
      this._refs.scene.add(orbGroup);
    }

    this.scroll.init();

    this._setupSkipLink();

    this._scrollUnsub = this.scroll.onProgress(progress => {
      if (this._destroyed) return;
      if (this._restActive) {
        const beat = this.beats[this._currentBeatIndex];
        if (beat && beat.progressRange) {
          const restEnd = beat.progressRange[0] + (beat.progressRange[1] - beat.progressRange[0]) * T.rest.scrollThreshold;
          if (progress >= restEnd) {
            this._endRest();
          }
        }
        return;
      }
      this._onUserScroll(progress);
    });

    this._running = true;
    this._lastBeatId = null;
    this._rafId = requestAnimationFrame((t) => this._tick(t));

    this._enterBeat(0);

    this._onMouseMove = (e) => {
      this._mouseNorm.x = (e.clientX / window.innerWidth) * 2 - 1;
      this._mouseNorm.y = -(e.clientY / window.innerHeight) * 2 + 1;
      this._cursorActive = true;
    };
    window.addEventListener('mousemove', this._onMouseMove, { passive: true });

    if (this.beats[0]?.scrollLocked) {
      this._startAutoAdvance();
    }

    this._resizeHandler = () => this.scroll.recomputeHeight();
    window.addEventListener('resize', this._resizeHandler);

    this._tunePanel = new TunePanel();
    this._tunePanel.init(this);

    // Self-test: run after init if ?selftest
    if (new URLSearchParams(window.location.search).has('selftest')) {
      setTimeout(() => {
        const st = new SelfTest();
        st.run(this);
      }, 500);
    }

    // Tune panel (gated behind ?tune)
    this._tunePanel = null;
    if (new URLSearchParams(window.location.search).has('tune')) {
      import('./tune-panel.js?v=story-pass-02').then(m => {
        this._tunePanel = new m.TunePanel(this);
        this._tunePanel.init();
        this._tunePanel.refresh(this.beats[0]);
      }).catch(e => console.warn('[tune] panel failed:', e));
    }
  }

  // Called from _enterBeat so tune panel stays in sync
  _refreshTunePanel() {
    this._tunePanel?.refresh(this.beats[this._currentBeatIndex]);
  }

  _setupSkipLink() {
    const skipBtn = document.getElementById('storySkipLink');
    if (skipBtn) {
      skipBtn.addEventListener('click', () => this.skipToArchive());
    }
  }

  skipToArchive() {
    this._complete();
  }

  _startAutoAdvance() {
    this._autoAdvancing = true;
    this._autoProgress = 0;
    const totalAutoDuration = this._reduceMotion ? 2000 : 4000;
    const startTime = performance.now();

    const autoTick = () => {
      if (this._destroyed || !this._autoAdvancing) return;
      const elapsed = performance.now() - startTime;
      this._autoProgress = Math.min(1, elapsed / totalAutoDuration);

      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo(0, this._autoProgress * maxScroll);

      if (this._autoProgress < 1) {
        this._autoRafId = requestAnimationFrame(autoTick);
      } else {
        this._autoAdvancing = false;
        this.scroll.unlock();
      }
    };

    this._autoRafId = requestAnimationFrame(autoTick);
  }

  _onUserScroll(progress) {
    this._progress = progress;

    const beatIndex = this._findBeatForProgress(progress);
    if (beatIndex !== this._currentBeatIndex) {
      this._autoAdvancing = false;
      this._enterBeat(beatIndex);
    }

    const beat = this.beats[beatIndex];
    if (beat) {
      const localProgress = (progress - beat.progressRange[0]) / (beat.progressRange[1] - beat.progressRange[0]);
      this._onBeatProgress(beat, localProgress);
    }
  }

  _findBeatForProgress(progress) {
    for (let i = this.beats.length - 1; i >= 0; i--) {
      if (progress >= this.beats[i].progressRange[0]) return i;
    }
    return 0;
  }

  async _enterBeat(index) {
    if (this._destroyed) return;
    const beat = this.beats[index];
    if (!beat) return;

    // Dock previous beat's buildings (accumulate — don't throw)
    if (index > 0 && this._lastBeatId) {
      const prevBeat = this.beats[index - 1];
      if (prevBeat?.buildings?.length) {
        for (const name of prevBeat.buildings) {
          if (!this.buildings.isReached(name)) {
            this.buildings.markReached(name);
            this.buildings.dockBuilding(name, { duration: 0.8 });
          }
        }
      }
    }

    this._lastBeatId = this.beats[index - 1]?.id || null;
    this._currentBeatIndex = index;

    if (index > 0) {
      this._endExplodeView();
    }

    if (beat.transitionIn && index > 0) {
      this.ui.hideHookLine();
      this.ui.hideRest();
      this.ui.hideSubtitle();
      if (index === 9 && beat.transitionIn === 'drain') {
        // Two-step at film_fall: drain runs up, then break lands
        await this._runTransition('drain');
        if (this._currentBeatIndex !== index) return;
        await this._runTransition('break');
        if (this._currentBeatIndex !== index) return;
        // Single dolly-zoom
        if (beat.camera) {
          this.camera.dollyZoom(beat.camera, { fovFrom: T.camera.dollyFovFrom, fovTo: T.camera.dollyFovTo, duration: T.camera.dollyDuration });
        }
      } else {
        await this._runTransition(beat.transitionIn);
        if (this._currentBeatIndex !== index) return;
      }
    }

    this.ui.showSkipLink();
    this.ui.setYear(beat.year || '');
    this.ui.showLetterbox(index > 0);
    this.orb.setState(beat.orbState);

    if (beat.voText) {
      const cleanVo = beat.voText.replace(/\s*\[[^\]]*\]\s*/g, ' ').replace(/\s+/g, ' ').trim();
      const subPos = (index === 15 || index === 16) ? 'corner' : 'bottom';
      this.ui.showSubtitle(cleanVo, { position: subPos });
      this.audio.speakBeat(beat.id, beat, {
        onStart: () => {
          if (beat.colorGrade !== 'void') {
            this.audio.duckScore();
          }
        },
        onEnd: () => {
          if (beat.rest) {
            this._startExplodeView(beat);
            this._startRest();
          } else {
            this._restActive = false;
          }
        },
      });
    }

    this.audio.setScoreMood(beat.scoreCue);
    this.audio.playScoreCue(beat.scoreCue);

    // Set scene background to match era color grade
    if (beat.colorGrade && BG_COLORS[beat.colorGrade] !== undefined) {
      this._setSceneBackground(BG_COLORS[beat.colorGrade], { duration: 1.5 });
    }

    const colorPreset = ERA_COLORS[beat.colorGrade];
    if (colorPreset) {
      this.colorGrader.setPreset(colorPreset, { duration: 1.2 });
    }

    if (beat.camera) {
      this.camera.animateTo(beat.camera, { duration: 3.5 });
    }

    if (beat.camera?.target) {
      this.orb.setTargetPosition(new THREE.Vector3(
        beat.camera.target[0],
        beat.camera.target[1],
        beat.camera.target[2]
      ));
    }

    if (beat.buildings?.length || index === 15) {
      await this._waitForCity();
      if (this._currentBeatIndex !== index) return;
    }

    if (beat.buildings && beat.buildings.length > 0) {
      if (index === 2) {
        for (const name of beat.buildings) {
          this.buildings.revealBuilding(name, { duration: 2.0 });
        }
      } else if (index === 10) {
        for (const name of beat.buildings) {
          this.buildings.riseBuilding(name, { duration: 2.5, height: 8 });
        }
      } else if (index === 6) {
        // Veer: NID building (Schoogle) leaves the spine along its curve
        for (const name of beat.buildings) {
          const path = beat.veerPath || [{ x: 15, z: 10 }];
          this.buildings.veerBuildingAlongPath(name, path, { duration: 2.0 });
        }
        this.camera.startVeerDrift(0.5, 4);
      } else if (index === 7) {
        // Break: Schoogle sits out there — nothing to animate, it stays dim
      } else if (index === 8) {
        // Film: Schoogle returns (the deviated building comes back)
        const orig = this.buildings._originalStates.get('Schoogle');
        if (orig) {
          this.buildings.returnBuilding('Schoogle', orig.position, { duration: 2.0 });
        }
        for (const name of beat.buildings) {
          if (name !== 'Schoogle') {
            this.buildings.revealBuilding(name, { duration: 1.5 });
          }
        }
      } else if (index === 12) {
        // Europe stall: small veer for Buddy Tales/KH
        for (const name of beat.buildings) {
          const path = beat.veerPath || [{ x: 5, z: -2 }, { x: 0, z: 0 }];
          this.buildings.veerBuildingAlongPath(name, path, { duration: 1.5 });
        }
        this.camera.startVeerDrift(0.3, 3);
      } else {
        for (const name of beat.buildings) {
          this.buildings.revealBuilding(name, { duration: 1.5 });
        }
      }
    }

    // Ensure current beat's buildings are marked as active (not future)
    if (beat.buildings) {
      for (const name of beat.buildings) {
        this.buildings.markReached(name);
      }
    }

    // Orb orbits around the first building of the beat
    if (beat.buildings?.length > 0) {
      const firstBuilding = beat.buildings[0];
      const pivot = this.buildings._pivots.get(firstBuilding);
      if (pivot) {
        const wp = new THREE.Vector3();
        pivot.getWorldPosition(wp);
        this.orb.setBuildingAnchor(wp, 2.5);
      }
    } else {
      this.orb.clearBuildingAnchor();
    }

    if (index === 15) {
      // Transition: fade story background to archive bg + show all city buildings
      this._setSceneBackground(0x0f0f0f, { duration: 2.0 });
      this.buildings.revealAllBuildings({ duration: 3.0, stagger: 0.05 });
      this.camera.disableChase();
      // Camera flies back to archive orbit in _complete at beat 17
    }

    if (index === 17) {
      this.orb.setState('handoff');
      this._complete();
    }
  }

  _setSceneBackground(hexColor, { duration = 1.0 } = {}) {
    if (!this._refs?.scene) return;
    const bg = this._refs.scene.background;
    if (!bg || !bg.isColor) {
      this._refs.scene.background = new THREE.Color(hexColor);
      this._refs.scheduleRender?.();
      return;
    }
    if (!this._gsap) {
      bg.setHex(hexColor);
      this._refs.scheduleRender?.();
      return;
    }
    this._gsap.to(bg, {
      r: ((hexColor >> 16) & 0xff) / 255,
      g: ((hexColor >> 8) & 0xff) / 255,
      b: (hexColor & 0xff) / 255,
      duration,
      ease: 'power2.inOut',
      onUpdate: () => {
        bg.setRGB(bg.r, bg.g, bg.b);
        this._refs.scheduleRender?.();
      },
    });
  }

  async _waitForCity() {
    if (this._refs?.cityReady) return;
    // Poll up to 10 seconds for city to load
    for (let i = 0; i < 100; i++) {
      await new Promise(r => setTimeout(r, 100));
      if (this._destroyed) return;
      if (window.__storyRefs?.cityReady) {
        // City just loaded — re-hide all buildings to ensure they're hidden
        this.buildings.hideAllBuildings();
        return;
      }
    }
  }

  _onBeatProgress(beat, localProgress) {
    if (this._destroyed || this._restActive) return;
    if (beat.scrollLocked && this._progress < 0.02) {
      this.scroll.lock();
    } else if (beat.scrollLocked === false && this.scroll.isLocked) {
      this.scroll.unlock();
    }
  }

  async _runTransition(type) {
    if (!type || type === 'flow') return;
    this.transitions.cancel();
    switch (type) {
      case 'bloom': await this.transitions.bloom(); break;
      case 'drain': await this.transitions.drain(); break;
      case 'veer': await this.transitions.veer(); break;
      case 'break': await this.transitions.break(); break;
    }
  }

  _startRest() {
    this._restActive = true;
    this.ui.showRest();
    this._restTimeout = setTimeout(() => {
      this._endRest();
    }, T.rest.timeoutMs);
  }

  _endRest() {
    this._restActive = false;
    this._endExplodeView();
    this.ui.hideRest();
    if (this._restTimeout) {
      clearTimeout(this._restTimeout);
      this._restTimeout = null;
    }
  }

  _startExplodeView(beat) {
    if (!beat.explodeBuilding) return;
    const entryMap = this._refs?.buildingEntryMap;
    if (!entryMap) return;
    const building = entryMap[beat.explodeBuilding];
    if (!building) return;

    const entryIds = building.entryIds || (typeof building === 'number' ? [building] : []);
    if (!entryIds.length) return;

    const entries = entryIds
      .map(id => this._refs?.getEntryById?.(id))
      .filter(Boolean);

    if (!entries.length) return;

    const node = this._findNodeInStager(beat.explodeBuilding);
    let anchor = new THREE.Vector3();
    if (node) {
      node.updateWorldMatrix(true, false);
      anchor.setFromMatrixPosition(node.matrixWorld);
    }

    this.explodeView.explode(entries, { anchor, radius: 6 });
  }

  _endExplodeView() {
    this.explodeView.collapse();
  }

  _findNodeInStager(name) {
    const cityRoot = this._refs?.stagerCityGroup?.getObjectByName('stagerCityComposition');
    if (!cityRoot) return null;
    let found = null;
    const norm = s => String(s).toLowerCase().replace(/[\s_]+/g, ' ').trim();
    const target = norm(name);
    cityRoot.traverse(node => {
      if (found) return;
      if (!node.isMesh && !node.isGroup) return;
      const n = norm(node.name);
      if (n && (n === target || n.includes(target) || target.includes(n))) found = node;
    });
    return found;
  }

  _applyEmissiveBoost(node, boost) {
    if (!node) return;
    node.traverse(child => {
      if (child.isMesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const m of mats) {
          if (m.emissiveIntensity != null && m.userData._baseEmissive == null) {
            m.userData._baseEmissive = m.emissiveIntensity;
          }
          if (m.emissiveIntensity != null) {
            const base = m.userData._baseEmissive ?? 0;
            m.emissiveIntensity = base + boost;
          }
        }
      }
    });
  }

  _tick(time) {
    if (this._destroyed) return;
    this._rafId = requestAnimationFrame((t) => this._tick(t));
    const delta = 0.016; // ~60fps

    // Compute orb target from mouse position projected relative to camera
    if (this._cursorActive && this._refs?.camera) {
      const cam = this._refs.camera;
      this._vRight.setFromMatrixColumn(cam.matrixWorld, 0);
      this._vUp.setFromMatrixColumn(cam.matrixWorld, 1);

      const dist = this.camera.isChaseActive()
        ? cam.position.distanceTo(this.orb.getTargetPosition())
        : 20;
      const maxOffset = Math.min(8, dist * 0.06);

      const beat = this.beats[this._currentBeatIndex];
      const t = beat?.camera?.target || [0, 5, -15];
      this._vec3.set(
        t[0] + this._vRight.x * this._mouseNorm.x * maxOffset + this._vUp.x * this._mouseNorm.y * maxOffset,
        t[1] + this._vRight.y * this._mouseNorm.x * maxOffset + this._vUp.y * this._mouseNorm.y * maxOffset,
        t[2] + this._vRight.z * this._mouseNorm.x * maxOffset + this._vUp.z * this._mouseNorm.y * maxOffset
      );
      this.orb.setTargetPosition(this._vec3);
    }

    this.orb.tick(delta);
    this.buildings.tick(delta);

    // Proximity brighten: buildings near orb get emissive boost
    if (this.buildings.getReachedBuildings().size > 0) {
      const orbPos = this.orb.getPosition();
      const falloffRadius = T.proximity.falloffRadius;
      const maxBoost = T.proximity.maxBoost;
      const suppressedStates = ['flicker', 'dim'];
      for (const name of this.buildings.getReachedBuildings()) {
        let node = this._nodeCache.get(name);
        if (!node) {
          node = this._findNodeInStager(name);
          if (node) this._nodeCache.set(name, node);
        }
        if (!node) continue;

        node.updateWorldMatrix(true, false);
        this._vec3.setFromMatrixPosition(node.matrixWorld);

        const dist = orbPos.distanceTo(this._vec3);
        let boost = 0;
        if (!suppressedStates.includes(this.orb.state)) {
          boost = Math.max(0, 1 - dist / falloffRadius) * maxBoost;
        }
        this._applyEmissiveBoost(node, boost);
      }
    }

    // Camera chase: orb position drives camera with handheld feel
    if (this.camera.isChaseActive() && this.orb.group) {
      this.camera.updateChase(this.orb.group.position, delta);
    }

    if (this._refs?.scheduleRender) {
      this._refs.scheduleRender();
    }
  }

  _complete() {
    if (this._destroyed) return;

    this.audio.stopSpeech();
    this.audio.stopScore();
    this._autoAdvancing = false;

    if (this._refs?.scene && this.orb.group.parent) {
      this._refs.scene.remove(this.orb.group);
    }

    this.colorGrader.setPreset({ saturation: 1, contrast: 1, tint: [1, 1, 1] }, { duration: 0.5 });
    this.ui.hideRest();
    this.ui.setYear('');
    this.ui.showLetterbox(false);

    // Restore original scene background and show all city buildings
    if (this._refs?.scene) {
      this._refs.scene.background = new THREE.Color(this._savedSceneBg);
      this._refs.scheduleRender?.();
    }
    this.buildings.showAllBuildings();

    this._refs.camera.fov = this._savedFov || 10;
    this._refs.camera.updateProjectionMatrix();

    const archivePolar = 0.516 * Math.PI;
    const archiveAz = -0.001;
    const archiveTargetY = 8.3;
    const archiveRadius = 123.5;
    const sinPol = Math.sin(archivePolar);
    const cosPol = Math.cos(archivePolar);
    const orbitX = archiveRadius * sinPol * Math.sin(archiveAz);
    const orbitY = archiveTargetY + archiveRadius * cosPol;
    const orbitZ = archiveRadius * sinPol * Math.cos(archiveAz);

    this.camera.animateTo({
      pos: [orbitX, orbitY, orbitZ],
      target: [0, archiveTargetY, 0],
    }, { duration: 1.5 });

    this.ui.hideHookLine();
    this.ui.hideRest();
    this.ui.hideSkipLink();
    this.ui.hideSubtitle();

    setTimeout(() => {
      Object.assign(this._refs.camState, {
        radius: archiveRadius, polar: archivePolar, azimuth: archiveAz,
      });
      Object.assign(this._refs.camTarget, { x: 0, y: archiveTargetY, z: 0 });
      this._refs.applyCamera();
      this._refs.scheduleRender();

      this.destroy();
      this._onComplete?.();
    }, 1600);
  }

  destroy() {
    this._destroyed = true;
    this._running = false;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    if (this._autoRafId) {
      cancelAnimationFrame(this._autoRafId);
      this._autoRafId = null;
    }
    if (this._restTimeout) {
      clearTimeout(this._restTimeout);
      this._restTimeout = null;
    }
    if (this._scrollUnsub) {
      this._scrollUnsub();
      this._scrollUnsub = null;
    }
    this._autoAdvancing = false;
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }
    if (this._onMouseMove) {
      window.removeEventListener('mousemove', this._onMouseMove);
      this._onMouseMove = null;
    }
    // Kill GSAP scene background tween
    if (this._gsap && this._refs?.scene?.background?.isColor) {
      this._gsap.killTweensOf(this._refs.scene.background);
    }
    if (this._ambientLight && this._refs?.scene) {
      this._refs.scene.remove(this._ambientLight);
    }
    if (this._hemiLight && this._refs?.scene) {
      this._refs.scene.remove(this._hemiLight);
    }
    this.scroll.destroy();
    this.buildings.destroy();
    this.camera.kill();
    this.audio.destroy();
    this.colorGrader.destroy();
    this.transitions.destroy();
    this.explodeView.destroy();
    this.ui.destroy();
    this.orb.destroy(this._refs?.scene);
    // Restore plinth color
    if (this._plinthOrigColor != null && this._refs?.scene) {
      this._refs.scene.traverse(node => {
        if (node.isMesh && node.material && node.geometry?.type === 'PlaneGeometry') {
          if (node.material.color) node.material.color.setHex(this._plinthOrigColor);
        }
      });
    }
    this._nodeCache.clear();
    window._storyEngine = null;
    document.body.classList.remove('story-active');
  }
}
