import * as THREE from 'three';

export class CameraRig {
  constructor() {
    this._refs = null;
    this._gsap = window.gsap;
    this._timeline = null;
    this._chaseActive = false;
    this._chaseTarget = new THREE.Vector3();
    this._chaseLookAt = new THREE.Vector3();
    this._chaseOffset = new THREE.Vector3();
    this._chasePos = new THREE.Vector3();
    this._targetPos = new THREE.Vector3();
    this._microShake = { x: 0, y: 0, z: 0 };
    this._shakeTime = 0;
    this._dollyZoomFired = false;
  }

  setRefs(refs) {
    this._refs = refs;
  }

  animateTo(beatCamera, { duration = 3.5, ease = 'power3.inOut' } = {}) {
    if (!this._gsap || !this._refs) return;
    if (this._timeline) this._timeline.kill();

    // When animating to a new beat, disable chase first
    this._chaseActive = false;

    const cam = this._refs.camera;

    if (beatCamera.pos) {
      const pos = new THREE.Vector3(beatCamera.pos[0], beatCamera.pos[1], beatCamera.pos[2]);
      const target = new THREE.Vector3(beatCamera.target[0], beatCamera.target[1], beatCamera.target[2]);

      // Store for chase mode after establishing shot
      this._chaseOffset.copy(pos).sub(target);
      this._targetPos.copy(target);

      const tl = this._gsap.timeline({
        onUpdate: () => {
          cam.lookAt(target);
          this._refs.scheduleRender();
        },
        onComplete: () => {
          // Enter chase mode after establishing shot
          this._chasePos.copy(cam.position);
          this._chaseLookAt.copy(target);
          this._chaseActive = true;
        },
      });

      tl.to(cam.position, {
        x: pos.x, y: pos.y, z: pos.z,
        duration, ease,
      }, 0);

      this._timeline = tl;
    } else {
      const tweenTarget = {};
      if (beatCamera.radius != null) tweenTarget.radius = beatCamera.radius;
      if (beatCamera.polar != null) tweenTarget.polar = beatCamera.polar;
      if (beatCamera.azimuth != null) tweenTarget.azimuth = beatCamera.azimuth;

      const tweenCamTarget = {};
      if (beatCamera.targetX != null) tweenCamTarget.x = beatCamera.targetX;
      if (beatCamera.targetY != null) tweenCamTarget.y = beatCamera.targetY;
      if (beatCamera.targetZ != null) tweenCamTarget.z = beatCamera.targetZ;

      const tl = this._gsap.timeline({
        onUpdate: () => {
          this._refs.applyCamera();
          this._refs.scheduleRender();
        },
      });

      if (Object.keys(tweenTarget).length) {
        tl.to(this._refs.camState, { ...tweenTarget, duration, ease }, 0);
      }
      if (Object.keys(tweenCamTarget).length) {
        tl.to(this._refs.camTarget, { ...tweenCamTarget, duration, ease }, 0);
      }

      this._timeline = tl;
    }

    return this._timeline;
  }

  updateChase(orbPos, delta) {
    if (!this._chaseActive || !this._refs) return;

    const cam = this._refs.camera;

    // Compute desired camera position: orbPos + offset (behind/above)
    const desiredPos = new THREE.Vector3().copy(orbPos).add(this._chaseOffset);

    // Lerp toward desired position with friction (handheld feel)
    const lerpSpeed = 2.5;
    this._chasePos.lerp(desiredPos, Math.min(1, lerpSpeed * delta));

    // Look at the orb target with slight lerp
    const lookTarget = new THREE.Vector3().copy(orbPos);
    this._chaseLookAt.lerp(lookTarget, Math.min(1, lerpSpeed * 0.8 * delta));

    // Micro-shake (sinusoidal handheld micro-movements)
    this._shakeTime += delta;
    const shakeIntensity = 0.04;
    this._microShake.x = Math.sin(this._shakeTime * 7.3) * shakeIntensity;
    this._microShake.y = Math.cos(this._shakeTime * 5.1) * shakeIntensity * 0.5;
    this._microShake.z = Math.sin(this._shakeTime * 3.7) * shakeIntensity * 0.3;

    // Apply position with shake
    cam.position.copy(this._chasePos);
    cam.position.x += this._microShake.x;
    cam.position.y += this._microShake.y;
    cam.position.z += this._microShake.z;

    // Look at orb
    cam.lookAt(this._chaseLookAt);

    this._refs.scheduleRender?.();
  }

  enableChase(orbPos, beatCamera) {
    if (!this._refs) return;
    this._chaseActive = true;
    const cam = this._refs.camera;

    if (beatCamera.pos) {
      const target = new THREE.Vector3(beatCamera.target[0], beatCamera.target[1], beatCamera.target[2]);
      const pos = new THREE.Vector3(beatCamera.pos[0], beatCamera.pos[1], beatCamera.pos[2]);
      this._chaseOffset.copy(pos).sub(target);
    } else {
      // Fallback: derive offset from current camera position relative to target
      this._chaseOffset.copy(cam.position).sub(this._chaseLookAt);
    }

    this._chasePos.copy(cam.position);
    this._chaseLookAt.copy(orbPos || this._chaseLookAt);
    this._targetPos.copy(orbPos || this._chaseLookAt);
  }

  disableChase() {
    this._chaseActive = false;
  }

  dollyZoom(beatCamera, { fovFrom = 40, fovTo = 15, duration = 1.8 } = {}) {
    if (this._dollyZoomFired) return Promise.resolve();
    this._dollyZoomFired = true;

    if (!this._gsap || !this._refs) return Promise.resolve();
    if (this._timeline) this._timeline.kill();
    this._chaseActive = false;

    const cam = this._refs.camera;
    const tl = this._gsap.timeline({
      onUpdate: () => {
        cam.updateProjectionMatrix();
        if (beatCamera?.target) {
          cam.lookAt(new THREE.Vector3(beatCamera.target[0], beatCamera.target[1], beatCamera.target[2]));
        }
        this._refs.scheduleRender();
      },
    });

    // Simultaneously dolly position along view axis AND FOV the opposite way
    if (beatCamera?.pos) {
      const pos = new THREE.Vector3(beatCamera.pos[0], beatCamera.pos[1], beatCamera.pos[2]);
      const backward = pos.clone().add(new THREE.Vector3(0, 0, 6));
      tl.to(cam.position, {
        x: backward.x, y: backward.y, z: backward.z,
        duration, ease: 'power2.inOut',
      }, 0);
    }

    tl.to(cam, {
      fov: fovTo,
      duration, ease: 'power2.inOut',
    }, 0);

    // Reset FOV after the beat
    tl.to(cam, {
      fov: 40,
      duration: 0.8, ease: 'power2.out',
    }, `+=0.4`);

    this._timeline = tl;
    return tl;
  }

  isChaseActive() {
    return this._chaseActive;
  }

  kill() {
    this._chaseActive = false;
    this._dollyZoomFired = false;
    if (this._timeline) {
      this._timeline.kill();
      this._timeline = null;
    }
  }
}
