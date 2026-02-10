'use client';

import { useRef, useEffect, useCallback } from 'react';

/* ------------------------------------------------------------------ */
/*  Shaders                                                            */
/* ------------------------------------------------------------------ */

const VERTEX_SHADER = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision mediump float;

uniform float u_time;
uniform vec2 u_resolution;
uniform float u_opacity;

// Hash-based noise for grain texture
float hash(vec2 p) {
  float h = dot(p, vec2(127.1, 311.7));
  return fract(sin(h) * 43758.5453123);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;

  // ── 5 large drifting blobs, each with its own color ──────────────

  // Blob 1: Brand green (top-left area)
  float d1 = length(uv - vec2(
    0.25 + sin(u_time * 0.08) * 0.15,
    0.35 + cos(u_time * 0.06) * 0.12
  ));
  float b1 = smoothstep(0.7, 0.0, d1);
  vec3 c1 = vec3(0.157, 0.804, 0.337); // #28CD56 green

  // Blob 2: Indigo/blue (right area)
  float d2 = length(uv - vec2(
    0.75 + cos(u_time * 0.07) * 0.12,
    0.55 + sin(u_time * 0.1) * 0.15
  ));
  float b2 = smoothstep(0.65, 0.0, d2);
  vec3 c2 = vec3(0.38, 0.35, 0.95); // #615AF2 indigo

  // Blob 3: Amber/orange (bottom-center)
  float d3 = length(uv - vec2(
    0.55 + sin(u_time * 0.12) * 0.18,
    0.7 + cos(u_time * 0.09) * 0.1
  ));
  float b3 = smoothstep(0.6, 0.0, d3);
  vec3 c3 = vec3(0.96, 0.65, 0.14); // #F5A623 amber

  // Blob 4: Soft pink (top-right)
  float d4 = length(uv - vec2(
    0.8 + cos(u_time * 0.05) * 0.1,
    0.25 + sin(u_time * 0.11) * 0.12
  ));
  float b4 = smoothstep(0.55, 0.0, d4);
  vec3 c4 = vec3(0.95, 0.4, 0.6); // #F2668F pink

  // Blob 5: Teal (bottom-left)
  float d5 = length(uv - vec2(
    0.2 + sin(u_time * 0.09) * 0.12,
    0.65 + cos(u_time * 0.07) * 0.15
  ));
  float b5 = smoothstep(0.6, 0.0, d5);
  vec3 c5 = vec3(0.0, 0.82, 0.76); // #00D1C1 teal

  // ── Blend colors additively with intensity ───────────────────────
  float intensity = 0.35;
  vec3 color = c1 * b1 * 0.4
             + c2 * b2 * 0.3
             + c3 * b3 * 0.25
             + c4 * b4 * 0.2
             + c5 * b5 * 0.25;
  color *= intensity;

  // Total alpha from combined blobs
  float totalBlob = (b1 * 0.4 + b2 * 0.3 + b3 * 0.25 + b4 * 0.2 + b5 * 0.25) * intensity;

  // Procedural grain
  float grain = (hash(uv * 300.0 + u_time * 0.5) - 0.5) * 0.015;
  float alpha = (totalBlob + grain * totalBlob) * u_opacity;

  gl_FragColor = vec4(color * u_opacity, alpha);
}
`;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface ShaderGradientProps {
  opacity?: number;
  className?: string;
}

export function ShaderGradient({ opacity = 1, className }: ShaderGradientProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const rafRef = useRef<number>(0);
  const startTime = useRef(Date.now());
  const opacityRef = useRef(opacity);

  // Keep opacity ref in sync
  opacityRef.current = opacity;

  const initGL = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return false;

    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
    if (!gl) return false;

    // Compile shaders
    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, VERTEX_SHADER);
    gl.compileShader(vs);

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, FRAGMENT_SHADER);
    gl.compileShader(fs);

    // Link program
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);

    // Full-screen quad
    const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const aPos = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    glRef.current = gl;
    programRef.current = program;
    return true;
  }, []);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const gl = glRef.current;
    if (!canvas || !gl) return;

    const dpr = Math.min(window.devicePixelRatio, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }, []);

  const render = useCallback(() => {
    const gl = glRef.current;
    const program = programRef.current;
    const canvas = canvasRef.current;
    if (!gl || !program || !canvas) return;

    const time = (Date.now() - startTime.current) / 1000;

    const uTime = gl.getUniformLocation(program, 'u_time');
    const uRes = gl.getUniformLocation(program, 'u_resolution');
    const uOpacity = gl.getUniformLocation(program, 'u_opacity');

    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.uniform1f(uTime, time);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uOpacity, opacityRef.current);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    rafRef.current = requestAnimationFrame(render);
  }, []);

  useEffect(() => {
    // Respect prefers-reduced-motion
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motionQuery.matches) return;

    const ok = initGL();
    if (!ok) return;

    resize();
    window.addEventListener('resize', resize);
    rafRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(rafRef.current);
    };
  }, [initGL, resize, render]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full pointer-events-none z-0 ${className ?? ''}`}
      aria-hidden="true"
    />
  );
}
