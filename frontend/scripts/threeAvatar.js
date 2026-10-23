import * as THREE from './vendor/three.module.js';

/**
 * ThreeAvatar — Executive-Grade Fluid Chromatic Speaking Orb
 * Matched to CampusPilot Executive Dashboard Specification
 * 
 * Features:
 * - High-density organic fluid glass sphere with chromatic transmission & subsurface glow
 * - Interior glowing audio-reactive soundwave curve (oscillates with voice frequency)
 * - Concentric holographic projection rings on ground pedestal
 * - Volumetric soft atmospheric back-illumination aura
 * - Real-time state machine: 'idle' | 'listening' | 'thinking' | 'speaking'
 */
export class ThreeAvatar {
  constructor(containerElement) {
    this.container = containerElement;
    this.state = 'idle';
    this.audioLevel = 0;
    this.targetAudioLevel = 0;
    this.time = 0;
    this.isRunning = false;

    this.init();
  }

  init() {
    if (!this.container) return;

    const width = this.container.clientWidth || 320;
    const height = this.container.clientHeight || 320;

    // 1. Scene & Camera Setup
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    this.camera.position.set(0, 0, 4.1);

    // 2. High-Performance WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);

    // 3. Studio Lighting Rig
    this.ambientLight = new THREE.AmbientLight(0x0a1020, 2.0);
    this.scene.add(this.ambientLight);

    // Key Light (Electric Cyan)
    this.keyLight = new THREE.DirectionalLight(0x38bdf8, 3.5);
    this.keyLight.position.set(3.5, 4.0, 3.5);
    this.scene.add(this.keyLight);

    // Rim Light (Vibrant Magenta/Violet)
    this.rimLight = new THREE.DirectionalLight(0xa855f7, 3.0);
    this.rimLight.position.set(-3.5, -2.5, -2.5);
    this.scene.add(this.rimLight);

    // Center Backlight (Soft Core Glow)
    this.backLight = new THREE.PointLight(0x00f2fe, 3.0, 8);
    this.backLight.position.set(0, 0, -1.0);
    this.scene.add(this.backLight);

    // 4. Volumetric Soft Atmospheric Aura
    const haloGeo = new THREE.PlaneGeometry(3.6, 3.6);
    const haloCanvas = document.createElement('canvas');
    haloCanvas.width = 256;
    haloCanvas.height = 256;
    const ctx = haloCanvas.getContext('2d');
    const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 120);
    grad.addColorStop(0.0, 'rgba(56, 189, 248, 0.5)');
    grad.addColorStop(0.35, 'rgba(139, 92, 246, 0.3)');
    grad.addColorStop(0.7, 'rgba(16, 185, 129, 0.1)');
    grad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    const haloTexture = new THREE.CanvasTexture(haloCanvas);
    this.haloMaterial = new THREE.MeshBasicMaterial({
      map: haloTexture,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.halo = new THREE.Mesh(haloGeo, this.haloMaterial);
    this.halo.position.z = -0.5;
    this.scene.add(this.halo);

    // 5. Concentric Holographic Ground Pedestal Rings
    this.ringsGroup = new THREE.Group();
    this.ringsGroup.position.y = -1.45;
    this.ringsGroup.rotation.x = Math.PI / 2.35;

    const ringRadii = [0.85, 1.25, 1.6];
    this.ringMeshes = [];

    ringRadii.forEach((r, idx) => {
      const ringGeo = new THREE.RingGeometry(r - 0.015, r + 0.015, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: idx === 1 ? 0x38bdf8 : 0x818cf8,
        transparent: true,
        opacity: 0.35 - idx * 0.08,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      this.ringMeshes.push(ringMesh);
      this.ringsGroup.add(ringMesh);
    });
    this.scene.add(this.ringsGroup);

    // 6. Outer Organic Fluid Glass Sphere
    const sphereGeo = new THREE.SphereGeometry(1.22, 96, 96);
    this.originalPositions = new Float32Array(sphereGeo.attributes.position.array);

    this.orbMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x060e1d,
      emissive: 0x0284c7,
      emissiveIntensity: 0.5,
      roughness: 0.06,
      metalness: 0.1,
      transmission: 0.82,
      thickness: 1.5,
      ior: 1.54,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      transparent: true,
      opacity: 0.95,
    });

    this.orb = new THREE.Mesh(sphereGeo, this.orbMaterial);
    this.scene.add(this.orb);

    // 7. Inner Bioluminescent Fluid Plasma Core
    const coreGeo = new THREE.SphereGeometry(0.8, 48, 48);
    this.coreMaterial = new THREE.MeshBasicMaterial({
      color: 0x00f2fe,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
    });
    this.core = new THREE.Mesh(coreGeo, this.coreMaterial);
    this.scene.add(this.core);

    // 8. Interior Glowing Audio Soundwave Ribbon
    const wavePointCount = 80;
    const waveGeo = new THREE.BufferGeometry();
    this.wavePositions = new Float32Array(wavePointCount * 3);

    for (let i = 0; i < wavePointCount; i++) {
      const t = (i / (wavePointCount - 1)) * 2 - 1; // -1 to 1
      this.wavePositions[i * 3] = t * 0.9;
      this.wavePositions[i * 3 + 1] = 0;
      this.wavePositions[i * 3 + 2] = 0;
    }
    waveGeo.setAttribute('position', new THREE.BufferAttribute(this.wavePositions, 3));

    this.soundwaveMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      linewidth: 3,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    });
    this.soundwave = new THREE.Line(waveGeo, this.soundwaveMaterial);
    this.soundwave.position.z = 0.15;
    this.scene.add(this.soundwave);

    // Secondary soundwave for luminous depth
    const waveGeo2 = waveGeo.clone();
    this.soundwaveMaterial2 = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      linewidth: 2,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
    });
    this.soundwave2 = new THREE.Line(waveGeo2, this.soundwaveMaterial2);
    this.soundwave2.position.z = 0.05;
    this.scene.add(this.soundwave2);

    // Resize observer
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(this.container);

    this.isRunning = true;
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  onResize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  setState(newState) {
    this.state = newState;
    if (!this.orbMaterial || !this.coreMaterial) return;

    switch (newState) {
      case 'listening':
        this.orbMaterial.emissive.setHex(0x0284c7);
        this.orbMaterial.emissiveIntensity = 0.9;
        this.coreMaterial.color.setHex(0x00f2fe);
        this.coreMaterial.opacity = 0.85;
        this.soundwaveMaterial.color.setHex(0x38bdf8);
        this.haloMaterial.opacity = 0.9;
        this.keyLight.intensity = 4.2;
        this.rimLight.intensity = 3.2;
        break;

      case 'thinking':
        this.orbMaterial.emissive.setHex(0x7c3aed);
        this.orbMaterial.emissiveIntensity = 0.95;
        this.coreMaterial.color.setHex(0xa855f7);
        this.coreMaterial.opacity = 0.85;
        this.soundwaveMaterial.color.setHex(0xc084fc);
        this.haloMaterial.opacity = 0.85;
        this.keyLight.intensity = 2.8;
        this.rimLight.intensity = 4.5;
        break;

      case 'speaking':
        this.orbMaterial.emissive.setHex(0x059669);
        this.orbMaterial.emissiveIntensity = 1.0;
        this.coreMaterial.color.setHex(0x34d399);
        this.coreMaterial.opacity = 0.9;
        this.soundwaveMaterial.color.setHex(0x6ee7b7);
        this.haloMaterial.opacity = 1.0;
        this.rimLight.intensity = 4.8;
        this.keyLight.intensity = 3.8;
        break;

      case 'idle':
      default:
        this.orbMaterial.emissive.setHex(0x0369a1);
        this.orbMaterial.emissiveIntensity = 0.5;
        this.coreMaterial.color.setHex(0x0284c7);
        this.coreMaterial.opacity = 0.6;
        this.soundwaveMaterial.color.setHex(0xffffff);
        this.haloMaterial.opacity = 0.75;
        this.keyLight.intensity = 3.5;
        this.rimLight.intensity = 3.0;
        break;
    }
  }

  setAudioLevel(level) {
    this.targetAudioLevel = Math.max(0, Math.min(level, 1));
  }

  animate() {
    if (!this.isRunning) return;
    requestAnimationFrame(this.animate);

    this.time += 0.018;

    // Smooth audio level interpolation
    this.audioLevel += (this.targetAudioLevel - this.audioLevel) * 0.24;

    // Organic gentle orbital floating
    let rotY = 0.004;
    let rotX = 0.002;

    if (this.state === 'speaking') {
      rotY = 0.01 + this.audioLevel * 0.025;
      rotX = 0.005 + this.audioLevel * 0.012;
    } else if (this.state === 'thinking') {
      rotY = 0.03;
      rotX = 0.012;
    } else if (this.state === 'listening') {
      rotY = 0.007 + this.audioLevel * 0.015;
    }

    this.orb.rotation.y += rotY;
    this.orb.rotation.x += rotX;
    this.core.rotation.y -= rotY * 1.2;

    // Pedestal rings slow rotation
    if (this.ringsGroup) {
      this.ringsGroup.rotation.z += 0.003;
    }

    // Gentle vertical breathing translation
    const floatY = Math.sin(this.time * 1.8) * 0.04;
    this.orb.position.y = floatY;
    this.core.position.y = floatY;
    this.halo.position.y = floatY;
    this.soundwave.position.y = floatY;
    this.soundwave2.position.y = floatY;

    // Fluid Surface Ripple Modulation
    const positions = this.orb.geometry.attributes.position.array;
    const orig = this.originalPositions;
    const vertexCount = positions.length / 3;

    let deformation = 0.032;
    if (this.state === 'speaking') {
      deformation = 0.06 + this.audioLevel * 0.25;
    } else if (this.state === 'listening') {
      deformation = 0.045 + this.audioLevel * 0.18;
    } else if (this.state === 'thinking') {
      deformation = 0.055 + Math.sin(this.time * 4.8) * 0.03;
    }

    for (let i = 0; i < vertexCount; i++) {
      const idx = i * 3;
      const ox = orig[idx];
      const oy = orig[idx + 1];
      const oz = orig[idx + 2];

      const wave1 = Math.sin(ox * 2.4 + this.time * 2.5) * Math.cos(oy * 2.4 + this.time * 2.1);
      const wave2 = Math.sin((ox + oz) * 3.0 - this.time * 3.2) * 0.55;
      const displacement = 1.0 + (wave1 + wave2) * deformation;

      positions[idx] = ox * displacement;
      positions[idx + 1] = oy * displacement;
      positions[idx + 2] = oz * displacement;
    }
    this.orb.geometry.attributes.position.needsUpdate = true;
    this.orb.geometry.computeVertexNormals();

    // Soundwave sine animation (Interior glowing wave)
    const wavePos = this.soundwave.geometry.attributes.position.array;
    const wavePos2 = this.soundwave2.geometry.attributes.position.array;
    const waveLen = wavePos.length / 3;
    const amp = 0.1 + (this.state === 'speaking' ? this.audioLevel * 0.35 : Math.sin(this.time * 2.5) * 0.04);
    const freq = 4.5;

    for (let i = 0; i < waveLen; i++) {
      const x = (i / (waveLen - 1)) * 2 - 1; // -1 to 1
      const envelope = Math.cos((x * Math.PI) / 2); // pinch at ends
      const y = Math.sin(x * freq + this.time * 6.0) * amp * envelope;

      wavePos[i * 3 + 1] = y;
      wavePos2[i * 3 + 1] = Math.sin(x * freq + this.time * 6.0 + 0.5) * amp * envelope * 0.85;
    }
    this.soundwave.geometry.attributes.position.needsUpdate = true;
    this.soundwave2.geometry.attributes.position.needsUpdate = true;

    // Pulse Inner Plasma Core & Atmospheric Aura
    const corePulse = 0.88 + (this.state === 'speaking' ? this.audioLevel * 0.22 : Math.sin(this.time * 2.0) * 0.035);
    this.core.scale.set(corePulse, corePulse, corePulse);

    const haloPulse = 1.0 + (this.state === 'speaking' ? this.audioLevel * 0.18 : Math.sin(this.time * 1.6) * 0.04);
    this.halo.scale.set(haloPulse, haloPulse, 1.0);

    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    this.isRunning = false;
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.renderer && this.renderer.domElement && this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
    if (this.renderer) this.renderer.dispose();
  }
}
