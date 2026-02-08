import { initializeCoordination } from '../coordination/initialize';
import { atomicRead, atomicWrite } from '../coordination/atomic';
import { EpicStateSchema } from '../coordination/schemas';
import { analyzeDependencies } from './dependency-analysis';
import { calculateWaves } from './wave-calculation';
import { launchWave, waitForWaveCompletion } from './wave-execution';
import { resolveBlockers } from './blockers';
import type { ExecutionWave } from './types';

/**
 * Main orchestration loop. Initializes coordination, analyzes dependencies,
 * calculates waves, and executes each wave sequentially.
 */
export async function orchestrateEpic(epicId: string): Promise<void> {
  await initializeCoordination(epicId);

  const depAnalysis = await analyzeDependencies();

  if (depAnalysis.hasCycles) {
    throw new Error(
      `Dependency cycle detected: ${depAnalysis.cycles.map((c) => c.join(' -> ')).join('; ')}`
    );
  }

  const waves = calculateWaves(depAnalysis);

  const epicState = await atomicRead('status/epic_state.json', EpicStateSchema);
  await atomicWrite('status/epic_state.json', {
    ...epicState,
    status: 'in_progress',
    total_tasks: depAnalysis.tasks.size,
    updated_at: new Date().toISOString(),
  });

  for (const wave of waves) {
    await launchWave(wave);
    const { completed, failed } = await waitForWaveCompletion(wave);

    const epic = await atomicRead('status/epic_state.json', EpicStateSchema);
    await atomicWrite('status/epic_state.json', {
      ...epic,
      completed_tasks: epic.completed_tasks + completed.length,
      failed_tasks: epic.failed_tasks + failed.length,
      updated_at: new Date().toISOString(),
    });
  }

  const final = await atomicRead('status/epic_state.json', EpicStateSchema);
  await atomicWrite('status/epic_state.json', {
    ...final,
    status: 'completed',
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}
