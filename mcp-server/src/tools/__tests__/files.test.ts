import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolRegistry } from '../registry.js';
import { registerFileTools } from '../files.js';

// Mock FileReader to avoid real file I/O
vi.mock('../../fs/reader.js', () => {
  return {
    FileReader: class MockFileReader {
      validatePath(p: string) {
        return !p.includes('..');
      }
      async readFile() {
        return '<div>file content</div>';
      }
      getFileType() {
        return 'liquid';
      }
      async listFiles() {
        return ['sections/header.liquid', 'snippets/new.liquid'];
      }
    },
  };
});

// Mock logger to suppress output during tests
vi.mock('../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function createMockAuthManager(authenticated = true) {
  return {
    isAuthenticated: vi.fn(() => authenticated),
    getAuthHeader: vi.fn(() => (authenticated ? 'Bearer test-token' : null)),
    loadToken: vi.fn(),
    logout: vi.fn(),
    refreshToken: vi.fn(),
  };
}

function createMockApiClient() {
  return {
    addFile: vi.fn(async () => ({
      data: { id: 'file-uuid-1', name: 'layout.liquid' },
    })),
    updateFileContent: vi.fn(async () => ({ data: {} })),
    listProjects: vi.fn(),
    createProject: vi.fn(),
    listProjectFiles: vi.fn(),
    executeAgents: vi.fn(),
    getExecutionStatus: vi.fn(),
    getProposedChanges: vi.fn(),
    getPreferences: vi.fn(),
  };
}

describe('registerFileTools', () => {
  let registry: ToolRegistry;
  let apiClient: ReturnType<typeof createMockApiClient>;
  let authManager: ReturnType<typeof createMockAuthManager>;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new ToolRegistry();
    apiClient = createMockApiClient();
    authManager = createMockAuthManager();
  });

  it('registers synapse_add_files tool', () => {
    registerFileTools(registry, apiClient as never, authManager as never);

    expect(registry.has('synapse_add_files')).toBe(true);

    const definitions = registry.getDefinitions();
    const fileTool = definitions.find((d) => d.name === 'synapse_add_files');
    expect(fileTool).toBeDefined();
    expect(fileTool!.description).toContain('Add files');
    expect(fileTool!.inputSchema.required).toContain('projectId');
    expect(fileTool!.inputSchema.required).toContain('filePaths');
    expect(fileTool!.inputSchema.required).toContain('workspacePath');
  });

  it('handler reads files and calls API', async () => {
    registerFileTools(registry, apiClient as never, authManager as never);

    const handler = registry.getHandler('synapse_add_files')!;
    expect(handler).toBeDefined();

    const result = await handler({
      projectId: 'proj-1',
      filePaths: ['templates/layout.liquid', 'snippets/header.liquid'],
      workspacePath: '/workspace/theme',
    });

    // Should have called addFile for each file path
    expect(apiClient.addFile).toHaveBeenCalledTimes(2);
    expect(apiClient.addFile).toHaveBeenCalledWith('proj-1', {
      name: 'layout.liquid',
      path: 'templates/layout.liquid',
      file_type: 'liquid',
      content: '<div>file content</div>',
    });
    expect(apiClient.addFile).toHaveBeenCalledWith('proj-1', {
      name: 'header.liquid',
      path: 'snippets/header.liquid',
      file_type: 'liquid',
      content: '<div>file content</div>',
    });

    // Should return success response
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.addedFiles).toHaveLength(2);
    expect(parsed.addedFiles[0]).toEqual({
      fileId: 'file-uuid-1',
      fileName: 'layout.liquid',
    });
    expect(parsed.errors).toBeUndefined();
  });

  it('handler rejects path traversal', async () => {
    registerFileTools(registry, apiClient as never, authManager as never);

    const handler = registry.getHandler('synapse_add_files')!;
    const result = await handler({
      projectId: 'proj-1',
      filePaths: ['../../../etc/passwd'],
      workspacePath: '/workspace/theme',
    });

    // Should NOT have called addFile for the traversal path
    expect(apiClient.addFile).not.toHaveBeenCalled();

    // Should report the path traversal error
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.addedFiles).toHaveLength(0);
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0].file).toBe('../../../etc/passwd');
    expect(parsed.errors[0].error).toContain('Path traversal');
  });

  it('throws AUTH_REQUIRED when not authenticated', async () => {
    authManager = createMockAuthManager(false);
    registerFileTools(registry, apiClient as never, authManager as never);

    const handler = registry.getHandler('synapse_add_files')!;

    await expect(
      handler({
        projectId: 'proj-1',
        filePaths: ['templates/layout.liquid'],
        workspacePath: '/workspace/theme',
      })
    ).rejects.toThrow('AUTH_REQUIRED');

    expect(apiClient.addFile).not.toHaveBeenCalled();
  });

  it('registers synapse_sync_workspace_to_project tool', () => {
    registerFileTools(registry, apiClient as never, authManager as never);

    expect(registry.has('synapse_sync_workspace_to_project')).toBe(true);

    const definitions = registry.getDefinitions();
    const syncTool = definitions.find((d) => d.name === 'synapse_sync_workspace_to_project');
    expect(syncTool).toBeDefined();
    expect(syncTool!.inputSchema.required).toContain('projectId');
    expect(syncTool!.inputSchema.required).toContain('workspacePath');
  });

  it('synapse_sync_workspace_to_project updates existing and adds new files', async () => {
    apiClient.listProjectFiles = vi.fn().mockResolvedValue({
      data: [
        { id: 'id-header', name: 'header.liquid', path: 'sections/header.liquid', file_type: 'liquid' },
      ],
    });

    registerFileTools(registry, apiClient as never, authManager as never);
    const handler = registry.getHandler('synapse_sync_workspace_to_project')!;

    const result = await handler({
      projectId: 'proj-1',
      workspacePath: '/workspace/theme',
    });

    expect(apiClient.listProjectFiles).toHaveBeenCalledWith('proj-1');
    expect(apiClient.updateFileContent).toHaveBeenCalledTimes(1);
    expect(apiClient.updateFileContent).toHaveBeenCalledWith('id-header', '<div>file content</div>');
    expect(apiClient.addFile).toHaveBeenCalledTimes(1);
    expect(apiClient.addFile).toHaveBeenCalledWith('proj-1', {
      name: 'new.liquid',
      path: 'snippets/new.liquid',
      file_type: 'liquid',
      content: '<div>file content</div>',
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.updated).toBe(1);
    expect(parsed.added).toBe(1);
  });
});
