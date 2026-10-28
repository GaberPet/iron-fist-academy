// 3D arena: renderer, Tekken-style side camera, fighters, hit effects. Reads FightEngine state.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { FightEngine, FightEvent, Vec } from '../../core/fight';
import { inRage } from '../../core/fight';
import type { FighterLook } from '../components/arenaRenderer';
import { Fighter3D, glowTexture } from './fighter3d';
import { HumanFighter, MODEL_IDS, PRIVATE_IDS } from './human3d';

type AnyFighter = Fighter3D | HumanFighter;

export function makeFighter(look: FighterLook): AnyFighter {
  if (look.id && PRIVATE_IDS.has(look.id)) return new HumanFighter(look, new URL(`models-private/${look.id}.glb`, document.baseURI).href, true);
  if (look.id && MODEL_IDS.has(look.id)) return new HumanFighter(look, new URL(`models/${look.id}.glb`, document.baseURI).href);
  return new Fighter3D(look);
}
import { poseFor, STANCE, strikeKind } from './anim3d';
import { buildStage, type Stage } from './stage3d';

interface Particle {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  life: number;
  max: number;
  grow: number;
  gravity: number;
}

let ringTex: THREE.Texture | null = null;
function ringTexture() {
  if (ringTex) return ringTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.strokeStyle = 'rgba(255,255,255,1)';
  g.lineWidth = 10;
  g.shadowColor = 'white';
  g.shadowBlur = 16;
  g.beginPath();
  g.arc(64, 64, 48, 0, Math.PI * 2);
  g.stroke();
  ringTex = new THREE.CanvasTexture(c);
  return ringTex;
}
let streakTex: THREE.Texture | null = null;
function streakTexture() {
  if (streakTex) return streakTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.translate(64, 64);
  for (let i = 0; i < 12; i++) {
    g.rotate((Math.PI * 2) / 12);
    const gr = g.createLinearGradient(0, 0, 60, 0);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(6, -3);
    g.lineTo(60 * (0.6 + Math.random() * 0.4), 0);
    g.lineTo(6, 3);
    g.fill();
  }
  streakTex = new THREE.CanvasTexture(c);
  return streakTex;
}

export class Arena3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.1, 900);
  readonly stage: Stage;
  fighters: [AnyFighter, AnyFighter];
  private particles: Particle[] = [];
  private shake = 0;
  private camAngle: number | null = null;
  private camPos = new THREE.Vector3(0, 1.6, 6);
  private camLook = new THREE.Vector3(0, 1, 0);
  private walkPhase: [number, number] = [0, 0];
  private lastPos: [Vec, Vec] | null = null;
  private shocks: { mesh: THREE.Mesh; age: number }[] = [];
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private trailTick = 0;

  constructor(canvas: HTMLCanvasElement, looks: [FighterLook, FighterLook]) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.stage = buildStage(this.renderer);
    this.fighters = [makeFighter(looks[0]), makeFighter(looks[1])];
    for (const f of this.fighters) {
      f.snap(STANCE);
      this.stage.scene.add(f.root);
    }
    try {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.stage.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(640, 360), 0.55, 0.5, 0.82);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    } catch {
      this.composer = null; // plain rendering
    }
  }

  /** Swap a fighter's look (e.g. the Dojo bot changes character between rounds). */
  setLook(i: 0 | 1, look: FighterLook) {
    const old = this.fighters[i];
    this.stage.scene.remove(old.root);
    old.dispose();
    const f = makeFighter(look);
    f.snap(STANCE);
    this.fighters[i] = f;
    this.stage.scene.add(f.root);
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.bloom?.resolution.set(w / 2, h / 2);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Engine position (cm) + height (cm) -> world (m). */
  world(p: Vec, y = 0) {
    return new THREE.Vector3(p.x / 100, y / 100, p.z / 100);
  }

  /** Screen position (px in the canvas) of a world point. */
  project(v: THREE.Vector3, w: number, h: number) {
    const p = v.clone().project(this.camera);
    return { x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * h, visible: p.z < 1 };
  }

  projectXYZ(x: number, y: number, z: number, w: number, h: number) {
    return this.project(new THREE.Vector3(x, y, z), w, h);
  }

  events(ev: FightEvent[], e: FightEngine) {
    for (const x of ev) {
      const at = x.at ? this.world(x.at, x.y ?? 100) : null;
      switch (x.type) {
        case 'hit':
          if (at) this.burst(at, x.level === 'throw' ? '#ffffff' : '#ffb347', 18, 1.0);
          this.shake = Math.max(this.shake, (x.damage ?? 10) >= 20 ? 0.09 : 0.05);
          break;
        case 'counter':
          if (at) this.burst(at, '#ff4d4d', 26, 1.5);
          this.shake = 0.12;
          break;
        case 'block':
          if (at) this.ring(at, '#6fb8ff', 0.6);
          if (at) this.burst(at, '#9fd0ff', 8, 0.6);
          this.shake = Math.max(this.shake, 0.025);
          break;
        case 'launch':
          if (at) this.burst(at, '#ffd36a', 22, 1.3);
          break;
        case 'wall':
          if (at) {
            this.burst(at, '#ffffff', 30, 1.6);
            this.stage.crack(at.x, at.z);
          }
          this.shake = 0.16;
          break;
        case 'tornado':
          if (at) this.ring(at, '#ffd36a', 1.1);
          break;
        case 'heat':
        case 'heat-smash':
        case 'heat-dash': {
          const f = e.f[x.by ?? 0];
          this.shockwave(this.world(f.pos, 2), '#3aa0ff');
          this.burst(this.world(f.pos, 110), '#7cc4ff', 30, 1.4);
          break;
        }
        case 'rage-art': {
          const f = e.f[x.by ?? 0];
          this.shockwave(this.world(f.pos, 2), '#ff2a2a');
          this.burst(this.world(f.pos, 110), '#ff5a5a', 34, 1.6);
          this.shake = 0.12;
          break;
        }
        case 'armor':
        case 'crush':
          if (at) this.ring(at, '#3cff9e', 0.8);
          break;
        case 'throw':
        case 'break':
          if (at) this.ring(at, '#ffffff', 0.7);
          break;
        case 'balcony':
          if (at) {
            this.burst(at, '#ffffff', 40, 2);
            this.ring(at, '#ffd36a', 1.6);
          }
          this.shake = 0.22;
          break;
        case 'parry':
          if (at) {
            this.ring(at, '#ffd36a', 1);
            this.burst(at, '#ffd36a', 16, 1);
          }
          break;
        case 'tech':
          if (x.at) this.dust(this.world(x.at, 5));
          break;
        case 'ko':
          this.shake = 0.2;
          break;
      }
    }
  }

  private sprite(color: string, tex: THREE.Texture, size: number) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.scale.setScalar(size);
    this.stage.scene.add(s);
    return s;
  }

  private burst(at: THREE.Vector3, color: string, n: number, power: number) {
    const flash = this.sprite(color, streakTexture(), 0.5 * power);
    flash.position.copy(at);
    this.particles.push({ sprite: flash, vel: new THREE.Vector3(), life: 0, max: 9, grow: 0.12 * power, gravity: 0 });
    for (let i = 0; i < n; i++) {
      const s = this.sprite(color, glowTexture(), 0.05 + Math.random() * 0.06);
      s.position.copy(at);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(0.03 + Math.random() * 0.06 * power);
      this.particles.push({ sprite: s, vel: v, life: 0, max: 14 + Math.random() * 12, grow: 0, gravity: 0.002 });
    }
  }

  private ring(at: THREE.Vector3, color: string, size: number) {
    const s = this.sprite(color, ringTexture(), 0.2);
    s.position.copy(at);
    this.particles.push({ sprite: s, vel: new THREE.Vector3(), life: 0, max: 12, grow: 0.09 * size, gravity: 0 });
  }

  private dust(at: THREE.Vector3) {
    for (let i = 0; i < 10; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#b8a8a0', transparent: true, opacity: 0.35, depthWrite: false }));
      s.position.copy(at);
      s.scale.setScalar(0.2);
      this.stage.scene.add(s);
      this.particles.push({ sprite: s, vel: new THREE.Vector3((Math.random() - 0.5) * 0.03, 0.006, (Math.random() - 0.5) * 0.03), life: 0, max: 30, grow: 0.015, gravity: 0 });
    }
  }

  private debris(at: THREE.Vector3) {
    const mat = new THREE.MeshStandardMaterial({ color: '#2a2a32', metalness: 0.8, roughness: 0.4 });
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.4 + Math.random() * 0.8, 6), mat);
      m.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 0.5, (Math.random() - 0.5) * 3));
      m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      this.stage.scene.add(m);
      const vel = at.clone().setY(0).normalize().multiplyScalar(0.05 + Math.random() * 0.06).add(new THREE.Vector3(0, 0.08 + Math.random() * 0.06, 0));
      this.pieces.push({ mesh: m, vel, age: 0 });
    }
  }
  private pieces: { mesh: THREE.Mesh; vel: THREE.Vector3; age: number }[] = [];

  private shockwave(at: THREE.Vector3, color: string) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.55, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.copy(at);
    this.stage.scene.add(m);
    this.shocks.push({ mesh: m, age: 0 });
  }

  /** Render one frame from the engine state. */
  render(e: FightEngine, now: number) {
    const [p, b] = e.f;
    // walk phase from distance travelled
    if (this.lastPos) {
      for (const i of [0, 1] as const) {
        const d = Math.hypot(e.f[i].pos.x - this.lastPos[i].x, e.f[i].pos.z - this.lastPos[i].z);
        this.walkPhase[i] += d * 0.09;
      }
    }
    this.lastPos = [{ ...p.pos }, { ...b.pos }];

    for (const i of [0, 1] as const) {
      const x = e.f[i];
      const fig = this.fighters[i];
      const a = poseFor(e, x, now, this.walkPhase[i], fig.look.style);
      fig.apply(a.pose, a.k);
      fig.root.position.set(x.pos.x / 100, 0, x.pos.z / 100);
      fig.root.position.y = a.lift;
      fig.root.rotation.y = Math.atan2(x.facing.x, x.facing.z);
      fig.setAura(x.heat === 'active' ? 'heat' : inRage(x) ? 'rage' : null, now);
      fig.flash(now - x.lastHit < 3 && now >= x.lastHit);
      // motion trail on the striking limb around the active frames
      if (x.state === 'attack' && x.move && !x.move.isThrow && now >= x.hitAt - 3 && now <= x.hitAt + 2 && this.trailTick++ % 1 === 0) {
        const kind = strikeKind(x.move);
        const limb = /Kick|sweep|knee/i.test(kind) ? (/L$/.test(kind) ? 'lFoot' : 'rFoot') : /hookL|jab/.test(kind) ? 'lHand' : 'rHand';
        const wp = fig.jointWorld(limb as 'lHand');
        const s = this.sprite(x.heat === 'active' ? '#7cc4ff' : '#fff2d8', glowTexture(), 0.22);
        s.position.copy(wp);
        (s.material as THREE.SpriteMaterial).opacity = 0.5;
        this.particles.push({ sprite: s, vel: new THREE.Vector3(), life: 0, max: 8, grow: -0.015, gravity: 0 });
      }
    }

    // ----- camera: side view perpendicular to the fighters' axis -----
    const mid = new THREE.Vector3((p.pos.x + b.pos.x) / 200, 0, (p.pos.z + b.pos.z) / 200);
    const fg = e.foreground;
    const want = Math.atan2(fg.x, fg.z);
    if (this.camAngle === null) this.camAngle = want;
    let da = want - this.camAngle;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    this.camAngle += da * 0.08;
    const tall = Math.max(this.fighters[0].H, this.fighters[1].H);
    const dist = Math.max(4.7, Math.min(8.5, 3.4 + (e.distance / 100) * 1.3)) * (0.75 + tall * 0.25);
    let target = new THREE.Vector3(mid.x + Math.sin(this.camAngle) * dist, 1.45 + dist * 0.06, mid.z + Math.cos(this.camAngle) * dist);
    let look = new THREE.Vector3(mid.x, 1.22 * tall, mid.z);
    // cinematics: Heat Burst / Rage Art flash zooms on the attacker, K.O. orbits slowly
    if (e.freeze > 8) {
      const who = e.f.find((x) => x.state === 'attack' && x.move && /Heat Burst|Rage Art/.test(x.move.notes)) ?? null;
      if (who) {
        const wp = this.world(who.pos, 0);
        target = new THREE.Vector3(wp.x + Math.sin(this.camAngle + 0.5) * 2.3, 1.3, wp.z + Math.cos(this.camAngle + 0.5) * 2.3);
        look = new THREE.Vector3(wp.x, 1.2, wp.z);
      }
    }
    if (e.phase === 'ko' || e.phase === 'over') {
      const t = (now - e.phaseAt) / 160;
      const ang = this.camAngle + t * 0.9;
      target = new THREE.Vector3(mid.x + Math.sin(ang) * (dist + 0.5), 1.6, mid.z + Math.cos(ang) * (dist + 0.5));
    }
    if (e.phase === 'intro') {
      const t = Math.min(1, (now - e.phaseAt) / 100);
      const ang = this.camAngle - (1 - t) * 1.2;
      target = new THREE.Vector3(mid.x + Math.sin(ang) * (dist + 2 * (1 - t)), 1.4 + (1 - t) * 0.8, mid.z + Math.cos(ang) * (dist + 2 * (1 - t)));
    }
    this.camPos.lerp(target, 0.12);
    this.camLook.lerp(look, 0.15);
    this.camera.position.copy(this.camPos);
    if (this.shake > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake *= 0.82;
    }
    this.camera.lookAt(this.camLook);
    // shadow camera follows the action
    this.stage.sun.position.set(mid.x - 30, 18, mid.z - 45);
    this.stage.sun.target.position.copy(mid);
    this.stage.sun.target.updateMatrixWorld();

    // broken railings (and their debris)
    const broke = (e as { broken?: boolean[] }).broken;
    if (broke) for (const i of this.stage.setBroken(broke)) this.debris(this.stage.railCenter(i));

    // ----- effects -----
    for (const pt of this.particles) {
      pt.life++;
      pt.vel.y -= pt.gravity;
      pt.sprite.position.add(pt.vel);
      pt.sprite.scale.addScalar(pt.grow);
      (pt.sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - pt.life / pt.max);
    }
    for (const pt of this.particles.filter((x) => x.life >= x.max)) {
      this.stage.scene.remove(pt.sprite);
      pt.sprite.material.dispose();
    }
    this.particles = this.particles.filter((x) => x.life < x.max);
    for (const s of this.shocks) {
      s.age++;
      s.mesh.scale.setScalar(1 + s.age * 0.35);
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - s.age / 30);
    }
    for (const s of this.shocks.filter((x) => x.age > 30)) {
      this.stage.scene.remove(s.mesh);
      s.mesh.geometry.dispose();
    }
    this.shocks = this.shocks.filter((x) => x.age <= 30);
    for (const pc of this.pieces) {
      pc.age++;
      pc.vel.y -= 0.006;
      pc.mesh.position.add(pc.vel);
      pc.mesh.rotation.x += 0.2;
      pc.mesh.rotation.z += 0.13;
    }
    for (const pc of this.pieces.filter((x) => x.age > 90)) {
      this.stage.scene.remove(pc.mesh);
      pc.mesh.geometry.dispose();
    }
    this.pieces = this.pieces.filter((x) => x.age <= 90);

    this.stage.update(performance.now());
    if (this.composer) this.composer.render();
    else this.renderer.render(this.stage.scene, this.camera);
  }

  dispose() {
    this.fighters.forEach((f) => f.dispose());
    this.renderer.dispose();
  }
}
