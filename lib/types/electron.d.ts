interface ThemeFile {
  path: string;
  content: string;
  sizeBytes: number;
}

interface ReadThemeFolderResult {
  files: ThemeFile[];
  error: string | null;
  folderName?: string;
}

interface ElectronAPI {
  platform: string;
  isDesktop: true;
  openFolder: () => Promise<string | null>;
  readThemeFolder: (folderPath: string) => Promise<ReadThemeFolderResult>;
  getSyncPath: () => Promise<string>;
  getVersion: () => Promise<string>;
  checkUpdate: () => Promise<{ available: boolean; version?: string }>;
  send: (channel: string, ...args: unknown[]) => void;
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
}

declare global {
  interface Window {
    electron?: ElectronAPI;
  }
}

export {};
