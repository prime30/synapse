import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActivityNotifier } from '../activity-notifier.js';
import type { AgentActivityUpdate } from '../activity-notifier.js';

// Mock logger to suppress output during tests
vi.mock('../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function createMockServer() {
  return {
    notification: vi.fn(),
    setRequestHandler: vi.fn(),
    connect: vi.fn(),
    close: vi.fn(),
  };
}

describe('ActivityNotifier', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let notifier: ActivityNotifier;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = createMockServer();
    notifier = new ActivityNotifier(mockServer as never);
  });

  it('sendUpdate sends MCP notification with correct params', () => {
    const update: AgentActivityUpdate = {
      executionId: 'exec-123',
      status: 'running',
      activeAgents: ['coder', 'reviewer'],
      completedAgents: ['analyzer'],
      progress: 50,
      message: 'Processing files...',
    };

    notifier.sendUpdate(update);

    expect(mockServer.notification).toHaveBeenCalledTimes(1);
    expect(mockServer.notification).toHaveBeenCalledWith({
      method: 'synapse/agentActivity',
      params: {
        executionId: 'exec-123',
        status: 'running',
        activeAgents: ['coder', 'reviewer'],
        completedAgents: ['analyzer'],
        progress: 50,
        message: 'Processing files...',
      },
    });
  });

  it('sendUpdate does not throw when notification fails', () => {
    mockServer.notification.mockImplementation(() => {
      throw new Error('Connection lost');
    });

    const update: AgentActivityUpdate = {
      executionId: 'exec-456',
      status: 'running',
      activeAgents: ['coder'],
      completedAgents: [],
      progress: 25,
    };

    // Should not throw
    expect(() => notifier.sendUpdate(update)).not.toThrow();
  });

  it('default message format includes agent names and progress when active', () => {
    const update: AgentActivityUpdate = {
      executionId: 'exec-789',
      status: 'running',
      activeAgents: ['coder', 'reviewer'],
      completedAgents: ['analyzer'],
      progress: 67,
      // No message provided — should use formatMessage
    };

    notifier.sendUpdate(update);

    const callArgs = mockServer.notification.mock.calls[0][0];
    // Default message should include active agent names and progress
    expect(callArgs.params.message).toBe('Working: coder, reviewer (67%)');
  });

  it('default message for completed status includes agent count', () => {
    const update: AgentActivityUpdate = {
      executionId: 'exec-done',
      status: 'completed',
      activeAgents: [],
      completedAgents: ['coder', 'reviewer', 'analyzer'],
      progress: 100,
    };

    notifier.sendUpdate(update);

    const callArgs = mockServer.notification.mock.calls[0][0];
    expect(callArgs.params.message).toBe('Agents completed (3 agents)');
  });

  it('default message for failed status', () => {
    const update: AgentActivityUpdate = {
      executionId: 'exec-fail',
      status: 'failed',
      activeAgents: [],
      completedAgents: ['coder'],
      progress: 33,
    };

    notifier.sendUpdate(update);

    const callArgs = mockServer.notification.mock.calls[0][0];
    expect(callArgs.params.message).toBe('Agent execution failed');
  });

  it('default message for status with no active agents shows processing', () => {
    const update: AgentActivityUpdate = {
      executionId: 'exec-wait',
      status: 'running',
      activeAgents: [],
      completedAgents: [],
      progress: 10,
    };

    notifier.sendUpdate(update);

    const callArgs = mockServer.notification.mock.calls[0][0];
    expect(callArgs.params.message).toBe('Processing... (10%)');
  });
});

describe('ActivityNotifier.calculateProgress', () => {
  it('returns correct percentage for partial completion', () => {
    expect(ActivityNotifier.calculateProgress(2, 3)).toBe(67);
  });

  it('returns 0 when totalCount is 0', () => {
    expect(ActivityNotifier.calculateProgress(0, 0)).toBe(0);
  });

  it('returns 100 when all agents are completed', () => {
    expect(ActivityNotifier.calculateProgress(3, 3)).toBe(100);
  });

  it('returns 0 when no agents are completed', () => {
    expect(ActivityNotifier.calculateProgress(0, 5)).toBe(0);
  });

  it('rounds to nearest integer', () => {
    // 1/3 = 33.33... -> 33
    expect(ActivityNotifier.calculateProgress(1, 3)).toBe(33);
    // 1/6 = 16.66... -> 17
    expect(ActivityNotifier.calculateProgress(1, 6)).toBe(17);
  });
});
