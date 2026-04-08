// ============================================================================
// Core Pipeline — Primary public API for orchestrating novel generation
// ============================================================================
export { EvolutionOrchestrator, loadDynamicPatterns } from "./orchestrator"

// ============================================================================
// Story Generation Subsystems — Actively wired into orchestrator
// ============================================================================
export { EnhancedPatternMiner, enhancedPatternMiner } from "./pattern-miner-enhanced"
export { StateExtractor, stateExtractor } from "./state-extractor"
export { EvolutionRulesEngine, evolutionRules } from "./evolution-rules"
export {
  CharacterDeepener,
  characterDeepener,
  type CharacterStateInput,
  type DeepenedCharacterProfile,
} from "./character-deepener"
export {
  RelationshipAnalyzer,
  relationshipAnalyzer,
  type RelationshipState,
  type DeepenedRelationship,
  type RelationshipAnalysisResult,
} from "./relationship-analyzer"

// ============================================================================
// Multi-Branch Story Management — Active: orchestrator uses BranchManager + BranchStorage
// ============================================================================
export {
  BranchManager,
  branchManager,
  type Branch,
  type BranchPruningConfig,
  type BranchMergeResult,
} from "./branch-manager"
export { BranchStorage, branchStorage, type BranchRecord, type BranchStorageConfig } from "./branch-storage"

// ============================================================================
// Relationship & Faction Analysis — Active: orchestrator uses these services
// ============================================================================
export {
  RelationshipViewService,
  AsyncGroupManagementService,
  type TriadPattern,
  type GraphReader,
  type IRelationshipViewService,
  type IAsyncGroupManagementService,
  type GroupDynamicsResult,
  type MultiWayRelationship,
} from "./multiway-relationships"
export {
  RelationshipInertiaManager,
  relationshipInertiaManager,
  type RelationshipInertia,
  type PlotHook,
  type InertiaConfig,
} from "./relationship-inertia"

// ============================================================================
// Character & Story Lifecycle — Active: orchestrator calls these each chapter
// ============================================================================
export {
  CharacterLifecycleManager,
  characterLifecycleManager,
  type CharacterLifecycle,
  type CharacterLifeStage,
  type CharacterStatus,
  type LifeEvent,
  type LifecycleConfig,
} from "./character-lifecycle"
export {
  EndGameDetector,
  endGameDetector,
  type CompletionCriterion,
  type EndGameReport,
  type StoryMetricsType,
} from "./end-game-detection"
export {
  MotifTracker,
  motifTracker,
  type MotifEvolution,
  type MotifCharacterCorrelation,
  type MotifVariation,
} from "./motif-tracker"
export {
  MultiThreadNarrativeExecutor,
  multiThreadNarrativeExecutor,
  type NarrativeThread,
  type ThreadSynchronization,
  type MultiThreadConfig,
  type LLMClient,
  type ReconciliationPlan,
  type SemanticConflict,
} from "./multi-thread-narrative"

// ============================================================================
// Knowledge Graph & Memory — Active: orchestrator initializes and queries these
// ============================================================================
export {
  StoryKnowledgeGraph,
  storyKnowledgeGraph,
  type GraphNode,
  type GraphEdge,
  type NodeType,
  type EdgeType,
  type KnowledgeGraphConfig,
} from "./story-knowledge-graph"
export {
  StoryWorldMemory,
  storyWorldMemory,
  type MemoryEntry,
  type MemoryLevel,
  type HierarchicalMemoryConfig,
} from "./story-world-memory"

// ============================================================================
// Epic Narrative Modules — World consistency & long-term saga planning
// ============================================================================
export {
  WorldBibleKeeper,
  worldBibleKeeper,
  type WorldBibleData,
  type WorldEntity,
  type WorldBibleEntry,
  type WorldConsistencyResult,
} from "./world-bible-keeper"
export {
  MultiArcArchitect,
  multiArcArchitect,
  type SagaPlan,
  type SagaVolume,
  type SagaAct,
  type ChapterPlan,
  type ChekhovsGun,
} from "./multi-arc-architect"

// ============================================================================
// Observability — Active: wired into orchestrator's runNovelCycle
// ============================================================================
export {
  novelObservability,
  NovelObservability,
  type NovelMetrics,
  type NovelHealthReport,
  type TraceEvent,
} from "./observability"

// ============================================================================
// Configuration & CLI — Active
// ============================================================================
export { NovelConfig } from "../config/novel-config"
export { handleSlashCommand, resolveSafePath } from "./command-parser"

// ============================================================================
// LLM Wrapper — Core LLM calling utilities
// ============================================================================
export {
  callLLM,
  callLLMJson,
  type LLMCallOptions,
  type LLMCallResult,
  type LLMJsonCallOptions,
  type LLMJsonCallResult,
} from "./llm-wrapper"

// ============================================================================
// Model Acquisition — Active: used by evolution/skill, learning modules
// ============================================================================
export { getNovelModel, getNovelLanguageModel } from "./model"

// ============================================================================
// Procedural World — Active: orchestrator initializes at story start
// ============================================================================
export {
  ProceduralWorldGenerator,
  type Region,
  type RegionType,
  type WorldGenerationConfig,
  type EcoEntity,
  type EcologicalProfile,
  EcoEntitySchema,
  EcologicalProfileSchema,
} from "./procedural-world"

// ============================================================================
// Dimension Coordination (Progressive Refactoring)
// ============================================================================
export {
  DimensionCoordinator,
  dimensionCoordinator,
  type DimensionMetrics,
  DEFAULT_DIMENSION_METRICS,
} from "./dimension-coordinator"

// ============================================================================
// ⚠️ Internal Utilities — Kept for convenience but primarily test/internal use.
//   Safe to use, but not recommended as primary integration points.
// ============================================================================
export { memoize, debounce, throttle, batch, lazy, rateLimit } from "./performance"

// ============================================================================
// Type Definitions
// ============================================================================
export * from "./types"
