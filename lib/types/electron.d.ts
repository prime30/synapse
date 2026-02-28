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

interface ElectronPreviewAPI {
  navigate: (url: string) => Promise<void>;
  resize: (bounds: { x: number; y: number; width: number; height: number }) => Promise<void>;
  destroy: () => Promise<void>;
  refresh: () => Promise<void>;
  setViewport: (width: number, height: number) => Promise<void>;
  getUrl: () => Promise<string | null>;
}

interface ElectronAPI {
  platform: string;
  isDesktop: true;
  openFolder: () => Promise<string | null>;
  readThemeFolder: (folderPath: string) => Promise<ReadThemeFolderResult>;
  getSyncPath: () => Promise<string>;
  getVersion: () => Promise<string>;
  checkUpdate: () => Promise<{ available: boolean; version?: string }>;
  startUpdateDownload: () => Promise<void>;
  restartToUpdate: () => Promise<void>;
  preview: ElectronPreviewAPI;
  send: (channel: string, ...args: unknown[]) => void;
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
}

declare global {
  interface Window {
    electron?: ElectronAPI;
  }
}

export {};
