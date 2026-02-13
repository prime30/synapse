/**
 * Cross-file context types - REQ-5
 */

export interface ProjectContext {
  projectId: string;
  files: FileContext[];
  dependencies: FileDependency[];
  loadedAt: Date;
  totalSizeBytes: number;
}

export interface FileContext {
  fileId: string;
  fileName: string;
  fileType: 'liquid' | 'javascript' | 'css' | 'other';
  content: string;
  sizeBytes: number;
  lastModified: Date;
  dependencies: {
    imports: string[];
    exports: string[];
    usedBy: string[];
  };
}

export interface FileDependency {
  sourceFileId: string;
  targetFileId: string;
  dependencyType:
    | 'css_class'
    | 'js_function'
    | 'liquid_include'
    | 'template_section'
    | 'data_attribute'
    | 'asset_reference'
    | 'js_import'
    | 'css_import'
    | 'schema_setting'
    | 'css_section'
    | 'snippet_variable';
  references: DependencyReference[];
}

export interface DependencyReference {
  sourceLocation: { line: number; column: number };
  targetLocation?: { line: number; column: number };
  symbol: string;
  context: string;
}
