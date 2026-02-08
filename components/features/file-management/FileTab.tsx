'use client';

interface FileTabProps {
  fileId: string;
  fileName: string;
  isActive: boolean;
  isUnsaved: boolean;
  onSelect: () => void;
  onClose: () => void;
}

export function FileTab({
  fileName,
  isActive,
  isUnsaved,
  onSelect,
  onClose,
}: FileTabProps) {
  const displayName = fileName.length > 20 ? `${fileName.slice(0, 17)}...` : fileName;

  return (
    <div
      role="tab"
      aria-selected={isActive}
      className={`
        group flex items-center gap-1 px-3 py-2 min-w-0 max-w-[150px]
        border-r border-gray-700/50 cursor-pointer
        hover:bg-gray-700/30 transition-colors
        ${isActive ? 'bg-gray-700/50 text-white' : 'bg-gray-800/50 text-gray-400'}
      `}
      onClick={onSelect}
    >
      <span className="truncate flex-1 text-sm">{displayName}</span>
      {isUnsaved && (
        <span className="text-amber-400 text-xs flex-shrink-0" title="Unsaved">
          •
        </span>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-gray-600 text-gray-400 hover:text-white transition-opacity"
        aria-label="Close tab"
      >
        ×
      </button>
    </div>
  );
}
