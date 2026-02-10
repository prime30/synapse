'use client';

interface PixelWatermarkProps {
  text?: string;
  opacity?: number;
  className?: string;
}

export function PixelWatermark({
  text = 'SYNAPSE',
  opacity = 0.02,
  className = '',
}: PixelWatermarkProps) {
  // Create a grid pattern of the text
  const rows = 8;
  const cols = 4;

  return (
    <div
      className={`absolute inset-0 overflow-hidden pointer-events-none select-none ${className}`}
      aria-hidden="true"
      style={{ opacity }}
    >
      <div className="flex flex-col items-center justify-center h-full gap-16">
        {Array.from({ length: rows }).map((_, row) => (
          <div key={row} className="flex gap-24 whitespace-nowrap">
            {Array.from({ length: cols }).map((_, col) => (
              <span
                key={col}
                className="font-pixel text-[80px] md:text-[120px] text-sky-500/30 tracking-[0.3em] select-none"
                style={{
                  transform: `translateX(${row % 2 === 0 ? 0 : 60}px)`,
                }}
              >
                {text}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
