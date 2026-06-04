import * as THREE from 'three';

export class Orb {
  constructor() {
    this.group = new THREE.Group();
    this.mesh = null;
    this.light = null;
    this.state = 'blinking';
    this._progress = 0;
    this._targetPos = new THREE.Vector3(0, 5, -30);
    this._currentPos = new THREE.Vector3(0, 5, -30);
    this._trailParticles = [];
    this._trailCount = 20;
    this._time = 0;
    this._buildingEmissiveCache = new Map();
  }

  create() {
    const geometry = new THREE.SphereGeometry(0.6, 24, 24);
    const material = new THREE.MeshPhysicalMaterial({
      color: 0x4fc3f7,
      emissive: 0x4fc3f7,
      emissiveIntensity: 1.5,
      transparent: true,
      opacity: 0.92,
      roughness: 0.15,
      metalness: 0.0,
      clearcoat: 0.3,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.group.add(this.mesh);

    const glowGeo = new THREE.SphereGeometry(1.2, 16, 16);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x4fc3f7,
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    this.group.add(glow);

    this.light = new THREE.PointLight(0x4fc3f7, 3, 200);
    this.light.position.set(0, 0, 0);
    this.group.add(this.light);

    for (let i = 0; i < this._trailCount; i++) {
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 8, 8),
        new THREE.MeshBasicMaterial({
          color: 0x4fc3f7,
          transparent: true,
          opacity: (1 - i / this._trailCount) * 0.6,
        })
      );
      dot.position.copy(this._currentPos);
      dot.userData.index = i;
      dot.userData.life = 1 - i / this._trailCount;
      this._trailParticles.push(dot);
      this.group.add(dot);
    }

    this.group.position.copy(this._currentPos);
    this._setStateVisuals('blinking');
    return this.group;
  }

  setState(newState) {
    if (this.state === newState) return;
    this.state = newState;
    this._setStateVisuals(newState);
  }

  _setStateVisuals(state) {
    if (!this.mesh) return;
    switch (state) {
      case 'blinking':
        this.mesh.material.emissiveIntensity = 1.5;
        this.mesh.material.color.setHex(0x4fc3f7);
        this.light.intensity = 2;
        this.light.color.setHex(0x4fc3f7);
        break;
      case 'curious':
        this.mesh.material.emissiveIntensity = 2.0;
        this.mesh.material.color.setHex(0x81d4fa);
        this.light.intensity = 2.5;
        break;
      case 'gentle':
        this.mesh.material.emissiveIntensity = 1.2;
        this.mesh.material.color.setHex(0x4fc3f7);
        this.light.intensity = 1.5;
        break;
      case 'bright':
        this.mesh.material.emissiveIntensity = 3.0;
        this.mesh.material.color.setHex(0xb3e5fc);
        this.light.intensity = 5;
        this.light.distance = 200;
        break;
      case 'dim':
        this.mesh.material.emissiveIntensity = 0.6;
        this.mesh.material.color.setHex(0x4fc3f7);
        this.light.intensity = 0.8;
        break;
      case 'flicker':
        this.mesh.material.emissiveIntensity = 0.4;
        this.mesh.material.color.setHex(0x29b6f6);
        this.light.intensity = 0.5;
        break;
      case 'handoff':
        this.mesh.material.emissiveIntensity = 2.0;
        this.mesh.material.color.setHex(0xb3e5fc);
        this.light.intensity = 3;
        this.light.distance = 200;
        break;
    }
  }

  setTargetPosition(pos) {
    this._targetPos.copy(pos);
  }

  getTargetPosition() {
    return this._targetPos;
  }

  cacheBuildingEmissive(name, node) {
    if (this._buildingEmissiveCache.has(name)) return;
    const intensities = [];
    node.traverse(child => {
      if (child.isMesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const m of mats) {
          if (m.emissiveIntensity != null) intensities.push({ mat: m, base: m.emissiveIntensity });
        }
      }
    });
    this._buildingEmissiveCache.set(name, intensities);
  }

  resetBuildingEmissive(name) {
    const cached = this._buildingEmissiveCache.get(name);
    if (!cached) return;
    for (const { mat, base } of cached) {
      mat.emissiveIntensity = base;
    }
  }

  getPosition() {
    return this._currentPos;
  }

  destroy(scene) {
    if (scene && this.group.parent) scene.remove(this.group);
    this.mesh?.geometry?.dispose();
    this.mesh?.material?.dispose();
    if (this.mesh) {
      const glow = this.group.children.find(c => c !== this.mesh && c.isMesh);
      glow?.geometry?.dispose();
      glow?.material?.dispose();
    }
    for (const p of this._trailParticles) {
      p.geometry?.dispose();
      p.material?.dispose();
    }
    this._trailParticles = [];
    this.light?.dispose?.();
    this._buildingEmissiveCache.clear();
    this.group = null;
    this.mesh = null;
    this.light = null;
  }

  tick(delta) {
    this._time += delta;
    this._currentPos.lerp(this._targetPos, delta * 1.5);

    const wobble = Math.sin(this._time * 2) * 0.3;
    const wobble2 = Math.cos(this._time * 1.7) * 0.3;
    this.group.position.copy(this._currentPos);
    this.mesh.position.set(wobble, Math.sin(this._time * 2.3) * 0.2, wobble2);

    if (this.state === 'blinking') {
      const blink = Math.sin(this._time * 4) > 0.7 ? 0.3 : 1.5;
      this.mesh.material.emissiveIntensity = blink;
      this.light.intensity = blink * 1.3;
    }

    if (this.state === 'flicker') {
      const flicker = 0.3 + Math.random() * 0.5;
      this.mesh.material.emissiveIntensity = flicker;
      this.light.intensity = flicker;
    }

    for (let i = this._trailParticles.length - 1; i >= 1; i--) {
      this._trailParticles[i].position.copy(this._trailParticles[i - 1].position);
    }
    if (this._trailParticles.length > 0) {
      this._trailParticles[0].position.copy(this._currentPos);
    }
  }
}
