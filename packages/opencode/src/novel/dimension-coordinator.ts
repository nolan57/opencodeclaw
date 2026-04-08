import { Log } from "../util/log"
import { callLLM, callLLMJson } from "./llm-wrapper"

interface DimensionData {
  version: number
  lastUpdated: number
}

interface DimensionConflict {
  dimensionA: string
  dimensionB: string
  type: "contradiction" | "resource_competition" | "priority_clash"
  description: string
  severity: "low" | "medium" | "high" | "critical"
}

interface CrossDimensionRule {
  name: string
  dimensions: [string, string]
  trigger: (data: Map<string, DimensionData>) => boolean
  action: (data: Map<string, DimensionData>) => Promise<void> | void
  priority: number
}

type DimensionDataMap = Map<string, DimensionData>

const log = Log.create({ service: "dimension-coordinator" })

export interface DimensionMetrics {
  narrativeConsistency: number
  psychologicalConsistency: number
  worldConsistency: number
  themeEvolution: number
  foreshadowingPayoff: number
  pacingTension: number
  relationshipNetwork: number
  worldRulesConsistency: number
  narrativePerspective: number
  literaryStyle: number
  readerExperience: number
}

export const DEFAULT_DIMENSION_METRICS: DimensionMetrics = {
  narrativeConsistency: 0.8,
  psychologicalConsistency: 0.8,
  worldConsistency: 0.8,
  themeEvolution: 0.5,
  foreshadowingPayoff: 0.5,
  pacingTension: 0.5,
  relationshipNetwork: 0.5,
  worldRulesConsistency: 0.8,
  narrativePerspective: 0.8,
  literaryStyle: 0.5,
  readerExperience: 0.5,
}

export class DimensionCoordinator {
  private rules: CrossDimensionRule[] = []
  private metrics: DimensionMetrics = { ...DEFAULT_DIMENSION_METRICS }
  private history: Array<{ chapter: number; conflicts: DimensionConflict[] }> = []
  private maxHistory = 50

  constructor(rules: CrossDimensionRule[] = []) {
    this.registerRules(rules)
    log.info("dimension_coordinator_initialized", { ruleCount: rules.length })
  }

  registerRules(rules: CrossDimensionRule[]): void {
    this.rules.push(...rules)
    this.rules.sort((a, b) => b.priority - a.priority)
    log.info("rules_registered", { count: rules.length, total: this.rules.length })
  }

  async evaluateRules(data: DimensionDataMap): Promise<void> {
    for (const rule of this.rules) {
      try {
        if (rule.trigger(data)) {
          await rule.action(data)
          log.debug("rule_triggered", { name: rule.name, dimensions: rule.dimensions })
        }
      } catch (error) {
        log.warn("rule_evaluation_failed", { name: rule.name, error: String(error) })
      }
    }
  }

  detectConflicts(data: DimensionDataMap): DimensionConflict[] {
    const conflicts: DimensionConflict[] = []

    const n = data.get("narrative")?.version || 1
    const p = data.get("psychological")?.version || 1
    const w = data.get("world")?.version || 1

    if (Math.abs(n - p) > 2) {
      conflicts.push({
        dimensionA: "narrative",
        dimensionB: "psychological",
        type: "priority_clash",
        description: "Narrative and psychological versions diverged significantly",
        severity: "medium",
      })
    }

    if (Math.abs(n - w) > 2) {
      conflicts.push({
        dimensionA: "narrative",
        dimensionB: "world",
        type: "priority_clash",
        description: "Narrative and world versions diverged significantly",
        severity: "medium",
      })
    }

    if (conflicts.length > 0) {
      this.history.push({ chapter: Date.now(), conflicts })
      if (this.history.length > this.maxHistory) {
        this.history.shift()
      }
      log.info("conflicts_detected", { count: conflicts.length, totalHistory: this.history.length })
    }

    return conflicts
  }

  updateMetrics(chapter: number, storySegment: string, state: Record<string, unknown>): void {
    const stateChars = state as Record<string, { stress?: number; status?: string }>
    const stress = Object.values(stateChars).reduce((acc: number, c) => {
      return acc + (c?.stress || 0)
    }, 0)
    const stressLevel = stress / Math.max(1, Object.keys(stateChars).length)
    this.metrics.psychologicalConsistency = Math.max(0, Math.min(1, 1 - stressLevel / 100))

    this.metrics.pacingTension = storySegment.includes("!") ? 0.7 : storySegment.includes("?") ? 0.5 : 0.4
  }

  getMetrics(): DimensionMetrics {
    return { ...this.metrics }
  }

  getHistory(): Array<{ chapter: number; conflicts: DimensionConflict[] }> {
    return [...this.history]
  }

  getRules(): CrossDimensionRule[] {
    return [...this.rules]
  }
}

export const dimensionCoordinator = new DimensionCoordinator([
  {
    name: "foreshadowing_pacing_coordination",
    dimensions: ["foreshadowing", "pacing"],
    trigger: (data) => {
      const f = data.get("foreshadowing")
      const p = data.get("pacing")
      return !!f && !!p && f.lastUpdated - p.lastUpdated > 10000
    },
    action: async (data) => {
      log.debug("rule_executed_foreshadowing_pacing")
    },
    priority: 8,
  },
  {
    name: "theme_style_coordination",
    dimensions: ["theme", "literary_style"],
    trigger: (data) => {
      const t = data.get("theme")
      const s = data.get("literary_style")
      return !!t && !!s && Math.abs(t.lastUpdated - s.lastUpdated) < 5000
    },
    action: async (data) => {
      log.debug("rule_executed_theme_style")
    },
    priority: 7,
  },
  {
    name: "relationship_psychological_coordination",
    dimensions: ["relationship", "psychological"],
    trigger: (data) => {
      const r = data.get("relationship")
      const p = data.get("psychological")
      return !!r && !!p
    },
    action: async (data) => {
      log.debug("rule_executed_relationship_psychological")
    },
    priority: 9,
  },
  {
    name: "world_rules_narrative_coordination",
    dimensions: ["world_rules", "narrative"],
    trigger: (data) => {
      const w = data.get("world_rules")
      const n = data.get("narrative")
      return !!w && !!n
    },
    action: async (data) => {
      log.debug("rule_executed_world_rules_narrative")
    },
    priority: 10,
  },
  {
    name: "reader_experience_coordination",
    dimensions: ["reader_experience", "pacing"],
    trigger: (data) => {
      const r = data.get("reader_experience")
      return !!r
    },
    action: async (data) => {
      log.debug("rule_executed_reader_experience")
    },
    priority: 6,
  },
])

log.info("dimension_coordinator_loaded")
