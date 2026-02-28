import type { SavedSlip, SlipStore } from './types';

function storeKey(projectId: string) {
  return `packing-slip-store-${projectId}`;
}

function legacyKey(projectId: string) {
  return `packing-slip-${projectId}`;
}

export function loadSlipStore(projectId: string): SlipStore {
  try {
    const raw = localStorage.getItem(storeKey(projectId));
    if (raw) {
      const parsed = JSON.parse(raw) as SlipStore;
      if (Array.isArray(parsed.slips)) return parsed;
    }

    // Migrate from legacy single-template storage
    const legacy = localStorage.getItem(legacyKey(projectId));
    if (legacy) {
      const now = new Date().toISOString();
      const migrated: SavedSlip = {
        id: crypto.randomUUID(),
        name: 'Untitled Slip',
        liquid: legacy,
        createdAt: now,
        updatedAt: now,
      };
      const store: SlipStore = { activeId: migrated.id, slips: [migrated] };
      localStorage.setItem(storeKey(projectId), JSON.stringify(store));
      localStorage.removeItem(legacyKey(projectId));
      return store;
    }
  } catch {
    /* localStorage may be unavailable */
  }
  return { activeId: null, slips: [] };
}

export function saveSlipStore(projectId: string, store: SlipStore): void {
  try {
    localStorage.setItem(storeKey(projectId), JSON.stringify(store));
  } catch {
    /* localStorage may be unavailable */
  }
}

export function createSlip(name: string, liquid: string = ''): SavedSlip {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name,
    liquid,
    createdAt: now,
    updatedAt: now,
  };
}

export function duplicateSlip(source: SavedSlip): SavedSlip {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: `${source.name} (copy)`,
    liquid: source.liquid,
    createdAt: now,
    updatedAt: now,
  };
}
