const STORAGE_KEY = 'synapse-pinned-toasts';
const MAX_PINNED = 3;

export interface PinnedToastData {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  pinnedAt: number;
}

export function getPinnedToasts(): PinnedToastData[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addPinnedToast(toast: PinnedToastData): void {
  try {
    let pinned = getPinnedToasts();
    pinned = pinned.filter((p) => p.id !== toast.id);
    pinned.unshift(toast);
    if (pinned.length > MAX_PINNED) pinned.length = MAX_PINNED;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pinned));
  } catch {}
}

export function removePinnedToast(id: string): void {
  try {
    const pinned = getPinnedToasts().filter((p) => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pinned));
  } catch {}
}
