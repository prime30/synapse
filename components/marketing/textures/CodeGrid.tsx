'use client';

interface CodeGridProps {
  opacity?: number;
  className?: string;
}

// Generate a repeating grid of code-like characters
const GRID_CHARS = '01{}[]<>=/;:.#$@!~+-*&|^%_';

function generateGrid(rows: number, cols: number): string {
  let grid = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      grid += GRID_CHARS[Math.floor((r * cols + c * 7 + r * 3) % GRID_CHARS.length)];
      if (c < cols - 1) grid += ' ';
    }
    grid += '\n';
  }
  return grid;
}

const GRID_CONTENT = generateGrid(60, 80);

export function CodeGrid({ opacity = 0.02, className = '' }: CodeGridProps) {
  return (
    <div
      className={`absolute inset-0 overflow-hidden pointer-events-none select-none ${className}`}
      aria-hidden="true"
      style={{ opacity }}
    >
      <pre className="font-mono text-[6px] leading-[8px] text-sky-500 whitespace-pre">
        {GRID_CONTENT}
      </pre>
    </div>
  );
}
