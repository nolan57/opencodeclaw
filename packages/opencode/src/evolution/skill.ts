import { mkdir, writeFile, access, readFile } from "fs/promises"
import { resolve, join } from "path"
import { saveSkillEvolution, getSkillEvolutions, updateSkillStatus } from "./store"
import { Skill } from "../skill/skill"
import type { SkillEvolution } from "./types"
import { SkillSandbox, generateTestCases, type TestCase } from "../learning/skill-sandbox"
import { generateText } from "ai"
import { Provider } from "../provider/provider"
import { Log } from "../util/log"

const log = Log.create({ service: "evolution-skill" })

export interface SkillPattern {
  name: string
  description: string
  triggerPatterns: string[]
  template: string
}

/**
 * Executable skill with code and tests
 * [EVOLUTION]: Skills now include executable TypeScript code
 */
export interface ExecutableSkill {
  name: string
  description: string
  code: string
  testCases: TestCase[]
  triggerPatterns: string[]
}

function generateSkillContent(task: string, tools: string[]): string {
  return `# ${task.slice(0, 50)}

## Description

Auto-generated skill for: ${task}

## Triggers

This skill activates when:
${tools.map((t) => `- Working with ${t} operations`).join("\n")}

## Actions

1. Analyze the task requirements
2. Execute relevant tool calls
3. Verify results

## Notes

Generated from session analysis on ${new Date().toISOString().split("T")[0]}
`
}

function extractKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3)

  return [...new Set(words)].slice(0, 5)
}

/**
 * Generate executable skill code from description
 * [EVOLUTION]: LLM generates both code and test cases
 */
export async function generateExecutableSkill(
  name: string,
  description: string,
  requirements: string[],
): Promise<ExecutableSkill | null> {
  try {
    const defaultModel = await Provider.defaultModel()
    const model = await Provider.getModel(defaultModel.providerID, defaultModel.modelID)
    const languageModel = await Provider.getLanguage(model)

    const prompt = `Generate an executable skill with test cases.

Skill Name: ${name}
Description: ${description}
Requirements:
${requirements.map((r) => `- ${r}`).join("\n")}

Generate:
1. TypeScript code that implements the skill (export a function named 'execute')
2. At least 3 test cases covering: basic usage, edge cases, error handling

Output JSON:
{
  "name": "${name}",
  "description": "${description}",
  "code": "TypeScript code string",
  "testCases": [
    {
      "name": "test_name",
      "input": "test_input",
      "expected_output": "expected_output",
      "should_fail": false
    }
  ],
  "triggerPatterns": ["pattern1", "pattern2"]
}`

    const result = await generateText({
      model: languageModel,
      prompt: prompt,
    })

    const text = result.text.trim()
    const jsonMatch = text.match(/\{[\s\S]*\}/)

    if (jsonMatch) {
      const skill = JSON.parse(jsonMatch[0])
      return {
        name: skill.name || name,
        description: skill.description || description,
        code: skill.code,
        testCases: skill.testCases || [],
        triggerPatterns: skill.triggerPatterns || [],
      }
    }
  } catch (error) {
    log.error("generate_executable_skill_failed", { error: String(error) })
  }

  return null
}

/**
 * Test skill in sandbox before approval
 * [EVOLUTION]: Skills must pass sandbox tests before deployment
 */
export async function testSkillInSandbox(skill: ExecutableSkill): Promise<{
  passed: boolean
  testResults: Array<{ name: string; passed: boolean; error?: string }>
  error?: string
}> {
  const sandbox = new SkillSandbox({
    timeout_ms: 10000,
    max_memory_mb: 256,
  })

  try {
    // First verify syntax
    const syntaxCheck = await sandbox.verifySyntax(skill.code)
    if (!syntaxCheck.valid) {
      return {
        passed: false,
        testResults: [],
        error: `Syntax error: ${syntaxCheck.error}`,
      }
    }

    // Run test cases
    const result = await sandbox.runTests(skill.code, skill.testCases)

    return {
      passed: result.success,
      testResults: result.test_results || [],
      error: result.error,
    }
  } catch (error) {
    return {
      passed: false,
      testResults: [],
      error: String(error),
    }
  }
}

export async function analyzeTaskForSkill(
  projectDir: string,
  sessionID: string,
  task: string,
  toolCalls: string[],
  success: boolean,
): Promise<{ shouldCreate: boolean; skill?: SkillEvolution }> {
  if (!success) return { shouldCreate: false }

  const toolFrequency = toolCalls.reduce(
    (acc, call) => {
      const toolName = call.split(" ")[0]
      acc[toolName] = (acc[toolName] || 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )

  const repeatedTools = Object.entries(toolFrequency).filter(([_, count]) => count >= 3)

  if (repeatedTools.length === 0) {
    return { shouldCreate: false }
  }

  const skillName = `auto-${repeatedTools[0][0].toLowerCase()}-task`
  const skillContent = generateSkillContent(
    task,
    repeatedTools.map(([tool]) => tool),
  )

  const skillData = {
    name: skillName,
    description: `Auto-generated skill for ${task.slice(0, 100)}`,
    content: skillContent,
    triggerPatterns: extractKeywords(task),
    sessionID,
  }

  const saved = await saveSkillEvolution(projectDir, skillData)

  return {
    shouldCreate: true,
    skill: saved,
  }
}

/**
 * Approve and deploy a skill
 * [EVOLUTION]: Now includes code deployment and test results storage
 */
export async function approveSkill(
  projectDir: string,
  skillID: string,
  testResults?: { passed: boolean; testResults: Array<{ name: string; passed: boolean }> },
): Promise<string | null> {
  await updateSkillStatus(projectDir, skillID, "approved")

  const skills = await getSkillEvolutions(projectDir, "approved")
  const skill = skills.find((s) => s.id === skillID)

  if (!skill) return null

  const skillDir = resolve(projectDir, ".opencode/skills", skill.name)

  try {
    await access(skillDir)
  } catch {
    await mkdir(skillDir, { recursive: true })
  }

  // Write SKILL.md
  const skillFile = resolve(skillDir, "SKILL.md")
  await writeFile(skillFile, skill.content)

  // Write test results if available
  if (testResults) {
    const testResultsFile = resolve(skillDir, "test-results.json")
    await writeFile(testResultsFile, JSON.stringify(testResults, null, 2))
  }

  // Reload skills
  await Skill.reload()

  log.info("skill_approved_and_deployed", {
    id: skillID,
    name: skill.name,
    tests_passed: testResults?.passed,
  })

  return skillDir
}

export async function rejectSkill(projectDir: string, skillID: string): Promise<void> {
  await updateSkillStatus(projectDir, skillID, "rejected")
  log.info("skill_rejected", { id: skillID })
}

export async function getPendingSkills(projectDir: string) {
  return getSkillEvolutions(projectDir, "draft")
}

/**
 * Get all approved skills with test results
 */
export async function getApprovedSkillsWithTests(projectDir: string): Promise<
  Array<{
    skill: SkillEvolution
    testResults?: { passed: boolean; testResults: Array<{ name: string; passed: boolean }> }
  }>
> {
  const skills = await getSkillEvolutions(projectDir, "approved")
  const result = []

  for (const skill of skills) {
    const skillDir = resolve(projectDir, ".opencode/skills", skill.name)
    const testResultsFile = resolve(skillDir, "test-results.json")

    try {
      const content = await readFile(testResultsFile, "utf-8")
      const testResults = JSON.parse(content)
      result.push({ skill, testResults })
    } catch {
      result.push({ skill })
    }
  }

  return result
}
