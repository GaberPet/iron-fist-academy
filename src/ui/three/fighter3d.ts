// Procedural 3D fighter: a jointed body built from lathe-turned "muscle" segments, with
// clothing, hair and face, driven by joint-angle poses. Original look (no game assets):
// build, height, hair, outfit cut and colours come from fighterLooks.
import * as THREE from 'three';
import type { FighterLook } from '../components/arenaRenderer';

export type Joint =
  | 'hips' | 'spine' | 'chest' | 'neck' | 'head'
  | 'lSh' | 'lEl' | 'lHand' | 'rSh' | 'rEl' | 'rHand'
  | 'lHip' | 'lKnee' | 'lFoot' | 'rHip' | 'rKnee' | 'rFoot';

export type Euler3 = [number, number, number];

/** A pose: joint rotations in degrees (x, y, z), hip height offset and whole-body tilt / lift (metres). */
export interface Pose3 {
  j: Partial<Record<Joint, Euler3>>;
  hipY?: number;
  root?: Euler3; // body rotation around the hips (degrees)
  lift?: number; // extra height of the hips (m)
  side?: number; // sideways offset (m), for rolls
}

export const JOINTS: Joint[] = ['hips', 'spine', 'chest', 'neck', 'head', 'lSh', 'lEl', 'lHand', 'rSh', 'rEl', 'rHand', 'lHip', 'lKnee', 'lFoot', 'rHip', 'rKnee', 'rFoot'];
const D2R = Math.PI / 180;

/** Lathe-turned segment hanging down from its joint: `radii` from top to bottom (m). */
function organ(length: number, radii: number[], seg = 14): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [new THREE.Vector2(0.0001, 0)];
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const f = t * (radii.length - 1);
    const k = Math.min(radii.length - 2, Math.floor(f));
    const u = f - k;
    const s = u * u * (3 - 2 * u);
    const r = radii[k] + (radii[k + 1] - radii[k]) * s;
    pts.push(new THREE.Vector2(r, -t * length));
  }
  pts.push(new THREE.Vector2(0.0001, -length));
  const g = new THREE.LatheGeometry(pts, seg);
  g.computeVertexNormals();
  return g;
}

function mat(color: string, rough = 0.75, metal = 0, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: rough, metalness: metal, ...extra });
}

export class Fighter3D {
  readonly root = new THREE.Group();
  readonly joints = {} as Record<Joint, THREE.Object3D>;
  private body = new THREE.Group(); // tilt / lift container
  private current: Pose3 = { j: {} };
  readonly look: FighterLook;
  readonly H: number;
  private hipHeight: number;
  private aura: THREE.Points;
  private auraMat: THREE.PointsMaterial;
  private auraBase: Float32Array;

  constructor(look: FighterLook) {
    this.look = look;
    const H = (this.H = look.height ?? 1);
    const W = look.width ?? 1;
    const fem = look.build === 'female';
    const beast = look.build === 'beast';
    const robot = look.build === 'robot';
    const o = look.outfit ?? 'tank';
    const skin = robot ? mat(look.skin, 0.35, 0.8) : beast ? mat(look.skin, 0.95) : mat(look.skin, 0.55, 0, { emissive: new THREE.Color(look.skin).multiplyScalar(0.04) });
    // character colours are UI pastels: deepen them into believable fabric dyes
    const dye = (c: string) => {
      const col = new THREE.Color(c);
      const hsl = { h: 0, s: 0, l: 0 };
      col.getHSL(hsl);
      return new THREE.Color().setHSL(hsl.h, Math.min(0.62, hsl.s), Math.min(0.36, hsl.l * 0.62)).getStyle();
    };
    const top = robot ? mat(look.top, 0.4, 0.7) : mat(beast ? look.top : dye(look.top), o === 'suit' ? 0.55 : 0.85);
    const pants = robot ? mat(look.pants, 0.45, 0.7) : beast ? skin : mat(look.pants, 0.9);
    const shoes = mat(look.shoes, 0.5);
    const gloves = mat(look.gloves, 0.42, 0.05);
    const belt = mat(look.belt, 0.5, 0.2);
    const hair = mat(look.hair, 0.65);
    const dark = mat('#141010', 0.4);

    const thigh = 0.45 * H, shin = 0.44 * H, upper = 0.3 * H, fore = 0.27 * H;
    this.hipHeight = thigh + shin + 0.07 * H;
    const shoulderW = (fem ? 0.17 : 0.2) * H * W;
    const hipW = (fem ? 0.1 : 0.09) * H * W;
    const limbK = (fem ? 0.82 : 1) * W * H;

    const J = (name: Joint, parent: THREE.Object3D, x: number, y: number, z: number) => {
      const j = new THREE.Object3D();
      j.position.set(x, y, z);
      parent.add(j);
      this.joints[name] = j;
      return j;
    };
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, pos?: [number, number, number], scale?: [number, number, number], rot?: [number, number, number]) => {
      const mesh = new THREE.Mesh(geo, m);
      if (pos) mesh.position.set(...pos);
      if (scale) mesh.scale.set(...scale);
      if (rot) mesh.rotation.set(...rot);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };

    this.root.add(this.body);
    const hips = J('hips', this.body, 0, this.hipHeight, 0);
    // pelvis (trousers / skirt)
    add(hips, organ(0.2 * H, [0.12, 0.15, 0.16, 0.13].map((r) => r * W * H * (fem ? 1.08 : 1))), o === 'dress' ? top : pants, [0, 0.1 * H, 0], [1.15, 1, 0.85]);
    add(hips, new THREE.TorusGeometry(0.14 * W * H * (fem ? 1.04 : 1), 0.018 * H, 8, 24), belt, [0, 0.07 * H, 0], [1.13, 1, 0.84], [Math.PI / 2, 0, 0]);
    if (o === 'dress') add(hips, new THREE.CylinderGeometry(0.16 * H * W, 0.26 * H * W, 0.32 * H, 18, 1, true), new THREE.MeshStandardMaterial({ color: (top as THREE.MeshStandardMaterial).color, roughness: 0.85, side: THREE.DoubleSide }), [0, -0.12 * H, 0], [1.1, 1, 0.95]);

    // spine -> chest -> neck -> head
    const spine = J('spine', hips, 0, 0.1 * H, 0);
    const torsoMat = o === 'bare' ? skin : top;
    add(spine, organ(0.24 * H, [0.13, 0.135, 0.15].map((r) => r * W * H * (fem ? 0.88 : 1))), torsoMat, [0, 0.24 * H, 0], [1.2, 1, 0.82]);
    const chest = J('chest', spine, 0, 0.22 * H, 0);
    add(chest, organ(0.3 * H, [fem ? 0.15 : 0.17, fem ? 0.165 : 0.19, fem ? 0.155 : 0.175, 0.13].map((r) => r * W * H)), torsoMat, [0, 0.3 * H, 0], [1.28, 1, 0.8]);
    if (fem) for (const s of [-1, 1]) add(chest, new THREE.SphereGeometry(0.068 * H, 14, 10), torsoMat, [s * 0.075 * H, 0.15 * H, 0.1 * H], [1, 0.95, 0.85]);
    if (!fem && o === 'bare' && !beast && !robot) {
      // pecs / abs hint
      for (const s of [-1, 1]) add(chest, new THREE.SphereGeometry(0.08 * H * W, 12, 10), skin, [s * 0.085 * H * W, 0.18 * H, 0.08 * H], [1.1, 0.75, 0.6]);
    }
    if (o === 'jacket' || o === 'suit') add(chest, new THREE.TorusGeometry(0.075 * H, 0.025 * H, 8, 18), top, [0, 0.29 * H, 0.01], [1, 1, 0.9], [Math.PI / 2, 0, 0]); // collar
    const neck = J('neck', chest, 0, 0.3 * H, 0);
    add(neck, organ(0.1 * H, [0.055, 0.05, 0.052].map((r) => r * H * (beast ? 1.5 : W > 1.1 ? 1.25 : 1))), robot ? top : skin, [0, 0.1 * H, 0]);
    const head = J('head', neck, 0, 0.09 * H, 0);
    this.buildHead(head, H, look, skin, hair, dark, fem, beast, robot);

    // arms
    const armMat = o === 'jacket' || o === 'suit' || robot || beast ? top : skin;
    const foreMat = o === 'suit' || robot || beast ? top : skin;
    for (const s of [1, -1] as const) {
      const L = s === 1;
      const sh = J(L ? 'lSh' : 'rSh', chest, s * shoulderW, 0.26 * H, 0);
      add(sh, new THREE.SphereGeometry(0.075 * limbK, 12, 10), armMat, [0, 0, 0], [1.05, 0.95, 1]); // deltoid
      add(sh, organ(upper, [0.062, 0.068, 0.058, 0.048].map((r) => r * limbK)), armMat);
      const el = J(L ? 'lEl' : 'rEl', sh, 0, -upper, 0);
      add(el, organ(fore, [0.05, 0.056, 0.045, 0.036].map((r) => r * limbK)), foreMat);
      const hand = J(L ? 'lHand' : 'rHand', el, 0, -fore, 0);
      // glove: rounded fist
      add(hand, new THREE.SphereGeometry(0.062 * limbK, 14, 12), robot ? top : gloves, [0, -0.045 * H, 0.012 * H], [0.9, 1.05, 1.0]);
      add(hand, new THREE.CylinderGeometry(0.045 * limbK, 0.05 * limbK, 0.05 * H, 12), robot ? top : gloves, [0, 0.0, 0]);
    }

    // legs
    const legMat = o === 'dress' ? skin : pants;
    const loose = o === 'gi' ? 1.18 : o === 'dress' || o === 'suit' ? 0.95 : 1.05;
    for (const s of [1, -1] as const) {
      const L = s === 1;
      const hp = J(L ? 'lHip' : 'rHip', hips, s * hipW, 0, 0);
      add(hp, organ(thigh, [0.095, 0.092, 0.075, 0.06].map((r) => r * W * H * loose * (fem ? 1.03 : 1))), legMat);
      const kn = J(L ? 'lKnee' : 'rKnee', hp, 0, -thigh, 0);
      add(kn, organ(shin, [0.062, 0.066, 0.05, 0.042].map((r) => r * W * H * loose * (fem ? 0.92 : 1))), o === 'dress' ? shoes : legMat);
      const ft = J(L ? 'lFoot' : 'rFoot', kn, 0, -shin, 0);
      add(ft, new THREE.BoxGeometry(0.1 * H * W, 0.075 * H, 0.24 * H), beast ? skin : shoes, [0, -0.035 * H, 0.055 * H]);
      if (!beast) add(ft, new THREE.BoxGeometry(0.105 * H * W, 0.02 * H, 0.25 * H), mat('#e8e6e0', 0.6), [0, -0.068 * H, 0.055 * H]);
    }

    // aura particles (Heat = blue, Rage = red)
    const N = 90;
    this.auraBase = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.25 + Math.random() * 0.2;
      this.auraBase.set([Math.cos(a) * r, Math.random() * 1.8 * H, Math.sin(a) * r], i * 3);
    }
    const ag = new THREE.BufferGeometry();
    ag.setAttribute('position', new THREE.BufferAttribute(this.auraBase.slice(), 3));
    this.auraMat = new THREE.PointsMaterial({ size: 0.06, color: '#3aa0ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, map: glowTexture() });
    this.aura = new THREE.Points(ag, this.auraMat);
    this.root.add(this.aura);
  }

  private buildHead(head: THREE.Object3D, H: number, look: FighterLook, skin: THREE.Material, hair: THREE.Material, dark: THREE.Material, fem: boolean, beast: boolean, robot: boolean) {
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, pos: [number, number, number], scale: [number, number, number] = [1, 1, 1], rot?: [number, number, number]) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(...pos);
      mesh.scale.set(...scale);
      if (rot) mesh.rotation.set(...rot);
      mesh.castShadow = true;
      head.add(mesh);
      return mesh;
    };
    const S = H;
    if (beast) {
      add(new THREE.SphereGeometry(0.15 * S, 20, 16), skin, [0, 0.1 * S, 0], [1, 0.95, 1]);
      add(new THREE.SphereGeometry(0.075 * S, 14, 12), mat(new THREE.Color(look.skin).lerp(new THREE.Color('#ffffff'), 0.2).getStyle(), 0.9), [0, 0.06 * S, 0.12 * S], [1, 0.8, 1.1]);
      add(new THREE.SphereGeometry(0.025 * S, 10, 8), dark, [0, 0.085 * S, 0.2 * S]);
      for (const s of [-1, 1]) {
        add(new THREE.SphereGeometry(0.05 * S, 12, 10), mat(look.hair, 0.9), [s * 0.11 * S, 0.22 * S, -0.01], [1, 1, 0.5]);
        const light = new THREE.Color(look.skin).r > 0.7;
        add(new THREE.SphereGeometry(light ? 0.035 * S : 0.016 * S, 10, 8), light ? mat(look.hair, 0.8) : dark, [s * 0.06 * S, 0.13 * S, 0.12 * S], [1, 1.2, 0.6]);
      }
      return;
    }
    if (robot) {
      add(new THREE.BoxGeometry(0.2 * S, 0.24 * S, 0.22 * S), skin, [0, 0.11 * S, 0]);
      add(new THREE.BoxGeometry(0.16 * S, 0.04 * S, 0.02 * S), new THREE.MeshStandardMaterial({ color: '#ff2a2a', emissive: '#ff2a2a', emissiveIntensity: 2.5 }), [0, 0.14 * S, 0.115 * S]);
      add(new THREE.BoxGeometry(0.12 * S, 0.05 * S, 0.02 * S), dark, [0, 0.04 * S, 0.115 * S]);
      return;
    }
    // skull + jaw
    add(new THREE.SphereGeometry(0.1 * S, 22, 18), skin, [0, 0.12 * S, -0.005 * S], [0.95, 1.12, 1.08]);
    add(new THREE.SphereGeometry(0.075 * S, 16, 12), skin, [0, 0.055 * S, 0.035 * S], fem ? [0.9, 0.85, 0.95] : [1.05, 0.9, 1]);
    add(new THREE.ConeGeometry(0.018 * S, 0.045 * S, 8), skin, [0, 0.11 * S, 0.105 * S], [1, 1, 1], [Math.PI / 2.2, 0, 0]); // nose
    for (const s of [-1, 1]) {
      add(new THREE.SphereGeometry(0.022 * S, 10, 8), skin, [s * 0.093 * S, 0.11 * S, -0.01 * S], [0.5, 1, 0.8]); // ears
      add(new THREE.SphereGeometry(0.012 * S, 10, 8), dark, [s * 0.036 * S, 0.135 * S, 0.088 * S], [1.2, 0.8, 0.6]); // eyes
      add(new THREE.BoxGeometry(0.035 * S, (fem ? 0.005 : 0.008) * S, 0.01 * S), mat(look.hair, 0.8), [s * 0.037 * S, 0.158 * S, 0.092 * S], [1, 1, 1], [0, 0, s * (fem ? -0.15 : 0.08)]); // brows
    }
    if (fem) add(new THREE.SphereGeometry(0.014 * S, 10, 8), mat('#b5524f', 0.5), [0, 0.06 * S, 0.1 * S], [1.6, 0.6, 0.6]); // lips
    const st = look.hairStyle;
    if (st === 'bald') return;
    // hair cap
    add(new THREE.SphereGeometry(0.108 * S, 22, 14, 0, Math.PI * 2, 0, Math.PI * (st === 'spiky' ? 0.5 : 0.55)), hair, [0, 0.13 * S, -0.012 * S], [0.98, 1.15, 1.12]);
    if (st === 'spiky') {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        add(new THREE.ConeGeometry(0.03 * S, 0.09 * S, 6), hair, [Math.cos(a) * 0.06 * S, 0.24 * S, Math.sin(a) * 0.06 * S - 0.015 * S], [1, 1, 1], [Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7]);
      }
    }
    if (st === 'bob' || st === 'long') {
      add(new THREE.SphereGeometry(0.115 * S, 18, 14, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.45), hair, [0, 0.1 * S, -0.02 * S], [1.02, 1.25, 1.08]);
    }
    if (st === 'long') add(organ(0.32 * S, [0.09, 0.1, 0.085, 0.05].map((r) => r * S)), hair, [0, 0.12 * S, -0.06 * S], [1.1, 1, 0.45]);
    if (st === 'ponytail') {
      add(new THREE.SphereGeometry(0.03 * S, 10, 8), hair, [0, 0.2 * S, -0.1 * S]);
      add(organ(0.28 * S, [0.035, 0.045, 0.03, 0.01].map((r) => r * S)), hair, [0, 0.2 * S, -0.12 * S], [1, 1, 1], [-0.5, 0, 0]);
    }
    if (st === 'buns') for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.045 * S, 12, 10), hair, [s * 0.075 * S, 0.22 * S, -0.03 * S]);
  }

  /** Blend towards a target pose (k = 0..1 per frame) and apply it. */
  apply(target: Pose3, k: number) {
    const c = this.current;
    for (const j of JOINTS) {
      const t = target.j[j] ?? [0, 0, 0];
      const cur = c.j[j] ?? [0, 0, 0];
      const nxt: Euler3 = [cur[0] + (t[0] - cur[0]) * k, cur[1] + (t[1] - cur[1]) * k, cur[2] + (t[2] - cur[2]) * k];
      c.j[j] = nxt;
      this.joints[j].rotation.set(nxt[0] * D2R, nxt[1] * D2R, nxt[2] * D2R, 'YXZ');
    }
    const lerp = (a: number | undefined, b: number | undefined) => (a ?? 0) + ((b ?? 0) - (a ?? 0)) * k;
    c.hipY = lerp(c.hipY, target.hipY);
    c.lift = lerp(c.lift, target.lift);
    c.side = lerp(c.side, target.side);
    const r0 = c.root ?? [0, 0, 0], r1 = target.root ?? [0, 0, 0];
    c.root = [r0[0] + (r1[0] - r0[0]) * k, r0[1] + (r1[1] - r0[1]) * k, r0[2] + (r1[2] - r0[2]) * k];
    this.joints.hips.position.y = this.hipHeight + (c.hipY ?? 0) * this.H;
    // tilt the whole body around the hips
    this.body.position.set((c.side ?? 0), c.lift ?? 0, 0);
    const hy = this.joints.hips.position.y;
    this.body.rotation.set(c.root[0] * D2R, c.root[1] * D2R, c.root[2] * D2R, 'XZY');
    // keep the hips as the pivot: offset so rotation happens around them
    const piv = new THREE.Vector3(0, hy, 0).applyEuler(this.body.rotation);
    this.body.position.y += hy - piv.y;
    this.body.position.z += -piv.z;
    this.body.position.x += -piv.x;
  }

  /** Snap to a pose without blending (round start). */
  snap(p: Pose3) {
    this.apply(p, 1);
  }

  /** Heat / Rage aura. */
  setAura(kind: 'heat' | 'rage' | null, t: number) {
    const target = kind ? 0.85 : 0;
    this.auraMat.opacity += (target - this.auraMat.opacity) * 0.1;
    this.aura.visible = this.auraMat.opacity > 0.02;
    if (kind) this.auraMat.color.set(kind === 'heat' ? '#3aa0ff' : '#ff2a2a');
    if (!this.aura.visible) return;
    const pos = this.aura.geometry.getAttribute('position') as THREE.BufferAttribute;
    const n = pos.count;
    for (let i = 0; i < n; i++) {
      const y = (this.auraBase[i * 3 + 1] + t * 0.012 * (1 + (i % 5) * 0.2)) % (1.9 * this.H);
      const a = t * 0.02 + i;
      pos.setXYZ(i, this.auraBase[i * 3] + Math.sin(a) * 0.03, y, this.auraBase[i * 3 + 2] + Math.cos(a) * 0.03);
    }
    pos.needsUpdate = true;
  }

  private flashMats: THREE.MeshStandardMaterial[] | null = null;
  private flashing = false;
  /** Brief white-hot flash when hit. */
  flash(on: boolean) {
    if (on === this.flashing) return;
    this.flashing = on;
    if (!this.flashMats) {
      const set = new Set<THREE.MeshStandardMaterial>();
      this.root.traverse((o) => {
        if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial && !o.material.emissiveMap) set.add(o.material);
      });
      this.flashMats = [...set];
      for (const m of this.flashMats) m.userData.baseEmissive = m.emissive.clone();
    }
    for (const m of this.flashMats) {
      if (on) m.emissive.setRGB(0.55, 0.42, 0.3);
      else m.emissive.copy(m.userData.baseEmissive as THREE.Color);
    }
  }

  /** World position of a joint (for effects). */
  jointWorld(j: Joint) {
    return this.joints[j].getWorldPosition(new THREE.Vector3());
  }

  dispose() {
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
        o.geometry.dispose();
        const m = o.material as THREE.Material | THREE.Material[];
        (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
      }
    });
  }
}

let glowTex: THREE.Texture | null = null;
/** Soft round glow sprite. */
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
