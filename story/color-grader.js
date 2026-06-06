import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export class ColorGrader {
  constructor() {
    this._pass = null;
    this._uniforms = null;
    this._currentPreset = null;
    this._targetUniforms = null;
    this._gsap = window.gsap;
    this._tl = null;
  }

  init(composer, scene, camera) {
    this._composer = composer;
    this._scene = scene;
    this._camera = camera;

    this._uniforms = {
      tDiffuse: { value: null },
      uSaturation: { value: 1.0 },
      uContrast: { value: 1.0 },
      uColorBalance: { value: new THREE.Vector3(1, 1, 1) },
    };

    const vertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      uniform sampler2D tDiffuse;
      uniform float uSaturation;
      uniform float uContrast;
      uniform vec3 uColorBalance;
      varying vec2 vUv;

      void main() {
        vec4 color = texture(tDiffuse, vUv);
        float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
        color.rgb = mix(vec3(gray), color.rgb, uSaturation);
        color.rgb = ((color.rgb - 0.5) * uContrast) + 0.5;
        color.rgb *= uColorBalance;
        gl_FragColor = color;
      }
    `;

    this._pass = new ShaderPass({
      uniforms: this._uniforms,
      vertexShader,
      fragmentShader,
    });
    this._pass.renderToScreen = true;

    composer.addPass(this._pass);
  }

  setPreset(preset, { duration = 0.8 } = {}) {
    if (!preset || !this._uniforms) return;

    if (this._tl) {
      this._tl.kill();
    }

    if (!this._gsap || duration === 0) {
      this._uniforms.uSaturation.value = preset.saturation;
      this._uniforms.uContrast.value = preset.contrast;
      this._uniforms.uColorBalance.value.set(preset.tint[0], preset.tint[1], preset.tint[2]);
      this._composer?.render();
      return;
    }

    const u = this._uniforms;
    const tl = this._gsap.timeline({
      onUpdate: () => {
        u.uColorBalance.value.set(
          u.uColorBalance.value.x,
          u.uColorBalance.value.y,
          u.uColorBalance.value.z
        );
      },
    });

    tl.to(u, { uSaturation: preset.saturation, duration, ease: 'power2.inOut' }, 0);
    tl.to(u, { uContrast: preset.contrast, duration, ease: 'power2.inOut' }, 0);

    const c = u.uColorBalance.value;
    tl.to(c, {
      x: preset.tint[0], y: preset.tint[1], z: preset.tint[2],
      duration, ease: 'power2.inOut',
      onUpdate: () => {
        c.set(c.x, c.y, c.z);
      },
    }, 0);

    this._tl = tl;
    this._currentPreset = preset;
  }

  destroy() {
    if (this._tl) this._tl.kill();
    if (this._pass && this._composer) {
      const idx = this._composer.passes.indexOf(this._pass);
      if (idx >= 0) this._composer.passes.splice(idx, 1);
    }
  }
}
