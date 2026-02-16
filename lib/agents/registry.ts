/**
 * Agent Plugin / Skills Registry -- EPIC C
 *
 * Singleton registry with dual matching: file-pattern (glob) and capability.
 * Agents self-register at import time. Coordinator queries the registry
 * with hardcoded fallback for backward compatibility.
 */

import picomatch from 'picomatch';
import type { Agent } from './base';
import type { AgentContext } from '@/lib/types/agent';

// -- Types --------------------------------------------------------------------

export interface AgentMetadata {
  name: string;
  type: string;
  filePatterns: string[];
  capabilities: string[];
  priority: number; // lower = higher priority
  factory: (context?: AgentContext) => Agent;
  enabled: boolean;
}

// -- Registry -----------------------------------------------------------------

class AgentRegistry {
  private agents = new Map<string, AgentMetadata>();

  /** Register an agent. Idempotent. */
  register(meta: AgentMetadata): void {
    this.agents.set(meta.type, meta);
  }

  /** Unregister an agent by type. */
  unregister(type: string): void {
    this.agents.delete(type);
  }

  /** Get all registered agent metadata. */
  getAll(): AgentMetadata[] {
    return Array.from(this.agents.values());
  }

  /** Get enabled agents only. */
  getEnabled(): AgentMetadata[] {
    return this.getAll().filter(a => a.enabled);
  }

  /**
   * Find the best specialist for each file based on glob patterns.
   * Returns a map of agentType -> Agent instance.
   */
  getSpecialistsForFiles(
    fileNames: string[],
  ): Map<string, Agent> {
    const result = new Map<string, Agent>();
    const enabledAgents = this.getEnabled().sort((a, b) => a.priority - b.priority);

    for (const fileName of fileNames) {
      for (const meta of enabledAgents) {
        const matches = meta.filePatterns.some(pattern =>
          picomatch.isMatch(fileName, pattern, { basename: true })
        );
        if (matches && !result.has(meta.type)) {
          result.set(meta.type, meta.factory());
          break;
        }
      }
    }

    return result;
  }

  /**
   * Find agents with a specific capability.
   */
  findByCapability(capability: string): AgentMetadata[] {
    return this.getEnabled().filter(a =>
      a.capabilities.includes(capability)
    ).sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get a specific agent by type.
   */
  getByType(type: string): AgentMetadata | undefined {
    return this.agents.get(type);
  }

  /**
   * Set enabled state for an agent.
   */
  setEnabled(type: string, enabled: boolean): void {
    const meta = this.agents.get(type);
    if (meta) meta.enabled = enabled;
  }
}

// -- Singleton ----------------------------------------------------------------

let _registry: AgentRegistry | null = null;

export function getAgentRegistry(): AgentRegistry {
  if (!_registry) _registry = new AgentRegistry();
  return _registry;
}