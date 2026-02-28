export { indexTheme, reindexFile } from './indexer';
export { getThemeMap, setThemeMap, loadFromDisk, invalidate, shiftLineRanges } from './cache';
export { lookupThemeMap, formatLookupResult } from './lookup';
export { triggerThemeMapIndexing, triggerFileReindex } from './trigger';
export type { ThemeMap, ThemeMapFile, ThemeMapFeature, ThemeMapLookupResult } from './types';
