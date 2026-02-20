/**
 * Build Verification: Export Checker
 * Verifies that every expected component, hook, and module exports correctly.
 * Run with: npx tsx scripts/verify-exports.ts
 */

import * as fs from 'fs';
import * as path from 'path';

interface ExportCheck {
  file: string;
  exportName: string;
}

const EXPECTED_EXPORTS: ExportCheck[] = [
  // ── AI Sidebar Components ──────────────────────────────────────────
  { file: 'components/ai-sidebar/AmbientBar.tsx', exportName: 'AmbientBar' },
  { file: 'components/ai-sidebar/AgentCard.tsx', exportName: 'AgentCard' },
  { file: 'components/ai-sidebar/AISidebar.tsx', exportName: 'AISidebar' },
  { file: 'components/ai-sidebar/BatchDiffModal.tsx', exportName: 'BatchDiffModal' },
  { file: 'components/ai-sidebar/BranchSelector.tsx', exportName: 'BranchSelector' },
  { file: 'components/ai-sidebar/ChatErrorBoundary.tsx', exportName: 'ChatErrorBoundary' },
  { file: 'components/ai-sidebar/ChatInterface.tsx', exportName: 'ChatInterface' },
  { file: 'components/ai-sidebar/CitationsBlock.tsx', exportName: 'CitationsBlock' },
  { file: 'components/ai-sidebar/ClarificationCard.tsx', exportName: 'ClarificationCard' },
  { file: 'components/ai-sidebar/CodeBlock.tsx', exportName: 'CodeBlock' },
  { file: 'components/ai-sidebar/CodeEditCard.tsx', exportName: 'CodeEditCard' },
  { file: 'components/ai-sidebar/ConflictResolver.tsx', exportName: 'ConflictResolver' },
  { file: 'components/ai-sidebar/ContextMeter.tsx', exportName: 'ContextMeter' },
  { file: 'components/ai-sidebar/ContextPanel.tsx', exportName: 'ContextPanel' },
  { file: 'components/ai-sidebar/FileCreateCard.tsx', exportName: 'FileCreateCard' },
  { file: 'components/ai-sidebar/FileOperationToast.tsx', exportName: 'FileOperationToast' },
  { file: 'components/ai-sidebar/FilePreviewCard.tsx', exportName: 'FilePreviewCard' },
  { file: 'components/ai-sidebar/FileSearchCard.tsx', exportName: 'FileSearchCard' },
  { file: 'components/ai-sidebar/GrepResultCard.tsx', exportName: 'GrepResultCard' },
  { file: 'components/ai-sidebar/IntentCompletionPanel.tsx', exportName: 'IntentCompletionPanel' },
  { file: 'components/ai-sidebar/LintResultCard.tsx', exportName: 'LintResultCard' },
  { file: 'components/ai-sidebar/MarkdownRenderer.tsx', exportName: 'MarkdownRenderer' },
  { file: 'components/ai-sidebar/OrchestrationTimeline.tsx', exportName: 'OrchestrationTimeline' },
  { file: 'components/ai-sidebar/PinnedPreferences.tsx', exportName: 'PinnedPreferences' },
  { file: 'components/ai-sidebar/PlanApprovalModal.tsx', exportName: 'PlanApprovalModal' },
  { file: 'components/ai-sidebar/PlanCard.tsx', exportName: 'PlanCard' },
  { file: 'components/ai-sidebar/PreviewNavToast.tsx', exportName: 'PreviewNavToast' },
  { file: 'components/ai-sidebar/ProgressRail.tsx', exportName: 'ProgressRail' },
  { file: 'components/ai-sidebar/PromptTemplateLibrary.tsx', exportName: 'PromptTemplateLibrary' },
  { file: 'components/ai-sidebar/ReviewBlock.tsx', exportName: 'ReviewBlock' },
  { file: 'components/ai-sidebar/ScreenshotCard.tsx', exportName: 'ScreenshotCard' },
  { file: 'components/ai-sidebar/ScreenshotCompareCard.tsx', exportName: 'ScreenshotCompareCard' },
  { file: 'components/ai-sidebar/SessionHistory.tsx', exportName: 'SessionHistory' },
  { file: 'components/ai-sidebar/SessionSidebar.tsx', exportName: 'SessionSidebar' },
  { file: 'components/ai-sidebar/ShareButton.tsx', exportName: 'ShareButton' },
  { file: 'components/ai-sidebar/ShopifyOperationCard.tsx', exportName: 'ShopifyOperationCard' },
  { file: 'components/ai-sidebar/SuggestionChips.tsx', exportName: 'SuggestionChips' },
  { file: 'components/ai-sidebar/ThinkingBlock.tsx', exportName: 'ThinkingBlock' },
  { file: 'components/ai-sidebar/ThinkingBlockV2.tsx', exportName: 'ThinkingBlockV2' },
  { file: 'components/ai-sidebar/ThemeReviewReport.tsx', exportName: 'ThemeReviewReport' },
  { file: 'components/ai-sidebar/ToolActionItem.tsx', exportName: 'ToolActionItem' },

  // ── Hooks ──────────────────────────────────────────────────────────
  { file: 'hooks/useAgentChat.ts', exportName: 'useAgentChat' },
  { file: 'hooks/useAgentSettings.ts', exportName: 'useAgentSettings' },
  { file: 'hooks/useAISidebar.ts', exportName: 'useAISidebar' },
  { file: 'hooks/useActiveStore.ts', exportName: 'useActiveStore' },
  { file: 'hooks/useAmbientIntelligence.ts', exportName: 'useAmbientIntelligence' },
  { file: 'hooks/useApplyWithUndo.ts', exportName: 'useApplyWithUndo' },
  { file: 'hooks/useAutoSave.ts', exportName: 'useAutoSave' },
  { file: 'hooks/useBatchJobs.ts', exportName: 'useBatchJobs' },
  { file: 'hooks/useBinarySync.ts', exportName: 'useBinarySync' },
  { file: 'hooks/useCanvasData.ts', exportName: 'useCanvasData' },
  { file: 'hooks/useChromaticSettings.tsx', exportName: 'useChromaticSettings' },
  { file: 'hooks/useCodeComments.ts', exportName: 'useCodeComments' },
  { file: 'hooks/useCollaborativeEditor.ts', exportName: 'useCollaborativeEditor' },
  { file: 'hooks/useContextMeter.ts', exportName: 'useContextMeter' },
  { file: 'hooks/useDependencyGraph.ts', exportName: 'extractFileDependencies' },
  { file: 'hooks/useDesignComponents.ts', exportName: 'useDesignComponents' },
  { file: 'hooks/useDesignTokens.ts', exportName: 'useDesignTokens' },
  { file: 'hooks/useDesignVersions.ts', exportName: 'useDesignVersions' },
  { file: 'hooks/useDevReport.ts', exportName: 'useDevReport' },
  { file: 'hooks/useDriftBatch.ts', exportName: 'useDriftBatch' },
  { file: 'hooks/useEditorSettings.tsx', exportName: 'useEditorSettings' },
  { file: 'hooks/useFile.ts', exportName: 'useFile' },
  { file: 'hooks/useFileEditor.ts', exportName: 'useFileEditor' },
  { file: 'hooks/useFileOperations.ts', exportName: 'useFileOperations' },
  { file: 'hooks/useFileTabs.ts', exportName: 'useFileTabs' },
  { file: 'hooks/useGitSync.ts', exportName: 'useGitSync' },
  { file: 'hooks/useIntentCompletion.ts', exportName: 'useIntentCompletion' },
  { file: 'hooks/useIsAdmin.ts', exportName: 'useIsAdmin' },
  { file: 'hooks/useLiquidDiagnostics.ts', exportName: 'useLiquidDiagnostics' },
  { file: 'hooks/useLivePreview.ts', exportName: 'useLivePreview' },
  { file: 'hooks/useLocalSync.ts', exportName: 'useLocalSync' },
  { file: 'hooks/useMemory.ts', exportName: 'useMemory' },
  { file: 'hooks/useMetafields.ts', exportName: 'useMetafields' },
  { file: 'hooks/useOfflineQueue.ts', exportName: 'useOfflineQueue' },
  { file: 'hooks/usePassiveContext.ts', exportName: 'usePassiveContext' },
  { file: 'hooks/usePinnedPreferences.ts', exportName: 'usePinnedPreferences' },
  { file: 'hooks/usePreviewBridge.ts', exportName: 'usePreviewBridge' },
  { file: 'hooks/usePreviewRefresh.ts', exportName: 'usePreviewRefresh' },
  { file: 'hooks/usePreviewVerification.ts', exportName: 'usePreviewVerification' },
  { file: 'hooks/useProjectFiles.ts', exportName: 'useProjectFiles' },
  { file: 'hooks/useProjects.ts', exportName: 'useProjects' },
  { file: 'hooks/usePromptProgress.ts', exportName: 'usePromptProgress' },
  { file: 'hooks/usePromptTemplates.ts', exportName: 'usePromptTemplates' },
  { file: 'hooks/usePublishRequests.ts', exportName: 'usePublishRequests' },
  { file: 'hooks/useRemoteCursors.ts', exportName: 'useRemoteCursors' },
  { file: 'hooks/useRequireAuth.ts', exportName: 'useRequireAuth' },
  { file: 'hooks/useResizablePanel.ts', exportName: 'useResizablePanel' },
  { file: 'hooks/useSchemaParser.ts', exportName: 'useSchemaParser' },
  { file: 'hooks/useShopifyAssets.ts', exportName: 'useShopifyAssets' },
  { file: 'hooks/useShopifyConnection.ts', exportName: 'useShopifyConnection' },
  { file: 'hooks/useShopifyDiscounts.ts', exportName: 'useShopifyDiscounts' },
  { file: 'hooks/useShopifyFiles.ts', exportName: 'useShopifyFiles' },
  { file: 'hooks/useShopifyInventory.ts', exportName: 'useShopifyInventory' },
  { file: 'hooks/useShopifyNavigation.ts', exportName: 'useShopifyNavigation' },
  { file: 'hooks/useShopifyPages.ts', exportName: 'useShopifyPages' },
  { file: 'hooks/useStyleProfile.ts', exportName: 'useStyleProfile' },
  { file: 'hooks/useSuggestions.ts', exportName: 'useSuggestions' },
  { file: 'hooks/useTemplateLayout.ts', exportName: 'useTemplateLayout' },
  { file: 'hooks/useTheme.ts', exportName: 'useTheme' },
  { file: 'hooks/useThemeConsole.ts', exportName: 'useThemeConsole' },
  { file: 'hooks/useThumbnails.ts', exportName: 'useThumbnails' },
  { file: 'hooks/useVersionHistory.ts', exportName: 'useVersionHistory' },
  { file: 'hooks/useWorkspaceDiagnostics.ts', exportName: 'useWorkspaceDiagnostics' },
  { file: 'hooks/useWorkspacePresence.ts', exportName: 'useWorkspacePresence' },

  // ── Feature Components ─────────────────────────────────────────────
  { file: 'components/features/agents/AgentLiveBreakout.tsx', exportName: 'AgentLiveBreakout' },
  { file: 'components/features/agents/AgentPromptPanel.tsx', exportName: 'AgentPromptPanel' },
  { file: 'components/features/agents/CostBreakdownPanel.tsx', exportName: 'CostBreakdownPanel' },

  // ── Preview ────────────────────────────────────────────────────────
  { file: 'components/preview/BlogPicker.tsx', exportName: 'BlogPicker' },
  { file: 'components/preview/CollectionPicker.tsx', exportName: 'CollectionPicker' },
  { file: 'components/preview/CreateTemplateModal.tsx', exportName: 'CreateTemplateModal' },
  { file: 'components/preview/DeviceSizeSelector.tsx', exportName: 'DeviceSizeSelector' },
  { file: 'components/preview/PagePicker.tsx', exportName: 'PagePicker' },
  { file: 'components/preview/PageTypeSelector.tsx', exportName: 'PageTypeSelector' },
  { file: 'components/preview/PreviewAnnotator.tsx', exportName: 'PreviewAnnotator' },
  { file: 'components/preview/PreviewControls.tsx', exportName: 'PreviewControls' },
  { file: 'components/preview/PreviewFrame.tsx', exportName: 'PreviewFrame' },
  { file: 'components/preview/PreviewPanel.tsx', exportName: 'PreviewPanel' },
  { file: 'components/preview/ProductPicker.tsx', exportName: 'ProductPicker' },
  { file: 'components/preview/ResourcePicker.tsx', exportName: 'ResourcePicker' },

  // ── Git ─────────────────────────────────────────────────────────────
  { file: 'components/git/BranchManager.tsx', exportName: 'BranchManager' },
  { file: 'components/git/CommitDialog.tsx', exportName: 'CommitDialog' },
  { file: 'components/git/GitStatusBar.tsx', exportName: 'GitStatusBar' },
  { file: 'components/git/MergeConflictPanel.tsx', exportName: 'MergeConflictPanel' },

  // ── Editor ──────────────────────────────────────────────────────────
  { file: 'components/editor/ActivityBar.tsx', exportName: 'ActivityBar' },
  { file: 'components/editor/CollaborativeCursors.tsx', exportName: 'CollaborativeCursors' },
  { file: 'components/editor/CommentThread.tsx', exportName: 'CommentThread' },
  { file: 'components/editor/CommandPalette.tsx', exportName: 'CommandPalette' },
  { file: 'components/editor/DevReportModal.tsx', exportName: 'DevReportModal' },
  { file: 'components/editor/FileBreadcrumb.tsx', exportName: 'FileBreadcrumb' },
  { file: 'components/editor/FlowCanvas.tsx', exportName: 'FlowCanvas' },
  { file: 'components/editor/InlineComments.tsx', exportName: 'InlineComments' },
  { file: 'components/editor/MonacoEditor.tsx', exportName: 'MonacoEditor' },
  { file: 'components/editor/QuickActionsToolbar.tsx', exportName: 'QuickActionsToolbar' },
  { file: 'components/editor/SettingsModal.tsx', exportName: 'SettingsModal' },
  { file: 'components/editor/StatusBar.tsx', exportName: 'StatusBar' },
  { file: 'components/editor/ThemeConsole.tsx', exportName: 'ThemeConsole' },
  { file: 'components/editor/TopBar.tsx', exportName: 'TopBar' },
];

const root = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
const failures: string[] = [];

for (const { file, exportName } of EXPECTED_EXPORTS) {
  const fullPath = path.join(root, file);

  if (!fs.existsSync(fullPath)) {
    failed++;
    failures.push(`MISSING FILE: ${file}`);
    continue;
  }

  const content = fs.readFileSync(fullPath, 'utf-8');

  const exportPatterns = [
    new RegExp(`export\\s+(function|const|class)\\s+${exportName}\\b`),
    new RegExp(`export\\s+default\\s+(function\\s+)?${exportName}\\b`),
    new RegExp(`export\\s*\\{[^}]*\\b${exportName}\\b[^}]*\\}`),
    new RegExp(`export\\s+default\\s+React\\.memo\\(\\s*${exportName}`),
    new RegExp(`export\\s+default\\s+memo\\(\\s*${exportName}`),
    new RegExp(`export\\s+default\\s+forwardRef`),
  ];

  const found = exportPatterns.some((p) => p.test(content));

  if (found) {
    passed++;
  } else {
    failed++;
    failures.push(`MISSING EXPORT: ${exportName} in ${file}`);
  }
}

console.log('\n════════════════════════════════════════════════');
console.log('  Component/Hook Export Verification');
console.log('════════════════════════════════════════════════');
console.log(`  Total checked: ${EXPECTED_EXPORTS.length}`);
console.log(`  Passed:        ${passed}`);
console.log(`  Failed:        ${failed}`);
console.log('════════════════════════════════════════════════\n');

if (failures.length > 0) {
  console.log('Failures:');
  for (const f of failures) {
    console.log(`  ✗ ${f}`);
  }
  console.log();
}

const report = {
  phase: '1e',
  name: 'Component/Hook Export Verification',
  timestamp: new Date().toISOString(),
  total: EXPECTED_EXPORTS.length,
  passed,
  failed,
  failures,
  result: failed === 0 ? 'PASS' : 'FAIL',
};

fs.writeFileSync(
  path.join(root, '.verification', 'exports.json'),
  JSON.stringify(report, null, 2),
);
console.log('Report written to .verification/exports.json');

process.exit(failed > 0 ? 1 : 0);
