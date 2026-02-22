/**
 * LlamaFactory configuration generation for SFT, DPO, and ORPO training.
 *
 * Generates YAML configs compatible with LlamaFactory's CLI:
 *   llamafactory-cli train <config.yaml>
 *
 * Supports:
 *   - SFT with LoRA (default entry point)
 *   - DPO with LoRA (preference optimization after SFT)
 *   - ORPO with LoRA (alternative preference method)
 *   - Full reproducibility metadata in output
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface BaseModelConfig {
  id: string;
  name: string;
  modelNameOrPath: string;
  template: string;
  maxLength: number;
  quantBits?: 4 | 8;
}

export interface TrainRunConfig {
  runId: string;
  stage: 'sft' | 'dpo' | 'orpo';
  baseModel: BaseModelConfig;
  datasetDir: string;
  outputDir: string;
  loraRank: number;
  loraAlpha: number;
  loraDropout: number;
  learningRate: number;
  numEpochs: number;
  batchSize: number;
  gradientAccumulationSteps: number;
  warmupRatio: number;
  weightDecay: number;
  maxGradNorm: number;
  seed: number;
  fp16: boolean;
  bf16: boolean;
  loggingSteps: number;
  saveSteps: number;
  evalSteps: number;
  sftFromCheckpoint?: string;
}

export interface TrainRunMetadata {
  runId: string;
  stage: string;
  baseModelId: string;
  datasetVersion: string;
  configHash: string;
  startedAt: string;
  hyperparams: Record<string, unknown>;
}

// ── Recommended Base Models ──────────────────────────────────────────────────

export const RECOMMENDED_BASE_MODELS: BaseModelConfig[] = [
  {
    id: 'qwen2.5-coder-32b',
    name: 'Qwen 2.5 Coder 32B Instruct',
    modelNameOrPath: 'Qwen/Qwen2.5-Coder-32B-Instruct',
    template: 'qwen',
    maxLength: 32768,
  },
  {
    id: 'qwen2.5-72b',
    name: 'Qwen 2.5 72B Instruct',
    modelNameOrPath: 'Qwen/Qwen2.5-72B-Instruct',
    template: 'qwen',
    maxLength: 32768,
    quantBits: 4,
  },
  {
    id: 'deepseek-coder-v2-lite',
    name: 'DeepSeek Coder V2 Lite Instruct',
    modelNameOrPath: 'deepseek-ai/DeepSeek-Coder-V2-Lite-Instruct',
    template: 'deepseek2',
    maxLength: 16384,
  },
  {
    id: 'codellama-34b',
    name: 'Code Llama 34B Instruct',
    modelNameOrPath: 'codellama/CodeLlama-34b-Instruct-hf',
    template: 'llama2',
    maxLength: 16384,
    quantBits: 4,
  },
  {
    id: 'llama3.1-70b',
    name: 'Llama 3.1 70B Instruct',
    modelNameOrPath: 'meta-llama/Llama-3.1-70B-Instruct',
    template: 'llama3',
    maxLength: 32768,
    quantBits: 4,
  },
];

// ── Default Hyperparameters ──────────────────────────────────────────────────

const SFT_DEFAULTS: Partial<TrainRunConfig> = {
  loraRank: 64,
  loraAlpha: 128,
  loraDropout: 0.05,
  learningRate: 2e-4,
  numEpochs: 3,
  batchSize: 2,
  gradientAccumulationSteps: 8,
  warmupRatio: 0.1,
  weightDecay: 0.01,
  maxGradNorm: 1.0,
  seed: 42,
  fp16: false,
  bf16: true,
  loggingSteps: 10,
  saveSteps: 100,
  evalSteps: 50,
};

const DPO_DEFAULTS: Partial<TrainRunConfig> = {
  ...SFT_DEFAULTS,
  learningRate: 5e-5,
  numEpochs: 2,
  loraRank: 32,
  loraAlpha: 64,
};

const ORPO_DEFAULTS: Partial<TrainRunConfig> = {
  ...DPO_DEFAULTS,
  learningRate: 8e-6,
  numEpochs: 2,
};

// ── Config Generation ────────────────────────────────────────────────────────

function mergeDefaults(
  stage: 'sft' | 'dpo' | 'orpo',
  overrides: Partial<TrainRunConfig>,
): TrainRunConfig {
  const defaults =
    stage === 'sft' ? SFT_DEFAULTS : stage === 'dpo' ? DPO_DEFAULTS : ORPO_DEFAULTS;

  return {
    runId: overrides.runId ?? `${stage}-${Date.now()}`,
    stage,
    baseModel: overrides.baseModel ?? RECOMMENDED_BASE_MODELS[0],
    datasetDir: overrides.datasetDir ?? '.finetune-data',
    outputDir: overrides.outputDir ?? `.finetune-output/${stage}`,
    loraRank: overrides.loraRank ?? (defaults.loraRank as number),
    loraAlpha: overrides.loraAlpha ?? (defaults.loraAlpha as number),
    loraDropout: overrides.loraDropout ?? (defaults.loraDropout as number),
    learningRate: overrides.learningRate ?? (defaults.learningRate as number),
    numEpochs: overrides.numEpochs ?? (defaults.numEpochs as number),
    batchSize: overrides.batchSize ?? (defaults.batchSize as number),
    gradientAccumulationSteps:
      overrides.gradientAccumulationSteps ?? (defaults.gradientAccumulationSteps as number),
    warmupRatio: overrides.warmupRatio ?? (defaults.warmupRatio as number),
    weightDecay: overrides.weightDecay ?? (defaults.weightDecay as number),
    maxGradNorm: overrides.maxGradNorm ?? (defaults.maxGradNorm as number),
    seed: overrides.seed ?? (defaults.seed as number),
    fp16: overrides.fp16 ?? (defaults.fp16 as boolean),
    bf16: overrides.bf16 ?? (defaults.bf16 as boolean),
    loggingSteps: overrides.loggingSteps ?? (defaults.loggingSteps as number),
    saveSteps: overrides.saveSteps ?? (defaults.saveSteps as number),
    evalSteps: overrides.evalSteps ?? (defaults.evalSteps as number),
    sftFromCheckpoint: overrides.sftFromCheckpoint,
  };
}

/**
 * Generate a LlamaFactory YAML config string from run configuration.
 */
export function generateYAMLConfig(config: TrainRunConfig): string {
  const model = config.baseModel;
  const isSFT = config.stage === 'sft';
  const datasetName = isSFT ? 'synapse_sft_train' : 'synapse_preference_train';
  const evalDatasetName = isSFT ? 'synapse_sft_val' : 'synapse_preference_val';

  const lines: string[] = [
    `### LlamaFactory Config: ${config.runId}`,
    `### Stage: ${config.stage.toUpperCase()}`,
    `### Base model: ${model.name}`,
    `### Generated: ${new Date().toISOString()}`,
    '',
    '### Model',
    `model_name_or_path: ${model.modelNameOrPath}`,
    `template: ${model.template}`,
  ];

  if (model.quantBits) {
    lines.push(`quantization_bit: ${model.quantBits}`);
  }

  lines.push(
    '',
    '### Method',
    `stage: ${config.stage}`,
    'do_train: true',
    'finetuning_type: lora',
    `lora_rank: ${config.loraRank}`,
    `lora_alpha: ${config.loraAlpha}`,
    `lora_dropout: ${config.loraDropout}`,
    'lora_target: all',
  );

  if (config.sftFromCheckpoint) {
    lines.push(`adapter_name_or_path: ${config.sftFromCheckpoint}`);
  }

  lines.push(
    '',
    '### Dataset',
    `dataset_dir: ${config.datasetDir}`,
    `dataset: ${datasetName}`,
    `eval_dataset: ${evalDatasetName}`,
    `cutoff_len: ${model.maxLength}`,
    'overwrite_cache: true',
    'preprocessing_num_workers: 8',
  );

  lines.push(
    '',
    '### Training',
    `output_dir: ${config.outputDir}/${config.runId}`,
    'overwrite_output_dir: true',
    `per_device_train_batch_size: ${config.batchSize}`,
    `gradient_accumulation_steps: ${config.gradientAccumulationSteps}`,
    `learning_rate: ${config.learningRate}`,
    `num_train_epochs: ${config.numEpochs}`,
    'lr_scheduler_type: cosine',
    `warmup_ratio: ${config.warmupRatio}`,
    `weight_decay: ${config.weightDecay}`,
    `max_grad_norm: ${config.maxGradNorm}`,
    `seed: ${config.seed}`,
  );

  if (config.bf16) {
    lines.push('bf16: true');
  } else if (config.fp16) {
    lines.push('fp16: true');
  }

  lines.push(
    '',
    '### Logging & Saving',
    `logging_steps: ${config.loggingSteps}`,
    `save_steps: ${config.saveSteps}`,
    'save_total_limit: 3',
    `eval_steps: ${config.evalSteps}`,
    'eval_strategy: steps',
    'load_best_model_at_end: true',
    'metric_for_best_model: eval_loss',
    '',
    '### Reporting',
    'report_to: none',
    'plot_loss: true',
  );

  return lines.join('\n');
}

/**
 * Build a full training configuration for a given stage.
 */
export function buildTrainConfig(
  stage: 'sft' | 'dpo' | 'orpo',
  overrides: Partial<TrainRunConfig> = {},
): TrainRunConfig {
  return mergeDefaults(stage, overrides);
}

/**
 * Generate reproducibility metadata for a training run.
 */
export function buildRunMetadata(
  config: TrainRunConfig,
  datasetVersion: string,
): TrainRunMetadata {
  const { createHash } = require('node:crypto');
  const configStr = JSON.stringify(config);
  const configHash = createHash('sha256').update(configStr).digest('hex').slice(0, 16);

  return {
    runId: config.runId,
    stage: config.stage,
    baseModelId: config.baseModel.id,
    datasetVersion,
    configHash,
    startedAt: new Date().toISOString(),
    hyperparams: {
      loraRank: config.loraRank,
      loraAlpha: config.loraAlpha,
      loraDropout: config.loraDropout,
      learningRate: config.learningRate,
      numEpochs: config.numEpochs,
      batchSize: config.batchSize,
      gradientAccumulationSteps: config.gradientAccumulationSteps,
      warmupRatio: config.warmupRatio,
      weightDecay: config.weightDecay,
      maxGradNorm: config.maxGradNorm,
      seed: config.seed,
    },
  };
}
