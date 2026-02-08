/**
 * Context packagers for AI provider APIs - REQ-5 TASK-3
 *
 * Formats ProjectContext into prompt strings optimized for
 * Claude (agent orchestration) and Codex (review) workflows.
 */

import type { ProjectContext, FileDependency } from './types';

// ── Public interface ────────────────────────────────────────────────

export interface ProposedChange {
  fileId: string;
  fileName: string;
  originalContent: string;
  proposedContent: string;
  agentType: string;
}

// ── Claude packager ─────────────────────────────────────────────────

const CLAUDE_TOKEN_LIMIT = 200_000;
const WARNING_THRESHOLD = CLAUDE_TOKEN_LIMIT * 0.8; // 160 000

export class ClaudeContextPackager {
  /**
   * Build a full prompt for an agent that needs the entire project context.
   */
  packageForAgent(
    context: ProjectContext,
    userRequest: string,
    agentType?: string,
  ): string {
    const sections: string[] = [];

    // Agent focus note
    if (agentType) {
      sections.push(`> You are the ${agentType} specialist.\n`);
    }

    // User request
    sections.push(`## User Request\n\n${userRequest}\n`);

    // Project files
    sections.push(this.formatFiles(context));

    // Dependency summary
    if (context.dependencies.length > 0) {
      sections.push(this.formatDependencies(context));
    }

    return sections.join('\n---\n\n');
  }

  /** Rough token estimate – ~4 chars per token for English / code. */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /** True when estimated tokens exceed 80 % of the 200 K context window. */
  shouldWarn(context: ProjectContext): boolean {
    const packed = this.packageForAgent(context, '');
    return this.estimateTokens(packed) > WARNING_THRESHOLD;
  }

  // ── private helpers ───────────────────────────────────────────────

  private formatFiles(context: ProjectContext): string {
    const lines: string[] = ['## Project Files\n'];

    for (const file of context.files) {
      lines.push(`### ${file.fileName} (${file.fileType})\n`);
      lines.push(`\`\`\`${file.fileName}`);
      lines.push(file.content);
      lines.push('```\n');
    }

    return lines.join('\n');
  }

  private formatDependencies(context: ProjectContext): string {
    const lines: string[] = ['## Dependency Summary\n'];

    for (const dep of context.dependencies) {
      const refs = dep.references
        .map((r) => r.symbol)
        .join(', ');

      lines.push(
        `- **${dep.sourceFileId}** → **${dep.targetFileId}** ` +
          `(${dep.dependencyType}): ${refs}`,
      );
    }

    return lines.join('\n');
  }
}

// ── Codex packager ──────────────────────────────────────────────────

export class CodexContextPackager {
  /**
   * Build a review prompt that shows original files alongside
   * proposed changes, plus a dependency-impact section.
   */
  packageForReview(
    context: ProjectContext,
    proposedChanges: ProposedChange[],
  ): string {
    const sections: string[] = [];

    // Changed files – side-by-side original vs proposed
    sections.push(this.formatChangedFiles(context, proposedChanges));

    // Dependency impact
    const impacted = this.computeDependencyImpact(
      context.dependencies,
      proposedChanges,
    );
    if (impacted.length > 0) {
      sections.push(this.formatDependencyImpact(impacted));
    }

    return sections.join('\n---\n\n');
  }

  /** Rough token estimate – same heuristic as Claude packager. */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  // ── private helpers ───────────────────────────────────────────────

  private formatChangedFiles(
    _context: ProjectContext,
    changes: ProposedChange[],
  ): string {
    const lines: string[] = ['## Changed Files\n'];

    for (const change of changes) {
      lines.push(
        `### ${change.fileName} (by ${change.agentType})\n`,
      );

      lines.push('#### Original\n');
      lines.push(`\`\`\`${change.fileName}`);
      lines.push(change.originalContent);
      lines.push('```\n');

      lines.push('#### Proposed\n');
      lines.push(`\`\`\`${change.fileName}`);
      lines.push(change.proposedContent);
      lines.push('```\n');
    }

    return lines.join('\n');
  }

  /**
   * Return dependencies that touch any file with a proposed change.
   */
  private computeDependencyImpact(
    dependencies: FileDependency[],
    changes: ProposedChange[],
  ): FileDependency[] {
    const changedIds = new Set(changes.map((c) => c.fileId));

    return dependencies.filter(
      (d) =>
        changedIds.has(d.sourceFileId) ||
        changedIds.has(d.targetFileId),
    );
  }

  private formatDependencyImpact(deps: FileDependency[]): string {
    const lines: string[] = ['## Dependency Impact\n'];

    for (const dep of deps) {
      const refs = dep.references
        .map((r) => r.symbol)
        .join(', ');

      lines.push(
        `- **${dep.sourceFileId}** → **${dep.targetFileId}** ` +
          `(${dep.dependencyType}): ${refs}`,
      );
    }

    return lines.join('\n');
  }
}
