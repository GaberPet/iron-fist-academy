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
  outfit: string; // main garment colour
  trim: string; // belt / gloves
  skin: string;
  dark: string; // shading colour
}

const rad = (d: number) => (d * Math.PI) / 180;

/** Draw a limb segment as a shaded capsule from (x1,y1) to (x2,y2). */
function capsule(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, w: number, color: string, dark: string) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const g = ctx.createLinearGradient(x1 + nx * w, y1 + ny * w, x1 - nx * w, y1 - ny * w);
  g.addColorStop(0, dark);
  g.addColorStop(0.45, color);
  g.addColorStop(1, dark);
  ctx.strokeStyle = g;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function joint(x: number, y: number, ang: number, len: number, facing: number) {
  return [x + Math.sin(rad(ang)) * len * facing, y + Math.cos(rad(ang)) * len] as const;
}

/** Forward kinematics + drawing of one fighter. `facing` 1 = facing right. */
export function drawFighter(ctx: CanvasRenderingContext2D, x: number, ground: number, facing: 1 | -1, pose: Pose, look: FighterLook, scale = 1) {
  const S = scale;
  const thigh = 46 * S, shin = 46 * S, upper = 34 * S, fore = 32 * S, torso = 62 * S;
  const hipY = ground - (thigh + shin) + pose.hipDrop * S;
  // shadow
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(x, ground + 4, 52 * S, 9 * S, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const [chestX, chestY] = [x + Math.sin(rad(pose.lean)) * torso * facing, hipY - Math.cos(rad(pose.lean)) * torso];
  const legs = (thighA: number, shinA: number, ox: number) => {
    const hx = x + ox * facing;
    const [kx, ky] = joint(hx, hipY, thighA, thigh, facing);
    const [fx, fy] = joint(kx, ky, thighA + shinA, shin, facing);
    return { hx, kx, ky, fx, fy: Math.min(fy, ground) };
  };
  const arms = (upA: number, foreA: number, ox: number) => {
    const sx = chestX + ox * facing, sy = chestY + 8 * S;
    const [ex, ey] = joint(sx, sy, upA + pose.lean, upper, facing);
    const [hx, hy] = joint(ex, ey, upA + pose.lean + foreA - 180, fore, facing);
    return { sx, sy, ex, ey, hx, hy };
  };
  const back = legs(pose.backThigh, pose.backShin, -8 * S);
  const front = legs(pose.frontThigh, pose.frontShin, 8 * S);
  const backArm = arms(pose.backUpper, pose.backFore, -10 * S);
  const frontArm = arms(pose.frontUpper, pose.frontFore, 10 * S);
  const darker = look.dark;

  // back limbs (further from camera: darker)
  ctx.globalAlpha = 0.85;
  capsule(ctx, back.hx, hipY, back.kx, back.ky, 20 * S, look.outfit, darker);
  capsule(ctx, back.kx, back.ky, back.fx, back.fy, 16 * S, look.skin, darker);
  capsule(ctx, back.fx, back.fy, back.fx + 14 * S * facing, back.fy, 9 * S, look.trim, darker);
  capsule(ctx, backArm.sx, backArm.sy, backArm.ex, backArm.ey, 15 * S, look.skin, darker);
  capsule(ctx, backArm.ex, backArm.ey, backArm.hx, backArm.hy, 13 * S, look.skin, darker);
  ctx.fillStyle = look.trim;
  ctx.beginPath();
  ctx.arc(backArm.hx, backArm.hy, 9 * S, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // torso: hips, trunk, belt
  capsule(ctx, x, hipY, chestX, chestY, 34 * S, look.skin, darker);
  capsule(ctx, x, hipY + 6 * S, x + (chestX - x) * 0.25, hipY - torso * 0.2, 36 * S, look.outfit, darker);
  ctx.strokeStyle = look.trim;
  ctx.lineWidth = 6 * S;
  ctx.beginPath();
  ctx.moveTo(x - 17 * S, hipY - 12 * S);
  ctx.lineTo(x + 17 * S, hipY - 12 * S);
  ctx.stroke();

  // head
  const [nx, ny] = [chestX + Math.sin(rad(pose.lean)) * 6 * S * facing, chestY - 10 * S];
  const hx = nx + Math.sin(rad(pose.lean + pose.head)) * 16 * S * facing;
  const hy = ny - Math.cos(rad(pose.lean + pose.head)) * 16 * S;
  const hg = ctx.createRadialGradient(hx - 5 * S * facing, hy - 6 * S, 2 * S, hx, hy, 17 * S);
  hg.addColorStop(0, look.skin);
  hg.addColorStop(1, darker);
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(hx, hy, 16 * S, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = look.dark;
  ctx.beginPath(); // hair cap
  ctx.arc(hx - 2 * S * facing, hy - 3 * S, 16 * S, Math.PI * 1.05, Math.PI * 1.95);
  ctx.fill();

  // front limbs
  capsule(ctx, front.hx, hipY, front.kx, front.ky, 21 * S, look.outfit, darker);
  capsule(ctx, front.kx, front.ky, front.fx, front.fy, 17 * S, look.skin, darker);
  capsule(ctx, front.fx, front.fy, front.fx + 15 * S * facing, front.fy, 10 * S, look.trim, darker);
  capsule(ctx, frontArm.sx, frontArm.sy, frontArm.ex, frontArm.ey, 16 * S, look.skin, darker);
  capsule(ctx, frontArm.ex, frontArm.ey, frontArm.hx, frontArm.hy, 14 * S, look.skin, darker);
  const gg = ctx.createRadialGradient(frontArm.hx - 3 * S, frontArm.hy - 3 * S, 1, frontArm.hx, frontArm.hy, 11 * S);
  gg.addColorStop(0, look.trim);
  gg.addColorStop(1, darker);
  ctx.fillStyle = gg;
  ctx.beginPath();
  ctx.arc(frontArm.hx, frontArm.hy, 10 * S, 0, Math.PI * 2);
  ctx.fill();
  return { hand: [frontArm.hx, frontArm.hy] as const, foot: [front.fx, front.fy] as const, head: [hx, hy] as const };
}

/** The stage: back wall with light, perspective floor. */
export function drawStage(ctx: CanvasRenderingContext2D, W: number, H: number, ground: number, c: { paper: string; paper2: string; rule: string; accent: string }) {
  const wall = ctx.createLinearGradient(0, 0, 0, ground);
  wall.addColorStop(0, c.paper);
  wall.addColorStop(1, c.paper2);
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, W, ground);
  // spotlight
  const spot = ctx.createRadialGradient(W / 2, ground - 40, 20, W / 2, ground - 40, W * 0.55);
  spot.addColorStop(0, 'rgba(255,190,90,0.16)');
  spot.addColorStop(1, 'rgba(255,190,90,0)');
  ctx.fillStyle = spot;
  ctx.fillRect(0, 0, W, ground);
  // floor
  const floor = ctx.createLinearGradient(0, ground, 0, H);
  floor.addColorStop(0, c.paper2);
  floor.addColorStop(1, c.paper);
  ctx.fillStyle = floor;
  ctx.fillRect(0, ground, W, H - ground);
  ctx.strokeStyle = c.rule;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.6;
  for (let i = -12; i <= 12; i++) {
    ctx.beginPath();
    ctx.moveTo(W / 2 + i * 40, ground);
    ctx.lineTo(W / 2 + i * 140, H);
    ctx.stroke();
  }
  for (let j = 1; j < 5; j++) {
    const y = ground + ((H - ground) * j * j) / 25;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = c.accent;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, ground);
  ctx.lineTo(W, ground);
  ctx.stroke();
  ctx.globalAlpha = 1;
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
