'use client';

import React, { useState, useCallback } from 'react';
import { ChevronDown, Check, X, FileText, Code, HelpCircle, FilePlus, Eye, Pencil, Trash2, ArrowRightLeft, Upload, Download, List, Image as ImageIcon, LayoutGrid, FileSearch, Search, ShieldCheck, GitBranch, Lightbulb } from 'lucide-react';
import { LambdaDots } from '@/components/ui/LambdaDots';
import { AnimatePresence, motion } from 'framer-motion';
import { safeTransition } from '@/lib/accessibility';
import type { ContentBlock } from './ChatInterface';
import type { PlanStep } from './PlanApprovalModal';
import { ToolProgressBar } from './ToolProgressBar';
import { ToolContentPreview } from './ToolContentPreview';
import type { ToolProgressState } from '@/hooks/useToolProgress';

// Lazy-loaded card components to avoid circular deps
import { PlanCard } from './PlanCard';
import { ClarificationCard } from './ClarificationCard';
import { FileCreateCard } from './FileCreateCard';
import { FileOperationToast } from './FileOperationToast';
import { ShopifyOperationCard } from './ShopifyOperationCard';
import { ScreenshotCard } from './ScreenshotCard';
import { CodeEditCard } from './CodeEditCard';
import { ChangePreviewCard } from './ChangePreviewCard';
import { ThemeArtifactCard } from './ThemeArtifactCard';
import { GrepResultCard } from './GrepResultCard';
import { LintResultCard } from './LintResultCard';
import { RunCommandBlock } from './RunCommandBlock';
import { FilePreviewCard } from './FilePreviewCard';

type ToolActionBlock = Extract<ContentBlock, { type: 'tool_action' }>;

interface ToolActionItemProps {
  block: ToolActionBlock;
  onApplyCode?: (code: string, fileId: string, fileName: string) => void;
  onOpenFile?: (filePath: string) => void;
  resolveFileId?: (path: string) => string | null;
  onOpenPlanFile?: (filePath: string) => void;
  onBuildPlan?: (checkedSteps: Set<number>) => void;
  onSend?: (content: string) => void;
  onConfirmFileCreate?: (fileName: string, content: string) => void;
  onChangeApproved?: (appliedCount: number) => void;
  onChangeRejected?: () => void;
  isBuilding?: boolean;
}

function getToolIcon(toolName: string, status: string) {
  if (status === 'error') return <X className="h-4 w-4 text-red-500 dark:text-red-400" aria-hidden />;

  const iconClass = 'h-4 w-4';
  switch (toolName) {
    case 'propose_plan':
      return <LayoutGrid className={iconClass} aria-hidden />;
    case 'propose_code_edit':
      return <Code className={iconClass} aria-hidden />;
    case 'ask_clarification':
      return <HelpCircle className={iconClass} aria-hidden />;
    case 'create_file':
      return <FilePlus className={iconClass} aria-hidden />;
    case 'navigate_preview':
      return <Eye className={iconClass} aria-hidden />;
    case 'write_file':
      return <Pencil className={iconClass} aria-hidden />;
    case 'delete_file':
      return <Trash2 className={iconClass} aria-hidden />;
    case 'rename_file':
      return <ArrowRightLeft className={iconClass} aria-hidden />;
    case 'push_to_shopify':
      return <Upload className={iconClass} aria-hidden />;
    case 'pull_from_shopify':
      return <Download className={iconClass} aria-hidden />;
    case 'list_themes':
    case 'list_resources':
      return <List className={iconClass} aria-hidden />;
    case 'get_asset':
      return <Download className={iconClass} aria-hidden />;
    case 'screenshot_preview':
    case 'compare_screenshots':
      return <ImageIcon className={iconClass} aria-hidden />;
    // PM exploration tools
    case 'read_file':
      return <FileSearch className={iconClass} aria-hidden />;
    case 'search_files':
    case 'grep_content':
      return <Search className={iconClass} aria-hidden />;
    case 'check_lint':
      return <ShieldCheck className={iconClass} aria-hidden />;
    case 'list_files':
      return <List className={iconClass} aria-hidden />;
    case 'get_dependency_graph':
      return <GitBranch className={iconClass} aria-hidden />;
    default:
      return <FileText className={iconClass} aria-hidden />;
  }
}

function StatusIcon({ status, toolName }: { status: string; toolName: string }) {
  if (status === 'loading') {
    return (
      <div className="shrink-0 h-4 w-4 flex items-center justify-center">
        <LambdaDots size={14} />
      </div>
    );
  }
  if (status === 'done') {
    return (
      <div className="shrink-0 h-4 w-4 flex items-center justify-center">
        <Check className="h-4 w-4 text-[oklch(0.745_0.189_148)]" aria-hidden />
      </div>
    );
  }
  // error
  return (
    <div className="shrink-0 h-4 w-4 flex items-center justify-center">
      {getToolIcon(toolName, status)}
    </div>
  );
}

function shouldAutoExpand(block: ToolActionBlock): boolean {
  if (block.status === 'error') return true;
  if (block.cardType === 'clarification') return true;
  if (block.cardType === 'change_preview') return true;
  if (block.cardType === 'terminal') return true;
  if (block.cardType === 'lint_results') return true;
  return false;
}

export function ToolActionItem({
  block,
  onApplyCode,
  onOpenFile,
  resolveFileId,
  onOpenPlanFile,
  onBuildPlan,
  onSend,
  onConfirmFileCreate,
  onChangeApproved,
  onChangeRejected,
  isBuilding,
}: ToolActionItemProps) {
  const autoExpand = shouldAutoExpand(block);
  const [expanded, setExpanded] = useState(autoExpand);
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const hasExpandableContent = block.cardType && block.cardData;

  const toggle = useCallback(() => {
    if (!hasExpandableContent && block.status !== 'error') return;
    setExpanded(prev => !prev);
  }, [hasExpandableContent, block.status]);

  // Auto-expand for clarification and errors
  const blockStatus = block.status;
  const blockCardType = block.cardType;
  React.useEffect(() => {
    if (blockStatus === 'error' || blockCardType === 'clarification') setExpanded(true);
  }, [blockStatus, blockCardType]);

  return (
    <div className="group flex flex-col rounded-md border ide-border-subtle overflow-hidden my-1" role="group">
      {/* Compact header row */}
      <div
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
        aria-expanded={hasExpandableContent ? expanded : undefined}
        className="flex items-center gap-2 px-2.5 py-1.5 text-left ide-hover cursor-pointer transition-colors"
      >
        <StatusIcon status={block.status} toolName={block.toolName} />

        <div className="flex-1 min-w-0">
          <span className="text-xs ide-text-2 font-medium truncate block">
            {block.label}
          </span>
          {block.subtitle && block.status === 'done' && (
            <span className="text-[10px] ide-text-3 truncate block mt-0.5">
              {block.subtitle}
            </span>
          )}
          {block.error && block.status === 'error' && (
            <span className="text-[10px] text-red-500 dark:text-red-400 truncate block mt-0.5">
              {block.error}
            </span>
          )}
        </div>

        {/* Why? button */}
        {block.reasoning && block.status === 'done' && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setReasoningOpen(prev => !prev); }}
            className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full transition-colors ${
              reasoningOpen
                ? 'bg-stone-200 dark:bg-[#1e1e1e] ide-text-2'
                : 'bg-stone-100 dark:bg-[#141414] text-stone-500 dark:text-gray-400 hover:bg-stone-200 dark:hover:bg-white/10'
            }`}
            aria-label="Show reasoning"
          >
            <Lightbulb className="h-3 w-3 inline-block -mt-px" aria-hidden />
          </button>
        )}

        {/* Chevron */}
        {(hasExpandableContent || block.status === 'error') && (
          <ChevronDown
            className={`h-3 w-3 ide-text-3 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
            aria-hidden
          />
        )}
      </div>

      {/* Reasoning trace */}
      <AnimatePresence initial={false}>
        {reasoningOpen && block.reasoning && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={safeTransition(0.15)}
            className="overflow-hidden"
          >
            <div className="border-t ide-border-subtle px-2.5 py-2 bg-stone-50 dark:bg-white/[0.02]">
              <p className="text-[10px] font-medium ide-text-3 mb-1 flex items-center gap-1">
                <Lightbulb className="h-3 w-3" aria-hidden /> Agent reasoning
              </p>
              <p className="text-[11px] ide-text-2 leading-relaxed whitespace-pre-wrap break-words">
                {block.reasoning}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tool progress during loading */}
      {block.status === 'loading' && block.progress && (
        <>
          <ToolProgressBar
            percentage={block.progress.percentage}
            indeterminate={block.progress.percentage == null}
          />
          <ToolContentPreview
            toolName={block.toolName}
            progress={{
              toolCallId: block.toolId,
              name: block.toolName,
              phase: block.progress.phase,
              detail: block.progress.detail,
              percentage: block.progress.percentage,
            } as ToolProgressState}
          />
        </>
      )}

      {/* Expanded card content */}
      {(hasExpandableContent || block.status === 'error') && (
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={safeTransition(0.15)}
              className="overflow-hidden"
            >
              <div className="border-t ide-border-subtle">
                {renderCardContent(block, {
                  onApplyCode,
                  onOpenFile,
                  resolveFileId,
                  onOpenPlanFile,
                  onBuildPlan,
                  onSend,
                  onConfirmFileCreate,
                  onChangeApproved,
                  onChangeRejected,
                  isBuilding,
                })}
                {block.validationSuggestions && block.validationSuggestions.length > 0 && (
                  <div role="status" className="px-2.5 py-2 space-y-1 border-t ide-border-subtle">
                    {block.validationSuggestions.map((suggestion, i) => (
                      <div
                        key={i}
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/20 inline-block mr-1"
                      >
                        {suggestion}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}

interface CardHandlers {
  onApplyCode?: (code: string, fileId: string, fileName: string) => void;
  onOpenFile?: (filePath: string) => void;
  resolveFileId?: (path: string) => string | null;
  onOpenPlanFile?: (filePath: string) => void;
  onBuildPlan?: (checkedSteps: Set<number>) => void;
  onSend?: (content: string) => void;
  onConfirmFileCreate?: (fileName: string, content: string) => void;
  onChangeApproved?: (appliedCount: number) => void;
  onChangeRejected?: () => void;
  isBuilding?: boolean;
}

function renderCardContent(block: ToolActionBlock, handlers: CardHandlers): React.ReactNode {
  const data = block.cardData;
  if (!data && block.status !== 'error') return null;

  switch (block.cardType) {
    case 'plan': {
      const planData = data as { title: string; description: string; steps: PlanStep[]; filePath?: string; confidence?: number };
      return (
        <PlanCard
          planData={planData}
          confidence={planData.confidence}
          onOpenPlanFile={handlers.onOpenPlanFile}
          onBuildPlan={handlers.onBuildPlan}
          isBuilding={handlers.isBuilding}
        />
      );
    }
    case 'code_edit': {
      const edit = data as { filePath: string; reasoning?: string; newContent: string; originalContent?: string; status: 'pending' | 'applied' | 'rejected'; confidence?: number };
      return (
        <CodeEditCard
          filePath={edit.filePath}
          reasoning={edit.reasoning}
          newContent={edit.newContent}
          originalContent={edit.originalContent}
          status={edit.status}
          confidence={edit.confidence}
          onApplyCode={handlers.onApplyCode}
          resolveFileId={handlers.resolveFileId}
          onOpenFile={handlers.onOpenFile}
        />
      );
    }
    case 'clarification': {
      const clar = data as { question: string; options: Array<{ id: string; label: string; recommended?: boolean }>; allowMultiple?: boolean };
      return (
        <ClarificationCard
          question={clar.question}
          options={clar.options}
          allowMultiple={clar.allowMultiple}
          onSend={handlers.onSend}
        />
      );
    }
    case 'file_create': {
      const fc = data as { fileName: string; content: string; reasoning?: string; status: 'pending' | 'confirmed' | 'cancelled'; confidence?: number };
      return (
        <FileCreateCard
          fileName={fc.fileName}
          content={fc.content}
          reasoning={fc.reasoning}
          status={fc.status}
          confidence={fc.confidence}
          onConfirm={handlers.onConfirmFileCreate}
        />
      );
    }
    case 'file_op': {
      const ops = (Array.isArray(data) ? data : [data]) as Array<{ type: 'write' | 'delete' | 'rename'; fileName: string; success: boolean; error?: string; newFileName?: string }>;
      return <FileOperationToast operations={ops} />;
    }
    case 'shopify_op': {
      const ops = (Array.isArray(data) ? data : [data]) as Array<{ type: 'push' | 'pull' | 'list_themes' | 'list_resources' | 'get_asset'; status: 'pending' | 'success' | 'error'; summary: string; detail?: string; error?: string }>;
      return <ShopifyOperationCard operations={ops} />;
    }
    case 'screenshot': {
      const screenshots = (Array.isArray(data) ? data : [data]) as Array<{ url: string; storeDomain?: string; themeId?: string; path?: string; error?: string }>;
      return <ScreenshotCard screenshots={screenshots} />;
    }
    case 'screenshot_comparison': {
      const comp = data as { beforeUrl: string; afterUrl: string; diffPercentage?: number; threshold?: number; passed?: boolean };
      return <ScreenshotCard comparison={comp} />;
    }
    case 'change_preview': {
      const preview = data as {
        executionId: string;
        sessionId?: string | null;
        projectId: string;
        changes: Array<{ fileId: string; fileName: string; originalContent: string; proposedContent: string; reasoning: string }>;
      };
      return (
        <ChangePreviewCard
          executionId={preview.executionId}
          sessionId={preview.sessionId ?? null}
          projectId={preview.projectId}
          changes={preview.changes}
          onApproved={handlers.onChangeApproved}
          onRejected={handlers.onChangeRejected}
        />
      );
    }
    case 'theme_artifact': {
      const artifact = data as { markdown: string };
      return <ThemeArtifactCard markdown={artifact.markdown} />;
    }
    case 'grep_results': {
      const grep = data as { pattern: string; matches: Array<{ file: string; line: number; content: string }>; totalMatches: number };
      return (
        <GrepResultCard
          pattern={grep.pattern}
          matches={grep.matches}
          totalMatches={grep.totalMatches}
        />
      );
    }
    case 'lint_results': {
      const lint = data as { passed: boolean; summary: string; issues: Array<{ severity: 'error' | 'warning' | 'info'; category: string; file: string; line?: number; message: string; suggestion?: string }> };
      return (
        <LintResultCard
          passed={lint.passed}
          summary={lint.summary}
          issues={lint.issues}
        />
      );
    }
    case 'terminal': {
      const cmd = data as { command: string; stdout: string; stderr: string; exitCode: number; timedOut?: boolean };
      return (
        <RunCommandBlock
          command={cmd.command}
          stdout={cmd.stdout}
          stderr={cmd.stderr}
          exitCode={cmd.exitCode}
          timedOut={cmd.timedOut}
        />
      );
    }
    case 'file_read': {
      const fr = data as { fileName: string; content: string; language: string; lineCount: number };
      return (
        <FilePreviewCard
          fileName={fr.fileName}
          content={fr.content}
          language={fr.language}
          lineCount={fr.lineCount}
        />
      );
    }
    case 'preview_nav':
    default:
      return null;
  }
}
