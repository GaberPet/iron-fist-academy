// Canvas renderer for the Bot Dojo: jointed, shaded fighters that blend between poses,
// a lit stage, shadows and hit/block effects. Pure drawing; the simulation lives in core/sim.ts.

export type PoseName =
  | 'idle' | 'guard' | 'crouch' | 'crouchGuard'
  | 'punchHigh' | 'punchMid' | 'kickMid' | 'kickLow' | 'grab'
  | 'windup' | 'hit' | 'recover';

/** Joint angles in degrees (0 = straight down for limbs, 0 = upright for torso), plus hip drop in px. */
export interface Pose {
  hipDrop: number;
  lean: number; // torso, + leans forward
  head: number;
  frontUpper: number; frontFore: number; // arm nearer the opponent
  backUpper: number; backFore: number;
  frontThigh: number; frontShin: number;
  backThigh: number; backShin: number;
}

const P = (hipDrop: number, lean: number, head: number, fu: number, ff: number, bu: number, bf: number, ft: number, fs: number, bt: number, bs: number): Pose =>
  ({ hipDrop, lean, head, frontUpper: fu, frontFore: ff, backUpper: bu, backFore: bf, frontThigh: ft, frontShin: fs, backThigh: bt, backShin: bs });

// Angles are measured from straight down, positive = towards the opponent.
export const POSES: Record<PoseName, Pose> = {
  idle:        P(12,  4, -4,  98, 172,  88, 176,  22, -18, -20,  8),
  guard:       P(12, -4, -6,  95, 175,  85, 178,  20, -16, -20,  8),
  crouch:      P(58, 22,  6,  70, 150,  50, 160,  85, -80, 30, -95),
  crouchGuard: P(58, 12,  0, 100, 170,  80, 175,  85, -80, 30, -95),
  windup:      P(14, -8, -4,  30,  90,  60, 150,  10, -10, -26,  10),
  punchHigh:   P( 8, 18,  4, 100,  98,  20, 150,  34, -10, -30,  6),
  punchMid:    P(16, 26,  6,  86,  88,  20, 150,  38, -14, -30,  8),
  kickMid:     P( 4, -16, -6, 50, 140,  30, 150, 100,  95, -12,  4),
  kickLow:     P(30, -6,  0,  60, 140,  40, 150,  75,  70, -24, -20),
  grab:        P(14, 22,  6,  84,  84,  74,  80,  26, -12, -24,  8),
  hit:         P( 8, -28, -24, 20, 120, -10, 140,  6,  -4, -32,  10),
  recover:     P(12, -10, -6,  40, 120,  30, 150,  18, -14, -22,  10),
};

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const o = {} as Pose;
  for (const k of Object.keys(a) as (keyof Pose)[]) o[k] = a[k] + (b[k] - a[k]) * t;
  return o;
}

export interface FighterLook {
  skin: string;
  hair: string;
  top: string; // shirt / tank top
  pants: string;
  shoes: string;
  gloves: string;
  belt: string;
}

const rad = (d: number) => (d * Math.PI) / 180;

// ---------- colour helpers (any CSS colour in, rgb() out) ----------
const rgbCache = new Map<string, [number, number, number]>();
let probe: CanvasRenderingContext2D | null = null;
function toRgb(c: string): [number, number, number] {
  const hit = rgbCache.get(c);
  if (hit) return hit;
  let out: [number, number, number] = [128, 128, 128];
  try {
    probe ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    if (probe) {
      probe.clearRect(0, 0, 1, 1);
      probe.fillStyle = c;
      probe.fillRect(0, 0, 1, 1);
      const d = probe.getImageData(0, 0, 1, 1).data;
      out = [d[0], d[1], d[2]];
    }
  } catch { /* keep grey */ }
  rgbCache.set(c, out);
  return out;
}
/** Mix a colour towards another; t = 0 keeps it, 1 gives the other. */
function mix(c: string, other: string, t: number): string {
  const a = toRgb(c), b = toRgb(other);
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}
const SUNLIGHT = '#ffd2a1';
const SHADOW = '#0b0a14';

// Light comes from the sunset, upper left of the scene.
const LX = -0.45, LY = -0.89;

/**
 * A muscle-shaped limb segment from a to b: start width w1, widest wm at fraction mt, end width w2.
 * Shaded across its width, lit on the side facing the light.
 */
function limb(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, w1: number, wm: number, w2: number, color: string, mt = 0.4, depth = 0) {
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux;
  const mx = ax + dx * mt, my = ay + dy * mt;
  const au = Math.atan2(uy, ux);
  ctx.beginPath();
  ctx.moveTo(ax + nx * w1 / 2, ay + ny * w1 / 2);
  ctx.quadraticCurveTo(mx + nx * wm * 0.62, my + ny * wm * 0.62, bx + nx * w2 / 2, by + ny * w2 / 2);
  ctx.arc(bx, by, w2 / 2, au + Math.PI / 2, au - Math.PI / 2, true);
  ctx.quadraticCurveTo(mx - nx * wm * 0.62, my - ny * wm * 0.62, ax - nx * w1 / 2, ay - ny * w1 / 2);
  ctx.arc(ax, ay, w1 / 2, au - Math.PI / 2, au - Math.PI * 1.5, true);
  ctx.closePath();
  const lit = nx * LX + ny * LY >= 0 ? 1 : -1;
  const g = ctx.createLinearGradient(mx + nx * lit * wm / 2, my + ny * lit * wm / 2, mx - nx * lit * wm / 2, my - ny * lit * wm / 2);
  const base = depth ? mix(color, SHADOW, depth) : color;
  g.addColorStop(0, mix(base, SUNLIGHT, 0.45));
  g.addColorStop(0.18, mix(base, SUNLIGHT, 0.12));
  g.addColorStop(0.55, base);
  g.addColorStop(1, mix(base, SHADOW, 0.55));
  ctx.fillStyle = g;
  ctx.fill();
}

function joint(x: number, y: number, ang: number, len: number, facing: number) {
  return [x + Math.sin(rad(ang)) * len * facing, y + Math.cos(rad(ang)) * len] as const;
}

/** A fist (glove) at the end of the forearm, pointing along the forearm. */
function fist(ctx: CanvasRenderingContext2D, ex: number, ey: number, hx: number, hy: number, S: number, color: string, depth: number) {
  const a = Math.atan2(hy - ey, hx - ex);
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(a);
  const base = depth ? mix(color, SHADOW, depth) : color;
  const g = ctx.createLinearGradient(0, -8 * S, 0, 8 * S);
  g.addColorStop(0, mix(base, SUNLIGHT, 0.4));
  g.addColorStop(0.45, base);
  g.addColorStop(1, mix(base, SHADOW, 0.6));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(4 * S, 0, 11 * S, 8.5 * S, 0, 0, Math.PI * 2);
  ctx.fill();
  // cuff
  ctx.fillStyle = mix(base, SHADOW, 0.35);
  ctx.fillRect(-6 * S, -6 * S, 5 * S, 12 * S);
  // knuckle line
  ctx.strokeStyle = mix(base, SHADOW, 0.5);
  ctx.lineWidth = 1.2 * S;
  ctx.beginPath();
  ctx.arc(4 * S, 0, 7 * S, -0.9, 0.9);
  ctx.stroke();
  ctx.restore();
}

/** A shoe planted at the ankle, toe pointing the way the fighter faces. */
function shoe(ctx: CanvasRenderingContext2D, x: number, y: number, facing: number, S: number, color: string, depth: number, tilt = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing, 1);
  ctx.rotate(rad(tilt));
  const base = depth ? mix(color, SHADOW, depth) : color;
  const g = ctx.createLinearGradient(0, -8 * S, 0, 8 * S);
  g.addColorStop(0, mix(base, SUNLIGHT, 0.35));
  g.addColorStop(1, mix(base, SHADOW, 0.5));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-7 * S, -6 * S);
  ctx.quadraticCurveTo(6 * S, -7 * S, 13 * S, 0);
  ctx.quadraticCurveTo(22 * S, 2 * S, 21 * S, 6 * S);
  ctx.lineTo(-8 * S, 6 * S);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = mix(base, '#ffffff', 0.55); // sole
  ctx.fillRect(-8 * S, 4.5 * S, 29 * S, 2.5 * S);
  ctx.restore();
}

/** Head in profile: skull, jaw, nose, ear, eye, short hair. */
function head(ctx: CanvasRenderingContext2D, x: number, y: number, facing: number, tiltDeg: number, S: number, look: FighterLook) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing * S, S);
  ctx.rotate(rad(tiltDeg));
  const skinG = ctx.createRadialGradient(-4, -8, 2, 0, 0, 18);
  skinG.addColorStop(0, mix(look.skin, SUNLIGHT, 0.35));
  skinG.addColorStop(0.6, look.skin);
  skinG.addColorStop(1, mix(look.skin, SHADOW, 0.5));
  ctx.fillStyle = skinG;
  ctx.beginPath(); // skull + jaw
  ctx.moveTo(-11, 6);
  ctx.bezierCurveTo(-15, -6, -9, -17, 1, -17);
  ctx.bezierCurveTo(10, -17, 14, -9, 13, -2);
  ctx.lineTo(15.5, 3); // nose
  ctx.lineTo(12.5, 5);
  ctx.quadraticCurveTo(13, 9, 11, 11); // mouth / chin
  ctx.quadraticCurveTo(9, 15, 3, 15);
  ctx.quadraticCurveTo(-4, 14, -7, 11);
  ctx.closePath();
  ctx.fill();
  // ear
  ctx.fillStyle = mix(look.skin, SHADOW, 0.25);
  ctx.beginPath();
  ctx.ellipse(-2, 1, 3, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // eye + brow
  ctx.fillStyle = '#16100c';
  ctx.beginPath();
  ctx.ellipse(8, -3, 1.8, 1.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = mix(look.hair, SHADOW, 0.2);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(5, -6.5);
  ctx.lineTo(11, -6);
  ctx.stroke();
  // hair
  const hg = ctx.createLinearGradient(-6, -18, 4, -4);
  hg.addColorStop(0, mix(look.hair, SUNLIGHT, 0.3));
  hg.addColorStop(1, look.hair);
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.moveTo(-12, 5);
  ctx.bezierCurveTo(-17, -8, -10, -20, 2, -19);
  ctx.bezierCurveTo(10, -19, 15, -13, 13, -7);
  ctx.quadraticCurveTo(7, -11, 1, -9);
  ctx.quadraticCurveTo(-4, -7, -5, -2);
  ctx.quadraticCurveTo(-7, 3, -8, 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Forward kinematics + drawing of one fighter. `facing` 1 = facing right. */
export function drawFighter(ctx: CanvasRenderingContext2D, x: number, ground: number, facing: 1 | -1, pose: Pose, look: FighterLook, scale = 1) {
  const S = scale;
  const thigh = 46 * S, shin = 46 * S, upper = 34 * S, fore = 32 * S, torso = 62 * S;
  const hipY = ground - (thigh + shin) + pose.hipDrop * S;
  // soft contact shadow
  const sh = ctx.createRadialGradient(x, ground + 4, 4, x, ground + 4, 60 * S);
  sh.addColorStop(0, 'rgba(0,0,0,0.55)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.fillStyle = sh;
  ctx.scale(1, 0.18);
  ctx.beginPath();
  ctx.arc(x, (ground + 4) / 0.18, 60 * S, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const [chestX, chestY] = [x + Math.sin(rad(pose.lean)) * torso * facing, hipY - Math.cos(rad(pose.lean)) * torso];
  const legs = (thighA: number, shinA: number, ox: number) => {
    const hx = x + ox * facing;
    const [kx, ky] = joint(hx, hipY, thighA, thigh, facing);
    const [fx, fy] = joint(kx, ky, thighA + shinA, shin, facing);
    return { hx, kx, ky, fx, fy: Math.min(fy, ground - 6 * S), lifted: fy < ground - 10 * S, tilt: thighA + shinA };
  };
  const arms = (upA: number, foreA: number, ox: number) => {
    const sx = chestX + ox * facing, sy = chestY + 8 * S;
    const [ex, ey] = joint(sx, sy, upA + pose.lean, upper, facing);
    const [hx, hy] = joint(ex, ey, upA + pose.lean + foreA - 180, fore, facing);
    return { sx, sy, ex, ey, hx, hy };
  };
  const back = legs(pose.backThigh, pose.backShin, -8 * S);
  const front = legs(pose.frontThigh, pose.frontShin, 8 * S);
  const backArm = arms(pose.backUpper, pose.backFore, -8 * S);
  const frontArm = arms(pose.frontUpper, pose.frontFore, 8 * S);

  const drawLeg = (l: ReturnType<typeof legs>, depth: number) => {
    limb(ctx, l.kx, l.ky, l.fx, l.fy, 17 * S, 19 * S, 13 * S, look.pants, 0.35, depth); // shin (loose trousers)
    limb(ctx, l.hx, hipY, l.kx, l.ky, 25 * S, 26 * S, 18 * S, look.pants, 0.35, depth); // thigh
    shoe(ctx, l.fx, l.fy, facing, S, look.shoes, depth, l.lifted ? Math.max(-60, Math.min(60, l.tilt - 90)) : 0);
  };
  const drawArm = (arm: ReturnType<typeof arms>, depth: number) => {
    limb(ctx, arm.sx, arm.sy, arm.ex, arm.ey, 17 * S, 19 * S, 12 * S, look.skin, 0.35, depth); // deltoid + biceps
    limb(ctx, arm.ex, arm.ey, arm.hx, arm.hy, 12 * S, 15 * S, 10 * S, look.skin, 0.3, depth); // forearm
    fist(ctx, arm.ex, arm.ey, arm.hx, arm.hy, S, look.gloves, depth);
  };

  // far side first
  drawArm(backArm, 0.35);
  drawLeg(back, 0.3);

  // neck + head
  const neckX = chestX + Math.sin(rad(pose.lean)) * 4 * S * facing, neckY = chestY - 4 * S;
  const hx = neckX + Math.sin(rad(pose.lean + pose.head)) * 19 * S * facing;
  const hy = neckY - Math.cos(rad(pose.lean + pose.head)) * 19 * S;
  limb(ctx, neckX, neckY, hx, hy, 14 * S, 14 * S, 12 * S, look.skin, 0.5);
  head(ctx, hx, hy - 2 * S, facing, pose.lean + pose.head, S, look);

  // torso: pelvis in trousers, tank top with chest, belt
  limb(ctx, x, hipY + 4 * S, x + (chestX - x) * 0.2, hipY - torso * 0.18, 36 * S, 38 * S, 34 * S, look.pants, 0.5);
  limb(ctx, x, hipY - 6 * S, chestX, chestY + 2 * S, 30 * S, 44 * S, 38 * S, look.top, 0.68);
  const bx = Math.cos(rad(pose.lean)) * 18 * S, by = Math.sin(rad(pose.lean)) * 18 * S * facing;
  const bcx = x + Math.sin(rad(pose.lean)) * 8 * S * facing, bcy = hipY - Math.cos(rad(pose.lean)) * 8 * S;
  ctx.strokeStyle = look.belt;
  ctx.lineWidth = 6 * S;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(bcx - bx, bcy - by);
  ctx.lineTo(bcx + bx, bcy + by);
  ctx.stroke();
  ctx.strokeStyle = mix(look.belt, SHADOW, 0.3); // belt tail
  ctx.lineWidth = 3 * S;
  ctx.beginPath();
  ctx.moveTo(bcx + bx * 0.3, bcy + by * 0.3);
  ctx.quadraticCurveTo(bcx - 4 * S * facing, bcy + 14 * S, bcx - 8 * S * facing, bcy + 22 * S);
  ctx.stroke();

  // near side
  drawLeg(front, 0);
  drawArm(frontArm, 0);
  return { hand: [frontArm.hx, frontArm.hy] as const, foot: [front.fx, front.fy] as const, head: [hx, hy] as const };
}

// ---------- the stage: a rooftop at sunset with a city behind ----------

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let stageCache: { key: string; img: HTMLCanvasElement } | null = null;

function skyline(ctx: CanvasRenderingContext2D, r: () => number, W: number, base: number, minH: number, maxH: number, minW: number, maxW: number, color: string, windows: number, winColor: string) {
  let x = -10;
  while (x < W + 10) {
    const w = minW + r() * (maxW - minW);
    const h = minH + r() * (maxH - minH);
    const top = base - h;
    ctx.fillStyle = color;
    ctx.fillRect(x, top, w, h + 200);
    const roof = r();
    if (roof < 0.18) { // spire
      ctx.beginPath();
      ctx.moveTo(x + w * 0.3, top);
      ctx.lineTo(x + w * 0.5, top - 18 - r() * 30);
      ctx.lineTo(x + w * 0.7, top);
      ctx.fill();
    } else if (roof < 0.4) { // stepped top
      ctx.fillRect(x + w * 0.2, top - 10, w * 0.6, 10);
      ctx.fillRect(x + w * 0.45, top - 22 - r() * 10, 2, 22);
    }
    if (windows > 0) {
      for (let wy = top + 6; wy < base - 4; wy += 7) {
        for (let wx = x + 4; wx < x + w - 5; wx += 6) {
          if (r() < windows) {
            ctx.fillStyle = r() < 0.75 ? winColor : '#9fd4ff';
            ctx.globalAlpha = 0.45 + r() * 0.5;
            ctx.fillRect(wx, wy, 3, 4);
          }
        }
      }
      ctx.globalAlpha = 1;
    }
    x += w + r() * 6;
  }
}

function renderStage(W: number, H: number, ground: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d')!;
  const r = rng(8128);
  const horizon = ground - 96;
  const wallTop = ground - 74, wallBase = ground - 38;

  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#0a0d26');
  sky.addColorStop(0.35, '#26214a');
  sky.addColorStop(0.68, '#7b3a63');
  sky.addColorStop(0.88, '#e0664a');
  sky.addColorStop(1, '#ffb15c');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, horizon + 40);
  // stars
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.6})`;
    const s = r() < 0.1 ? 2 : 1;
    ctx.fillRect(r() * W, r() * horizon * 0.42, s, s);
  }
  // sun
  const sunX = W * 0.3, sunY = horizon - 62;
  const glow = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 260);
  glow.addColorStop(0, 'rgba(255,214,140,0.85)');
  glow.addColorStop(0.2, 'rgba(255,150,80,0.35)');
  glow.addColorStop(1, 'rgba(255,120,80,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, horizon + 40);
  ctx.fillStyle = '#ffe2a8';
  ctx.beginPath();
  ctx.arc(sunX, sunY, 34, 0, Math.PI * 2);
  ctx.fill();
  // cloud streaks, lit from below
  for (let i = 0; i < 7; i++) {
    const cy = horizon * (0.32 + r() * 0.42), cx = r() * W, cw = 120 + r() * 260;
    const cg = ctx.createLinearGradient(0, cy - 6, 0, cy + 6);
    cg.addColorStop(0, 'rgba(60,40,90,0.0)');
    cg.addColorStop(0.5, 'rgba(120,70,120,0.5)');
    cg.addColorStop(1, 'rgba(255,150,110,0.55)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.ellipse(cx, cy, cw / 2, 3 + r() * 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // city: far haze layer, mid layer with lights, near towers at the edges
  skyline(ctx, r, W, horizon + 30, 30, 95, 18, 46, '#6a4672', 0, '');
  const haze1 = ctx.createLinearGradient(0, horizon - 60, 0, horizon + 30);
  haze1.addColorStop(0, 'rgba(240,130,100,0)');
  haze1.addColorStop(1, 'rgba(240,130,100,0.5)');
  ctx.fillStyle = haze1;
  ctx.fillRect(0, horizon - 60, W, 90);
  skyline(ctx, r, W, horizon + 40, 55, 150, 26, 64, '#2a2142', 0.22, '#ffcf7a');
  const haze2 = ctx.createLinearGradient(0, horizon - 20, 0, horizon + 40);
  haze2.addColorStop(0, 'rgba(200,100,110,0)');
  haze2.addColorStop(1, 'rgba(200,100,110,0.35)');
  ctx.fillStyle = haze2;
  ctx.fillRect(0, horizon - 20, W, 60);
  // near towers on both sides
  const tower = (tx: number, tw: number, th: number) => {
    const tg = ctx.createLinearGradient(tx, 0, tx + tw, 0);
    tg.addColorStop(0, '#16132a');
    tg.addColorStop(1, '#0e0c1c');
    ctx.fillStyle = tg;
    ctx.fillRect(tx, wallTop - th, tw, th + 60);
    for (let wy = wallTop - th + 10; wy < wallTop; wy += 12) {
      for (let wx = tx + 7; wx < tx + tw - 8; wx += 11) {
        if (r() < 0.3) {
          ctx.fillStyle = r() < 0.8 ? 'rgba(255,205,130,0.75)' : 'rgba(150,210,255,0.6)';
          ctx.fillRect(wx, wy, 5, 7);
        }
      }
    }
    // sunset rim on the edge facing the sun
    ctx.fillStyle = 'rgba(255,170,110,0.35)';
    ctx.fillRect(tx < sunX ? tx + tw - 2 : tx, wallTop - th, 2, th);
  };
  tower(-20, 110, 170);
  tower(W - 150, 95, 200);
  tower(W - 60, 80, 140);
  // antenna mast on the right tower (the light blinks, drawn per frame)
  ctx.strokeStyle = '#0e0c1c';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(W - 102, wallTop - 200);
  ctx.lineTo(W - 102, wallTop - 262);
  ctx.stroke();

  // rooftop parapet + railing
  const wall = ctx.createLinearGradient(0, wallTop, 0, wallBase);
  wall.addColorStop(0, '#5a4a52');
  wall.addColorStop(0.12, '#3b3140');
  wall.addColorStop(1, '#221d29');
  ctx.fillStyle = wall;
  ctx.fillRect(0, wallTop, W, wallBase - wallTop);
  ctx.fillStyle = 'rgba(255,190,130,0.45)'; // cap lit by the sun
  ctx.fillRect(0, wallTop, W, 3);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  for (let px = 40; px < W; px += 80) { // panel joints
    ctx.beginPath();
    ctx.moveTo(px, wallTop + 3);
    ctx.lineTo(px, wallBase);
    ctx.stroke();
  }
  const railTop = wallTop - 34;
  ctx.strokeStyle = '#17141f';
  ctx.lineWidth = 3;
  for (let px = 20; px < W; px += 64) {
    ctx.beginPath();
    ctx.moveTo(px, wallTop);
    ctx.lineTo(px, railTop);
    ctx.stroke();
  }
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, railTop);
  ctx.lineTo(W, railTop);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, railTop + 16);
  ctx.lineTo(W, railTop + 16);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,180,120,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, railTop - 1.5);
  ctx.lineTo(W, railTop - 1.5);
  ctx.stroke();

  // roof floor
  const floor = ctx.createLinearGradient(0, wallBase, 0, H);
  floor.addColorStop(0, '#3a3140');
  floor.addColorStop(0.35, '#2a2430');
  floor.addColorStop(1, '#141118');
  ctx.fillStyle = floor;
  ctx.fillRect(0, wallBase, W, H - wallBase);
  // sunset sheen on the floor
  const sheen = ctx.createRadialGradient(sunX + 120, wallBase + 10, 10, sunX + 120, wallBase + 10, 420);
  sheen.addColorStop(0, 'rgba(255,160,100,0.22)');
  sheen.addColorStop(1, 'rgba(255,160,100,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, wallBase, W, H - wallBase);
  // concrete slab joints in perspective
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  for (let i = -14; i <= 14; i++) {
    ctx.beginPath();
    ctx.moveTo(W / 2 + i * 46, wallBase);
    ctx.lineTo(W / 2 + i * 150, H);
    ctx.stroke();
  }
  for (let j = 1; j < 6; j++) {
    const y = wallBase + ((H - wallBase) * j * j) / 36;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  // grit
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
    ctx.fillRect(r() * W, wallBase + r() * (H - wallBase), 2, 1);
  }
  // painted helipad ring, worn
  ctx.save();
  ctx.strokeStyle = 'rgba(255,190,70,0.28)';
  ctx.lineWidth = 5;
  ctx.setLineDash([60, 14]);
  ctx.beginPath();
  ctx.ellipse(W / 2, ground + 6, 380, 46, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // props: AC unit (left) and water tank (right) on the roof
  const ac = (ax: number, ay: number) => {
    const g = ctx.createLinearGradient(0, ay - 46, 0, ay);
    g.addColorStop(0, '#6c6672');
    g.addColorStop(1, '#2f2a35');
    ctx.fillStyle = g;
    ctx.fillRect(ax, ay - 46, 92, 46);
    ctx.fillStyle = 'rgba(255,190,130,0.35)';
    ctx.fillRect(ax, ay - 46, 92, 2);
    ctx.fillStyle = '#1b1820';
    ctx.beginPath();
    ctx.arc(ax + 30, ay - 23, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4a4450';
    ctx.lineWidth = 1;
    for (let k = 0; k < 6; k++) {
      ctx.beginPath();
      ctx.moveTo(ax + 52, ay - 40 + k * 6);
      ctx.lineTo(ax + 86, ay - 40 + k * 6);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(ax + 4, ay, 90, 4);
  };
  ac(18, wallBase + 8);
  const tx = W - 120, tBase = wallBase + 6;
  ctx.strokeStyle = '#1d1922';
  ctx.lineWidth = 4;
  for (const lx of [tx - 30, tx - 10, tx + 10, tx + 30]) {
    ctx.beginPath();
    ctx.moveTo(lx, tBase);
    ctx.lineTo(lx * 0.9 + tx * 0.1, tBase - 70);
    ctx.stroke();
  }
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(tx - 30, tBase - 20);
  ctx.lineTo(tx + 30, tBase - 50);
  ctx.moveTo(tx + 30, tBase - 20);
  ctx.lineTo(tx - 30, tBase - 50);
  ctx.stroke();
  const tank = ctx.createLinearGradient(tx - 40, 0, tx + 40, 0);
  tank.addColorStop(0, '#a0684a');
  tank.addColorStop(0.35, '#6e4532');
  tank.addColorStop(1, '#2c1d18');
  ctx.fillStyle = tank;
  ctx.fillRect(tx - 40, tBase - 150, 80, 82);
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  for (let k = 1; k < 4; k++) {
    ctx.beginPath();
    ctx.moveTo(tx - 40, tBase - 150 + k * 20);
    ctx.lineTo(tx + 40, tBase - 150 + k * 20);
    ctx.stroke();
  }
  ctx.fillStyle = '#3a2a24';
  ctx.beginPath();
  ctx.moveTo(tx - 46, tBase - 150);
  ctx.lineTo(tx, tBase - 182);
  ctx.lineTo(tx + 46, tBase - 150);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,180,120,0.4)';
  ctx.beginPath();
  ctx.moveTo(tx - 46, tBase - 150);
  ctx.lineTo(tx, tBase - 182);
  ctx.lineTo(tx - 4, tBase - 178);
  ctx.lineTo(tx - 40, tBase - 151);
  ctx.closePath();
  ctx.fill();

  // darken the front edge so the frame meter stays readable
  const front = ctx.createLinearGradient(0, ground + 40, 0, H);
  front.addColorStop(0, 'rgba(8,7,12,0)');
  front.addColorStop(1, 'rgba(8,7,12,0.85)');
  ctx.fillStyle = front;
  ctx.fillRect(0, ground + 40, W, H - ground - 40);
  return cv;
}

/** The stage: a rooftop at sunset over a city. Static parts are rendered once and cached. */
export function drawStage(ctx: CanvasRenderingContext2D, W: number, H: number, ground: number, now = performance.now()) {
  const key = `${W}x${H}@${ground}`;
  if (stageCache?.key !== key) stageCache = { key, img: renderStage(W, H, ground) };
  ctx.drawImage(stageCache.img, 0, 0);
  // blinking aircraft-warning light on the mast
  const wallTop = ground - 74;
  const on = Math.floor(now / 900) % 2 === 0;
  if (on) {
    const g = ctx.createRadialGradient(W - 102, wallTop - 263, 1, W - 102, wallTop - 263, 14);
    g.addColorStop(0, 'rgba(255,60,60,1)');
    g.addColorStop(1, 'rgba(255,60,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(W - 120, wallTop - 281, 36, 36);
  }
  // a plane crossing far away
  const px = ((now / 60) % (W + 200)) - 100;
  if (Math.floor(now / 500) % 2 === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(px, 54 + Math.sin(px / 300) * 4, 2, 2);
  }
}

export interface Spark {
  x: number; y: number; age: number; kind: 'hit' | 'block' | 'grab';
}

export function drawSpark(ctx: CanvasRenderingContext2D, s: Spark, c: { hit: string; block: string; grab: string }) {
  const life = 18;
  const t = s.age / life;
  if (t >= 1) return;
  const color = s.kind === 'hit' ? c.hit : s.kind === 'block' ? c.block : c.grab;
  ctx.save();
  ctx.globalAlpha = 1 - t;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  const n = s.kind === 'block' ? 6 : 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + s.x;
    const r1 = 8 + t * 20, r2 = 18 + t * (s.kind === 'hit' ? 46 : 30);
    ctx.beginPath();
    ctx.moveTo(s.x + Math.cos(a) * r1, s.y + Math.sin(a) * r1);
    ctx.lineTo(s.x + Math.cos(a) * r2, s.y + Math.sin(a) * r2);
    ctx.stroke();
  }
  if (s.kind === 'block') {
    ctx.beginPath();
    ctx.arc(s.x, s.y, 14 + t * 18, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(s.x, s.y, 8 * (1 - t), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
