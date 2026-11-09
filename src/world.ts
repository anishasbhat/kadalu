/**
 * Top-down artificial-life sim off the Karnataka coast: a few big dolphins and
 * the fish (ಮೀನು) they hunt, seen from above. The whole screen is sea.
 *
 * Fish swim alone, each on its own meandering course, keeping their distance
 * from one another, and bolt away from a dolphin that comes too close.
 *
 * Dolphins: a follow-the-leader spine, so the body bends through every turn.
 * They cruise, then hunt the nearest fish ahead of them when hungry, and dash
 * to wherever you tap the water.
 */
import { TAU, angleDiff, clamp, rand, randInt } from "./math";

export const DOLPHIN_NODES = 18;

export interface Fish {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 0 calm → 1 fleeing. */
  alarm: number;
  /** Smoothed angular velocity; hard turns glint. */
  turn: number;
  /** Where it is idly swimming to: anywhere in the sea, so fish spread out. */
  goalX: number;
  goalY: number;
  /** Which colour of fish this is; the renderer owns the palette. */
  kind: number;
  alive: boolean;
  respawnAt: number;
  /** 0.55 deep → 1 near the surface. */
  depth: number;
}

export type DolphinState = "cruise" | "hunt" | "dash";

export interface Dolphin {
  id: number;
  length: number;
  /** Spine positions, beak first: [x0, y0, x1, y1, ...]. */
  nodes: Float32Array;
  heading: number;
  speed: number;
  state: DolphinState;
  hunger: number;
  /** Where it is cruising to when not hunting; picked anywhere on screen. */
  goalX: number;
  goalY: number;
  goalUntil: number;
  target: Fish | null;
  huntUntil: number;
  dashX: number;
  dashY: number;
  dashUntil: number;
  /** Tail-beat phase: a slight side-to-side sway travels down the body. */
  stroke: number;
  /** 0.7 deep → 1 near the surface; deeper dolphins draw dimmer and underneath. */
  depth: number;
  /** Which skin colour; the renderer owns the palette. */
  kind: number;
}

export interface WorldEvent {
  kind: "ripple";
  x: number;
  y: number;
}

export type WorldOptions = { dolphins?: number };

const FISH = { cruise: 40, flee: 105 };

export class World {
  width = 0;
  height = 0;
  time = 0;
  fish: Fish[] = [];
  dolphins: Dolphin[] = [];
  events: WorldEvent[] = [];
  pointer = { x: 0, y: 0, active: false };
  /** Nose-to-tail length of a fish, in px. */
  fishLength = 30;

  private sep = 60;

  constructor(private options: WorldOptions = {}) {}

  resize(width: number, height: number, cellW: number, cellH: number) {
    const first = this.width === 0;
    this.width = width;
    this.height = height;
    // Fish are big enough to read as fish, and keep well apart so each stands alone.
    this.fishLength = clamp(Math.min(width, height) * 0.075, Math.max(cellW, cellH) * 4, 68);
    this.sep = this.fishLength * 3.5;
    if (first) return this.seed();
    for (const f of this.fish) {
      f.x = clamp(f.x, 0, width);
      f.y = clamp(f.y, 0, height);
    }
  }

  seed() {
    const { width: W, height: H } = this;
    // A small pod of big dolphins: four on a big screen, three where there isn't room.
    const count = this.options.dolphins ?? (W * H > 500000 ? 4 : 3);
    const base = clamp(Math.min(W, H) * 0.5, 190, 480);
    const sizes = [1, 0.84, 0.74, 0.92, 0.8, 0.7, 0.88, 0.76, 0.95, 0.72];

    this.dolphins = Array.from({ length: count }, (_, i) => {
      const length = base * sizes[i % sizes.length];
      const heading = rand(0, TAU);
      // Spread the pod out on a loose grid so nobody starts tangled up.
      const gc = Math.ceil(Math.sqrt(count * (W / H)));
      const gr = Math.ceil(count / gc);
      const x = ((i % gc) + rand(0.3, 0.7)) / gc * W;
      const y = (Math.floor(i / gc) + rand(0.3, 0.7)) / gr * H;
      const nodes = new Float32Array(DOLPHIN_NODES * 2);
      const seg = length / (DOLPHIN_NODES - 1);
      for (let n = 0; n < DOLPHIN_NODES; n++) {
        nodes[n * 2] = x - Math.cos(heading) * seg * n;
        nodes[n * 2 + 1] = y - Math.sin(heading) * seg * n;
      }
      return {
        id: i, length, nodes, heading, speed: 80, state: "cruise" as DolphinState,
        hunger: rand(0.2, 0.6), goalX: x, goalY: y, goalUntil: 0, target: null, huntUntil: 0,
        dashX: 0, dashY: 0, dashUntil: 0, stroke: rand(0, TAU),
        depth: 0.7 + 0.3 * sizes[i % sizes.length],
        kind: i,
      };
    });

    const fishCount = clamp(Math.round((W * H) / 85000), 5, 16);
    this.fish = Array.from({ length: fishCount }, () => this.makeFish(rand(0.05, 0.95) * W, rand(0.05, 0.95) * H, rand(0, TAU)));
  }

  private makeFish(x: number, y: number, dir: number): Fish {
    const s = FISH.cruise * rand(0.8, 1.2);
    return {
      x, y, vx: Math.cos(dir) * s, vy: Math.sin(dir) * s,
      alarm: 0, turn: 0, ...this.somewhere(0.1), kind: randInt(0, 3), alive: true, respawnAt: 0, depth: rand(0.6, 1),
    };
  }

  /** A random point anywhere on screen, at least `inset` (fraction) from the edges. */
  private somewhere(inset: number) {
    return { goalX: rand(inset, 1 - inset) * this.width, goalY: rand(inset, 1 - inset) * this.height };
  }

  /**
   * Somewhere uncrowded for fish `f` to swim to next: the best of a few random
   * spots, scored by how far it is from the other fish (and where they're headed).
   * Uniform random targets alone pile fish up in the middle, because the straight
   * line between two random points crosses the centre far more than the edges.
   */
  private openWater(f: Fish) {
    const { width: W, height: H } = this;
    const hop = Math.min(W, H) * 0.6;
    let bx = f.x, by = f.y, best = -Infinity;
    for (let i = 0; i < 8; i++) {
      const x = rand(0.08, 0.92) * W, y = rand(0.08, 0.92) * H;
      let crowd = Infinity;
      for (const o of this.fish) {
        if (o === f || !o.alive) continue;
        crowd = Math.min(crowd, Math.hypot(x - o.x, y - o.y), Math.hypot(x - o.goalX, y - o.goalY));
      }
      // Short-ish hops, so fish don't keep cutting across the middle.
      const score = Math.min(crowd, hop) - 0.35 * Math.hypot(x - f.x, y - f.y);
      if (score > best) { best = score; bx = x; by = y; }
    }
    return { goalX: bx, goalY: by };
  }

  /** A tap on the water: a ripple, fish scatter, and the nearest dolphin dashes over. */
  splash(x: number, y: number) {
    this.events.push({ kind: "ripple", x, y });
    for (const f of this.fish) {
      if (!f.alive) continue;
      const d = Math.hypot(f.x - x, f.y - y);
      if (d < 180) {
        f.alarm = 1;
        const k = 80 / Math.max(d, 10);
        f.vx += (f.x - x) * k;
        f.vy += (f.y - y) * k;
      }
    }
    let best: Dolphin | null = null, bd = Infinity;
    for (const d of this.dolphins) {
      const dist = Math.hypot(d.nodes[0] - x, d.nodes[1] - y);
      if (dist < bd) { bd = dist; best = d; }
    }
    if (best) {
      best.state = "dash";
      best.dashX = x;
      best.dashY = y;
      best.dashUntil = this.time + 3;
      best.target = null;
    }
  }

  step(dt: number) {
    this.time += dt;
    this.stepFish(dt);
    for (const d of this.dolphins) this.stepDolphin(d, dt);
    this.respawn();
  }

  // ---- fish ------------------------------------------------------------------

  private stepFish(dt: number) {
    const { fish, dolphins, sep, width: W, height: H, pointer } = this;
    // Fish keep to open water, away from the edges, so the chase stays on screen.
    const m = Math.max(this.fishLength * 1.2, Math.min(W, H) * 0.08);

    for (const f of fish) {
      if (!f.alive) continue;
      // Idle along towards a destination anywhere in the sea; pick another on arrival.
      const gx = f.goalX - f.x, gy = f.goalY - f.y;
      const gd = Math.hypot(gx, gy) || 1;
      if (gd < this.fishLength * 2) Object.assign(f, this.openWater(f));
      let fx = (gx / gd) * FISH.cruise * 1.5 - f.vx;
      let fy = (gy / gd) * FISH.cruise * 1.5 - f.vy;

      // Keep their distance: every fish on its own.
      for (const o of fish) {
        if (o === f || !o.alive) continue;
        const dx = f.x - o.x, dy = f.y - o.y;
        const dist = Math.hypot(dx, dy) || 0.01;
        if (dist < sep) {
          const k = 1 - dist / sep;
          fx += (dx / dist) * 120 * k;
          fy += (dy / dist) * 120 * k;
        }
      }

      let threat = 0;
      for (const d of dolphins) {
        // The beak and the middle of the body both count.
        for (const k of [0, 6]) {
          const dx = f.x - d.nodes[k * 2], dy = f.y - d.nodes[k * 2 + 1];
          const dist = Math.hypot(dx, dy) || 1;
          const range = d.state === "cruise" ? d.length * 0.35 : d.length * 0.5;
          if (dist > range) continue;
          const t = 1 - dist / range;
          threat = Math.max(threat, t);
          fx += (dx / dist) * 700 * t;
          fy += (dy / dist) * 700 * t;
        }
      }
      if (pointer.active) {
        const dx = f.x - pointer.x, dy = f.y - pointer.y;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist < 130) {
          const t = 1 - dist / 130;
          fx += (dx / dist) * 600 * t;
          fy += (dy / dist) * 600 * t;
          threat = Math.max(threat, t * 0.7);
        }
      }
      // Turn back from the very edges rather than wrapping, so nobody pops across.
      if (f.x < m) fx += (m - f.x) * 6;
      if (f.x > W - m) fx -= (f.x - (W - m)) * 6;
      if (f.y < m) fy += (m - f.y) * 6;
      if (f.y > H - m) fy -= (f.y - (H - m)) * 6;
      f.alarm = Math.max(f.alarm - dt * 0.5, threat);

      f.vx += fx * dt * 1.5;
      f.vy += fy * dt * 1.5;
      const want = FISH.cruise + (FISH.flee - FISH.cruise) * f.alarm;
      const s = Math.hypot(f.vx, f.vy) || 0.01;
      const ns = Math.min(FISH.flee, s + (want - s) * Math.min(1, dt * 2.5));
      const oldA = Math.atan2(f.vy, f.vx);
      f.vx = (f.vx / s) * ns;
      f.vy = (f.vy / s) * ns;
      const a = Math.atan2(f.vy, f.vx);
      // After a scare, head off somewhere new, roughly the way it fled.
      if (f.alarm > 0.3) {
        const r = Math.min(W, H) * 0.35;
        f.goalX = clamp(f.x + Math.cos(a) * r, W * 0.08, W * 0.92);
        f.goalY = clamp(f.y + Math.sin(a) * r, H * 0.08, H * 0.92);
      }
      f.turn += (Math.abs(angleDiff(oldA, a)) / dt - f.turn) * Math.min(1, dt * 8);
      f.x += f.vx * dt;
      f.y += f.vy * dt;
    }
  }

  // ---- dolphins ------------------------------------------------------------

  private stepDolphin(d: Dolphin, dt: number) {
    const { width: W, height: H, time } = this;
    const L = d.length;
    let hx = d.nodes[0], hy = d.nodes[1];

    d.hunger = Math.min(1, d.hunger + dt * 0.03);
    // Give up on a fish that dies, takes too long, or hugs an edge (no chasing off-screen).
    const edge = (f: Fish) => Math.min(f.x, W - f.x, f.y, H - f.y) < L * 0.25;
    if (d.target && (!d.target.alive || time > d.huntUntil || edge(d.target))) d.target = null;
    if (d.state === "dash" && (time > d.dashUntil || Math.hypot(d.dashX - hx, d.dashY - hy) < L * 0.15)) d.state = "cruise";

    let want = d.heading;
    let speed = 85;
    let turn = 1.4;

    if (d.state === "dash") {
      want = Math.atan2(d.dashY - hy, d.dashX - hx);
      speed = 260;
      turn = 2.6;
    } else {
      if (d.hunger > 0.6 && !d.target) {
        d.target = this.pickFish(d);
        d.huntUntil = time + 7;
      }
      const t = d.target;
      if (t) {
        d.state = "hunt";
        const dist = Math.hypot(t.x - hx, t.y - hy);
        const lead = Math.min(dist / 200, 0.5);
        want = Math.atan2(t.y + t.vy * lead - hy, t.x + t.vx * lead - hx);
        speed = 230;
        turn = 2.8;
        if (dist < L * 0.12) {
          t.alive = false;
          t.respawnAt = time + rand(4, 9);
          d.hunger = Math.max(0, d.hunger - 0.6);
          d.target = null;
          if (d.hunger < 0.15) d.state = "cruise";
        }
      } else {
        d.state = "cruise";
        // Cruise to somewhere new on screen, near the edges as often as the middle,
        // but at least a turning circle in, so there's room to come about.
        if (time > d.goalUntil || Math.hypot(d.goalX - hx, d.goalY - hy) < L * 0.4) {
          const r = L * 0.75;
          d.goalX = rand(Math.min(r, W * 0.4), Math.max(W - r, W * 0.6));
          d.goalY = rand(Math.min(r, H * 0.4), Math.max(H - r, H * 0.6));
          d.goalUntil = time + rand(10, 16);
        }
        want = Math.atan2(d.goalY - hy, d.goalX - hx);
      }
    }

    // Keep on screen by looking ahead. If the point we're heading for is past an
    // edge, steer for the nearest safe point to it: that swings the dolphin round
    // to run along the edge rather than back to the middle, and points it out of
    // a corner. Swimming straight at a wall, that point is dead ahead, so then it
    // turns along the wall towards whichever side it was going.
    const look = L * 1.2;
    const cx = Math.cos(d.heading), cy = Math.sin(d.heading);
    const ax = hx + cx * look, ay = hy + cy * look;
    const m = clamp(L * 0.35, 40, Math.min(W, H) * 0.18);
    const past = Math.max(m - ax, ax - (W - m), m - ay, ay - (H - m));
    if (past > 0) {
      let safe = Math.atan2(clamp(ay, m, H - m) - hy, clamp(ax, m, W - m) - hx);
      const ox = ax < m ? -1 : ax > W - m ? 1 : 0, oy = ay < m ? -1 : ay > H - m ? 1 : 0;
      if (!(ox && oy) && Math.abs(angleDiff(d.heading, safe)) < 0.5) {
        const gx = (d.state === "cruise" ? d.goalX : W / 2) - hx, gy = (d.state === "cruise" ? d.goalY : H / 2) - hy;
        const side = gx * -oy + gy * ox >= 0 ? 1 : -1;
        safe = Math.atan2(ox * side, -oy * side);
      }
      const k = clamp(past / look, 0, 1);
      want += angleDiff(want, safe) * Math.min(1, 0.5 + k * 2);
      turn = Math.max(turn, 2);
    }

    // Give each other room, measured body to body.
    const mid = (DOLPHIN_NODES >> 1) * 2;
    for (const o of this.dolphins) {
      if (o === d) continue;
      const dx = d.nodes[mid] - o.nodes[mid], dy = d.nodes[mid + 1] - o.nodes[mid + 1];
      const r = (L + o.length) * 0.45;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < r) want += clamp(angleDiff(want, Math.atan2(dy, dx)) * 0.7 * (1 - dist / r), -0.8, 0.8);
    }

    // A turning circle no tighter than ~0.55 body lengths, so the spine never
    // curls round on itself (and the fins don't fold over the body).
    turn = Math.min(turn, Math.max(d.speed, 70) / (0.55 * L));
    d.heading += clamp(angleDiff(d.heading, want), -turn * dt, turn * dt);
    d.speed += (speed - d.speed) * Math.min(1, dt * 1.2);
    // The tail beat sways the head a touch; the spine carries it down as a wave.
    d.stroke += dt * (2 + d.speed / 50);
    const sway = d.heading + Math.sin(d.stroke) * 0.07;
    hx += Math.cos(sway) * d.speed * dt;
    hy += Math.sin(sway) * d.speed * dt;
    this.follow(d, hx, hy);
  }

  private follow(d: Dolphin, hx: number, hy: number) {
    const nodes = d.nodes;
    nodes[0] = hx;
    nodes[1] = hy;
    const seg = d.length / (DOLPHIN_NODES - 1);
    for (let n = 1; n < DOLPHIN_NODES; n++) {
      const ax = nodes[(n - 1) * 2], ay = nodes[(n - 1) * 2 + 1];
      const dx = nodes[n * 2] - ax, dy = nodes[n * 2 + 1] - ay;
      const dd = Math.hypot(dx, dy) || 1;
      nodes[n * 2] = ax + (dx / dd) * seg;
      nodes[n * 2 + 1] = ay + (dy / dd) * seg;
    }
  }

  /** The nearest fish, favouring ones ahead over ones behind. */
  private pickFish(d: Dolphin) {
    const hx = d.nodes[0], hy = d.nodes[1];
    let best: Fish | null = null, bs = Infinity;
    const { width: W, height: H } = this;
    for (const f of this.fish) {
      if (!f.alive || Math.min(f.x, W - f.x, f.y, H - f.y) < d.length * 0.25) continue;
      const dist = Math.hypot(f.x - hx, f.y - hy);
      const ahead = Math.abs(angleDiff(d.heading, Math.atan2(f.y - hy, f.x - hx)));
      const score = dist + ahead * d.length * 0.5;
      if (score < bs) { bs = score; best = f; }
    }
    return best;
  }

  private respawn() {
    const { width: W, height: H } = this;
    for (const f of this.fish) {
      if (f.alive || f.respawnAt > this.time) continue;
      // A new fish swims in from off-screen.
      const side = randInt(0, 3);
      const x = side === 0 ? -20 : side === 1 ? W + 20 : rand(0.1, 0.9) * W;
      const y = side === 2 ? -20 : side === 3 ? H + 20 : rand(0.1, 0.9) * H;
      Object.assign(f, this.makeFish(x, y, Math.atan2(H / 2 - y, W / 2 - x) + rand(-0.5, 0.5)));
    }
  }
}
