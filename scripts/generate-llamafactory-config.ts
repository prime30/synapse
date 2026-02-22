/**
 * Generate LlamaFactory YAML config files for SFT, DPO, and ORPO training.
 *
 * Usage:
 *   npx tsx scripts/generate-llamafactory-config.ts [--stage sft|dpo|orpo|all]
 *     [--model <model-id>] [--dataset-dir <path>] [--output-dir <path>]
 *     [--sft-checkpoint <path>]
 *
 * Outputs YAML files to .finetune-configs/ ready for:
 *   llamafactory-cli train .finetune-configs/<stage>.yaml
 */

import fs from 'fs';
import path from 'path';
import {
  buildTrainConfig,
  buildRunMetadata,
  generateYAMLConfig,
  RECOMMENDED_BASE_MODELS,
  type BaseModelConfig,
} from '../lib/finetune/llamafactory-configs';

function parseArg(name: string): string | undefined {
  const idx = process.argv.findIndex((a) => a === `--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

const stage = parseArg('stage') ?? 'all';
const modelId = parseArg('model') ?? 'qwen2.5-coder-32b';
const datasetDir = parseArg('dataset-dir') ?? path.join(process.cwd(), '.finetune-data');
const outputDir = parseArg('output-dir') ?? path.join(process.cwd(), '.finetune-output');
const configDir = parseArg('config-dir') ?? path.join(process.cwd(), '.finetune-configs');
const sftCheckpoint = parseArg('sft-checkpoint');
const datasetVersion = parseArg('dataset-version') ?? 'latest';

const baseModel: BaseModelConfig =
  RECOMMENDED_BASE_MODELS.find((m) => m.id === modelId) ?? RECOMMENDED_BASE_MODELS[0];

function generateAndWrite(targetStage: 'sft' | 'dpo' | 'orpo') {
  const config = buildTrainConfig(targetStage, {
    baseModel,
    datasetDir,
    outputDir,
    sftFromCheckpoint: targetStage !== 'sft' ? sftCheckpoint : undefined,
  });

  const yaml = generateYAMLConfig(config);
  const metadata = buildRunMetadata(config, datasetVersion);

  const yamlPath = path.join(configDir, `${targetStage}.yaml`);
  const metadataPath = path.join(configDir, `${targetStage}-metadata.json`);

  fs.writeFileSync(yamlPath, yaml, 'utf8');
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');

  console.log(`Wrote ${yamlPath}`);
  console.log(`Wrote ${metadataPath}`);
  console.log(`  Base model: ${config.baseModel.name}`);
  console.log(`  LoRA rank: ${config.loraRank}, alpha: ${config.loraAlpha}`);
  console.log(`  LR: ${config.learningRate}, epochs: ${config.numEpochs}`);
  console.log(`  Run ID: ${config.runId}`);
  console.log('');
}

function main() {
  fs.mkdirSync(configDir, { recursive: true });

  console.log(`Generating LlamaFactory configs for model: ${baseModel.name}`);
  console.log(`Dataset dir: ${datasetDir}`);
  console.log(`Output dir: ${outputDir}`);
  console.log('');

  const stages: Array<'sft' | 'dpo' | 'orpo'> =
    stage === 'all'
      ? ['sft', 'dpo', 'orpo']
      : [stage as 'sft' | 'dpo' | 'orpo'];

  for (const s of stages) {
    generateAndWrite(s);
  }

  console.log('=== Training Pipeline ===');
  console.log('1. Build dataset:     npx tsx scripts/build-training-dataset.ts');
  console.log(`2. SFT training:      llamafactory-cli train ${configDir}/sft.yaml`);
  if (stages.includes('dpo') || stages.includes('orpo')) {
    console.log(
      `3. DPO training:      llamafactory-cli train ${configDir}/dpo.yaml --sft-checkpoint <sft-output>`,
    );
    console.log(
      `4. ORPO training:     llamafactory-cli train ${configDir}/orpo.yaml --sft-checkpoint <sft-output>`,
    );
  }
  console.log('5. Evaluate:          npx tsx scripts/run-finetune-eval.ts');
}

main();
