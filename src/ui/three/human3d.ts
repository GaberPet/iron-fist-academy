// Realistic fighters: CC0 MakeHuman bodies (generated with MPFB, see scripts/fighters) with a
// game-engine skeleton, driven by the same procedural poses as the simple rig.
//
// The simple Fighter3D rig stays as an invisible "driver": every frame its joint rotations are
// retargeted onto the real skeleton (full rotation for pelvis / spine / neck / head, limb
// direction for arms, legs and feet), and the fingers are curled into fists.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { FighterLook } from '../components/arenaRenderer';
import { Fighter3D, type Joint, type Pose3 } from './fighter3d';

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Group | null>>();

function loadModel(url: string) {
  let p = cache.get(url);
  if (!p) {
    p = loader.loadAsync(url).then((g) => g.scene, () => null);
    cache.set(url, p);
  }
  return p;
}

/** Driver joint -> bone, and how the rotation is transferred. */
const FULL: [Joint, string][] = [['hips', 'pelvis'], ['spine', 'spine_01'], ['chest', 'spine_03'], ['neck', 'neck_01'], ['head', 'head']];
const DIRS: [Joint, Joint | 'toe', string][] = [
  ['lSh', 'lEl', 'upperarm_l'], ['lEl', 'lHand', 'lowerarm_l'], ['rSh', 'rEl', 'upperarm_r'], ['rEl', 'rHand', 'lowerarm_r'],
  ['lHip', 'lKnee', 'thigh_l'], ['lKnee', 'lFoot', 'calf_l'], ['rHip', 'rKnee', 'thigh_r'], ['rKnee', 'rFoot', 'calf_r'],
  ['lFoot', 'toe', 'foot_l'], ['rFoot', 'toe', 'foot_r'],
];
const CHILD: Record<string, string> = {
  upperarm_l: 'lowerarm_l', lowerarm_l: 'hand_l', upperarm_r: 'lowerarm_r', lowerarm_r: 'hand_r',
  thigh_l: 'calf_l', calf_l: 'foot_l', thigh_r: 'calf_r', calf_r: 'foot_r', foot_l: 'ball_l', foot_r: 'ball_r',
};

/** Private fan-look models (git-ignored public/models-private, personal use; absent on the public site). */
export const PRIVATE_IDS = new Set<string>();
export const privateReady: Promise<void> =
  typeof fetch === 'undefined'
    ? Promise.resolve()
    : fetch(new URL('models-private/index.json', document.baseURI).href)
        .then((r) => (r.ok ? r.json() : []))
        .then((ids: string[]) => ids.forEach((i) => PRIVATE_IDS.add(i)), () => undefined);

/** Characters with a realistic model in public/models (see scripts/fighters/roster.mjs). */
export const MODEL_IDS = new Set<string>([
  'alisa', 'anna', 'asuka', 'azucena', 'jun', 'leo', 'lidia', 'kunimitsu', 'lili', 'miary-zo', 'nina', 'reina', 'xiaoyu', 'zafina',
  'armor-king', 'bob', 'bryan', 'claudio', 'clive', 'devil-jin', 'dragunov', 'eddy', 'fahkumram', 'feng', 'heihachi', 'hwoarang', 'jin',
  'kazuya', 'king', 'lars', 'law', 'lee', 'leroy', 'paul', 'raven', 'shaheen', 'steve', 'victor', 'yoshimitsu',
]);

/** Fight-trouser colours for the bare-chested fighters (the work trousers texture is recoloured). */
const TROUSERS: Record<string, string> = {
  jin: '#18181c', kazuya: '#2c2a30', 'devil-jin': '#1f1828', heihachi: '#d9d3c4', 'armor-king': '#141414', king: '#232c5c', eddy: '#cdb991', fahkumram: '#9c1d1d',
};
const TROUSERS_AVG: [number, number, number] = [0.24, 0.33, 0.48];

/** Average colour (sRGB) of each MakeHuman hair texture, so hair can be recoloured to any shade. */
const HAIR_AVG: Record<string, [number, number, number]> = {
  afro01: [0.06, 0.02, 0.02], bob01: [0.15, 0.12, 0.13], bob02: [0.62, 0.59, 0.53], braid01: [0.09, 0.08, 0.06], long01: [0.19, 0.11, 0.08],
  ponytail01: [0.34, 0.23, 0.16], short01: [0.11, 0.11, 0.11], short02: [0.29, 0.24, 0.19], short03: [0.31, 0.2, 0.17], short04: [0.14, 0.14, 0.14],
};

export class HumanFighter {
  readonly driver: Fighter3D;
  readonly root: THREE.Group;
  readonly look: FighterLook;
  H: number;
  private bones = new Map<string, THREE.Bone>();
  private order: THREE.Bone[] = []; // parents first
  private restBs = new Map<THREE.Object3D, THREE.Quaternion>(); // body-space rest rotation of each bone
  private restDir = new Map<string, THREE.Vector3>(); // body-space rest direction of each direction-driven bone
  private armatureBs = new THREE.Quaternion();
  private pelvisRest = new THREE.Vector3();
  private model: THREE.Object3D | null = null;
  private fistAxis = new Map<string, THREE.Vector3>();
  private flashing = false;
  ready = false;

  private readonly baked: boolean;

  constructor(look: FighterLook, url: string, baked = false) {
    this.look = look;
    this.baked = baked;
    this.driver = new Fighter3D(look);
    this.root = this.driver.root;
    this.H = this.driver.H;
    void loadModel(url).then((scene) => scene && this.attach(scene));
  }

  private attach(src: THREE.Group) {
    const scene = cloneSkinned(src);
    // hide the placeholder meshes, keep the aura
    this.driver.body.traverse((o) => {
      if (o instanceof THREE.Mesh) o.visible = false;
    });
    this.driver.body.add(scene);
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
        const m = o.material as THREE.MeshStandardMaterial;
        if (m && 'roughness' in m) {
          // MPFB exports every material as alpha-blended; only hair, brows and lashes need alpha
          const cutout = /eyelash|eyebrow|hair|short0|long0|bob0|ponytail|braid|afro/.test(m.name);
          m.transparent = false;
          m.depthWrite = true;
          m.alphaTest = cutout ? 0.45 : 0;
          m.side = cutout ? THREE.DoubleSide : THREE.FrontSide;
          if (/body/.test(m.name)) m.roughness = 0.55;
          const trousers = this.look.id && !this.baked ? TROUSERS[this.look.id] : undefined;
          if (trousers && /worksuit/.test(m.name)) {
            const avg = new THREE.Color().setRGB(...TROUSERS_AVG, THREE.SRGBColorSpace);
            const want = new THREE.Color(trousers);
            m.color.setRGB(Math.min(8, want.r / avg.r), Math.min(8, want.g / avg.g), Math.min(8, want.b / avg.b));
          }
          const hairId = Object.keys(HAIR_AVG).find((h) => m.name.endsWith(h));
          if (hairId) {
            // recolour: target / texture average (linear), so light and dark textures both reach the shade
            const avg = new THREE.Color().setRGB(...HAIR_AVG[hairId], THREE.SRGBColorSpace);
            const want = new THREE.Color(this.look.hair);
            m.color.setRGB(Math.min(14, want.r / Math.max(0.01, avg.r)), Math.min(14, want.g / Math.max(0.01, avg.g)), Math.min(14, want.b / Math.max(0.01, avg.b)));
            m.roughness = 0.6;
          }
          m.needsUpdate = true;
        }
      }
      if ((o as THREE.Bone).isBone) this.bones.set(o.name, o as THREE.Bone);
    });
    this.model = scene;
    // capture rest pose in body space
    this.driver.body.updateMatrixWorld(true);
    const bodyInv = this.driver.body.getWorldQuaternion(new THREE.Quaternion()).invert();
    const bodyMatInv = this.driver.body.matrixWorld.clone().invert();
    const rootBone = this.bones.get('Root') ?? this.bones.get('pelvis');
    if (!rootBone) return;
    this.armatureBs = bodyInv.clone().multiply(rootBone.parent!.getWorldQuaternion(new THREE.Quaternion()));
    rootBone.traverse((o) => {
      if (!(o as THREE.Bone).isBone) return;
      this.order.push(o as THREE.Bone);
      this.restBs.set(o, bodyInv.clone().multiply(o.getWorldQuaternion(new THREE.Quaternion())));
    });
    const pos = (n: string) => this.bones.get(n)!.getWorldPosition(new THREE.Vector3()).applyMatrix4(bodyMatInv);
    for (const [, , bone] of DIRS) {
      const c = CHILD[bone];
      if (this.bones.has(bone) && this.bones.has(c)) this.restDir.set(bone, pos(c).sub(pos(bone)).normalize());
    }
    this.pelvisRest.copy(this.bones.get('pelvis')!.position);
    // height of the model for the camera
    const box = new THREE.Box3().setFromObject(scene);
    this.H = (box.max.y - box.min.y) / 1.8;
    // finger curl axis: perpendicular to the finger and to the palm direction (approximate: the hand's rest side axis)
    for (const side of ['l', 'r']) {
      const hand = this.bones.get(`hand_${side}`);
      const idx = this.bones.get(`index_01_${side}`), pky = this.bones.get(`pinky_01_${side}`);
      if (!hand || !idx || !pky) continue;
      const across = pos(`index_01_${side}`).sub(pos(`pinky_01_${side}`)).normalize(); // across the knuckles, body space
      this.fistAxis.set(side, across);
    }
    this.ready = true;
  }

  /** Same interface as Fighter3D. */
  apply(pose: Pose3, k: number) {
    this.driver.apply(pose, k);
    if (!this.ready) return;
    const drv = this.driver;
    drv.body.updateMatrixWorld(true);
    const bodyQ = drv.body.getWorldQuaternion(new THREE.Quaternion());
    const bodyInv = bodyQ.clone().invert();
    const bodyMatInv = drv.body.matrixWorld.clone().invert();
    const jq = (j: Joint) => bodyInv.clone().multiply(drv.joints[j].getWorldQuaternion(new THREE.Quaternion()));
    const jp = (j: Joint) => drv.joints[j].getWorldPosition(new THREE.Vector3()).applyMatrix4(bodyMatInv);

    // target body-space rotations
    const target = new Map<THREE.Object3D, THREE.Quaternion>();
    for (const [j, b] of FULL) {
      const bone = this.bones.get(b);
      if (bone) target.set(bone, jq(j).multiply(this.restBs.get(bone)!));
    }
    for (const [j, to, b] of DIRS) {
      const bone = this.bones.get(b);
      const rest = this.restDir.get(b);
      if (!bone || !rest) continue;
      let dir: THREE.Vector3;
      if (to === 'toe') dir = new THREE.Vector3(0, -0.35, 1).normalize().applyQuaternion(jq(j));
      else dir = jp(to).sub(jp(j)).normalize();
      const delta = new THREE.Quaternion().setFromUnitVectors(rest, dir);
      target.set(bone, delta.multiply(this.restBs.get(bone)!));
    }
    // walk the skeleton parents-first, converting to local rotations
    const now = new Map<THREE.Object3D, THREE.Quaternion>();
    for (const bone of this.order) {
      const parentBs = now.get(bone.parent!) ?? (bone.parent && this.restBs.has(bone.parent) ? this.restBs.get(bone.parent)! : this.armatureBs);
      let bs = target.get(bone);
      if (!bs) {
        // undriven bones keep their rest offset relative to the parent
        const parentRest = this.restBs.get(bone.parent!) ?? this.armatureBs;
        const local = parentRest.clone().invert().multiply(this.restBs.get(bone)!);
        bs = parentBs.clone().multiply(local);
        // fists: curl the fingers
        const m = /^(index|middle|ring|pinky)_0([123])_([lr])$/.exec(bone.name);
        if (m) {
          const axis = this.fistAxis.get(m[3]);
          const hand = this.bones.get(`hand_${m[3]}`);
          const handNow = hand ? now.get(hand) : undefined;
          if (axis && hand && handNow) {
            // the knuckle axis turns with the hand
            const turn = handNow.clone().multiply(this.restBs.get(hand)!.clone().invert());
            const ax = axis.clone().applyQuaternion(turn);
            bs = new THREE.Quaternion().setFromAxisAngle(ax, -1 * (m[3] === 'l' ? 1 : -1) * (m[2] === '1' ? 1.25 : 1.4)).multiply(bs);
          }
        }
      }
      now.set(bone, bs);
      bone.quaternion.copy(parentBs.clone().invert().multiply(bs));
    }
    // hip height follows the driver (crouches, knockdowns)
    const pelvis = this.bones.get('pelvis');
    if (pelvis) {
      const drop = (drv.joints.hips.position.y - drv.restHipHeight) / Math.max(0.5, this.driver.H) * this.H;
      const v = new THREE.Vector3(0, drop, 0).applyQuaternion(this.armatureBs.clone().invert());
      const s = pelvis.parent ? pelvis.parent.getWorldScale(new THREE.Vector3()).y / drv.body.getWorldScale(new THREE.Vector3()).y : 1;
      pelvis.position.copy(this.pelvisRest).addScaledVector(v, 1 / (s || 1));
    }
  }

  snap(p: Pose3) {
    this.apply(p, 1);
  }
  setAura(kind: 'heat' | 'rage' | null, t: number) {
    this.driver.setAura(kind, t);
  }
  flash(on: boolean) {
    if (!this.model) return this.driver.flash(on);
    if (on === this.flashing) return;
    this.flashing = on;
    this.model.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const m = o.material as THREE.MeshStandardMaterial;
        if (!m.emissive) return;
        if (!m.userData.baseEmissive) m.userData.baseEmissive = m.emissive.clone();
        if (on) m.emissive.setRGB(0.45, 0.34, 0.24);
        else m.emissive.copy(m.userData.baseEmissive as THREE.Color);
      }
    });
  }
  jointWorld(j: Joint) {
    const map: Partial<Record<Joint, string>> = { lHand: 'hand_l', rHand: 'hand_r', lFoot: 'foot_l', rFoot: 'foot_r', head: 'head' };
    const b = map[j] ? this.bones.get(map[j]!) : undefined;
    return b ? b.getWorldPosition(new THREE.Vector3()) : this.driver.jointWorld(j);
  }
  dispose() {
    this.driver.dispose();
    this.model?.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}

/** Clone a skinned glTF scene so several fighters can share one loaded file. */
function cloneSkinned(src: THREE.Object3D): THREE.Group {
  // SkeletonUtils.clone without importing the whole module twice
  const map = new Map<THREE.Object3D, THREE.Object3D>();
  const clone = src.clone(true);
  const a: THREE.Object3D[] = [], b: THREE.Object3D[] = [];
  src.traverse((o) => a.push(o));
  clone.traverse((o) => b.push(o));
  a.forEach((o, i) => map.set(o, b[i]));
  clone.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) {
      const sm = o as THREE.SkinnedMesh;
      const orig = a[b.indexOf(o)] as THREE.SkinnedMesh;
      const bones = orig.skeleton.bones.map((x) => map.get(x) as THREE.Bone);
      sm.material = (orig.material as THREE.Material).clone();
      sm.bind(new THREE.Skeleton(bones, orig.skeleton.boneInverses), orig.bindMatrix);
    }
  });
  return clone as THREE.Group;
}
