'use client';

import { useRef, useEffect, useCallback, RefObject } from 'react';

const VERTEX_SHADER = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform float u_opacity;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec2 center = vec2(u_mouse.x, 1.0 - u_mouse.y);
  float d = length(uv - center);
  float blob = smoothstep(0.5, 0.0, d);
  vec3 color = vec3(0.055, 0.647, 0.914);
  float alpha = blob * u_opacity * 0.2;
  gl_FragColor = vec4(color, alpha);
}
`;

const LERP = 0.08;

interface CursorBlobProps {
  cursor: { clientX: number; clientY: number } | null;
  containerRef: RefObject<HTMLDivElement | null>;
  opacity?: number;
  className?: string;
}

export function CursorBlob({ cursor, containerRef, opacity = 0.15, className }: CursorBlobProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const rafRef = useRef<number>(0);
  const mouseRef = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 });
  const opacityRef = useRef(opacity);

  opacityRef.current = opacity;

  const initGL = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return false;

    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
    if (!gl) return false;

    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, VERTEX_SHADER);
    gl.compileShader(vs);

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, FRAGMENT_SHADER);
    gl.compileShader(fs);

    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);

    const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const aPos = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
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
    const container = containerRef.current;
    if (!gl || !program || !canvas) return;

    if (cursor && container) {
      const rect = container.getBoundingClientRect();
      const x = (cursor.clientX - rect.left) / rect.width;
      const y = (cursor.clientY - rect.top) / rect.height;
      mouseRef.current = {
        x: mouseRef.current.x + (x - mouseRef.current.x) * LERP,
        y: mouseRef.current.y + (y - mouseRef.current.y) * LERP,
      };
    } else {
      mouseRef.current.x += (0.5 - mouseRef.current.x) * LERP;
      mouseRef.current.y += (0.5 - mouseRef.current.y) * LERP;
    }

    const uRes = gl.getUniformLocation(program, 'u_resolution');
    const uMouse = gl.getUniformLocation(program, 'u_mouse');
    const uOpacity = gl.getUniformLocation(program, 'u_opacity');

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform2f(uMouse, mouseRef.current.x, mouseRef.current.y);
    gl.uniform1f(uOpacity, cursor ? opacityRef.current : 0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    rafRef.current = requestAnimationFrame(render);
  }, [cursor, containerRef]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq.matches) return;

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
      className={`absolute inset-0 w-full h-full pointer-events-none select-none ${className ?? ''}`}
      aria-hidden="true"
    />
  );
}
