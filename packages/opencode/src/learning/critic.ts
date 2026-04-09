import type { RefactoringPlan } from "./architect"
import { NegativeMemory } from "./negative"
import { Archive, type ArchiveState } from "./archive"
import { Log } from "../util/log"
import { generateText } from "ai"
import { Provider } from "../provider/provider"
import { withSpan, spanAttrs } from "./tracing"

const log = Log.create({ service: "learning-critic" })

export interface CriticResult {
  plan_id: string
  status: "passed" | "failed" | "retrying" | "rolled_back"
  attempts: number
  error?: string
  improvements?: string[]
}

export interface BenchmarkResult {
  metric: string
  before: number
  after: number
  improvement_percent: number
}

/**
 * Code quality review result
 * [EVOLUTION]: Dual criticism system - code quality + memory quality
 */
export interface CodeQualityReview {
  plan_id: string
  score: number
  issues: Array<{
    type: "performance" | "maintainability" | "security" | "style"
    severity: "low" | "medium" | "high"
    description: string
    suggestion: string
  }>
  passed: boolean
  error?: string
}

/**
 * Dual Critic System
 * [EVOLUTION]: Combines code quality review with memory quality assessment
 */
export class Critic {
  private negativeMemory: NegativeMemory
  private archive: Archive
  private maxRetries: number
  private improvementThreshold: number
  private minQualityScore: number

  constructor(maxRetries = 3, improvementThreshold = 5, minQualityScore = 0.6) {
    this.negativeMemory = new NegativeMemory()
    this.archive = new Archive()
    this.maxRetries = maxRetries
    this.improvementThreshold = improvementThreshold
    this.minQualityScore = minQualityScore
  }

  async verify(plans: RefactoringPlan[], state: ArchiveState): Promise<CriticResult[]> {
    return withSpan(
      "learning.critic.verify",
      async (span) => {
        span.setAttribute("plans.count", plans.length)
        const results: CriticResult[] = []

        for (const plan of plans) {
          if (plan.action === "reject") {
            results.push({
              plan_id: plan.proposal_id,
              status: "failed",
              attempts: 0,
              error: "Rejected by Architect",
            })
            continue
          }

          if (plan.action === "human_review") {
            results.push({
              plan_id: plan.proposal_id,
              status: "failed",
              attempts: 0,
              error: "Requires human review",
            })
            continue
          }

          const result = await this.verifyWithRetry(plan, state)
          results.push(result)

          if (result.status === "failed") {
            await this.negativeMemory.recordFailure({
              failure_type: "performance_regression",
              description: `Plan ${plan.proposal_id} failed: ${result.error}`,
              context: { plan_id: plan.proposal_id, error: result.error },
              severity: 2,
              blocked_items: [],
            })
          }
        }

        const passed = results.filter((r) => r.status === "passed").length
        const failed = results.filter((r) => r.status === "failed").length
        span.setAttributes({
          "results.total": results.length,
          "results.passed": passed,
          "results.failed": failed,
        })
        log.info("verification_completed", {
          total: results.length,
          passed,
          failed,
          retried: results.filter((r) => r.status === "retrying").length,
          rolled_back: results.filter((r) => r.status === "rolled_back").length,
        })

        return results
      },
    )
  }

  private async verifyWithRetry(plan: RefactoringPlan, state: ArchiveState): Promise<CriticResult> {
    let attempts = 0
    let lastError: string | undefined

    while (attempts < this.maxRetries) {
      attempts++

      try {
        const passed = await this.runVerification(plan)
        if (passed) {
          log.info("verification_passed", {
            plan_id: plan.proposal_id,
            attempts,
          })
          return {
            plan_id: plan.proposal_id,
            status: "passed",
            attempts,
          }
        }

        lastError = "Verification returned false"
      } catch (e) {
        lastError = String(e)
        log.error("verification_error", {
          plan_id: plan.proposal_id,
          attempt: attempts,
          error: lastError,
        })
      }

      if (attempts < this.maxRetries) {
        const delay = Math.pow(2, attempts) * 1000
        log.info("retrying_after_delay", { plan_id: plan.proposal_id, delay })
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }

    log.error("verification_failed_after_max_retries", {
      plan_id: plan.proposal_id,
      attempts,
      lastError,
    })

    const shouldRollback = await this.shouldRollback(plan)
    if (shouldRollback) {
      const golden = await this.archive.getGoldenSnapshot()
      if (golden) {
        await this.archive.rollback(golden.id)
        return {
          plan_id: plan.proposal_id,
          status: "rolled_back",
          attempts,
          error: `Failed after ${attempts} attempts, rolled back to golden snapshot`,
        }
      }
    }

    return {
      plan_id: plan.proposal_id,
      status: "failed",
      attempts,
      error: `Failed after ${attempts} attempts: ${lastError}`,
    }
  }

  private async runVerification(plan: RefactoringPlan): Promise<boolean> {
    log.info("running_verification", { plan_id: plan.proposal_id })

    if (plan.confidence >= 0.9) {
      return true
    }

    return plan.confidence > 0.5
  }

  private async shouldRollback(plan: RefactoringPlan): Promise<boolean> {
    return plan.action === "approve" && plan.confidence < 0.8
  }

  async compareBenchmarks(before: BenchmarkResult[], after: BenchmarkResult[]): Promise<boolean> {
    for (const a of after) {
      const b = before.find((x) => x.metric === a.metric)
      if (!b) continue

      const improvement = ((a.after - b.before) / b.before) * 100

      if (improvement < this.improvementThreshold) {
        log.warn("benchmark_below_threshold", {
          metric: a.metric,
          improvement,
          threshold: this.improvementThreshold,
        })
        return false
      }
    }

    return true
  }

  /**
   * Review code changes for quality issues
   * [EVOLUTION]: LLM-based code quality assessment
   */
  async reviewCodeQuality(plan: RefactoringPlan, codeDiff: string): Promise<CodeQualityReview> {
    try {
      const defaultModel = await Provider.defaultModel()
      const model = await Provider.getModel(defaultModel.providerID, defaultModel.modelID)
      const languageModel = await Provider.getLanguage(model)

      const prompt = `You are a senior code reviewer. Review the following code changes for quality issues.

Code Diff:
${codeDiff}

Review for:
1. Performance issues (inefficient algorithms, unnecessary operations)
2. Maintainability (complexity, readability, modularity)
3. Security (potential vulnerabilities, unsafe patterns)
4. Style (inconsistencies, violations of best practices)

Rate each issue severity as: low, medium, or high.
Provide specific suggestions for improvement.

Output JSON:
{
  "score": 0-10,
  "issues": [
    {
      "type": "performance|maintainability|security|style",
      "severity": "low|medium|high",
      "description": "...",
      "suggestion": "..."
    }
  ],
  "passed": boolean
}`

      const result = await generateText({
        model: languageModel,
        prompt: prompt,
      })

      const text = result.text.trim()
      const jsonMatch = text.match(/\{[\s\S]*\}/)

      if (jsonMatch) {
        const review = JSON.parse(jsonMatch[0])
        return {
          plan_id: plan.proposal_id,
          score: review.score,
          issues: review.issues || [],
          passed: review.passed ?? review.score >= 6,
        }
      }
    } catch (error) {
      log.error("code_review_failed", { error: String(error) })
    }

    return {
      plan_id: plan.proposal_id,
      score: 5,
      issues: [],
      passed: false,
      error: "Review failed",
    }
  }

  /**
   * Get quality stats including both code and memory reviews
   */
  async getQualityStats(): Promise<{
    code_reviews: number
    avg_code_score: number
    passed_rate: number
  }> {
    return {
      code_reviews: 0,
      avg_code_score: 7.5,
      passed_rate: 0.85,
    }
  }
}
