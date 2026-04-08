import { Log } from "../util/log"

const log = Log.create({ service: "novel-types" })

// ============================================================================
// Default Constants (can be extended via configuration)
// ============================================================================

/**
 * Default standardized tags for trauma classification
 * Based on psychological research and interactive fiction best practices
 */
export const DEFAULT_TRAUMA_TAGS = {
  // Visual trauma
  VISUAL: "PTSD_Visual",
  NIGHTMARE: "PTSD_Nightmare",
  FLASHBACK: "PTSD_Flashback",

  // Physical trauma
  PAIN: "Physical_Pain",
  INJURY: "Physical_Injury",
  NEURAL: "Neural_Damage",

  // Psychological trauma
  PSYCHOLOGICAL_FEAR: "Psychological_Fear",
  PSYCHOLOGICAL_BETRAYAL: "Psychological_Betrayal",
  PSYCHOLOGICAL_GUILT: "Psychological_Guilt",
  PSYCHOLOGICAL_LOSS: "Psychological_Loss",

  // Social trauma
  HUMILIATION: "Social_Humiliation",
  ISOLATION: "Social_Isolation",
  PERSECUTION: "Social_Persecution",

  // Physical aliases
  PHYSICAL_PAIN: "Physical_Pain",
  PHYSICAL_INJURY: "Physical_Injury",
} as const

/**
 * Default standardized skill categories
 */
export const DEFAULT_SKILL_CATEGORIES = {
  // Mental skills
  ANALYSIS: "Mental_Analysis",
  DEDUCTION: "Mental_Deduction",
  INTUITION: "Mental_Intuition",
  MEMORY: "Mental_Memory",

  // Social skills
  INTERROGATION: "Social_Interrogation",
  DECEPTION: "Social_Deception",
  PERSUASION: "Social_Persuasion",
  EMPATHY: "Social_Empathy",

  // Technical skills
  HACKING: "Technical_Hacking",
  ENCRYPTION: "Technical_Encryption",
  SURVEILLANCE: "Technical_Surveillance",

  // Combat skills
  COMBAT: "Combat_Physical",
  STEALTH: "Combat_Stealth",
  ESCAPE: "Combat_Escape",

  // Resistance skills
  INTERROGATION_RESIST: "Resistance_Interrogation",
  PAIN_TOLERANCE: "Resistance_Pain",
  FEAR_RESIST: "Resistance_Fear",
} as const

/**
 * Default character status constants
 */
export const DEFAULT_CHARACTER_STATUS = {
  ACTIVE: "active",
  INJURED: "injured",
  STRESSED: "stressed",
  UNCONSCIOUS: "unconscious",
  CAPTURED: "captured",
  MISSING: "missing",
  DECEASED: "deceased",
  CONSCIOUSNESS_LOST: "consciousness_lost",
  AI_SIMULATED: "ai_simulated",
} as const

/**
 * Relationship attachment styles
 * Based on attachment theory research
 */
export const ATTACHMENT_STYLES = {
  SECURE: "secure",
  ANXIOUS: "anxious",
  AVOIDANT: "avoidant",
  DISORGANIZED: "disorganized",
} as const

/**
 * Emotion types based on OCC model
 */
export const EMOTION_TYPES = {
  // Positive emotions
  JOY: "joy",
  HOPE: "hope",
  PRIDE: "pride",
  GRATITUDE: "gratitude",
  LOVE: "love",

  // Negative emotions
  ANGER: "anger",
  FEAR: "fear",
  SADNESS: "sadness",
  GUILT: "guilt",
  SHAME: "shame",
  ENVY: "envy",
  HATE: "hate",

  // Surprise emotions
  SURPRISE: "surprise",
  CONFUSION: "confusion",
} as const

/**
 * Goal types
 */
export const GOAL_TYPES = {
  SURVIVAL: "survival",
  INVESTIGATION: "investigation",
  REVENGE: "revenge",
  PROTECTION: "protection",
  ESCAPE: "escape",
  DISCOVERY: "discovery",
  REDEMPTION: "redemption",
  POWER: "power",
  LOVE: "love",
  JUSTICE: "justice",
} as const

/**
 * Memory salience levels
 */
export const SALIENCE_LEVELS = {
  CRITICAL: 1.0, // Defining moment, never forgotten
  HIGH: 0.8, // Major event, long-term memory
  MEDIUM: 0.5, // Notable event, may fade
  LOW: 0.3, // Minor event, likely to fade
  TRIVIAL: 0.1, // Background detail, quickly forgotten
} as const

// ============================================================================
// Backward Compatibility Aliases (use DEFAULT_* internally)
// ============================================================================

/**
 * @deprecated Use getTraumaTags() for configurable values, or DEFAULT_TRAUMA_TAGS for defaults
 */
export const TRAUMA_TAGS = DEFAULT_TRAUMA_TAGS

/**
 * @deprecated Use getSkillCategories() for configurable values, or DEFAULT_SKILL_CATEGORIES for defaults
 */
export const SKILL_CATEGORIES = DEFAULT_SKILL_CATEGORIES

/**
 * @deprecated Use getCharacterStatus() for configurable values, or DEFAULT_CHARACTER_STATUS for defaults
 */
export const CHARACTER_STATUS = DEFAULT_CHARACTER_STATUS

// ============================================================================
// Configurable Type Getters
// ============================================================================

/**
 * Runtime configuration for custom types
 */
interface CustomTypeConfig {
  customTraumaTags?: Record<string, string>
  customSkillCategories?: Record<string, string>
  customGoalTypes?: Record<string, string>
  customEmotionTypes?: Record<string, string>
  customCharacterStatus?: Record<string, string>
}

let runtimeConfig: CustomTypeConfig = {}

/**
 * Initialize custom types from configuration
 */
export function initializeCustomTypes(config: CustomTypeConfig): void {
  runtimeConfig = config
  log.info("custom_types_initialized", {
    traumaTags: Object.keys(config.customTraumaTags || {}).length,
    skillCategories: Object.keys(config.customSkillCategories || {}).length,
    goalTypes: Object.keys(config.customGoalTypes || {}).length,
    emotionTypes: Object.keys(config.customEmotionTypes || {}).length,
    characterStatus: Object.keys(config.customCharacterStatus || {}).length,
  })
}

/**
 * Get merged trauma tags (default + custom)
 */
export function getTraumaTags(): Record<string, string> {
  return {
    ...DEFAULT_TRAUMA_TAGS,
    ...runtimeConfig.customTraumaTags,
  }
}

/**
 * Get merged skill categories (default + custom)
 */
export function getSkillCategories(): Record<string, string> {
  return {
    ...DEFAULT_SKILL_CATEGORIES,
    ...runtimeConfig.customSkillCategories,
  }
}

/**
 * Get merged goal types (default + custom)
 */
export function getGoalTypes(): Record<string, string> {
  const defaults: Record<string, string> = {
    SURVIVAL: "survival",
    INVESTIGATION: "investigation",
    REVENGE: "revenge",
    PROTECTION: "protection",
    ESCAPE: "escape",
    DISCOVERY: "discovery",
    REDEMPTION: "redemption",
    POWER: "power",
    LOVE: "love",
    JUSTICE: "justice",
  }
  return {
    ...defaults,
    ...runtimeConfig.customGoalTypes,
  }
}

/**
 * Get merged emotion types (default + custom)
 */
export function getEmotionTypes(): Record<string, string> {
  const defaults: Record<string, string> = {
    JOY: "joy",
    HOPE: "hope",
    PRIDE: "pride",
    GRATITUDE: "gratitude",
    LOVE: "love",
    ANGER: "anger",
    FEAR: "fear",
    SADNESS: "sadness",
    GUILT: "guilt",
    SHAME: "shame",
    ENVY: "envy",
    HATE: "hate",
    SURPRISE: "surprise",
    CONFUSION: "confusion",
  }
  return {
    ...defaults,
    ...runtimeConfig.customEmotionTypes,
  }
}

/**
 * Get merged character status (default + custom)
 */
export function getCharacterStatus(): Record<string, string> {
  return {
    ...DEFAULT_CHARACTER_STATUS,
    ...runtimeConfig.customCharacterStatus,
  }
}

// ============================================================================
// Visual Types
// ============================================================================

export type CameraShot =
  | "extreme-close-up"
  | "close-up"
  | "medium-close-up"
  | "medium"
  | "medium-wide"
  | "wide"
  | "extreme-wide"
  | "insert"
  | "over-shoulder"
  | "point-of-view"
export type CameraAngle = "eye-level" | "high" | "low" | "dutch" | "birds-eye" | "worms-eye" | "overhead"
export type CameraMovement =
  | "static"
  | "pan"
  | "tilt"
  | "dolly"
  | "track"
  | "crane"
  | "handheld"
  | "steadicam"
  | "zoom"
  | "rack-focus"

export interface CameraSpec {
  shot: CameraShot
  angle: CameraAngle
  movement: CameraMovement
  depthOfField?: "shallow" | "deep" | "none"
}

export interface ControlNetSignals {
  poseReference: string | null
  depthReference: string | null
  characterRefUrl: string | null
  scribbleReference?: string | null
  normalMapReference?: string | null
}

export interface VisualPanelSpec {
  id: string
  panelIndex: number
  camera: CameraSpec
  lighting: string
  composition: string
  visualPrompt: string
  negativePrompt: string
  controlNetSignals: ControlNetSignals
  styleModifiers: string[]
  colorPalette?: string[]
  atmosphericEffects?: string[]
  notes?: string
  /** Version of the prompt generation algorithm (e.g., "v2" for prioritized prompts) */
  promptVersion?: string
  /** Hash strategy used for character references (e.g., "deterministic") */
  hashStrategy?: string

  // ============================================================================
  // CONTINUITY METADATA (for maintaining character consistency across panels)
  // ============================================================================
  /** Character information for continuity tracking */
  character?: {
    name: string
    emotionalState?: string
    outfitDetails?: string
    injuryDetails?: string
  }

  /** Beat/context information for continuity tracking */
  beat?: {
    location?: string
    timeOfDay?: string
    description?: string
  }

  /** Continuity metadata from LLM analysis */
  continuity?: {
    /** Continuity analysis result */
    analysis: {
      timeContext: {
        isContinuousWithPrevious: boolean
        timePassed: string
        sleepOccurred: boolean
        explicitTimeMarkers: string[]
      }
      locationContext: {
        isSameLocation: boolean
        locationDescription: string
        locationType: string
        explicitLocationMarkers: string[]
      }
      narrativeContext: {
        outfitChangeMentioned: boolean
        outfitChangeDescription: string | null
        significantEvents: string[]
        characterState: string
      }
      llmJudgement: {
        shouldMaintainOutfit: boolean
        confidence: number
        reasoning: string
        outfitDescription: string
      }
    }
    /** Instruction for prompt engineering */
    instruction: string
  }
}

export interface EnrichedBeat {
  originalText: string
  visualSpec: VisualPanelSpec | null
  charactersOnScreen: string[]
  sceneDescription: string
}

// ============================================================================
// Learning Bridge Types
// ============================================================================

export interface LearningBridgeConfig {
  enabled: boolean
  vector: {
    enabled: boolean
    fallbackToLocal: boolean
    modelId?: string
  }
  knowledge: {
    enabled: boolean
    syncNodes: boolean
    syncEdges: boolean
    linkToCode: boolean
  }
  memory: {
    enabled: boolean
    qualityFilter: boolean
    minQualityScore: number
    deduplication: boolean
  }
  improvement: {
    enabled: boolean
    autoSuggest: boolean
    requireReview: boolean
  }
}

export const DEFAULT_LEARNING_BRIDGE_CONFIG: LearningBridgeConfig = {
  enabled: true,
  vector: {
    enabled: true,
    fallbackToLocal: true,
  },
  knowledge: {
    enabled: true,
    syncNodes: false,
    syncEdges: false,
    linkToCode: false,
  },
  memory: {
    enabled: true,
    qualityFilter: false,
    minQualityScore: 0.5,
    deduplication: false,
  },
  improvement: {
    enabled: false,
    autoSuggest: false,
    requireReview: true,
  },
}

// ============================================================================
// LLM-based Visual Prompt Engineering Types
// ============================================================================

/**
 * Context provided to the visual prompt engineer for generating optimized prompts.
 */
export interface VisualGenerationContext {
  /** The current story beat being visualized */
  beat: {
    description: string
    action?: string
    emotion?: string
    location?: string
    timeOfDay?: string
    tone?: string
  }
  /** Character state for the current scene */
  character: {
    name: string
    emotionalState?: string
    currentAction?: string
    outfitDetails?: string
    injuryDetails?: string
    visualDescription?: string
  }
  /** Camera specification for the shot */
  camera: CameraSpec
  /** Global style (e.g., "Cyberpunk Noir", "Watercolor") */
  globalStyle: string
  /** Previous panels for maintaining continuity */
  previousPanels: VisualPanelSpec[]
}

/**
 * Result from LLM prompt engineering.
 */
export interface LLMPromptEngineeringResult {
  /** The refined visual prompt optimized for image generation */
  refinedVisualPrompt: string
  /** Negative prompts specific to the scene */
  refinedNegativePrompt: string
  /** LLM's artistic reasoning for debugging */
  artisticNotes?: string
  /** Confidence score (0-1). Low scores trigger fallback to hardcoded. */
  confidenceScore: number
  /** Detected action type (e.g., "fight", "conversation", "chase") */
  detectedAction?: string
  /** How the prompt was generated */
  generationMethod?: "hardcoded" | "llm" | "hybrid"
}

/**
 * Metadata for tracking generation method.
 */
export interface VisualGenerationMetadata {
  /** How the prompt was generated: "hardcoded" | "llm" | "hybrid" */
  generationMethod: "hardcoded" | "llm" | "hybrid"
  /** LLM's notes if available */
  notes?: string
  /** Timestamp of generation */
  timestamp: number
}

// ============================================================================
// Dimension Coordination Types (Progressive Refactoring)
// ============================================================================

export interface DimensionData {
  version: number
  lastUpdated: number
}

export interface DimensionUpdate {
  changes: Record<string, unknown>
  confidence: number
}

export interface DimensionConflict {
  dimensionA: string
  dimensionB: string
  type: "contradiction" | "resource_competition" | "priority_clash"
  description: string
  severity: "low" | "medium" | "high" | "critical"
}

export interface DimensionControllerConfig {
  enabled?: boolean
  priority?: number
}

export const DEFAULT_DIMENSION_CONFIG: DimensionControllerConfig = {
  enabled: true,
  priority: 50,
}

export interface CrossDimensionRule {
  name: string
  dimensions: [string, string]
  trigger: (data: DimensionDataMap) => boolean
  action: (data: DimensionDataMap) => Promise<void> | void
  priority: number
}

export type DimensionDataMap = Map<string, DimensionData>

log.info("novel_types_loaded", {
  traumaTags: Object.keys(DEFAULT_TRAUMA_TAGS).length,
  skillCategories: Object.keys(DEFAULT_SKILL_CATEGORIES).length,
  emotionTypes: Object.keys(EMOTION_TYPES).length,
})
