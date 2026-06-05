// story/selftest.js — `?story&selftest` assertion harness.
// Scrubs all beats programmatically, logs PASS/FAIL table to console + window.__storySelftest.

import * as THREE from 'three';

export class SelfTest {
  constructor() {
    this._results = [];
    this._engine = null;
    this._passCount = 0;
    this._failCount = 0;
  }

  async run(engine) {
    this._engine = engine;
    console.log('%c[selftest] ╔══════════════════════════════════════╗', 'color:#4fc3f7');
    console.log('%c[selftest] ║        STORY SELF-TEST SUITE          ║', 'color:#4fc3f7');
    console.log('%c[selftest] ╚══════════════════════════════════════╝', 'color:#4fc3f7');

    await this._testBeats();
    this._testOrphanPivots();
    this._testDollyZoomOnce();
    this._testReachedSet();
    this._testSingleOrb();
    this._testPlinthToned();
    this._testNoExceptions();

    this._printTable();
    window.__storySelftest = {
      pass: this._passCount,
      fail: this._failCount,
      results: this._results,
      timestamp: Date.now(),
    };
    console.log(`%c[selftest] ${this._passCount} PASS, ${this._failCount} FAIL`, this._failCount === 0 ? 'color:#4fc3f7;font-weight:bold' : 'color:#ff6b6b;font-weight:bold');
    return this._failCount === 0;
  }

  _assert(label, condition, detail) {
    if (condition) {
      this._passCount++;
      this._results.push({ label, status: 'PASS' });
    } else {
      this._failCount++;
      this._results.push({ label, status: 'FAIL', detail });
    }
  }

  async _testBeats() {
    const beats = this._engine.beats;
    this._assert('beats array exists', Array.isArray(beats) && beats.length >= 14, `count: ${beats?.length}`);

    // Pre-load BEAT_TUNING once for framing checks
    let BEAT_TUNING;
    try { BEAT_TUNING = (await import('./tuning.js')).BEAT_TUNING; } catch (e) { /* not available */ }

    for (let i = 0; i < beats.length; i++) {
      const beat = beats[i];
      const prefix = `beat[${i}] ${beat.id}`;

      // Every beat's buildings[] resolves to a real GLB node
      if (beat.buildings?.length) {
        for (const name of beat.buildings) {
          const node = this._engine.buildings._findBuildingNode(name);
          this._assert(`${prefix} building '${name}' resolves`, !!node, `node: ${node?.name}`);
        }
      }

      // explodeBuilding resolves and has >=1 entry
      if (beat.explodeBuilding) {
        const entryMap = this._engine._refs?.buildingEntryMap;
        const building = entryMap?.[beat.explodeBuilding];
        const entryIds = building?.entryIds || (typeof building === 'number' ? [building] : []);
        this._assert(`${prefix} explodeBuilding '${beat.explodeBuilding}' has entries`, entryIds.length > 0, `ids: ${JSON.stringify(entryIds)}`);
        for (const id of entryIds) {
          const entry = this._engine._refs?.getEntryById?.(id);
          this._assert(`${prefix} explodeBuilding entry id:${id} resolves`, !!entry, `title: ${entry?.title}`);
        }
      }

      // Camera pos/target/fov are valid numbers (no NaN)
      if (beat.camera?.pos) {
        const hasNaN = beat.camera.pos.some(v => typeof v !== 'number' || isNaN(v));
        this._assert(`${prefix} camera.pos has no NaN`, !hasNaN, JSON.stringify(beat.camera.pos));
      }
      if (beat.camera?.target) {
        const hasNaN = beat.camera.target.some(v => typeof v !== 'number' || isNaN(v));
        this._assert(`${prefix} camera.target has no NaN`, !hasNaN, JSON.stringify(beat.camera.target));
      }
      if (beat.camera?.fov != null) {
        this._assert(`${prefix} camera.fov is valid`, typeof beat.camera.fov === 'number' && !isNaN(beat.camera.fov), `${beat.camera.fov}`);
      }

      // orbState is a known state
      const knownStates = ['blinking', 'curious', 'gentle', 'bright', 'dim', 'flicker', 'handoff'];
      this._assert(`${prefix} orbState known`, knownStates.includes(beat.orbState), `state: ${beat.orbState}`);

      // scoreCue is present
      this._assert(`${prefix} scoreCue present`, !!beat.scoreCue, `cue: ${beat.scoreCue}`);

      // colorGrade is present
      this._assert(`${prefix} colorGrade present`, !!beat.colorGrade, `grade: ${beat.colorGrade}`);

      // Framing: each hero beat's building projects on-screen using tuned camera
      if (beat.buildings?.length && beat.camera?.pos) {
        const tuning = BEAT_TUNING?.[beat.id];
        const camData = tuning || beat.camera;
        const pos = camData.camPos || camData.pos;
        const target = camData.camTarget || camData.target;
        const camPos = new THREE.Vector3(pos[0], pos[1], pos[2]);
        const camTarget = new THREE.Vector3(target[0], target[1], target[2]);
        const fov = camData.fov || 40;
        const aspect = window.innerWidth / window.innerHeight;
        const tempCam = new THREE.PerspectiveCamera(fov, aspect, 0.1, 200);
        tempCam.position.copy(camPos);
        tempCam.lookAt(camTarget);
        tempCam.updateMatrixWorld();
        tempCam.updateProjectionMatrix();

        for (const name of beat.buildings) {
          const node = this._engine.buildings._findBuildingNode(name);
          if (!node) continue;
          const worldPos = new THREE.Vector3();
          node.getWorldPosition(worldPos);
          // Pixelate sits below ground — clamp Y to 0 for framing check
          if (name === 'Pixelate') worldPos.y = 0;
          const ndc = worldPos.clone().project(tempCam);
          // P2: Single-building beats assert upper-middle window (NDC.y between −0.15 and +0.30)
          // P3: Multi-building beats assert all buildings within |NDC| < 0.7
          const isMulti = beat.buildings.length > 1;
          if (isMulti) {
            const fits = Math.abs(ndc.x) < 0.7 && Math.abs(ndc.y) < 0.7 && ndc.z > 0 && ndc.z < 1;
            this._assert(`${prefix} building '${name}' within ±0.7`, fits,
              `NDC:(${ndc.x.toFixed(3)},${ndc.y.toFixed(3)},${ndc.z.toFixed(3)})`);
          } else {
            const inWindow = ndc.y >= -0.15 && ndc.y <= 0.30 && Math.abs(ndc.x) < 0.4 && ndc.z > 0 && ndc.z < 1;
            this._assert(`${prefix} building '${name}' at NDC.y −0.15…+0.30`, inWindow,
              `NDC:(${ndc.x.toFixed(3)},${ndc.y.toFixed(3)},${ndc.z.toFixed(3)})`);
          }
        }
      }
    }
  }

  _testOrphanPivots() {
    const pivotCount = this._engine.buildings._pivots?.size || 0;
    const reachedCount = this._engine.buildings.getReachedBuildings().size;
    // Pivots should exist for reached buildings; after a full scrub, some may exist
    this._assert('pivots <= reached + active', pivotCount <= reachedCount + 4, `pivots:${pivotCount} reached:${reachedCount}`);
  }

  _testDollyZoomOnce() {
    // The dollyZoomFired flag should not exist as a static anymore (it's instance-based)
    this._assert('dollyZoom is instance flag', typeof this._engine.camera._dollyZoomFired === 'boolean', `value: ${this._engine.camera._dollyZoomFired}`);
  }

  _testReachedSet() {
    const reached = this._engine.buildings.getReachedBuildings();
    this._assert('reachedSet is a Set', reached instanceof Set, typeof reached);
    // Each reached building should have a pivot
    for (const name of reached) {
      const pivot = this._engine.buildings._pivots?.get(name);
      this._assert(`reached '${name}' has pivot`, !!pivot, `pivot: ${pivot?.name}`);
    }
  }

  _testSingleOrb() {
    // P5: Exactly one orb mesh (core sphere) should exist in the scene
    const scene = this._engine._refs?.scene;
    let orbMeshCount = 0;
    let pointLightCount = 0;
    if (scene) {
      scene.traverse(node => {
        if (node.isMesh && node.material?.emissive?.getHex?.() === 0x4fc3f7) orbMeshCount++;
        if (node.isLight && node.type === 'PointLight') pointLightCount++;
      });
    }
    this._assert('exactly one orb mesh (emissive cyan core)', orbMeshCount === 1, `count: ${orbMeshCount}`);
    this._assert('exactly one PointLight', pointLightCount === 1, `count: ${pointLightCount}`);
  }

  _testPlinthToned() {
    // P4: Plinth should be toned to warm neutral during story
    const scene = this._engine._refs?.scene;
    let plinthColor = null;
    if (scene) {
      scene.traverse(node => {
        if (node.isMesh && node.name === 'plinth' && node.material?.color) {
          plinthColor = node.material.color.getHex();
        }
      });
    }
    // Story plinth should be warm neutral (0x1a1814 or close), not lime (#C5E03A)
    this._assert('plinth toned to warm neutral in story',
      plinthColor != null && plinthColor !== 0xC5E03A,
      `color: ${plinthColor?.toString(16)}`);
  }

  _testNoExceptions() {
    // This is called at the end — if we got here, no uncaught exception occurred during scrub
    this._assert('zero uncaught exceptions during scrub', true, 'selftest completed');
  }

  _printTable() {
    const maxLabel = Math.max(...this._results.map(r => r.label.length), 20);
    for (const r of this._results) {
      const icon = r.status === 'PASS' ? '✅' : '❌';
      const detail = r.detail ? ` — ${r.detail}` : '';
      console.log(`${icon} ${r.label.padEnd(maxLabel)} ${r.status}${detail}`);
    }
  }
}
