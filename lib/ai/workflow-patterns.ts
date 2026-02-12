/**
 * Workflow Patterns — defines the 4 workflow patterns that the intent
 * completion system can detect and offer to auto-complete.
 *
 * Each pattern has:
 * - A trigger condition (what action starts the workflow)
 * - A set of remaining steps (what else needs to happen)
 * - A confidence threshold
 *
 * Pure data + functions, no React dependencies.
 * @module lib/ai/workflow-patterns
 */

import type { FileAction, FileActionType } from './action-stream';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Identifiers for the 4 supported workflow patterns. */
export type WorkflowPatternId =
  | 'rename-propagation'
  | 'section-creation'
  | 'component-extraction'
  | 'locale-sync';

/** A single step in a workflow that may or may not be completed. */
export interface WorkflowStep {
  id: string;
  /** Human-readable description of the step. */
  label: string;
  /** Whether this step has been completed. */
  completed: boolean;
  /** File(s) this step would affect. */
  targetFiles?: string[];
  /** What action would be performed. */
  actionType: FileActionType | 'edit-reference' | 'edit-schema' | 'edit-locale';
  /** Payload for resolution — enough data to auto-complete the step. */
  payload?: Record<string, unknown>;
}

/** A matched workflow pattern instance. */
export interface WorkflowMatch {
  /** Which pattern was matched. */
  patternId: WorkflowPatternId;
  /** Human-readable title for the panel header. */
  title: string;
  /** How confident we are this pattern applies (0–1). */
  confidence: number;
  /** The trigger action that started this workflow. */
  triggerAction: FileAction;
  /** All steps in the workflow (completed + pending). */
  steps: WorkflowStep[];
  /** When this match was computed. */
  computedAt: number;
}

/** Definition of a workflow pattern (used internally for matching). */
export interface WorkflowPatternDef {
  id: WorkflowPatternId;
  /** Check whether a trigger action starts this pattern. */
  matches: (action: FileAction, recentActions: FileAction[]) => boolean;
  /** Compute the workflow steps given the trigger action and project context. */
  buildSteps: (
    action: FileAction,
    context: WorkflowContext,
  ) => WorkflowStep[];
  /** Human-readable title template (may use action data). */
  title: (action: FileAction) => string;
  /** Base confidence for this pattern. */
  baseConfidence: number;
}

/** Context provided to pattern builders for file analysis. */
export interface WorkflowContext {
  /** All project file names/paths. */
  allFiles: string[];
  /** Function to search file content. Returns matching file paths. */
  searchContent?: (pattern: string) => string[];
  /** Function to get file content by path. */
  getContent?: (filePath: string) => string | null;
}

// ---------------------------------------------------------------------------
// Pattern 1: Rename Propagation
// ---------------------------------------------------------------------------

/**
 * Triggered when a file is renamed. Suggests updating all references
 * to the old file name across the project.
 */
const renamePropagation: WorkflowPatternDef = {
  id: 'rename-propagation',
  baseConfidence: 0.85,

  matches(action: FileAction): boolean {
    return action.type === 'rename' && !!action.oldFileName;
  },

  title(action: FileAction): string {
    return `Update references: ${action.oldFileName} → ${action.fileName}`;
  },

  buildSteps(action: FileAction, context: WorkflowContext): WorkflowStep[] {
    const steps: WorkflowStep[] = [];
    const oldName = action.oldFileName ?? '';
    const newName = action.fileName;

    // Strip extension for reference matching
    const oldBase = oldName.replace(/\.liquid$/, '').split('/').pop() ?? oldName;
    const newBase = newName.replace(/\.liquid$/, '').split('/').pop() ?? newName;

    // Step 1: Find files that reference the old name
    const referencingFiles = context.searchContent
      ? context.searchContent(oldBase)
      : findReferencingFiles(oldBase, context.allFiles);

    for (const file of referencingFiles) {
      // Skip the renamed file itself
      if (file === action.filePath || file === action.fileName) continue;

      steps.push({
        id: `update-ref:${file}`,
        label: `Update references in ${file.split('/').pop()}: "${oldBase}" → "${newBase}"`,
        completed: false,
        targetFiles: [file],
        actionType: 'edit-reference',
        payload: { file, oldName: oldBase, newName: newBase },
      });
    }

    // Step 2: Update template JSON if a section was renamed
    const oldPath = action.oldFilePath ?? '';
    if (oldPath.startsWith('sections/') || oldPath.includes('/sections/')) {
      const templateFiles = context.allFiles.filter(
        (f) => f.startsWith('templates/') && f.endsWith('.json'),
      );

      for (const tpl of templateFiles) {
        steps.push({
          id: `update-template:${tpl}`,
          label: `Update section type in ${tpl.split('/').pop()}: "${oldBase}" → "${newBase}"`,
          completed: false,
          targetFiles: [tpl],
          actionType: 'edit-reference',
          payload: { file: tpl, oldName: oldBase, newName: newBase, type: 'template-json' },
        });
      }
    }

    return steps;
  },
};

// ---------------------------------------------------------------------------
// Pattern 2: Section Creation Flow
// ---------------------------------------------------------------------------

/**
 * Triggered when a new section file is created. Suggests adding schema,
 * registering in template JSON, and creating related snippets.
 */
const sectionCreation: WorkflowPatternDef = {
  id: 'section-creation',
  baseConfidence: 0.75,

  matches(action: FileAction): boolean {
    if (action.type !== 'create') return false;
    const path = action.filePath ?? action.fileName;
    return (path.startsWith('sections/') || path.includes('/sections/'))
      && path.endsWith('.liquid');
  },

  title(action: FileAction): string {
    const name = action.fileName.replace(/\.liquid$/, '').split('/').pop();
    return `Complete section setup: ${name}`;
  },

  buildSteps(action: FileAction, context: WorkflowContext): WorkflowStep[] {
    const steps: WorkflowStep[] = [];
    const sectionName = action.fileName.replace(/\.liquid$/, '').split('/').pop() ?? action.fileName;

    // Step 1: Check if schema exists
    const content = context.getContent?.(action.filePath ?? action.fileName);
    const hasSchema = content ? /\{%-?\s*schema\s*-?%\}/.test(content) : false;

    if (!hasSchema) {
      steps.push({
        id: `add-schema:${action.fileId}`,
        label: `Add {% schema %} block to ${action.fileName}`,
        completed: false,
        targetFiles: [action.filePath ?? action.fileName],
        actionType: 'edit-schema',
        payload: { fileId: action.fileId, fileName: action.fileName, sectionName },
      });
    }

    // Step 2: Add to a template JSON
    steps.push({
      id: `register-template:${sectionName}`,
      label: `Add "${sectionName}" to a template (e.g. index.json)`,
      completed: false,
      targetFiles: context.allFiles.filter(
        (f) => f.startsWith('templates/') && f.endsWith('.json'),
      ),
      actionType: 'edit-reference',
      payload: { sectionName, sectionFile: action.filePath ?? action.fileName },
    });

    // Step 3: Create related stylesheet if CSS patterns suggest it
    const cssFile = `assets/${sectionName}.css`;
    if (!context.allFiles.includes(cssFile)) {
      steps.push({
        id: `create-css:${sectionName}`,
        label: `Create stylesheet: ${cssFile}`,
        completed: false,
        targetFiles: [cssFile],
        actionType: 'create',
        payload: { fileName: cssFile, sectionName },
      });
    }

    return steps;
  },
};

// ---------------------------------------------------------------------------
// Pattern 3: Component Extraction
// ---------------------------------------------------------------------------

/**
 * Triggered when a new snippet is created, especially if preceded by
 * edits to a section file (suggesting code was extracted).
 */
const componentExtraction: WorkflowPatternDef = {
  id: 'component-extraction',
  baseConfidence: 0.7,

  matches(action: FileAction, recentActions: FileAction[]): boolean {
    if (action.type !== 'create') return false;
    const path = action.filePath ?? action.fileName;
    const isSnippet = path.startsWith('snippets/') || path.includes('/snippets/');
    if (!isSnippet || !path.endsWith('.liquid')) return false;

    // Higher confidence if there was a recent edit to a section file
    const recentSectionEdit = recentActions.some(
      (a) =>
        a.type === 'edit' &&
        a.timestamp > Date.now() - 60_000 &&
        ((a.filePath ?? a.fileName).startsWith('sections/') ||
          (a.filePath ?? a.fileName).includes('/sections/')),
    );

    return recentSectionEdit;
  },

  title(action: FileAction): string {
    const name = action.fileName.replace(/\.liquid$/, '').split('/').pop();
    return `Complete extraction: ${name}`;
  },

  buildSteps(action: FileAction, context: WorkflowContext): WorkflowStep[] {
    const steps: WorkflowStep[] = [];
    const snippetName = action.fileName.replace(/\.liquid$/, '').split('/').pop() ?? action.fileName;

    // Step 1: Add {% render %} reference in the source section
    const sectionFiles = context.allFiles.filter(
      (f) => (f.startsWith('sections/') || f.includes('/sections/')) && f.endsWith('.liquid'),
    );

    for (const section of sectionFiles) {
      steps.push({
        id: `add-render:${section}:${snippetName}`,
        label: `Add {% render '${snippetName}' %} in ${section.split('/').pop()}`,
        completed: false,
        targetFiles: [section],
        actionType: 'edit-reference',
        payload: { file: section, snippetName },
      });
    }

    // Step 2: Pass required variables
    steps.push({
      id: `pass-variables:${snippetName}`,
      label: `Wire variables into {% render '${snippetName}', var1: value1 %}`,
      completed: false,
      targetFiles: sectionFiles,
      actionType: 'edit-reference',
      payload: { snippetName },
    });

    return steps;
  },
};

// ---------------------------------------------------------------------------
// Pattern 4: Locale Sync
// ---------------------------------------------------------------------------

/**
 * Triggered when a locale file is edited. Suggests syncing other
 * locale files (e.g. added a key to en.default.json → add to fr.json).
 */
const localeSync: WorkflowPatternDef = {
  id: 'locale-sync',
  baseConfidence: 0.8,

  matches(action: FileAction): boolean {
    if (action.type !== 'edit') return false;
    const path = action.filePath ?? action.fileName;
    return (path.startsWith('locales/') || path.includes('/locales/'))
      && path.endsWith('.json');
  },

  title(action: FileAction): string {
    const name = action.fileName.split('/').pop();
    return `Sync locale changes from ${name}`;
  },

  buildSteps(action: FileAction, context: WorkflowContext): WorkflowStep[] {
    const steps: WorkflowStep[] = [];
    const editedLocale = action.filePath ?? action.fileName;

    // Find all other locale files
    const localeFiles = context.allFiles.filter(
      (f) =>
        (f.startsWith('locales/') || f.includes('/locales/')) &&
        f.endsWith('.json') &&
        f !== editedLocale,
    );

    for (const locale of localeFiles) {
      const localeName = locale.split('/').pop() ?? locale;
      steps.push({
        id: `sync-locale:${locale}`,
        label: `Sync new keys to ${localeName}`,
        completed: false,
        targetFiles: [locale],
        actionType: 'edit-locale',
        payload: { sourceLocale: editedLocale, targetLocale: locale },
      });
    }

    return steps;
  },
};

// ---------------------------------------------------------------------------
// All patterns
// ---------------------------------------------------------------------------

export const WORKFLOW_PATTERNS: readonly WorkflowPatternDef[] = [
  renamePropagation,
  sectionCreation,
  componentExtraction,
  localeSync,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Simple reference finder when no content search is available.
 * Returns file paths that likely reference the given name based on
 * common Shopify patterns.
 */
function findReferencingFiles(name: string, allFiles: string[]): string[] {
  // In a real implementation, this would search file content.
  // As a heuristic, sections that might reference snippets, template JSONs
  // that reference sections, and layout files.
  const candidates: string[] = [];

  for (const file of allFiles) {
    // Template JSON files reference sections by type
    if (file.startsWith('templates/') && file.endsWith('.json')) {
      candidates.push(file);
    }
    // Liquid files might use {% render %} or {% include %}
    if (file.endsWith('.liquid')) {
      candidates.push(file);
    }
  }

  return candidates;
}

/**
 * Get a pattern definition by ID.
 */
export function getPatternById(id: WorkflowPatternId): WorkflowPatternDef | undefined {
  return WORKFLOW_PATTERNS.find((p) => p.id === id);
}
