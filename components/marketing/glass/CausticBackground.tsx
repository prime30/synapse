'use client';

import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const CausticShader = {
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform float uIntensity;
    uniform vec2 uResolution;
    varying vec2 vUv;

    // Simplex-style caustic pattern
    vec2 causticsPattern(vec2 p, float time) {
      float s = sin(time * 0.3);
      float c = cos(time * 0.2);
      mat2 m = mat2(c, -s, s, c);
      p = m * p;
      return sin(p * 3.7 + time * 0.5) * 0.5 + 0.5;
    }

    float caustics(vec2 uv, float time) {
      vec2 p = uv * 4.0;
      vec2 c1 = causticsPattern(p, time);
      vec2 c2 = causticsPattern(p * 1.3 + 1.7, time * 1.1);
      vec2 c3 = causticsPattern(p * 1.7 + 3.2, time * 0.9);
      float pattern = (c1.x * c2.y + c2.x * c3.y + c3.x * c1.y) / 3.0;
      return pow(pattern, 2.0);
    }

    void main() {
      vec2 uv = vUv;
      float aspect = uResolution.x / uResolution.y;
      uv.x *= aspect;

      float c = caustics(uv, uTime) * uIntensity;

      // Electric blue/cyan palette
      vec3 sky = vec3(0.055, 0.647, 0.914);   // #0ea5e9
      vec3 cyan = vec3(0.024, 0.714, 0.831);  // #06b6d4
      vec3 dark = vec3(0.039, 0.039, 0.039); // #0a0a0a

      vec3 color = mix(dark, mix(sky, cyan, c * 0.6), c * 0.4);

      gl_FragColor = vec4(color, c * 0.5);
    }
  `,
};

function CausticPlane({ intensity = 0.5 }: { intensity?: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const uniformsRef = useRef({
    uTime: { value: 0 },
    uIntensity: { value: intensity },
    uResolution: { value: new THREE.Vector2(1, 1) },
  });

  useFrame(({ clock, size }) => {
    uniformsRef.current.uTime.value = clock.getElapsedTime();
    uniformsRef.current.uIntensity.value = intensity;
    uniformsRef.current.uResolution.value.set(size.width, size.height);
  });

  // Three.js shader uniforms require a stable object reference passed during render
  // and in-place mutation inside useFrame — useRef is the correct primitive here.
  // eslint-disable-next-line react-hooks/refs
  const uniforms = uniformsRef.current;

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        vertexShader={CausticShader.vertexShader}
        fragmentShader={CausticShader.fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}

interface CausticBackgroundProps {
  intensity?: number;
  className?: string;
}

export function CausticBackground({ intensity = 0.5, className = '' }: CausticBackgroundProps) {
  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      <Canvas
        camera={{ position: [0, 0, 1], fov: 90 }}
        gl={{ alpha: true, antialias: false, powerPreference: 'low-power' }}
        dpr={[1, 1.5]}
        style={{ position: 'absolute', inset: 0 }}
      >
        <CausticPlane intensity={intensity} />
      </Canvas>
    </div>
  );
}
