/**
 * Draws the World, seen from above, as a grid of small Kannada (ಕನ್ನಡ) cells.
 * The whole screen is sea:
 *   1. a wake that diffuses behind whatever swims, as faint ೦ bubbles
 *   2. ripples of ೦ rings where you tap the water
 *   3. fish as small mosaics in warm oranges with forked, beating tails, written
 *      in the letters of ಮೀನು (fish), glinting on hard turns
 *   4. dolphins rasterised into a mosaic: every cell a softly shaded square tile
 *      carrying a letter of ಕಡಲಹಂದಿ (sea pig, a name for the dolphin), heavier
 *      letters where there is more ink.
 *      Beak, melon, flippers out to the sides, a dorsal ridge, a blowhole, flukes.
 */
import { TAU, clamp, hash3, keyframes, lerp, smoothstep } from "./math";
import { DOLPHIN_NODES, type Dolphin, type Fish, type World } from "./world";

type RGB = [number, number, number];

export type ThemeName = "light" | "dark";

interface Theme {
  /** Shows in the 1px gaps between cells: the colour of the grid lines. */
  bg: string;
  /** The tile in every empty cell. */
  grid: string;
  /** True on a pale background: there, darker means more ink. */
  light: boolean;
  wake: RGB;
  /** Fish in one warm family of muted oranges, apricot, burnt orange, amber and
   *  salmon, close in hue to the pink-grey humpbacks so the sea stays in harmony. */
  fish: RGB[];
}

const THEMES: Record<ThemeName, Theme> = {
  dark: {
    bg: "#000000", grid: "#0b1d3d", light: false, wake: [170, 200, 225],
    fish: [[232, 152, 100], [212, 122, 84], [236, 178, 112], [226, 142, 122]],
  },
  // The same colours, deepened so they hold up on white.
  light: {
    bg: "#a8c3e6", grid: "#ffffff", light: true, wake: [96, 124, 152],
    fish: [[200, 112, 64], [178, 90, 54], [196, 142, 66], [190, 106, 88]],
  },
};
// Dolphin skins, as per-channel tints: slate grey, the pink-grey of the
// Indo-Pacific humpback dolphins seen off Karnataka, a darker bottlenose, and
// a pale, older humpback.
const SKINS: RGB[] = [[0.86, 0.93, 1], [1, 0.8, 0.8], [0.74, 0.77, 0.82], [0.95, 0.9, 0.9]];
const GLINT: RGB = [255, 244, 214];
// Each animal is written in the letters of its own name, ordered light → heavy ink.
// Fish: ಮೀನು (mīnu, "fish"): ನ at the faint edges, ಮ in the body.
const FISH_RAMP = "ನಮ";
// Dolphins: ಕಡಲಹಂದಿ (kaḍala handi, "sea pig"), a coastal name for the dolphin.
// (ಂ is left out: on its own it renders as a dotted circle.)
const RAMP = "ಲಕದಡಹ";

// Outline from above, as half-widths in fractions of length, beak (0) → flukes (1).
const body = keyframes([
  [0, 0.012], [0.05, 0.018], [0.08, 0.036], [0.13, 0.064], [0.22, 0.088], [0.35, 0.094],
  [0.55, 0.07], [0.75, 0.038], [0.86, 0.02], [0.92, 0.017], [1, 0.012],
]);
// Pectoral flippers, out to each side and swept back.
const flipper = keyframes([[0.19, 0], [0.25, 0.05], [0.32, 0.09], [0.35, 0.085], [0.36, 0]]);
// Flukes: a wide swept-back crescent.
const fluke = keyframes([[0.85, 0], [0.92, 0.06], [0.97, 0.13], [0.995, 0.15], [1, 0.14]]);
// The dorsal fin, seen from above: a thin ridge along the spine.
const ridge = keyframes([[0.36, 0], [0.42, 0.014], [0.5, 0.012], [0.57, 0]]);

const F_BODY = 1, F_FIN = 2, F_RIDGE = 3;
const FLIPPER_AT = 0.27, FLUKE_AT = 0.86;
// A 3×3 grid of sample points per cell, for soft edges.
const SUBSAMPLES = [1, 3, 5].flatMap((y) => [1, 3, 5].flatMap((x) => [x / 6, y / 6]));
const NS = SUBSAMPLES.length / 2;
// Light from the upper left, mostly overhead.
const LX = -0.4, LY = -0.45, LZ = 0.8;

export class GlyphRenderer {
  cellWidth = 12;
  cellHeight = 22;
  private ctx: CanvasRenderingContext2D;
  private fontSize = 15;
  private fontFamily = "sans-serif";
  private cols = 0;
  private rows = 0;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private time = 0;

  private wake = new Float32Array(0);
  private wakeTmp = new Float32Array(0);
  private glyph: string[] = [];
  private color = new Int32Array(0);
  /** Packed colour of a shaded square behind the letter, 0 for none. */
  private tile = new Int32Array(0);
  private ripples: { x: number; y: number; age: number }[] = [];
  private buckets = new Map<number, number[]>();
  private styleCache = new Map<number, string>();
  /** Result of the last sampleDolphin: which part was hit, and its brightness. */
  private sample = { flag: 0, light: 0 };
  /**
   * Rigid frames the fins hang from, per dolphin: origin and left normal for the
   * flippers (at s = FLIPPER_AT) and the flukes (at s = FLUKE_AT). Fins drawn in
   * these frames stay crisp however hard the spine bends.
   */
  private frames = new Float64Array(8);

  private theme: Theme;
  /** The empty grid, drawn once per resize and copied under every frame. */
  private gridLayer: HTMLCanvasElement | null = null;

  constructor(private canvas: HTMLCanvasElement, theme: ThemeName = "dark") {
    this.ctx = canvas.getContext("2d")!;
    this.theme = THEMES[theme];
  }

  setFontFamily(family: string) {
    this.fontFamily = family || "sans-serif";
    this.measure();
  }

  private get font() {
    return `600 ${this.fontSize}px ${this.fontFamily}`;
  }

  private measure() {
    this.ctx.font = this.font;
    this.cellWidth = Math.ceil(this.ctx.measureText("ಲ").width) + 1;
    // Near-square cells, so shapes have the same resolution both ways. The ramp
    // letters have no signs hanging below the line, so they fit.
    this.cellHeight = Math.max(this.cellWidth, Math.round(this.fontSize * 1.15));
  }

  resize(width: number, height: number, dpr: number) {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    // Small cells, so an animal is hundreds of letters and its outline reads smooth.
    this.fontSize = width < 600 ? 7 : width < 1400 ? 8 : 9;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.measure();
    this.cols = Math.ceil(width / this.cellWidth);
    this.rows = Math.ceil(height / this.cellHeight);
    const n = this.cols * this.rows;
    this.wake = new Float32Array(n);
    this.wakeTmp = new Float32Array(n);
    this.glyph = new Array(n).fill("");
    this.color = new Int32Array(n);
    this.tile = new Int32Array(n);
    this.drawGrid();
  }

  private drawGrid() {
    const layer = (this.gridLayer ??= document.createElement("canvas"));
    layer.width = this.canvas.width;
    layer.height = this.canvas.height;
    const g = layer.getContext("2d")!;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = this.theme.bg;
    g.fillRect(0, 0, this.width, this.height);
    g.fillStyle = this.theme.grid;
    const { cellWidth: cw, cellHeight: ch } = this;
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) g.fillRect(c * cw, r * ch, cw - 1, ch - 1);
  }

  render(world: World, dt: number) {
    this.time += dt;
    const { cols, rows, glyph, color, cellWidth: cw, cellHeight: ch } = this;
    if (!cols || !rows) return;

    for (const e of world.events) this.ripples.push({ x: e.x, y: e.y, age: 0 });
    world.events.length = 0;
    this.updateWake(world, dt);

    this.tile.fill(0);
    // Wake bubbles.
    for (let i = 0; i < glyph.length; i++) {
      const w = this.wake[i];
      if (w < 0.3) { glyph[i] = ""; continue; }
      glyph[i] = "೦";
      color[i] = pack(this.theme.wake, Math.min(0.22, (w - 0.3) * 0.4));
    }

    this.drawRipples(dt);

    // Fish, then dolphins on top of them.
    for (let k = 0; k < world.fish.length; k++) if (world.fish[k].alive) this.drawFish(world.fish[k], k, world.fishLength);

    // Dolphins, deep ones first so nearer ones swim over them.
    for (const d of [...world.dolphins].sort((a, b) => a.depth - b.depth)) this.drawDolphin(d);

    // Flush, batched by colour.
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.gridLayer) ctx.drawImage(this.gridLayer, 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.font = this.font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Tiles first: a mosaic of shaded squares that the letters sit on.
    for (const list of this.buckets.values()) list.length = 0;
    const tile = this.tile;
    for (let i = 0; i < tile.length; i++) {
      if (!tile[i]) continue;
      let list = this.buckets.get(tile[i]);
      if (!list) this.buckets.set(tile[i], (list = []));
      list.push(i);
    }
    for (const [key, list] of this.buckets) {
      if (!list.length) continue;
      ctx.fillStyle = this.style(key);
      for (const i of list) ctx.fillRect((i % cols) * cw, ((i / cols) | 0) * ch, cw - 1, ch - 1);
    }
    for (const list of this.buckets.values()) list.length = 0;
    for (let i = 0; i < glyph.length; i++) {
      if (!glyph[i]) continue;
      let list = this.buckets.get(color[i]);
      if (!list) this.buckets.set(color[i], (list = []));
      list.push(i);
    }
    for (const [key, list] of this.buckets) {
      if (!list.length) continue;
      ctx.fillStyle = this.style(key);
      for (const i of list) ctx.fillText(glyph[i], ((i % cols) + 0.5) * cw, (((i / cols) | 0) + 0.55) * ch);
    }
  }

  private cellAt(x: number, y: number) {
    const c = Math.floor(x / this.cellWidth), r = Math.floor(y / this.cellHeight);
    return c < 0 || r < 0 || c >= this.cols || r >= this.rows ? -1 : r * this.cols + c;
  }

  private put(x: number, y: number, g: string, rgb: RGB, a: number) {
    const i = this.cellAt(x, y);
    if (i < 0) return;
    this.glyph[i] = g;
    this.color[i] = pack(rgb, a);
  }

  private updateWake(world: World, dt: number) {
    const { cols, rows, wake, wakeTmp } = this;
    const decay = Math.pow(0.3, dt);
    for (let r = 0, i = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++, i++) {
        const l = c > 0 ? wake[i - 1] : 0, rr = c < cols - 1 ? wake[i + 1] : 0;
        const u = r > 0 ? wake[i - cols] : 0, d = r < rows - 1 ? wake[i + cols] : 0;
        wakeTmp[i] = (wake[i] * 0.6 + (l + rr + u + d) * 0.1) * decay;
      }
    }
    wake.set(wakeTmp);
    const add = (x: number, y: number, v: number) => {
      const i = this.cellAt(x, y);
      if (i >= 0) wake[i] = Math.min(1.2, wake[i] + v);
    };
    // Dolphins leave a wake off their flukes; panicking fish stir the water.
    for (const d of world.dolphins) {
      const n = (DOLPHIN_NODES - 1) * 2;
      if (d.speed > 60) add(d.nodes[n], d.nodes[n + 1], (d.speed / 200) * dt * 10);
    }
    for (const f of world.fish) {
      if (f.alive && f.alarm > 0.5) add(f.x, f.y, dt * 1.5);
    }
  }

  /** Expanding, fading rings of ೦. */
  private drawRipples(dt: number) {
    const step = Math.min(this.cellWidth, this.cellHeight);
    for (const p of this.ripples) {
      p.age += dt;
      for (let ring = 0; ring < 2; ring++) {
        const age = p.age - ring * 0.35;
        if (age <= 0) continue;
        const r = 12 + age * 110;
        const a = 0.45 * (1 - age / 1.6) * (ring ? 0.6 : 1);
        if (a <= 0) continue;
        const n = Math.ceil((TAU * r) / step);
        for (let k = 0; k < n; k++) {
          const th = (k / n) * TAU;
          this.put(p.x + Math.cos(th) * r, p.y + Math.sin(th) * r, "೦", this.theme.wake, a);
        }
      }
    }
    this.ripples = this.ripples.filter((p) => p.age < 2);
  }

  // ---- fish ----------------------------------------------------------------

  /** A small fish from above: a lens-shaped body and a forked tail that beats. */
  private drawFish(f: Fish, id: number, len: number) {
    const { glyph, color, cellWidth: cw, cellHeight: ch } = this;
    const sp = Math.hypot(f.vx, f.vy) || 1;
    const cx = f.vx / sp, cy = f.vy / sp;
    const glint = smoothstep(2.5, 7, f.turn);
    const fishes = this.theme.fish;
    const rgb = mix(fishes[f.kind % fishes.length], GLINT, glint * 0.8);
    const alpha = 0.45 + 0.55 * f.depth;
    const beat = this.time * (8 + sp / 12) + id * 1.7;
    const reach = len * 0.65;
    const c0 = Math.max(0, Math.floor((f.x - reach) / cw)), c1 = Math.min(this.cols - 1, Math.floor((f.x + reach) / cw));
    const r0 = Math.max(0, Math.floor((f.y - reach) / ch)), r1 = Math.min(this.rows - 1, Math.floor((f.y + reach) / ch));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        let hits = 0, light = 0;
        for (let k = 0; k < NS * 2; k += 2) {
          const dx = (c + SUBSAMPLES[k]) * cw - f.x, dy = (r + SUBSAMPLES[k + 1]) * ch - f.y;
          const u = (dx * cx + dy * cy) / len;
          let v = (-dx * cy + dy * cx) / len;
          if (u < 0) v += Math.sin(beat + u * 5) * 0.06 * -u; // the tail swings
          const a = Math.abs(v);
          if (u > -0.36 && u < 0.5) {
            const hw = 0.2 * Math.sqrt(Math.max(0, 1 - ((u - 0.07) / 0.43) ** 2));
            if (a < hw) {
              hits++;
              const t = a / hw;
              light += 0.45 + 0.55 * Math.sqrt(1 - t * t) - (v * cy > 0 ? 0 : 0.1);
            }
          } else if (u <= -0.36 && u > -0.64) {
            // Forked tail: widening wedge with a notch in the middle.
            const spread = 0.04 + (-0.36 - u) * 0.85;
            if (a < spread && !(u < -0.5 && a < (-0.5 - u) * 0.8)) {
              hits++;
              light += 0.5;
            }
          }
        }
        if (!hits) continue;
        const i = r * this.cols + c;
        const v = clamp(light / hits, 0, 1);
        const cover = hits / NS;
        if (this.theme.light) {
          // On white: shaded parts are darker and carry the denser letters.
          glyph[i] = FISH_RAMP[Math.min(FISH_RAMP.length - 1, Math.floor((1.15 - v) * FISH_RAMP.length))];
          color[i] = pack(scale(rgb, 0.45 + 0.3 * v), alpha * (0.45 + 0.55 * cover));
          this.tile[i] = pack(scale(rgb, 0.8 + 0.3 * v), alpha * cover * 0.7);
        } else {
          glyph[i] = FISH_RAMP[Math.min(FISH_RAMP.length - 1, Math.floor(v * FISH_RAMP.length))];
          color[i] = pack(scale(rgb, 0.45 + 0.55 * v), alpha * (0.45 + 0.55 * cover));
          this.tile[i] = pack(scale(rgb, v), alpha * cover * (0.15 + 0.4 * v));
        }
      }
    }
  }

  // ---- dolphin -------------------------------------------------------------

  private drawDolphin(d: Dolphin) {
    const { glyph, color, sample, cellWidth: cw, cellHeight: ch } = this;
    const L = d.length;
    const sp = d.nodes;
    const N = DOLPHIN_NODES;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let n = 0; n < N; n++) {
      minX = Math.min(minX, sp[n * 2]); maxX = Math.max(maxX, sp[n * 2]);
      minY = Math.min(minY, sp[n * 2 + 1]); maxY = Math.max(maxY, sp[n * 2 + 1]);
    }
    const pad = L * 0.14;
    const c0 = Math.max(0, Math.floor((minX - pad) / cw)), c1 = Math.min(this.cols - 1, Math.ceil((maxX + pad) / cw));
    const r0 = Math.max(0, Math.floor((minY - pad) / ch)), r1 = Math.min(this.rows - 1, Math.ceil((maxY + pad) / ch));
    // Deeper dolphins are seen through more water: dimmer.
    const alpha = 0.55 + 0.45 * d.depth;
    const skin = SKINS[d.kind % SKINS.length];
    const fr = this.frames;
    fr.set(spineFrame(sp, N, FLIPPER_AT), 0);
    // The flukes take their direction from the very end of the tail.
    const [tx, ty] = spineFrame(sp, N, FLUKE_AT);
    const [, , tnx, tny] = spineFrame(sp, N, 0.97);
    fr.set([tx, ty, tnx, tny], 4);

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        let hits = 0, light = 0;
        for (let k = 0; k < NS * 2; k += 2) {
          this.sampleDolphin(d, (c + SUBSAMPLES[k]) * cw, (r + SUBSAMPLES[k + 1]) * ch);
          if (!sample.flag) continue;
          hits++;
          light += sample.light;
        }
        if (!hits) continue;
        const i = r * this.cols + c;
        // More ink → denser letter; partly covered edge cells fade out, like antialiasing.
        const v = clamp(light / hits, 0, 1);
        const q = Math.round(v * 20) / 20;
        const cover = hits / NS;
        const ink = this.theme.light ? 1 - v : v;
        const idx = clamp(Math.round(ink * (RAMP.length - 1) + (hash3(c, r, d.id) - 0.5) * 0.9), 0, RAMP.length - 1);
        glyph[i] = RAMP[idx];
        if (this.theme.light) {
          // On white the skin is the tile's grey: lit parts pale, shaded parts dark.
          color[i] = pack(tint(0.1 + 0.55 * q, skin), alpha * (0.4 + 0.6 * cover));
          this.tile[i] = pack(tint(0.2 + 0.8 * q, skin), alpha * cover * (0.95 - 0.35 * q));
        } else {
          color[i] = pack(tint(Math.min(1, 0.4 + 0.75 * q), skin), alpha * (0.35 + 0.65 * cover));
          this.tile[i] = pack(tint(q, skin), alpha * cover * (0.28 + 0.62 * q));
        }
      }
    }

    // The blowhole: one dark cell on the top of the head.
    const [bx, by] = spineFrame(sp, N, 0.16);
    const b = this.cellAt(bx, by);
    if (b >= 0) {
      glyph[b] = "೦";
      color[b] = pack([12, 16, 22], alpha);
      this.tile[b] = pack([40, 46, 54], alpha);
    }
  }

  private sampleDolphin(d: Dolphin, px: number, py: number) {
    const out = this.sample;
    out.flag = 0;
    const sp = d.nodes;
    const N = DOLPHIN_NODES;
    const L = d.length;
    let best = Infinity, bestS = 0, bestLat = 0, over = 0, nx = 0, ny = 0;
    for (let n = 0; n < N - 1; n++) {
      const x0 = sp[n * 2], y0 = sp[n * 2 + 1];
      const dx = sp[n * 2 + 2] - x0, dy = sp[n * 2 + 3] - y0;
      const len2 = dx * dx + dy * dy || 1;
      const raw = ((px - x0) * dx + (py - y0) * dy) / len2;
      const t = clamp(raw, 0, 1);
      const qx = px - (x0 + dx * t), qy = py - (y0 + dy * t);
      const d2 = qx * qx + qy * qy;
      if (d2 < best) {
        best = d2;
        bestS = (n + t) / (N - 1);
        const len = Math.sqrt(len2);
        nx = -dy / len;
        ny = dx / len;
        bestLat = qx * nx + qy * ny;
        // How far past the beak or the flukes, if at all.
        over = (n === 0 && raw < 0) || (n === N - 2 && raw > 1) ? Math.sqrt(d2 - bestLat * bestLat) : 0;
      }
    }
    const s = bestS;
    const lat = bestLat / L;
    const a = Math.abs(lat);
    const w = body(s);
    if (over > L * 0.006) {
      this.sampleFins(px, py, L);
    } else if (a < ridge(s)) {
      // The dorsal fin's edge catches the light.
      out.flag = F_RIDGE;
      out.light = 0.95;
    } else if (a < w) {
      out.flag = F_BODY;
      // A rounded body: the surface normal tilts out towards the sides.
      const u = lat / w;
      const z = Math.sqrt(Math.max(0, 1 - u * u));
      const sx = nx * u, sy = ny * u;
      const diffuse = Math.max(0, sx * LX + sy * LY + z * LZ);
      // A darker cape along the back, paler flanks.
      const albedo = lerp(0.72, 0.92, smoothstep(0.35, 0.85, Math.abs(u))) * (s < 0.08 ? 0.85 : 1);
      out.light = albedo * (0.22 + 0.78 * diffuse);
    } else {
      this.sampleFins(px, py, L);
    }
  }

  /** Flippers and flukes: thin and flat, in their rigid frames. The fluke has a notch. */
  private sampleFins(px: number, py: number, L: number) {
    const fr = this.frames;
    for (let k = 0; k < 8; k += 4) {
      const ox = px - fr[k], oy = py - fr[k + 1], nx = fr[k + 2], ny = fr[k + 3];
      // Tailward along the body is (ny, −nx).
      const t = (ox * ny - oy * nx) / L;
      const l = Math.abs(ox * nx + oy * ny) / L;
      const hit = k === 0
        ? l < body(FLIPPER_AT) + flipper(FLIPPER_AT + t) && flipper(FLIPPER_AT + t) > 0
        : t > 0 && FLUKE_AT + t <= 1 && l < fluke(FLUKE_AT + t) && !(FLUKE_AT + t > 0.97 && l < 0.03);
      if (hit) {
        this.sample.flag = F_FIN;
        this.sample.light = 0.5;
        return;
      }
    }
  }

  private style(key: number) {
    let s = this.styleCache.get(key);
    if (!s) {
      const r = (key >>> 19) & 31, g = (key >>> 14) & 31, b = (key >>> 9) & 31, a = (key >>> 4) & 31;
      s = `rgba(${(r * 255) / 31 | 0},${(g * 255) / 31 | 0},${(b * 255) / 31 | 0},${(a / 31).toFixed(2)})`;
      this.styleCache.set(key, s);
    }
    return s;
  }
}

/** Point and left normal on a spine at s ∈ [0, 1]. */
function spineFrame(sp: Float32Array, N: number, s: number): [number, number, number, number] {
  const f = s * (N - 1);
  const n = Math.min(N - 2, Math.floor(f));
  const t = f - n;
  const x0 = sp[n * 2], y0 = sp[n * 2 + 1], x1 = sp[n * 2 + 2], y1 = sp[n * 2 + 3];
  const dx = x1 - x0, dy = y1 - y0;
  const d = Math.hypot(dx, dy) || 1;
  return [x0 + dx * t, y0 + dy * t, -dy / d, dx / d];
}

/** A brightness in a dolphin's skin colour. */
function tint(v: number, skin: RGB): RGB {
  return [255 * v * skin[0], 255 * v * skin[1], 255 * v * skin[2]];
}

function pack([r, g, b]: RGB, a: number) {
  const q = (v: number) => clamp(Math.round((v / 255) * 31), 0, 31);
  return (q(r) << 19) | (q(g) << 14) | (q(b) << 9) | (clamp(Math.round(a * 31), 0, 31) << 4);
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function scale(c: RGB, k: number): RGB {
  return [c[0] * k, c[1] * k, c[2] * k];
}
