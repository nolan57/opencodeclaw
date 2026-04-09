import { KnowledgeGraph, type KnowledgeNode } from "./knowledge-graph"
import { SemanticAnchor } from "./semantic-anchor"
import { ConstraintLoader } from "./constraint-loader"
import { Log } from "../util/log"
import { generateText } from "ai"
import { Provider } from "../provider/provider"

const log = Log.create({ service: "consistency-checker" })
const sevenDays = 7 * 24 * 60 * 60 * 1000

export interface ConsistencyIssue {
  id: string
  type: "conflict" | "outdated" | "orphan" | "redundant" | "constraint_violation"
  severity: "low" | "medium" | "high"
  description: string
  affected_nodes: string[]
  suggested_fix?: string
}

export interface ConsistencyReport {
  checked_at: number
  total_nodes: number
  total_edges: number
  issues: ConsistencyIssue[]
  summary: {
    conflicts: number
    outdated: number
    orphans: number
    redundant: number
    constraint_violations: number
  }
}

/**
 * Conflict resolution recommendation
 * [EVOLUTION]: LLM-based conflict analysis and resolution
 */
export interface ConflictResolution {
  issue_id: string
  resolution_type: "merge" | "keep_one" | "keep_newest" | "manual"
  recommendation: string
  confidence: number
  merged_content?: string
}

/**
 * Enhanced Consistency Checker with LLM-based conflict detection
 * [EVOLUTION]: Detects logical conflicts between knowledge entries
 */
export class ConsistencyChecker {
  private graph: KnowledgeGraph
  private semantic: SemanticAnchor
  private constraints: ConstraintLoader

  constructor() {
    this.graph = new KnowledgeGraph()
    this.semantic = new SemanticAnchor()
    this.constraints = new ConstraintLoader()
  }

  async runFullCheck(): Promise<ConsistencyReport> {
    log.info("consistency_check_started")

    const stats = await this.graph.getStats()
    const issues: ConsistencyIssue[] = []

    const conflictIssues = await this.checkForConflicts()
    issues.push(...conflictIssues)

    const outdatedIssues = await this.checkForOutdated()
    issues.push(...outdatedIssues)

    const orphanIssues = await this.checkForOrphans()
    issues.push(...orphanIssues)

    const redundantIssues = await this.checkForRedundant()
    issues.push(...redundantIssues)

    const constraintIssues = await this.checkConstraints()
    issues.push(...constraintIssues)

    const summary = {
      conflicts: issues.filter((i) => i.type === "conflict").length,
      outdated: issues.filter((i) => i.type === "outdated").length,
      orphans: issues.filter((i) => i.type === "orphan").length,
      redundant: issues.filter((i) => i.type === "redundant").length,
      constraint_violations: issues.filter((i) => i.type === "constraint_violation").length,
    }

    const report: ConsistencyReport = {
      checked_at: Date.now(),
      total_nodes: stats.nodes,
      total_edges: stats.edges,
      issues,
      summary,
    }

    log.info("consistency_check_completed", summary)

    return report
  }

  /**
   * Enhanced conflict detection using LLM
   * [EVOLUTION]: Semantic analysis to find logical contradictions
   */
  private async checkForConflicts(): Promise<ConsistencyIssue[]> {
    const issues: ConsistencyIssue[] = []
    const memories = await this.graph.findNodesByType("memory")

    // Group memories by type for efficient comparison
    const byType = new Map<string, KnowledgeNode[]>()
    for (const memory of memories) {
      const type = memory.type || "memory"
      if (!byType.has(type)) {
        byType.set(type, [])
      }
      byType.get(type)!.push(memory)
    }

    // Check for conflicts within each type
    for (const [type, typeMemories] of byType.entries()) {
      for (let i = 0; i < typeMemories.length; i++) {
        for (let j = i + 1; j < typeMemories.length; j++) {
          const a = typeMemories[i]
          const b = typeMemories[j]

          const conflictResult = await this.detectConflict(a, b)
          if (conflictResult.hasConflict) {
            issues.push({
              id: crypto.randomUUID(),
              type: "conflict",
              severity: conflictResult.severity,
              description: `Conflict between "${a.title}" and "${b.title}": ${conflictResult.reason}`,
              affected_nodes: [a.id, b.id],
              suggested_fix: conflictResult.resolution,
            })
          }
        }
      }
    }

    return issues
  }

  /**
   * Detect conflict between two nodes using LLM
   */
  private async detectConflict(
    a: KnowledgeNode,
    b: KnowledgeNode,
  ): Promise<{ hasConflict: boolean; severity: "low" | "medium" | "high"; reason: string; resolution?: string }> {
    try {
      const defaultModel = await Provider.defaultModel()
      const model = await Provider.getModel(defaultModel.providerID, defaultModel.modelID)
      const languageModel = await Provider.getLanguage(model)

      const prompt = `Analyze these two knowledge entries for logical conflicts.

Entry A: "${a.title}"
${a.content}

Entry B: "${b.title}"
${b.content}

Determine if there are any contradictions:
- Do they make opposite claims about the same topic?
- Do they recommend incompatible approaches?
- Does one invalidate the other?

Output JSON:
{
  "hasConflict": boolean,
  "severity": "low|medium|high",
  "reason": "explanation",
  "resolution": "suggested fix"
}`

      const result = await generateText({
        model: languageModel,
        prompt: prompt,
      })

      const text = result.text.trim()
      const jsonMatch = text.match(/\{[\s\S]*\}/)

      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
    } catch (error) {
      log.warn("conflict_detection_failed", { error: String(error) })
    }

    // Fallback: simple text similarity check
    const similarity = this.textSimilarity(a.content || "", b.content || "")
    if (similarity > 0.85) {
      return {
        hasConflict: false,
        severity: "low",
        reason: "High similarity but no clear conflict",
      }
    }

    return { hasConflict: false, severity: "low", reason: "No conflict detected" }
  }

  private async checkForOutdated(): Promise<ConsistencyIssue[]> {
    const issues: ConsistencyIssue[] = []
    const allNodes = [...(await this.graph.findNodesByType("memory")), ...(await this.graph.findNodesByType("agenda"))]

    const now = Date.now()
    const thirtyDays = 30 * 24 * 60 * 60 * 1000

    for (const node of allNodes) {
      const lastUpdated = Number(node.metadata?.last_changed || node.metadata?.loaded_at || 0)

      if (now - lastUpdated > thirtyDays) {
        issues.push({
          id: crypto.randomUUID(),
          type: "outdated",
          severity: "low",
          description: `"${node.title}" has not been updated in over 30 days`,
          affected_nodes: [node.id],
          suggested_fix: "Review and update or archive this entry",
        })
      }

      if (node.metadata?.outdated) {
        const outdatedDuration = now - Number(node.metadata.outdated_since || 0)
        if (outdatedDuration > sevenDays) {
          issues.push({
            id: crypto.randomUUID(),
            type: "outdated",
            severity: "high",
            description: `"${node.title}" marked as outdated for over 7 days`,
            affected_nodes: [node.id],
            suggested_fix: "Either update or remove the outdated marker",
          })
        }
      }
    }

    return issues
  }

  private async checkForOrphans(): Promise<ConsistencyIssue[]> {
    const issues: ConsistencyIssue[] = []
    const memories = await this.graph.findNodesByType("memory")

    for (const memory of memories) {
      const related = await this.graph.getRelatedNodes(memory.id)

      if (related.length === 0) {
        issues.push({
          id: crypto.randomUUID(),
          type: "orphan",
          severity: "low",
          description: `"${memory.title}" has no connections to other nodes`,
          affected_nodes: [memory.id],
          suggested_fix: "Consider connecting to related memories or removing",
        })
      }
    }

    return issues
  }

  private async checkForRedundant(): Promise<ConsistencyIssue[]> {
    const issues: ConsistencyIssue[] = []
    const memories = await this.graph.findNodesByType("memory")
    const checked = new Set<string>()

    for (const memory of memories) {
      if (checked.has(memory.id)) continue

      const similar = await this.semantic.findSimilar(memory.content || memory.title, ["memory"], 3)

      for (const s of similar) {
        if (s.node.id === memory.id) continue
        if (checked.has(s.node.id)) continue

        if (s.score > 0.85) {
          issues.push({
            id: crypto.randomUUID(),
            type: "redundant",
            severity: "medium",
            description: `"${memory.title}" and "${s.node.title}" are ${Math.round(s.score * 100)}% similar`,
            affected_nodes: [memory.id, s.node.id],
            suggested_fix: "Consider merging or consolidating these entries",
          })

          checked.add(s.node.id)
        }
      }

      checked.add(memory.id)
    }

    return issues
  }

  async checkConstraints(): Promise<ConsistencyIssue[]> {
    const issues: ConsistencyIssue[] = []
    const files = await this.graph.findNodesByType("file")

    for (const file of files) {
      const validation = await this.constraints.validateAgainstConstraints(file.content || "", file.entity_id)

      if (!validation.valid) {
        for (const violation of validation.violations) {
          issues.push({
            id: crypto.randomUUID(),
            type: "constraint_violation",
            severity: "high",
            description: `Constraint violation in ${file.title}: ${violation}`,
            affected_nodes: [file.id],
            suggested_fix: "Fix the constraint violation",
          })
        }
      }
    }

    return issues
  }

  /**
   * Resolve a conflict automatically
   * [EVOLUTION]: LLM-based conflict resolution
   */
  async resolveConflict(issue: ConsistencyIssue): Promise<ConflictResolution | null> {
    if (issue.type !== "conflict") return null

    try {
      const nodes = await Promise.all(issue.affected_nodes.map((id) => this.graph.getNode(id)))
      if (nodes.some((n) => !n)) return null

      const validNodes = nodes.filter((n): n is KnowledgeNode => n !== null)
      const [a, b] = validNodes

      const defaultModel = await Provider.defaultModel()
      const model = await Provider.getModel(defaultModel.providerID, defaultModel.modelID)
      const languageModel = await Provider.getLanguage(model)

      const prompt = `Resolve this knowledge conflict.

Entry A: "${a?.title}"
${a?.content}

Entry B: "${b?.title}"
${b?.content}

Conflict: ${issue.description}

Recommend how to resolve:
- Merge both into one coherent entry
- Keep the newer one
- Keep the more accurate one
- Flag for manual review

Output JSON:
{
  "resolution_type": "merge|keep_one|keep_newest|manual",
  "recommendation": "detailed explanation",
  "confidence": 0-1,
  "merged_content": "optional merged content"
}`

      const result = await generateText({
        model: languageModel,
        prompt: prompt,
      })

      const text = result.text.trim()
      const jsonMatch = text.match(/\{[\s\S]*\}/)

      if (jsonMatch) {
        const resolution = JSON.parse(jsonMatch[0])
        return {
          issue_id: issue.id,
          ...resolution,
        }
      }
    } catch (error) {
      log.warn("conflict_resolution_failed", { error: String(error) })
    }

    return null
  }

  async autoFix(issue: ConsistencyIssue): Promise<boolean> {
    log.info("attempting_auto_fix", { issue_type: issue.type, id: issue.id })

    switch (issue.type) {
      case "outdated":
        if (issue.affected_nodes.length === 1) {
          await this.graph.updateNode(issue.affected_nodes[0], {
            metadata: {
              ...(await this.graph.getNode(issue.affected_nodes[0]))?.metadata,
              outdated: false,
              outdated_since: null,
            },
          })
          return true
        }
        return false

      case "redundant":
        if (issue.affected_nodes.length === 2) {
          await this.graph.addEdge({
            source_id: issue.affected_nodes[0],
            target_id: issue.affected_nodes[1],
            relation: "related_to",
            weight: 2,
          })
          return true
        }
        return false

      default:
        return false
    }
  }

  private textSimilarity(a: string, b: string): number {
    const setA = new Set(
      a
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 2),
    )
    const setB = new Set(
      b
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 2),
    )

    if (setA.size === 0 && setB.size === 0) return 0

    const intersection = new Set([...setA].filter((x) => setB.has(x)))
    const union = new Set([...setA, ...setB])

    return intersection.size / union.size
  }
}
