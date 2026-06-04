import * as THREE from 'three';

export class BeatBuildings {
  constructor() {
    this._refs = null;
    this._pivots = new Map();
    this._originalStates = new Map();
    this._buildingNodes = new Map();
    this._reachedBuildings = new Set();
    this._gsap = window.gsap;
    this._tl = null;
    this._tickTime = 0;
    this._bounceBasePositions = new Map();
    this._reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  setRefs(refs) {
    this._refs = refs;
  }

  _findBuildingNode(name) {
    if (this._buildingNodes.has(name)) return this._buildingNodes.get(name);

    const norm = s => String(s).toLowerCase().replace(/[\s_]+/g, ' ').trim();
    const target = norm(name);

    if (!this._refs?.stagerCityGroup) return null;

    let found = null;
    this._refs.stagerCityGroup.traverse(node => {
      if (found) return;
      if (!node.isMesh && !node.isGroup) return;
      if (node.name === 'stagerCityComposition') return;
      const n = norm(node.name);
      if (n && (n === target || n.includes(target) || target.includes(n)) && n !== 'stagerCityComposition') {
        found = node;
      }
    });

    if (found) {
      this._buildingNodes.set(name, found);
    }
    return found;
  }

  _getOrCreatePivot(name) {
    if (this._pivots.has(name)) return this._pivots.get(name);
    const node = this._findBuildingNode(name);
    if (!node) return null;

    const pivot = new THREE.Group();
    pivot.name = `pivot_${name}`;

    node.updateWorldMatrix(true, false);
    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    const worldScale = new THREE.Vector3();
    node.matrixWorld.decompose(worldPos, worldQuat, worldScale);

    pivot.position.copy(worldPos);
    pivot.quaternion.copy(worldQuat);
    pivot.scale.set(1, 1, 1);

    const parent = node.parent;
    if (parent) {
      parent.add(pivot);
      pivot.attach(node);
    }
    node.visible = true;

    this._originalStates.set(name, {
      position: worldPos.clone(),
      quaternion: worldQuat.clone(),
      scale: worldScale.clone(),
      emissiveIntensity: this._getEmissiveIntensity(node) ?? 0,
    });

    this._pivots.set(name, pivot);
    return pivot;
  }

  _getEmissiveIntensity(node) {
    if (!node) return 0;
    let intensity = 0;
    node.traverse(child => {
      if (child.isMesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const m of mats) {
          if (m.emissiveIntensity != null) intensity = Math.max(intensity, m.emissiveIntensity);
        }
      }
    });
    return intensity;
  }

  _setEmissiveIntensity(node, intensity) {
    if (!node) return;
    node.traverse(child => {
      if (child.isMesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const m of mats) {
          if (m.emissiveIntensity != null) {
            m.emissiveIntensity = intensity;
          }
        }
      }
    });
  }

  async revealBuilding(name, { duration = 1.5, ease = 'power3.out' } = {}) {
    if (!this._gsap) return;
    const pivot = this._getOrCreatePivot(name);
    if (!pivot) return;

    pivot.scale.set(0.01, 0.01, 0.01);
    pivot.visible = true;

    const tl = this._gsap.timeline();
    tl.to(pivot.scale, {
      x: 1, y: 1, z: 1,
      duration, ease,
      onUpdate: () => this._refs?.scheduleRender?.(),
    });
    this._tl = tl;
    return tl;
  }

  async hideBuilding(name, { duration = 0.8 } = {}) {
    if (!this._gsap) return;
    const pivot = this._getOrCreatePivot(name);
    if (!pivot) return;

    const tl = this._gsap.timeline();
    tl.to(pivot.scale, {
      x: 0.01, y: 0.01, z: 0.01,
      duration, ease: 'power2.in',
      onComplete: () => { pivot.visible = false; },
    });
  }

  async riseBuilding(name, { duration = 2.0, height = 5 } = {}) {
    if (!this._gsap) return;
    const pivot = this._getOrCreatePivot(name);
    if (!pivot) return;

    pivot.scale.set(0.01, 0.01, 0.01);
    const startY = pivot.position.y - height;
    pivot.position.y = startY;
    pivot.visible = true;

    const tl = this._gsap.timeline();
    tl.to(pivot.position, { y: startY + height, duration, ease: 'power3.out' }, 0);
    tl.to(pivot.scale, { x: 1, y: 1, z: 1, duration: duration * 0.8, ease: 'power3.out' }, 0);
    this._tl = tl;
    return tl;
  }

  async veerBuilding(name, offset, { duration = 1.5 } = {}) {
    if (!this._gsap) return;
    const pivot = this._getOrCreatePivot(name);
    if (!pivot) return;

    const tl = this._gsap.timeline();
    tl.to(pivot.position, {
      x: pivot.position.x + (offset.x || 0),
      y: pivot.position.y + (offset.y || 0),
      z: pivot.position.z + (offset.z || 0),
      duration, ease: 'power2.inOut',
    });
    this._tl = tl;
    return tl;
  }

  async veerBuildingAlongPath(name, waypoints, { duration = 2.0, ease = 'power2.inOut' } = {}) {
    if (!this._gsap) return;
    const pivot = this._getOrCreatePivot(name);
    if (!pivot) return;

    pivot.visible = true;

    const tl = this._gsap.timeline();
    const startPos = pivot.position.clone();

    for (const wp of waypoints) {
      const targetX = startPos.x + (wp.x || 0);
      const targetZ = startPos.z + (wp.z || 0);
      tl.to(pivot.position, {
        x: targetX, z: targetZ,
        duration: duration / waypoints.length,
        ease,
      });
    }
    this._tl = tl;
    return tl;
  }

  async returnBuilding(name, originalPosition, { duration = 1.5, ease = 'power2.inOut' } = {}) {
    if (!this._gsap) return;
    const pivot = this._getOrCreatePivot(name);
    if (!pivot) return;

    const tl = this._gsap.timeline();
    tl.to(pivot.position, {
      x: originalPosition.x,
      y: originalPosition.y,
      z: originalPosition.z,
      duration, ease: 'power2.inOut',
    });
    this._tl = tl;
    return tl;
  }

  async dockBuilding(name, { duration = 1.2 } = {}) {
    if (!this._gsap) return;
    const orig = this._originalStates.get(name);
    if (!orig) return;

    const pivot = this._getOrCreatePivot(name);
    if (!pivot) return;

    const tl = this._gsap.timeline();
    // Reset pivot to original world scale (1,1,1) — the node's local transform
    // was rewritten by pivot.attach(), so the pivot carries the world position.
    tl.to(pivot.scale, { x: 1, y: 1, z: 1, duration, ease: 'power2.inOut' }, 0);
    // Dim the emissive to reached state (safe from NaN)
    const baseIntensity = orig.emissiveIntensity ?? 0;
    const targetIntensity = baseIntensity * 0.15;
    tl.call(() => this._setEmissiveIntensity(pivot, targetIntensity), [], 0);
    this._tl = tl;
    return tl;
  }

  markReached(name) {
    this._reachedBuildings.add(name);
  }

  isReached(name) {
    return this._reachedBuildings.has(name);
  }

  getReachedBuildings() {
    return this._reachedBuildings;
  }

  async resetBuilding(name, { duration = 1.0 } = {}) {
    if (!this._gsap) return;
    const orig = this._originalStates.get(name);
    const pivot = this._getOrCreatePivot(name);
    if (!pivot || !orig) return;

    const tl = this._gsap.timeline();
    tl.to(pivot.scale, { x: orig.scale.x, y: orig.scale.y, z: orig.scale.z, duration, ease: 'power2.out' }, 0);
    this._tl = tl;
    return tl;
  }

  async revealAllBuildings({ duration = 2.5, stagger = 0.04 } = {}) {
    if (!this._gsap || !this._refs?.stagerCityGroup) return;

    const cityRoot = this._refs.stagerCityGroup.getObjectByName('stagerCityComposition');
    if (!cityRoot) return;

    const buildingNames = new Set();
    const skipNames = new Set(['Tree', 'Car', 'Contact', 'stagerCityComposition']);

    cityRoot.traverse(node => {
      if (!node.isMesh && !node.isGroup) return;
      if (!node.name) return;
      for (const skip of skipNames) {
        if (node.name.includes(skip)) return;
      }
      buildingNames.add(node.name);
    });

    const tl = this._gsap.timeline();
    for (const name of buildingNames) {
      if (this._reachedBuildings.has(name)) continue;
      if (this._pivots.has(name)) continue;
      const pivot = this._getOrCreatePivot(name);
      if (pivot) {
        pivot.scale.set(0.01, 0.01, 0.01);
        pivot.visible = true;
        tl.to(pivot.scale, { x: 1, y: 1, z: 1, duration: 1.0, ease: 'power3.out' }, stagger);
      }
    }
    this._tl = tl;
    return tl;
  }

  hideAllBuildings() {
    if (!this._refs?.stagerCityGroup) return;
    const cityRoot = this._refs.stagerCityGroup.getObjectByName('stagerCityComposition') || this._refs.stagerCityGroup;
    cityRoot.traverse(node => {
      if (node.isMesh) {
        node.visible = false;
      }
    });
    // Also hide any pivot groups that were created (they contain exposed meshes)
    for (const [, pivot] of this._pivots) {
      pivot.visible = false;
    }
    this._refs.scheduleRender?.();
  }

  showAllBuildings({ duration = 1.5 } = {}) {
    if (!this._refs?.stagerCityGroup || !this._gsap) return;
    const cityRoot = this._refs.stagerCityGroup.getObjectByName('stagerCityComposition') || this._refs.stagerCityGroup;
    cityRoot.traverse(node => {
      if (node.isMesh) {
        node.visible = true;
      }
    });
    this._refs.scheduleRender?.();
  }

  tick(delta) {
    if (this._reduceMotion || this._pivots.size === 0) return;
    this._tickTime += delta;
    for (const [name, pivot] of this._pivots) {
      if (!this._reachedBuildings.has(name)) continue;
      if (!this._bounceBasePositions.has(name)) {
        this._bounceBasePositions.set(name, pivot.position.y);
      }
      const baseY = this._bounceBasePositions.get(name);
      const hash = name.length * 0.3 + 1.2;
      pivot.position.y = baseY + Math.sin(this._tickTime * hash) * 0.015;
    }
    this._refs?.scheduleRender?.();
  }

  destroy() {
    if (this._gsap) this._gsap.killTweensOf('*');
    this._tl?.kill();
    this._tl = null;
    for (const [name] of this._buildingNodes) {
      const pivot = this._pivots.get(name);
      if (pivot && this._refs?.scene) {
        this._refs.scene.remove(pivot);
      }
    }
    this._buildingNodes.clear();
    this._pivots.clear();
    this._originalStates.clear();
    this._reachedBuildings.clear();
    this._refs = null;
  }

  reset() {
    if (this._tl) {
      this._tl.kill();
      this._tl = null;
    }
    this._pivots.clear();
    this._originalStates.clear();
    this._buildingNodes.clear();
    this._reachedBuildings.clear();
    this._bounceBasePositions.clear();
  }
}
