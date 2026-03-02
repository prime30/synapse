export interface ThemeFile {
    path: string;
    content: string;
}
export declare function readThemeFiles(workspacePath: string): ThemeFile[];
export declare function readThemeFile(workspacePath: string, filePath: string): ThemeFile | null;
//# sourceMappingURL=file-reader.d.ts.map