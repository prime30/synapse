'use client';

const PRESET_SIZES = [
  { label: 'Desktop', width: 1440 },
  { label: 'Tablet', width: 768 },
  { label: 'Mobile', width: 375 },
];

interface DeviceSizeSelectorProps {
  value: number;
  onChange: (width: number) => void;
}

export function DeviceSizeSelector({ value, onChange }: DeviceSizeSelectorProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESET_SIZES.map((size) => (
        <button
          key={size.label}
          type="button"
          onClick={() => onChange(size.width)}
          className={`rounded px-3 py-1 text-xs ${value === size.width ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-200 hover:bg-gray-700'}`}
        >
          {size.label}
        </button>
      ))}
      <label className="flex items-center gap-2 text-xs text-gray-300">
        Custom
        <input
          type="number"
          min={320}
          max={2560}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="w-24 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-200"
        />
        px
      </label>
    </div>
  );
}
