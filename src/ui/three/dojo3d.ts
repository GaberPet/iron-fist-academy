// Bot Dojo in 3D: maps a DrillEngine round onto the 3D arena's fighter model, so the drills
// use the same fighters, animations, camera and effects as Free Fight.
import type { Move } from '../../types';
import type { FightEngine, Fighter, FightEvent } from '../../core/fight';
import type { DrillEngine } from '../../core/sim';
import type { Frame } from '../../core/recognizer';
import { isDownish } from '../../core/notation';
import { recoveryFrames } from '../../core/frames';

const THROW: Move = {
  id: '1+3', num: null, name: 'Throw', alt: [], input: '1+3', parent: null, hitLevels: ['t'], damage: '35', startup: 'i12', startupFrame: 12,
  block: '', blockFrame: null, blockRange: null, hit: '', hitFrame: null, ch: '', crush: '', recovery: 'r30', reach: '', tracks: '', notes: '', isThrow: true,
};

function blank(side: 0 | 1): Fighter {
  return {
    side, char: null as never, pos: { x: side ? 60 : -60, z: 0 }, hp: 180, recov: 0, state: 'neutral', stateAt: 0, until: 0, crouching: false, guard: 'stand', walking: 0,
    move: null, moveStart: 0, hitAt: 0, endAt: 0, outcome: 'pending', aim: null, lunge: 0, queued: null, y: 0, vy: 0, airHits: 0, tornadoUsed: false, wallHit: false, noTech: false,
    step: null, combo: { hits: 0, damage: 0 }, lastHit: -999, hitHeight: 100, throwBreak: null, breakLocked: false, dealt: 0, heat: 'ready', heatLeft: 0, rageUsed: false, impactAt: -999,
    facing: { x: side ? -1 : 1, z: 0 },
  };
}

/** Keeps two pseudo-fighters in sync with a drill and produces effect events. */
export class DrillView {
  readonly p = blank(0);
  readonly b = blank(1);
  private lastImpact = -1;
  private lastResult: unknown = null;
  readonly fake: FightEngine;

  constructor() {
    const self = this;
    this.fake = {
      get f() {
        return [self.p, self.b];
      },
      phase: 'fight',
      winner: null,
      phaseAt: 0,
      freeze: 0,
      get distance() {
        return Math.abs(self.b.pos.x - self.p.pos.x);
      },
      foreground: { x: 0, z: 1 },
    } as unknown as FightEngine;
  }

  update(e: DrillEngine, f: Frame | null): FightEvent[] {
    const ev: FightEvent[] = [];
    const frame = f?.frame ?? 0;
    const dir = f?.dir ?? 'n';
    const a = e.action;
    const tl = e.timeline;
    const res = e.result;
    const { p, b } = this;
    b.pos.x = a?.kind === 'whiff' ? 175 : 62;
    p.pos.x = -62;
    const playerHit = res && ['got-hit', 'pressed-early', 'thrown', 'pressed-into-safe'].includes(res.outcome);
    const botHit = res && ['punished', 'whiff-punished'].includes(res.outcome);
    const hitY = a?.level === 'high' ? 150 : a?.level === 'low' ? 35 : 105;

    // ----- player -----
    const pm = e.playerMove;
    const set = (x: Fighter, state: Fighter['state'], at: number) => {
      if (x.state !== state) x.stateAt = at;
      x.state = state;
    };
    if (playerHit && tl && frame - tl.impact < 34 && frame >= tl.impact) {
      set(p, 'hitstun', tl.impact);
      p.hitHeight = hitY;
      p.until = tl.impact + 34;
    } else if (pm && frame - pm.frame < (pm.move.startupFrame ?? 12) + (recoveryFrames(pm.move) ?? 20)) {
      set(p, 'attack', pm.frame);
      p.move = pm.move;
      p.moveStart = pm.frame;
      p.hitAt = pm.frame + (pm.move.startupFrame ?? 12) - 1;
      p.endAt = p.hitAt + 1 + (recoveryFrames(pm.move) ?? 20);
    } else if (e.blocked && tl && frame >= tl.impact && frame < tl.playerActionable) {
      set(p, 'blockstun', tl.impact);
      p.crouching = e.crouchBlocked;
    } else {
      set(p, 'neutral', frame);
      p.move = null;
      p.crouching = isDownish(dir);
      p.guard = dir === 'd' || dir === 'db' ? 'crouch' : dir === 'n' || dir === 'b' ? 'stand' : 'none';
    }

    // ----- bot -----
    if (botHit && pm && frame - pm.frame < 44) {
      set(b, 'hitstun', pm.frame + (pm.move.startupFrame ?? 12));
      b.hitHeight = 110;
      b.until = b.stateAt + 34;
    } else if (a && tl && frame >= tl.t0 && (a.kind === 'whiff' ? frame < tl.impact + a.recovery : frame < Math.max(tl.botActionable, tl.impact + 12)) && res?.outcome !== 'pressed-early') {
      set(b, 'attack', tl.t0);
      b.move = a.move ?? THROW;
      b.moveStart = tl.t0;
      b.hitAt = tl.impact;
      b.endAt = a.kind === 'whiff' ? tl.impact + a.recovery : Math.max(tl.botActionable, tl.impact + 12);
    } else {
      set(b, 'neutral', frame);
      b.move = null;
      b.crouching = false;
    }

    // ----- effects -----
    const mid = { x: 0, z: 0 };
    if (tl && frame === tl.impact && this.lastImpact !== tl.impact) {
      this.lastImpact = tl.impact;
      if (a?.kind === 'throw') ev.push({ type: 'throw', by: 1, at: mid, y: 120 });
      else if (a?.kind !== 'whiff') {
        ev.push({ type: e.blocked ? 'block' : 'hit', by: 1, at: mid, y: hitY, level: a?.level === 'throw' ? 'throw' : a?.level, damage: 14 });
        if (!e.blocked) p.lastHit = frame;
      }
    }
    if (res && res !== this.lastResult) {
      this.lastResult = res;
      if (botHit) {
        ev.push({ type: 'hit', by: 0, at: { x: b.pos.x - 30, z: 0 }, y: 110, damage: 20 });
        b.lastHit = frame;
      }
      if (res.outcome === 'broke-throw') ev.push({ type: 'break', by: 0, at: mid, y: 120 });
    }
    return ev;
  }
}
