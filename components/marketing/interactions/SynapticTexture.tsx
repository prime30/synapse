'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const NODES = [
  { x: 80, y: 60 }, { x: 200, y: 120 }, { x: 320, y: 80 },
  { x: 440, y: 160 }, { x: 560, y: 100 }, { x: 680, y: 140 },
  { x: 150, y: 260 }, { x: 280, y: 300 }, { x: 400, y: 240 },
  { x: 520, y: 320 }, { x: 640, y: 280 }, { x: 720, y: 200 },
  { x: 100, y: 180 }, { x: 360, y: 180 }, { x: 500, y: 200 },
  { x: 250, y: 200 }, { x: 600, y: 60 }, { x: 180, y: 340 },
];

function getConnections(): [number, number][] {
  const connections: [number, number][] = [];
  for (let i = 0; i < NODES.length; i++) {
    for (let j = i + 1; j < NODES.length; j++) {
      const dx = NODES[i].x - NODES[j].x;
      const dy = NODES[i].y - NODES[j].y;
      if (Math.sqrt(dx * dx + dy * dy) < 200) {
        connections.push([i, j]);
      }
    }
  }
  return connections;
}

const CONNECTIONS = getConnections();
const SIGNAL_PATHS = CONNECTIONS.slice(0, 3);

interface SynapticTextureProps {
  intensity: number;
  className?: string;
}

export function SynapticTexture({ intensity, className }: SynapticTextureProps) {
  const lineOpacity = 0.03 + intensity * 0.05;

  return (
    <svg
      viewBox="0 0 800 400"
      className={cn('pointer-events-none select-none w-full h-full', className)}
      preserveAspectRatio="xMidYMid slice"
    >
      {CONNECTIONS.map(([i, j], idx) => (
        <motion.line
          key={idx}
          x1={NODES[i].x}
          y1={NODES[i].y}
          x2={NODES[j].x}
          y2={NODES[j].y}
          stroke="rgb(14, 165, 233)"
          strokeWidth={1}
          animate={{ opacity: [lineOpacity, lineOpacity * 1.5, lineOpacity] }}
          transition={{
            duration: 3 + (idx % 3),
            repeat: Infinity,
            ease: 'easeInOut',
            delay: idx * 0.3,
          }}
        />
      ))}

      {NODES.map((node, i) => (
        <circle
          key={i}
          cx={node.x}
          cy={node.y}
          r={3}
          fill="rgba(14, 165, 233, 0.1)"
        />
      ))}

      {SIGNAL_PATHS.map(([i, j], idx) => (
        <motion.circle
          key={`signal-${idx}`}
          r={2.5}
          fill="rgb(14, 165, 233)"
          animate={{
            cx: [NODES[i].x, NODES[j].x, NODES[i].x],
            cy: [NODES[i].y, NODES[j].y, NODES[i].y],
            opacity: [0.3 + intensity * 0.4, 0.6 + intensity * 0.3, 0.3 + intensity * 0.4],
          }}
          transition={{
            duration: 4 - intensity * 1.5,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: idx * 1.2,
          }}
        />
      ))}
    </svg>
  );
}
