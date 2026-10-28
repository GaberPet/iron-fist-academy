// 3D stage: a rooftop arena at sunset over a city. Everything is procedural (no assets).
import * as THREE from 'three';
import { ARENA } from '../../core/fight';
import { glowTexture } from './fighter3d';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}

export interface Stage {
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
  update(t: number): void;
  /** Crack the wall where a fighter splatted (world position, metres). */
  crack(x: number, z: number): void;
  /** Show which railing sections are broken (0 = -x, 1 = +x, 2 = -z, 3 = +z). Returns sections that just broke. */
  setBroken(flags: boolean[]): number[];
  /** World centre of a railing section. */
  railCenter(i: number): THREE.Vector3;
}

export function buildStage(renderer?: THREE.WebGLRenderer): Stage {
  const scene = new THREE.Scene();
  if (renderer) {
    // soft image-based lighting so skin, cloth and metal pick up believable reflections
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.28;
    pmrem.dispose();
  }
  const r = rng(8128);
  const A = ARENA / 100; // walls at +-A metres

  // ----- sky dome with a sunset gradient + sun -----
  const skyGeo = new THREE.SphereGeometry(400, 32, 20);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { sunDir: { value: new THREE.Vector3(-0.55, 0.08, -0.83).normalize() } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      varying vec3 vDir; uniform vec3 sunDir;
      void main(){
        float h = clamp(vDir.y, -0.2, 1.0);
        vec3 top = vec3(0.04,0.05,0.16);
        vec3 mid = vec3(0.30,0.16,0.36);
        vec3 low = vec3(0.98,0.48,0.28);
        vec3 col = mix(low, mid, smoothstep(0.0, 0.22, h));
        col = mix(col, top, smoothstep(0.2, 0.75, h));
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        col += vec3(1.0,0.65,0.35) * pow(s, 12.0) * 0.9 + vec3(1.0,0.85,0.6) * pow(s, 400.0) * 3.0;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));
  // stars
  const starPos: number[] = [];
  for (let i = 0; i < 500; i++) {
    const a = r() * Math.PI * 2, e = 0.35 + r() * 1.1;
    starPos.push(Math.cos(a) * Math.cos(e) * 380, Math.sin(e) * 380, Math.sin(a) * Math.cos(e) * 380);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 1.2, sizeAttenuation: false, transparent: true, opacity: 0.7 })));

  scene.fog = new THREE.Fog('#4a2a4a', 40, 260);

  // ----- lights -----
  scene.add(new THREE.HemisphereLight('#8a7ab8', '#2a1c24', 0.9));
  const sun = new THREE.DirectionalLight('#ffb070', 2.6);
  sun.position.set(-30, 18, -45);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -10;
  sun.shadow.camera.right = 10;
  sun.shadow.camera.top = 10;
  sun.shadow.camera.bottom = -10;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  const rim = new THREE.DirectionalLight('#6fa8ff', 0.9);
  rim.position.set(25, 12, 30);
  scene.add(rim);
  const fill = new THREE.PointLight('#ffd2a0', 18, 30, 1.6);
  fill.position.set(0, 6, 6);
  scene.add(fill);

  // ----- city: instanced towers with lit windows -----
  const winTex = canvasTex(64, 128, (g) => {
    g.fillStyle = '#0d0b18';
    g.fillRect(0, 0, 64, 128);
    for (let y = 4; y < 124; y += 8) for (let x = 4; x < 60; x += 8) {
      if (r() < 0.32) {
        g.fillStyle = r() < 0.8 ? `rgba(255,${190 + Math.floor(r() * 40)},120,${0.6 + r() * 0.4})` : 'rgba(150,210,255,0.8)';
        g.fillRect(x, y, 4, 5);
      }
    }
  });
  winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;
  const towerMat = new THREE.MeshStandardMaterial({ color: '#1a1628', roughness: 0.8, metalness: 0.2, emissive: '#ffffff', emissiveMap: winTex, emissiveIntensity: 1.1, map: winTex });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const N = 260;
  const towers = new THREE.InstancedMesh(box, towerMat, N);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < N; i++) {
    const a = r() * Math.PI * 2;
    const d = 45 + Math.pow(r(), 0.7) * 170;
    const w = 6 + r() * 14, dd = 6 + r() * 14, h = 10 + Math.pow(r(), 1.6) * 90;
    m4.compose(new THREE.Vector3(Math.cos(a) * d, h / 2 - 30, Math.sin(a) * d), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI), new THREE.Vector3(w, h, dd));
    towers.setMatrixAt(i, m4);
  }
  scene.add(towers);
  // red aircraft-warning lights on the tallest towers
  const blinkers: THREE.Sprite[] = [];
  for (let i = 0; i < 8; i++) {
    const a = r() * Math.PI * 2, d = 60 + r() * 90;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ff3030', blending: THREE.AdditiveBlending, depthWrite: false }));
    s.position.set(Math.cos(a) * d, 40 + r() * 30, Math.sin(a) * d);
    s.scale.setScalar(3);
    scene.add(s);
    blinkers.push(s);
  }

  // ----- the rooftop: building block, floor, parapet walls, railings -----
  const building = new THREE.Mesh(new THREE.BoxGeometry(A * 2 + 4, 30, A * 2 + 4), new THREE.MeshStandardMaterial({ color: '#2a2430', roughness: 0.9, map: winTex, emissive: '#ffffff', emissiveMap: winTex, emissiveIntensity: 0.6 }));
  building.position.y = -15.01;
  scene.add(building);
  const floorTex = canvasTex(512, 512, (g) => {
    g.fillStyle = '#4a4248';
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 9000; i++) {
      const c = 60 + Math.floor(r() * 50);
      g.fillStyle = `rgba(${c},${c - 6},${c - 2},${0.25 + r() * 0.3})`;
      g.fillRect(r() * 512, r() * 512, 1 + r() * 2, 1 + r() * 2);
    }
    g.strokeStyle = 'rgba(15,12,18,0.7)';
    g.lineWidth = 3;
    for (let k = 0; k <= 512; k += 128) {
      g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 512); g.stroke();
      g.beginPath(); g.moveTo(0, k); g.lineTo(512, k); g.stroke();
    }
    // stains
    for (let i = 0; i < 14; i++) {
      const gr = g.createRadialGradient(r() * 512, r() * 512, 2, r() * 512, r() * 512, 40 + r() * 60);
      gr.addColorStop(0, 'rgba(20,16,22,0.25)');
      gr.addColorStop(1, 'rgba(20,16,22,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 512, 512);
    }
  }, [A, A]);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(A * 2 + 4, A * 2 + 4), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.92, metalness: 0.05 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  // painted helipad ring + H
  const padTex = canvasTex(1024, 1024, (g) => {
    g.clearRect(0, 0, 1024, 1024);
    g.strokeStyle = 'rgba(255,190,60,0.55)';
    g.lineWidth = 26;
    g.setLineDash([120, 36]);
    g.beginPath();
    g.arc(512, 512, 440, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = 'rgba(240,240,240,0.18)';
    g.font = 'bold 420px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('H', 512, 530);
    // scuffs
    for (let i = 0; i < 2600; i++) {
      g.clearRect(r() * 1024, r() * 1024, 2 + r() * 6, 1 + r() * 3);
    }
  });
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshStandardMaterial({ map: padTex, transparent: true, roughness: 0.9, depthWrite: false }));
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.005;
  pad.receiveShadow = true;
  scene.add(pad);

  const wallMat = new THREE.MeshStandardMaterial({ color: '#57494f', roughness: 0.85 });
  const capMat = new THREE.MeshStandardMaterial({ color: '#8a7a78', roughness: 0.7 });
  const railMat = new THREE.MeshStandardMaterial({ color: '#2a2a32', roughness: 0.35, metalness: 0.85 });
  const wallH = 1.0;
  const rails: THREE.Group[] = [new THREE.Group(), new THREE.Group(), new THREE.Group(), new THREE.Group()];
  rails.forEach((g) => scene.add(g));
  const railCenters = [new THREE.Vector3(-A - 0.15, 1.5, 0), new THREE.Vector3(A + 0.15, 1.5, 0), new THREE.Vector3(0, 1.5, -A - 0.15), new THREE.Vector3(0, 1.5, A + 0.15)];
  const sideOf = [2, 3, 0, 1];
  let wi = 0;
  for (const [x, z, w, d] of [[0, -A - 0.15, A * 2 + 0.6, 0.3], [0, A + 0.15, A * 2 + 0.6, 0.3], [-A - 0.15, 0, 0.3, A * 2], [A + 0.15, 0, 0.3, A * 2]] as const) {
    const rail = rails[sideOf[wi++]];
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), wallMat);
    wall.position.set(x, wallH / 2, z);
    wall.castShadow = wall.receiveShadow = true;
    scene.add(wall);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.08, d + 0.08), capMat);
    cap.position.set(x, wallH + 0.04, z);
    cap.receiveShadow = true;
    scene.add(cap);
    // railing posts + bar
    const long = w > d;
    const span = long ? w : d;
    for (let k = -span / 2 + 0.2; k <= span / 2 - 0.2; k += 1.4) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 8), railMat);
      post.position.set(long ? x + k : x, wallH + 0.5, long ? z : z + k);
      post.castShadow = true;
      rail.add(post);
    }
    for (const yy of [wallH + 0.95, wallH + 0.5]) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, span, 8), railMat);
      bar.rotation.z = long ? Math.PI / 2 : 0;
      bar.rotation.x = long ? 0 : Math.PI / 2;
      bar.position.set(x, yy, z);
      rail.add(bar);
    }
  }
  // props outside the fighting area (corners): AC units, a water tank, an antenna
  const ac = (x: number, z: number) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.9), new THREE.MeshStandardMaterial({ color: '#7a7480', roughness: 0.6, metalness: 0.3 }));
    body.position.y = 0.45;
    body.castShadow = true;
    g.add(body);
    const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.05, 20), new THREE.MeshStandardMaterial({ color: '#1a1820' }));
    fan.position.set(0, 0.92, 0);
    g.add(fan);
    g.position.set(x, 0, z);
    scene.add(g);
  };
  ac(-A - 2.2, -A + 1.5);
  ac(-A - 2.2, -A + 3.2);
  ac(A + 2.2, A - 2);
  const tank = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#7a4a32', roughness: 0.9 });
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.5, 2.6, 24), wood);
  barrel.position.y = 4.3;
  barrel.castShadow = true;
  tank.add(barrel);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.9, 24), new THREE.MeshStandardMaterial({ color: '#3a2a24', roughness: 0.8 }));
  roof.position.y = 6.05;
  tank.add(roof);
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3, 8), railMat);
    leg.position.set(lx, 1.5, lz);
    tank.add(leg);
  }
  tank.position.set(A + 4, 0, -A - 3);
  scene.add(tank);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 9, 8), railMat);
  mast.position.set(-A - 3, 4.5, A + 2.5);
  scene.add(mast);
  const mastLight = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ff3030', blending: THREE.AdditiveBlending, depthWrite: false }));
  mastLight.position.set(-A - 3, 9.1, A + 2.5);
  mastLight.scale.setScalar(1.6);
  scene.add(mastLight);
  // a neon sign on the neighbouring rooftop
  const neon = canvasTex(512, 128, (g) => {
    g.fillStyle = '#0a0812';
    g.fillRect(0, 0, 512, 128);
    g.font = 'bold 84px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = '#ff3d7a';
    g.shadowBlur = 24;
    g.fillStyle = '#ff7aa8';
    g.fillText('IRON FIST', 256, 66);
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshBasicMaterial({ map: neon, transparent: true }));
  sign.position.set(4, 7, -A - 14);
  scene.add(sign);
  const signLight = new THREE.PointLight('#ff3d7a', 25, 18, 1.8);
  signLight.position.set(4, 6, -A - 11);
  scene.add(signLight);

  // wall cracks (decals) on splats
  const crackTex = canvasTex(128, 128, (g) => {
    g.strokeStyle = 'rgba(10,8,12,0.9)';
    g.lineWidth = 3;
    for (let i = 0; i < 9; i++) {
      g.beginPath();
      g.moveTo(64, 64);
      let x = 64, y = 64;
      const a = (i / 9) * Math.PI * 2;
      for (let k = 0; k < 4; k++) {
        x += Math.cos(a + (Math.random() - 0.5)) * 14;
        y += Math.sin(a + (Math.random() - 0.5)) * 14;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  });
  const crackMat = new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, depthWrite: false });
  const cracks: THREE.Mesh[] = [];

  const broken = [false, false, false, false];
  return {
    scene,
    sun,
    setBroken(flags: boolean[]) {
      const now: number[] = [];
      flags.forEach((b, i) => {
        if (b && !broken[i]) now.push(i);
        broken[i] = b;
        rails[i].visible = !b;
      });
      return now;
    },
    railCenter(i: number) {
      return railCenters[i].clone();
    },
    update(t: number) {
      const on = Math.floor(t / 900) % 2 === 0;
      mastLight.visible = on;
      blinkers.forEach((b, i) => (b.visible = Math.floor(t / 700 + i) % 2 === 0));
      signLight.intensity = 22 + Math.sin(t / 90) * 2 + (Math.random() < 0.01 ? -15 : 0);
    },
    crack(x: number, z: number) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), crackMat);
      const ax = Math.abs(x) > Math.abs(z);
      m.position.set(ax ? Math.sign(x) * (A + 0.0) : x, 0.6, ax ? z : Math.sign(z) * (A + 0.0));
      m.lookAt(0, 0.6, 0);
      scene.add(m);
      cracks.push(m);
      if (cracks.length > 6) scene.remove(cracks.shift()!);
    },
  };
}
