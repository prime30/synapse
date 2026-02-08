'use client';

interface ConflictModalProps {
  isOpen: boolean;
  serverVersion: number;
  clientVersion: number;
  onForceOverwrite: () => void;
  onCancel: () => void;
}

export function ConflictModal({
  isOpen,
  serverVersion,
  clientVersion,
  onForceOverwrite,
  onCancel,
}: ConflictModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 rounded-lg shadow-xl w-full max-w-md mx-4 border border-gray-700">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-700">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-amber-500/20">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-5 h-5 text-amber-400"
            >
              <path
                fillRule="evenodd"
                d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd"
              />
            </svg>
          </span>
          <h2 className="text-lg font-medium text-gray-200">
            Version Conflict
          </h2>
        </div>

        <div className="px-4 py-4">
          <p className="text-sm text-gray-300 mb-3">
            The file has been modified since your last action. Another change was
            saved while you were working.
          </p>

          <div className="bg-gray-800 rounded p-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Your version:</span>
              <span className="text-gray-200 font-mono">v{clientVersion}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Server version:</span>
              <span className="text-amber-400 font-mono">
                v{serverVersion}
              </span>
            </div>
          </div>

          <p className="text-xs text-gray-500 mt-3">
            Force overwrite will discard the server changes and apply your
            action. Cancel to review the latest version first.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-700">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onForceOverwrite}
            className="px-3 py-1.5 text-sm rounded bg-amber-600 text-white hover:bg-amber-500 transition-colors"
          >
            Force Overwrite
          </button>
        </div>
      </div>
    </div>
  );
}
