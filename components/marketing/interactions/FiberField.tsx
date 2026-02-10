'use client';

import { useRef, useEffect, useCallback, RefObject } from 'react';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

const NUM_FIBERS = 120;
const REPULSION_RADIUS = 180;
const TEXT_REPULSION_RADIUS = 120;
const MAX_DISPLACEMENT = 60;
const SPRING_K = 0.012;
const SPRING_DAMPING = 0.91;

/* ------------------------------------------------------------------ */
/*  Deterministic PRNG                                                 */
/* ------------------------------------------------------------------ */

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9999.1) * 10000;
  return x - Math.floor(x);
}

/* ------------------------------------------------------------------ */
/*  Bezier helpers                                                     */
/* ------------------------------------------------------------------ */

function bezierPoint(
  p0x: number, p0y: number,
  p1x: number, p1y: number,
  p2x: number, p2y: number,
  p3x: number, p3y: number,
  t: number,
): [number, number] {
  const u = 1 - t;
  const uu = u * u;
  const uuu = uu * u;
  const tt = t * t;
  const ttt = tt * t;
  return [
    uuu * p0x + 3 * uu * t * p1x + 3 * u * tt * p2x + ttt * p3x,
    uuu * p0y + 3 * uu * t * p1y + 3 * u * tt * p2y + ttt * p3y,
  ];
}

/* ------------------------------------------------------------------ */
/*  Color helpers — green → teal → sky-blue                            */
/* ------------------------------------------------------------------ */

function fiberColor(positionT: number, alpha: number): string {
  // positionT: 0 = center, 1 = edge
  // Center: #28CD56 (green)  → Mid: #06B6D4 (cyan-500) → Edge: #38BDF8 (sky-400)
  let r: number, g: number, b: number;
  if (positionT < 0.5) {
    const t = positionT / 0.5;
    r = Math.round(40 + t * (6 - 40));
    g = Math.round(205 + t * (182 - 205));
    b = Math.round(86 + t * (212 - 86));
  } else {
    const t = (positionT - 0.5) / 0.5;
    r = Math.round(6 + t * (56 - 6));
    g = Math.round(182 + t * (189 - 182));
    b = Math.round(212 + t * (248 - 212));
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function pulseColor(positionT: number, alpha: number): string {
  // Brighter version for the traveling pulse
  let r: number, g: number, b: number;
  if (positionT < 0.5) {
    const t = positionT / 0.5;
    r = Math.round(80 + t * (40 - 80));
    g = Math.round(240 + t * (220 - 240));
    b = Math.round(120 + t * (240 - 120));
  } else {
    const t = (positionT - 0.5) / 0.5;
    r = Math.round(40 + t * (100 - 40));
    g = Math.round(220 + t * (220 - 220));
    b = Math.round(240 + t * (255 - 240));
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* ------------------------------------------------------------------ */
/*  Fiber data                                                         */
/* ------------------------------------------------------------------ */

interface Fiber {
  // Base control points (before displacement)
  p1x: number; p1y: number;
  p2x: number; p2y: number;
  p3x: number; p3y: number;
  // Visual
  depth: number;
  positionT: number; // 0 = center, 1 = edge (for color)
  lineWidth: number;
  // Ambient drift
  drift1Phase: number; drift1Freq: number; drift1Amp: number;
  drift2Phase: number; drift2Freq: number; drift2Amp: number;
  drift3Phase: number; drift3Freq: number; drift3Amp: number;
  // Pulse
  pulseSpeed: number;
  pulsePhase: number;
  pulseCount: number; // 1 or 2 pulses per fiber
  // Strand lifecycle
  lifePhase: number;
  cycleDuration: number;
  deadFraction: number;
}

function buildFibers(canvasW: number, canvasH: number): Fiber[] {
  const originX = canvasW / 2;
  const originY = canvasH * 0.98;

  const maxReach = Math.min(canvasW * 0.42, canvasH * 0.80);

  const fibers: Fiber[] = [];

  for (let i = 0; i < NUM_FIBERS; i++) {
    const t = i / (NUM_FIBERS - 1); // 0..1

    // Fan angle: ~160 degree spread, center-weighted
    const centered = t - 0.5;
    const biased = Math.sign(centered) * Math.pow(Math.abs(centered) * 2, 0.8) * 0.5;
    const angle = -Math.PI / 2 + biased * Math.PI * 0.88;

    const depth = seededRandom(i + 700);
    const positionT = Math.abs(centered) * 2; // 0 at center, 1 at edge

    // Random reach per fiber
    const r1 = seededRandom(i + 100);
    const r2 = seededRandom(i + 200);
    const reach = maxReach * (0.3 + ((r1 + r2) / 2) * 0.7);

    // Tip (P3)
    const tipX = originX + Math.cos(angle) * reach;
    const tipY = originY + Math.sin(angle) * reach;

    // Curvature: P1 and P2 create the arc
    const curveJitter = (seededRandom(i + 300) - 0.5) * 0.4;
    const midAngle = angle + curveJitter;

    // P1: ~30% of the way, slight spread
    const p1Dist = reach * (0.25 + seededRandom(i + 400) * 0.1);
    const p1x = originX + Math.cos(midAngle - curveJitter * 0.3) * p1Dist;
    const p1y = originY + Math.sin(midAngle - curveJitter * 0.3) * p1Dist;

    // P2: ~65% of the way, more spread
    const p2Dist = reach * (0.55 + seededRandom(i + 500) * 0.15);
    const p2x = originX + Math.cos(midAngle + curveJitter * 0.5) * p2Dist;
    const p2y = originY + Math.sin(midAngle + curveJitter * 0.5) * p2Dist;

    // Line width: thinner far, thicker near
    const lineWidth = 0.8 + depth * 2.0;

    // Ambient drift per control point
    // Slow, floaty drift — like strands suspended in air
    const drift1Phase = seededRandom(i + 1000) * Math.PI * 2;
    const drift1Freq = 0.015 + seededRandom(i + 1100) * 0.025;
    const drift1Amp = 12 + seededRandom(i + 1200) * 18;

    const drift2Phase = seededRandom(i + 1300) * Math.PI * 2;
    const drift2Freq = 0.012 + seededRandom(i + 1400) * 0.020;
    const drift2Amp = 18 + seededRandom(i + 1500) * 25;

    const drift3Phase = seededRandom(i + 1600) * Math.PI * 2;
    const drift3Freq = 0.010 + seededRandom(i + 1700) * 0.018;
    const drift3Amp = 22 + seededRandom(i + 1800) * 30;

    // Pulse — very slow, gentle drift along the fiber
    const pulseSpeed = 0.03 + seededRandom(i + 1900) * 0.05;
    const pulsePhase = seededRandom(i + 2000);
    const pulseCount = seededRandom(i + 2100) > 0.6 ? 2 : 1;

    // Strand lifecycle
    const lifePhase = seededRandom(i + 2200) * 100;
    const cycleDuration = 12 + seededRandom(i + 2300) * 18; // 12–30s
    const deadFraction = 0.06 + seededRandom(i + 2400) * 0.08; // 6–14%

    fibers.push({
      p1x, p1y, p2x, p2y, p3x: tipX, p3y: tipY,
      depth, positionT, lineWidth,
      drift1Phase, drift1Freq, drift1Amp,
      drift2Phase, drift2Freq, drift2Amp,
      drift3Phase, drift3Freq, drift3Amp,
      pulseSpeed, pulsePhase, pulseCount,
      lifePhase, cycleDuration, deadFraction,
    });
  }

  // Sort back-to-front
  fibers.sort((a, b) => a.depth - b.depth);
  return fibers;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface FiberFieldProps {
  intensity: number;
  cursor: { clientX: number; clientY: number } | null;
  containerRef: RefObject<HTMLDivElement | null>;
  textRef?: RefObject<HTMLDivElement | null>;
  className?: string;
}

export function FiberField({
  intensity,
  cursor,
  containerRef,
  textRef,
  className,
}: FiberFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fibersRef = useRef<Fiber[] | null>(null);
  // Displacement per control point (3 points × 2 axes = 6 per fiber)
  const dispRef = useRef<Float64Array>(new Float64Array(0));
  const velRef = useRef<Float64Array>(new Float64Array(0));
  const rafRef = useRef<number>(0);
  const mountedRef = useRef(true);
  const startTimeRef = useRef(performance.now());

  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;
  const intensityRef = useRef(intensity);
  intensityRef.current = intensity;

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = Math.min(window.devicePixelRatio, 2);
    const w = container.clientWidth;
    const h = container.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;

    const fibers = buildFibers(canvas.width, canvas.height);
    fibersRef.current = fibers;
    // 6 values per fiber: dx1,dy1, dx2,dy2, dx3,dy3
    dispRef.current = new Float64Array(fibers.length * 6);
    velRef.current = new Float64Array(fibers.length * 6);
  }, [containerRef]);

  const render = useCallback(() => {
    if (!mountedRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const fibers = fibersRef.current;
    const container = containerRef.current;
    if (!canvas || !ctx || !fibers || !container) return;

    const dpr = Math.min(window.devicePixelRatio, 2);
    const time = (performance.now() - startTimeRef.current) / 1000;
    const cur = cursorRef.current;
    const scrollIntensity = intensityRef.current;

    const originX = canvas.width / 2;
    const originY = canvas.height * 0.98;

    /* ---- Cursor → canvas coords ---- */
    const rect = container.getBoundingClientRect();
    let cursorX = -1e6;
    let cursorY = -1e6;
    if (cur) {
      cursorX = (cur.clientX - rect.left) * dpr;
      cursorY = (cur.clientY - rect.top) * dpr;
    }

    /* ---- Text rect → canvas coords ---- */
    let textL = -1e6, textR = -1e6, textT = -1e6, textB = -1e6;
    const textEl = textRef?.current;
    if (textEl && scrollIntensity > 0.01) {
      const tRect = textEl.getBoundingClientRect();
      textL = (tRect.left - rect.left) * dpr;
      textR = (tRect.right - rect.left) * dpr;
      textT = (tRect.top - rect.top) * dpr;
      textB = (tRect.bottom - rect.top) * dpr;
    }

    const repulsionStr = 0.4 + scrollIntensity * 0.6;
    const textRepulsionStr = scrollIntensity * 1.2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    /* ---- Background glow ---- */
    const glowR = Math.min(canvas.width, canvas.height) * 0.5;
    const glow = ctx.createRadialGradient(originX, originY, 0, originX, originY, glowR);
    const glowAlpha = 0.03 + scrollIntensity * 0.05;
    glow.addColorStop(0, `rgba(40, 205, 86, ${glowAlpha})`);
    glow.addColorStop(0.4, `rgba(6, 182, 212, ${glowAlpha * 0.5})`);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    /* ---- Draw fibers ---- */
    ctx.lineCap = 'round';
    const disp = dispRef.current;
    const vel = velRef.current;

    for (let f = 0; f < fibers.length; f++) {
      const fb = fibers[f];
      const base = f * 6;

      /* ---- Ambient drift — slow, floating in air ---- */
      const d1x = Math.sin(time * fb.drift1Freq + fb.drift1Phase) * fb.drift1Amp;
      const d1y = Math.cos(time * fb.drift1Freq * 0.6 + fb.drift1Phase + 1) * fb.drift1Amp * 0.8;
      const d2x = Math.sin(time * fb.drift2Freq + fb.drift2Phase) * fb.drift2Amp;
      const d2y = Math.cos(time * fb.drift2Freq * 0.5 + fb.drift2Phase + 2) * fb.drift2Amp * 0.7;
      const d3x = Math.sin(time * fb.drift3Freq + fb.drift3Phase) * fb.drift3Amp;
      const d3y = Math.cos(time * fb.drift3Freq * 0.45 + fb.drift3Phase + 3) * fb.drift3Amp * 0.6;

      // Current animated positions (base + drift)
      const pts = [
        { bx: fb.p1x + d1x, by: fb.p1y + d1y },
        { bx: fb.p2x + d2x, by: fb.p2y + d2y },
        { bx: fb.p3x + d3x, by: fb.p3y + d3y },
      ];

      // Compute repulsion targets for each control point
      for (let p = 0; p < 3; p++) {
        const idx = base + p * 2;
        const px = pts[p].bx;
        const py = pts[p].by;
        let targetDx = 0;
        let targetDy = 0;

        // Cursor repulsion
        const dc = Math.hypot(px - cursorX, py - cursorY);
        if (dc < REPULSION_RADIUS && dc > 0) {
          const force = repulsionStr * (1 / (dc / 70 + 0.3));
          const mag = Math.min(force * 18, MAX_DISPLACEMENT);
          targetDx += ((px - cursorX) / dc) * mag;
          targetDy += ((py - cursorY) / dc) * mag;
        }

        // Text repulsion
        if (textRepulsionStr > 0.01 && textL < 1e5) {
          const nx = Math.max(textL, Math.min(px, textR));
          const ny = Math.max(textT, Math.min(py, textB));
          const dtx = px - nx;
          const dty = py - ny;
          const dt = Math.hypot(dtx, dty);
          if (dt < TEXT_REPULSION_RADIUS && dt > 0) {
            const tForce = textRepulsionStr * (1 / (dt / 50 + 0.4));
            const tMag = Math.min(tForce * 12, MAX_DISPLACEMENT * 0.7);
            targetDx += (dtx / dt) * tMag;
            targetDy += (dty / dt) * tMag;
          }
        }

        // Damped spring
        vel[idx] = vel[idx] * SPRING_DAMPING + (targetDx - disp[idx]) * SPRING_K;
        vel[idx + 1] = vel[idx + 1] * SPRING_DAMPING + (targetDy - disp[idx + 1]) * SPRING_K;
        disp[idx] += vel[idx];
        disp[idx + 1] += vel[idx + 1];
      }

      // Final control points (mutable for lifecycle + scroll growth)
      let fp1x = pts[0].bx + disp[base];
      let fp1y = pts[0].by + disp[base + 1];
      let fp2x = pts[1].bx + disp[base + 2];
      let fp2y = pts[1].by + disp[base + 3];
      let fp3x = pts[2].bx + disp[base + 4];
      let fp3y = pts[2].by + disp[base + 5];

      /* ---- Strand lifecycle: spawn → alive → die → respawn ---- */
      const cycleT = ((time + fb.lifePhase) % fb.cycleDuration) / fb.cycleDuration;
      const halfDead = fb.deadFraction / 2;
      let strandLife: number;
      if (cycleT < halfDead) {
        strandLife = cycleT / halfDead;
      } else if (cycleT > 1 - halfDead) {
        strandLife = (1 - cycleT) / halfDead;
      } else {
        strandLife = 1;
      }

      if (strandLife < 0.01) continue; // skip invisible strands

      // Dying strands retract slightly (20% back toward origin)
      const retract = 1 - (1 - strandLife) * 0.2;
      fp3x = originX + (fp3x - originX) * retract;
      fp3y = originY + (fp3y - originY) * retract;

      /* ---- Scroll growth: fibers start small, grow to full size ---- */
      const growth = 0.15 + scrollIntensity * 0.85;
      fp1x = originX + (fp1x - originX) * growth;
      fp1y = originY + (fp1y - originY) * growth;
      fp2x = originX + (fp2x - originX) * growth;
      fp2y = originY + (fp2y - originY) * growth;
      fp3x = originX + (fp3x - originX) * growth;
      fp3y = originY + (fp3y - originY) * growth;

      /* ---- Draw fiber strand ---- */
      const strandAlpha = (0.08 + fb.depth * 0.28) * (0.4 + scrollIntensity * 0.6) * strandLife;
      ctx.strokeStyle = fiberColor(fb.positionT, strandAlpha);
      ctx.lineWidth = fb.lineWidth;
      ctx.beginPath();
      ctx.moveTo(originX, originY);
      ctx.bezierCurveTo(fp1x, fp1y, fp2x, fp2y, fp3x, fp3y);
      ctx.stroke();

      /* ---- Light pulses: radial-gradient glow lights ---- */
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const pulseSpeedMult = 0.8 + scrollIntensity * 0.3;
      for (let pi = 0; pi < fb.pulseCount; pi++) {
        const pulseT = ((time * fb.pulseSpeed * pulseSpeedMult + fb.pulsePhase + pi * 0.5) % 1);
        const [px, py] = bezierPoint(
          originX, originY,
          fp1x, fp1y, fp2x, fp2y, fp3x, fp3y,
          pulseT,
        );

        // Lifecycle fade: bright near origin, dying near tip
        const lifeFade = 1 - pulseT * pulseT;

        const breathe = 0.8 + 0.2 * Math.sin(time * 1.2 + fb.pulsePhase * 10 + pi);
        const pulseAlpha = (0.25 + fb.depth * 0.35 + scrollIntensity * 0.15) * breathe * lifeFade * strandLife;
        const glowRadius = (3 + fb.depth * 4) * (0.8 + scrollIntensity * 0.3) * (0.5 + lifeFade * 0.5);

        if (pulseAlpha < 0.01) continue;

        // Radial gradient glow
        const grad = ctx.createRadialGradient(px, py, 0, px, py, glowRadius);
        grad.addColorStop(0, pulseColor(fb.positionT, pulseAlpha * 0.9));
        grad.addColorStop(0.15, pulseColor(fb.positionT, pulseAlpha * 0.6));
        grad.addColorStop(0.4, pulseColor(fb.positionT, pulseAlpha * 0.2));
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(px - glowRadius, py - glowRadius, glowRadius * 2, glowRadius * 2);
      }
      ctx.restore();

      /* ---- Tip light: constant glow at the end of each fiber ---- */
      const tipGlowR = (2.5 + fb.depth * 3) * (0.6 + scrollIntensity * 0.4);
      const tipAlpha = (0.2 + fb.depth * 0.4) * (0.3 + scrollIntensity * 0.7) * strandLife;
      if (tipAlpha > 0.01) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const tipGrad = ctx.createRadialGradient(fp3x, fp3y, 0, fp3x, fp3y, tipGlowR);
        tipGrad.addColorStop(0, pulseColor(fb.positionT, tipAlpha * 0.9));
        tipGrad.addColorStop(0.2, pulseColor(fb.positionT, tipAlpha * 0.5));
        tipGrad.addColorStop(0.5, pulseColor(fb.positionT, tipAlpha * 0.15));
        tipGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = tipGrad;
        ctx.fillRect(fp3x - tipGlowR, fp3y - tipGlowR, tipGlowR * 2, tipGlowR * 2);
        ctx.restore();
      }
    }

    rafRef.current = requestAnimationFrame(render);
  }, [containerRef, textRef]);

  useEffect(() => {
    mountedRef.current = true;
    startTimeRef.current = performance.now();

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq.matches) {
      // Static fallback: draw fibers once without animation
      resize();
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      const fibers = fibersRef.current;
      if (canvas && ctx && fibers) {
        const originX = canvas.width / 2;
        const originY = canvas.height * 0.98;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.lineCap = 'round';
        for (const fb of fibers) {
          const alpha = 0.08 + fb.depth * 0.22;
          ctx.strokeStyle = fiberColor(fb.positionT, alpha);
          ctx.lineWidth = fb.lineWidth;
          ctx.beginPath();
          ctx.moveTo(originX, originY);
          ctx.bezierCurveTo(fb.p1x, fb.p1y, fb.p2x, fb.p2y, fb.p3x, fb.p3y);
          ctx.stroke();
        }
      }
      return;
    }

    resize();
    window.addEventListener('resize', resize);
    rafRef.current = requestAnimationFrame(render);

    return () => {
      mountedRef.current = false;
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(rafRef.current);
    };
  }, [resize, render]);

  return (
    <canvas
      ref={canvasRef}
      className={cn('pointer-events-none select-none w-full h-full', className)}
      aria-hidden="true"
    />
  );
}
