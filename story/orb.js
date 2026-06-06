import * as THREE from 'three';
import { GLOBAL_TUNING } from './tuning.js';
const O = GLOBAL_TUNING.orb;

export class Orb {
  constructor() {
    this.group = new THREE.Group();
    this.mesh = null;
    this.light = null;
    this._haloSprite = null;
    this.state = 'blinking';
    this._progress = 0;
    this._targetPos = new THREE.Vector3(0, 5, -30);
    this._currentPos = new THREE.Vector3(0, 5, -30);
    this._trailParticles = [];
    this._trailCount = 8;
    this._time = 0;
    this._buildingEmissiveCache = new Map();
    this._buildingAnchor = null;
    this._orbitRadius = 0;
    this._reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  _makeRadialGradientTexture() {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.15, 'rgba(200, 230, 255, 0.8)');
    gradient.addColorStop(0.4, 'rgba(100, 180, 255, 0.3)');
    gradient.addColorStop(0.7, 'rgba(50, 100, 200, 0.08)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  create() {
    // Small bright core
    const coreRadius = O.coreSize;
    const geometry = new THREE.SphereGeometry(coreRadius, 20, 20);
    const material = new THREE.MeshPhysicalMaterial({
      color: 0x4fc3f7,
      emissive: 0x4fc3f7,
      emissiveIntensity: 2.5,
      transparent: true,
      opacity: 0.95,
      roughness: 0.1,
      metalness: 0.0,
      clearcoat: 0.0,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.group.add(this.mesh);

    // Additive soft halo sprite (replaces the flat navy glow sphere)
    const haloTexture = this._makeRadialGradientTexture();
    const haloMat = new THREE.SpriteMaterial({
      map: haloTexture,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 1.0,
      color: 0x88ccff,
    });
    this._haloSprite = new THREE.Sprite(haloMat);
    this._haloSprite.scale.set(coreRadius * 6, coreRadius * 6, 1);
    this.group.add(this._haloSprite);

    // Point light (tuned down to avoid hotspot)
    this.light = new THREE.PointLight(0x4fc3f7, O.lightIntensity, O.lightDistance);
    this.light.position.set(0, 0, 0);
    this.group.add(this.light);

    // Trail particles (small, additive)
    for (let i = 0; i < this._trailCount; i++) {
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 6, 6),
        new THREE.MeshBasicMaterial({
          color: 0x88ccff,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          opacity: (1 - i / this._trailCount) * 0.4,
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
        this.mesh.material.emissiveIntensity = 2.0;
        this.mesh.material.color.setHex(0x4fc3f7);
        this.light.intensity = 1.2;
        this.light.color.setHex(0x4fc3f7);
        break;
      case 'curious':
        this.mesh.material.emissiveIntensity = 2.5;
        this.mesh.material.color.setHex(0x81d4fa);
        this.light.intensity = 1.8;
        break;
      case 'gentle':
        this.mesh.material.emissiveIntensity = 1.5;
        this.mesh.material.color.setHex(0x4fc3f7);
        this.light.intensity = 1.0;
        break;
      case 'bright':
        this.mesh.material.emissiveIntensity = 3.5;
        this.mesh.material.color.setHex(0xb3e5fc);
        this.light.intensity = 2.5;
        this.light.distance = 80;
        break;
      case 'dim':
        this.mesh.material.emissiveIntensity = 0.8;
        this.mesh.material.color.setHex(0x4fc3f7);
        this.light.intensity = 0.5;
        break;
      case 'flicker':
        this.mesh.material.emissiveIntensity = 0.5;
        this.mesh.material.color.setHex(0x29b6f6);
        this.light.intensity = 0.3;
        break;
      case 'handoff':
        this.mesh.material.emissiveIntensity = 2.5;
        this.mesh.material.color.setHex(0xb3e5fc);
        this.light.intensity = 2.0;
        this.light.distance = 80;
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

  setBuildingAnchor(worldPos, radius = 2.5) {
    this._buildingAnchor = worldPos.clone();
    this._orbitRadius = radius;
  }

  clearBuildingAnchor() {
    this._buildingAnchor = null;
    this._orbitRadius = 0;
  }

  getPosition() {
    return this._currentPos;
  }

  tick(delta) {
    this._time += delta;

    if (this._buildingAnchor && !this._reduceMotion) {
      const cx = Math.cos(this._time * 0.4) * this._orbitRadius;
      const cz = Math.sin(this._time * 0.4) * this._orbitRadius;
      const cy = Math.sin(this._time * 0.25) * this._orbitRadius * 0.3;
      this._currentPos.set(
        this._buildingAnchor.x + cx,
        this._buildingAnchor.y + cy + 2,
        this._buildingAnchor.z + cz
      );
    } else {
      this._currentPos.lerp(this._targetPos, delta * 1.5);
    }

    if (!this._reduceMotion) {
      const wobble = Math.sin(this._time * 2) * 0.3;
      const wobble2 = Math.cos(this._time * 1.7) * 0.3;
      this.group.position.copy(this._currentPos);
      this.mesh.position.set(wobble, Math.sin(this._time * 2.3) * 0.2, wobble2);

      // Halo gentle pulse
      if (this._haloSprite) {
        const pulse = 1 + Math.sin(this._time * 1.5) * 0.08;
        const baseScale = this._reduceMotion ? 2.1 : 2.1;
        this._haloSprite.scale.set(baseScale * pulse, baseScale * pulse, 1);
      }
    } else {
      this.group.position.copy(this._currentPos);
      this.mesh.position.set(0, 0, 0);
      if (this._haloSprite) {
        this._haloSprite.scale.set(2.1, 2.1, 1);
      }
    }

    if (this.state === 'blinking' && !this._reduceMotion) {
      const blink = Math.sin(this._time * 4) > 0.7 ? 0.3 : 2.0;
      this.mesh.material.emissiveIntensity = blink;
      this.light.intensity = blink * 0.6;
    }

    if (this.state === 'flicker' && !this._reduceMotion) {
      const flicker = 0.3 + Math.random() * 0.5;
      this.mesh.material.emissiveIntensity = flicker;
      this.light.intensity = flicker;
    }

    if (!this._reduceMotion) {
      for (let i = this._trailParticles.length - 1; i >= 1; i--) {
        this._trailParticles[i].position.copy(this._trailParticles[i - 1].position);
      }
      if (this._trailParticles.length > 0) {
        this._trailParticles[0].position.copy(this._currentPos);
      }
    }
  }

  destroy(scene) {
    this.clearBuildingAnchor();
    if (scene && this.group.parent) scene.remove(this.group);
    this.mesh?.geometry?.dispose();
    this.mesh?.material?.dispose();
    this._haloSprite?.material?.map?.dispose();
    this._haloSprite?.material?.dispose();
    for (const p of this._trailParticles) {
      p.geometry?.dispose();
      p.material?.dispose();
    }
    this._trailParticles = [];
    this.light?.dispose?.();
    this._buildingEmissiveCache.clear();
    this.group = null;
    this.mesh = null;
    this._haloSprite = null;
    this.light = null;
  }
}
