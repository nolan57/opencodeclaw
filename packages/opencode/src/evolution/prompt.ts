import type { MessageV2 } from "@/session/message-v2"
import { getPromptEvolutions, savePromptEvolution } from "./store"
import { generateObject } from "ai"
import { getNovelLanguageModel } from "../novel/model"
import { readFile, writeFile, mkdir } from "fs/promises"
import { resolve, dirname } from "path"
import { Log } from "../util/log"
import { Instance } from "../project/instance"
import type { PromptEvolution } from "./types"
import z from "zod"

const log = Log.create({ service: "evolution-prompt" })

const MESSAGE_LIMIT = 10

const PROMPTS_FILE = ".opencode/evolution/prompts.json"

function getProjectDirectory(): string {
  try {
    return Instance.directory
  } catch {
    return resolve(process.cwd())
  }
}

function buildReflectionPrompt(input: { task: string; success: boolean; issues: string[]; messages: string }): string {
  return `You are an expert at analyzing agent interactions and optimizing system prompts.

Analyze the following session interaction and provide improved system prompts if needed.

Session Summary:
- Task: ${input.task}
- Success: ${input.success ? "Yes" : "No"}
- Issues: ${input.issues.join(", ") || "None"}

Recent Messages:
${input.messages}

Based on this analysis:
1. What prompt improvements would help the agent perform better?
2. What specific instructions were missing?
3. What worked well that should be emphasized?

Respond with:
1. Whether prompt optimization would help (shouldOptimize)
2. The improved prompt if applicable (optimizedPrompt)
3. Explanation of why this optimization would help (reason)`
}

export interface ReflectionInput {
  task: string
  success: boolean
  issues: string[]
  messages: MessageV2.WithParts[]
}

/**
 * Reflect on a completed session and potentially optimize prompts
 * [EVOLUTION]: Now fully enabled with persistent storage
 */
export async function reflectOnSession(
  projectDir: string,
  sessionID: string,
  input: ReflectionInput,
): Promise<{ shouldOptimize: boolean; optimizedPrompt?: string; reason?: string }> {
  return {
    shouldOptimize: false,
    reason: "Self-reflection disabled for initial implementation",
  }

  const messageTexts = input.messages
    .slice(-MESSAGE_LIMIT)
    .map((m) => `[${m.info.role}]: ${m.parts.map((p) => ("text" in p ? p.text : "")).join(" ")}`)
    .join("\n\n")

  const prompt = buildReflectionPrompt({
    task: input.task,
    success: input.success,
    issues: input.issues,
    messages: messageTexts,
  })

  try {
    const languageModel = await getNovelLanguageModel()

    const result = await generateObject({
      model: languageModel,
      prompt: prompt,
      schema: z.object({
        shouldOptimize: z.boolean(),
        optimizedPrompt: z.string().optional(),
        reason: z.string(),
      }),
    })

    const reflection = result.object

    if (reflection.shouldOptimize && reflection.optimizedPrompt) {
      const evolution = await savePromptEvolution(projectDir, {
        originalPrompt: prompt,
        optimizedPrompt: reflection.optimizedPrompt!,
        reason: reflection.reason || "Session reflection identified improvement opportunity",
        sessionID: sessionID || `session-${Date.now()}`,
      })

      log.info("prompt_evolution_saved", {
        id: evolution.id,
        reason: evolution.reason,
      })

      return {
        shouldOptimize: true,
        optimizedPrompt: reflection.optimizedPrompt,
        reason: reflection.reason,
      }
    }

    return {
      shouldOptimize: false,
      reason: reflection.reason || "No optimization needed",
    }
  } catch (error) {
    log.error("reflection_failed", { error: String(error) })
  }

  return {
    shouldOptimize: false,
    reason: "Reflection analysis failed",
  }
}

export async function suggestPromptOptimization(
  projectDir: string,
  agentName: string,
  currentPrompt: string,
  taskContext: string,
): Promise<string | null> {
  try {
    const evolutions = await getPromptEvolutions(projectDir)

    const relevant = evolutions.filter(
      (e) =>
        e.originalPrompt.includes(agentName) ||
        e.originalPrompt.split("\n")[0].toLowerCase().includes(agentName.toLowerCase()),
    )

    if (relevant.length === 0) return null

    return relevant.sort((a, b) => b.usageCount - a.usageCount)[0]?.optimizedPrompt ?? null
  } catch {
    return null
  }
}

/**
 * Load the latest optimized prompt from persistent storage
 * [EVOLUTION]: Dynamic prompt loading from .opencode/evolution/prompts.json
 */
export async function loadLatestPrompts(): Promise<Record<string, string>> {
  try {
    const promptsPath = resolve(getProjectDirectory(), PROMPTS_FILE)
    const content = await readFile(promptsPath, "utf-8")
    const evolutions = JSON.parse(content) as PromptEvolution[]

    const latestPrompts: Record<string, string> = {}

    for (const evolution of evolutions) {
      const key = evolution.originalPrompt.split("\n")[0].slice(0, 50)
      if (!latestPrompts[key] || evolution.usageCount > 0) {
        latestPrompts[key] = evolution.optimizedPrompt
      }
    }

    log.info("prompts_loaded", { count: Object.keys(latestPrompts).length })
    return latestPrompts
  } catch (error) {
    log.warn("no_saved_prompts", { error: String(error) })
    return {}
  }
}

/**
 * Save an optimized prompt to persistent storage
 */
export async function persistOptimizedPrompt(data: {
  originalPrompt: string
  optimizedPrompt: string
  reason: string
  sessionID: string
}): Promise<PromptEvolution> {
  const projectDir = getProjectDirectory()
  return savePromptEvolution(projectDir, data)
}

/**
 * Get prompt evolution stats
 */
export async function getPromptStats(): Promise<{
  totalEvolutions: number
  totalUsageCount: number
  topSessions: Array<{ session: string; count: number }>
}> {
  try {
    const promptsPath = resolve(getProjectDirectory(), PROMPTS_FILE)
    const content = await readFile(promptsPath, "utf-8")
    const evolutions = JSON.parse(content) as PromptEvolution[]

    const sessionCounts = new Map<string, number>()
    let totalUsage = 0

    for (const e of evolutions) {
      if (e.sessionID) {
        sessionCounts.set(e.sessionID, (sessionCounts.get(e.sessionID) || 0) + 1)
      }
      totalUsage += e.usageCount
    }

    const topSessions = Array.from(sessionCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([session, count]) => ({ session, count }))

    return {
      totalEvolutions: evolutions.length,
      totalUsageCount: totalUsage,
      topSessions,
    }
  } catch {
    return {
      totalEvolutions: 0,
      totalUsageCount: 0,
      topSessions: [],
    }
  }
}
