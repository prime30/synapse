// Liquid Flow Particle System – 60fps particle animation along flow paths on Canvas

import type { FlowPath, BezierCurve } from './flow-graph-builder';

/** A single particle moving along a flow path. */
export interface Particle {
  /** Current position along the curve segment (0 = start, 1 = end) */
  t: number;
  /** Which curve segment this particle is on (index into path.curves) */
  curveIndex: number;
  /** Speed: progress per second (normalized 0-1 range) */
  speed: number;
  /** Current pixel position */
  x: number;
  y: number;
  /** Particle size in pixels */
  size: number;
  /** Opacity 0-1 */
  opacity: number;
  /** Color (CSS string) */
  color: string;
}

/** Color scheme for different data types. */
export interface FlowColorScheme {
  assignment: string;
  output: string;
  filter: string;
  control: string;
  scope: string;
  string: string;
  number: string;
  boolean: string;
  array: string;
  object: string;
  unknown: string;
}

/** Configuration for the particle system. */
export interface ParticleSystemConfig {
  /** Max particles per path */
  maxParticlesPerPath: number;
  /** Particle spawn interval in ms */
  spawnInterval: number;
  /** Base particle speed (0-1 per second) */
  baseSpeed: number;
  /** Particle base size in CSS pixels */
  baseSize: number;
  /** Enable glow effect on active paths */
  glowEnabled: boolean;
  /** Color scheme */
  colors: FlowColorScheme;
}

/** The particle system controller. */
export interface ParticleSystem {
  /** Advance one frame. Returns all active particles. */
  tick(deltaMs: number): Particle[];
  /** Set which paths are active (highlighted). */
  setActivePaths(pathIds: Set<string>): void;
  /** Update the paths (when code changes). */
  updatePaths(paths: FlowPath[]): void;
  /** Reset all particles. */
  reset(): void;
  /** Get current particle count. */
  getParticleCount(): number;
}

/** Default color scheme matching Tailwind palette. */
export const DEFAULT_COLORS: FlowColorScheme = {
  assignment: 'oklch(0.718 0.158 248)', // blue-400
  output: 'oklch(0.765 0.177 163)', // emerald-400
  filter: 'oklch(0.667 0.174 277)', // violet-400
  control: 'oklch(0.852 0.167 84)', // amber-400
  scope: 'oklch(0.704 0.191 22)', // red-400
  string: 'oklch(0.765 0.177 163)',
  number: 'oklch(0.718 0.158 248)',
  boolean: 'oklch(0.852 0.167 84)',
  array: 'oklch(0.667 0.174 277)',
  object: 'oklch(0.702 0.183 52)',
  unknown: 'oklch(0.704 0.022 256)', // slate-400
};

/** Default particle system configuration. */
export const DEFAULT_PARTICLE_CONFIG: ParticleSystemConfig = {
  maxParticlesPerPath: 5,
  spawnInterval: 600,
  baseSpeed: 0.4,
  baseSize: 3,
  glowEnabled: true,
  colors: DEFAULT_COLORS,
};

/** Evaluate a point on a cubic bezier curve at parameter t (0-1). */
export function evaluateBezier(curve: BezierCurve, t: number): { x: number; y: number } {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;

  const bx = mt3 * curve.start.x + 3 * mt2 * t * curve.cp1.x + 3 * mt * t2 * curve.cp2.x + t3 * curve.end.x;
  const by = mt3 * curve.start.y + 3 * mt2 * t * curve.cp1.y + 3 * mt * t2 * curve.cp2.y + t3 * curve.end.y;
  return { x: bx, y: by };
}

/** Resolve color for a path based on its style and dataType. */
function resolveColor(path: FlowPath, colors: FlowColorScheme): string {
  const typeColor = colors[path.dataType as keyof FlowColorScheme];
  if (typeColor) return typeColor;
  return colors[path.style as keyof FlowColorScheme] ?? colors.unknown;
}

/** Compute particle opacity: fades in over the first 10% and out over the last 10%. */
function computeOpacity(curveIndex: number, t: number, totalCurves: number): number {
  const overall = (curveIndex + t) / totalCurves;
  if (overall < 0.1) return overall / 0.1;
  if (overall > 0.9) return (1 - overall) / 0.1;
  return 1;
}

interface PathState {
  pathId: string;
  particles: Particle[];
  timeSinceSpawn: number;
  color: string;
  curves: BezierCurve[];
}

/** Create a particle system that manages animation state. Call `tick()` each frame. */
export function createParticleSystem(
  paths: FlowPath[],
  config?: Partial<ParticleSystemConfig>,
): ParticleSystem {
  const cfg: ParticleSystemConfig = { ...DEFAULT_PARTICLE_CONFIG, ...config };
  let activePaths = new Set<string>();
  let pathStates: PathState[] = buildPathStates(paths, cfg);

  function buildPathStates(p: FlowPath[], c: ParticleSystemConfig): PathState[] {
    return p
      .filter((fp) => fp.curves.length > 0)
      .map((fp) => ({
        pathId: fp.id,
        particles: [],
        timeSinceSpawn: 0,
        color: resolveColor(fp, c.colors),
        curves: fp.curves,
      }));
  }

  function spawnParticle(state: PathState): Particle {
    const pos = evaluateBezier(state.curves[0], 0);
    return {
      t: 0,
      curveIndex: 0,
      speed: cfg.baseSpeed * (0.8 + Math.random() * 0.4), // ±20% variance
      x: pos.x,
      y: pos.y,
      size: cfg.baseSize * (0.8 + Math.random() * 0.4),
      opacity: 0,
      color: state.color,
    };
  }

  function tickPathState(state: PathState, deltaSec: number): void {
    if (!activePaths.has(state.pathId)) { state.particles = []; return; }

    state.timeSinceSpawn += deltaSec * 1000;
    if (
      state.timeSinceSpawn >= cfg.spawnInterval &&
      state.particles.length < cfg.maxParticlesPerPath
    ) {
      state.particles.push(spawnParticle(state));
      state.timeSinceSpawn = 0;
    }

    const alive: Particle[] = [];
    for (const p of state.particles) {
      p.t += p.speed * deltaSec;
      while (p.t >= 1 && p.curveIndex < state.curves.length - 1) {
        p.t -= 1;
        p.curveIndex++;
      }

      if (p.t >= 1 && p.curveIndex >= state.curves.length - 1) continue;
      const pos = evaluateBezier(state.curves[p.curveIndex], Math.min(p.t, 1));
      p.x = pos.x;
      p.y = pos.y;
      p.opacity = computeOpacity(p.curveIndex, p.t, state.curves.length);
      alive.push(p);
    }

    state.particles = alive;
  }

  return {
    tick(deltaMs: number): Particle[] {
      const clamped = Math.min(deltaMs / 1000, 0.1); // clamp to avoid tab-switch jumps
      for (const s of pathStates) tickPathState(s, clamped);
      const all: Particle[] = [];
      for (const s of pathStates) for (const p of s.particles) all.push(p);
      return all;
    },

    setActivePaths(pathIds: Set<string>): void {
      activePaths = pathIds;
    },

    updatePaths(newPaths: FlowPath[]): void {
      pathStates = buildPathStates(newPaths, cfg);
    },

    reset(): void {
      for (const state of pathStates) {
        state.particles = [];
        state.timeSinceSpawn = 0;
      }
    },

    getParticleCount(): number {
      let count = 0;
      for (const state of pathStates) {
        count += state.particles.length;
      }
      return count;
    },
  };
}

/** Render particles onto a Canvas 2D context. Handles devicePixelRatio scaling. */
export function renderParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
  dpr: number,
  glowEnabled: boolean,
): void {
  ctx.save();

  for (const p of particles) {
    const px = p.x * dpr;
    const py = p.y * dpr;
    const radius = p.size * dpr * 0.5;

    ctx.globalAlpha = p.opacity;
    ctx.fillStyle = p.color;

    if (glowEnabled) {
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8 * dpr;
    }

    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/** Render static flow lines (bezier curves). Active paths are brighter; inactive are dimmed. */
export function renderFlowLines(
  ctx: CanvasRenderingContext2D,
  paths: FlowPath[],
  activePaths: Set<string>,
  colors: FlowColorScheme,
  dpr: number,
): void {
  ctx.save();
  ctx.lineWidth = 1.5 * dpr;
  ctx.lineCap = 'round';

  for (const path of paths) {
    const isActive = activePaths.has(path.id);
    const color = resolveColor(path, colors);

    ctx.strokeStyle = color;
    ctx.globalAlpha = isActive ? 0.6 : 0.15;

    for (const curve of path.curves) {
      ctx.beginPath();
      ctx.moveTo(curve.start.x * dpr, curve.start.y * dpr);
      ctx.bezierCurveTo(
        curve.cp1.x * dpr,
        curve.cp1.y * dpr,
        curve.cp2.x * dpr,
        curve.cp2.y * dpr,
        curve.end.x * dpr,
        curve.end.y * dpr,
      );
      ctx.stroke();
    }
  }

  ctx.restore();
}
