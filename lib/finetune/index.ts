/**
 * LlamaFactory fine-tuning module.
 *
 * Provides the complete pipeline from behavior specification to production
 * deployment of a Shopify-specialized tuned model.
 */

export { BEHAVIOR_SPECS, getBehaviorSpec, getAllPromptFamilies, getAllAntiPatterns, computeWeightedScore } from './behavior-spec';
export type { IntentMode, ModeBehaviorSpec, PromptFamily, AntiPattern, ScorecardDimension } from './behavior-spec';

export { sftToShareGPT, sftToAlpaca, preferenceToLlamaFactory } from './dataset-schema';
export type { SFTExample, PreferenceExample, DatasetManifest, ConversationTurn, QualityLabels } from './dataset-schema';

export { redactText, sanitize, normalizePaths, contentFingerprint } from './redaction';

export { ADVERSARIAL_SCENARIOS, generateAdversarialDataset, scenarioToSFT, scenarioToPreference } from './adversarial-set';

export { buildTrainConfig, generateYAMLConfig, buildRunMetadata, RECOMMENDED_BASE_MODELS } from './llamafactory-configs';
export type { BaseModelConfig, TrainRunConfig, TrainRunMetadata } from './llamafactory-configs';

export { buildEvalSummary, scoreModeInference, scoreClarificationQuality, scorePlanDecomposition, scoreHallucination, scoreAntiPatterns, scoreConversationQuality } from './eval-dimensions';
export type { FinetuneEvalResult, FinetuneEvalSummary } from './eval-dimensions';

export { shouldUseTunedModel, configureTunedModel, getTunedModelConfig, getRollbackState, recordKPIObservation, resetRollback, getTunedModelEndpoint, initFromEnv } from './hybrid-router';
export type { TunedModelConfig, CanaryDecision, RollbackState } from './hybrid-router';

export { recordObservation, captureBaseline, generateDriftReport, setBaseline, getBaseline, resetObservations } from './drift-detector';
export type { BaselineSnapshot, DriftMetrics, DriftAlert, DriftReport } from './drift-detector';

export { recordProductionMiss, buildHardCaseReplaySuite, shouldTriggerRetraining, evaluatePromotion, recordPromotion, runWeeklyCycle, clearHardCases, getPromotionHistory, getRetrainingHistory } from './continuous-learning';
export type { ProductionMiss, FailureCategory, HardCaseReplaySuite, RetrainingTrigger, PromotionCandidate, PromotionRecord, WeeklyCycleReport } from './continuous-learning';
