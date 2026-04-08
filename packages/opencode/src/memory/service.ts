import type { MemoryType, AddMemoryParams, SearchParams, MemoryRef } from "../collab/types"
import { getSharedVectorStore, type IVectorStore } from "../learning/vector-store"
import { KnowledgeGraph } from "../learning/knowledge-graph"
import { Database } from "../storage/db"
import { session_memory, session_message, project_memory, project_memory_relation } from "./session_memory.sql"
import { NamedError } from "@opencode-ai/util/error"
import { eq, and, sql, or, like, inArray, isNotNull, lt } from "drizzle-orm"
import { Log } from "../util/log"
import z from "zod"
import { CodeAnalyzer, type CodeEntity, type ImportInfo } from "./code-analyzer"
import { Provider } from "../provider/provider"
import { generateObject } from "ai"
import { Bus } from "../bus"
import { TuiEvent } from "../cli/cmd/tui/event"
import { readFile } from "fs/promises"
import { resolve } from "path"
import { Instance } from "../project/instance"
import { saveMemory, getMemories, incrementMemoryUsage } from "../evolution/store"
import type { MemoryEntry } from "../evolution/types"
import { MemoryLearningBridge, DEFAULT_MEMORY_BRIDGE_CONFIG } from "../adapt/memory-learning-bridge"

const log = Log.create({ service: "memory" })

// ============================================================================
// Custom Error Types
// ============================================================================

/**
 * Error thrown when a required parameter is missing
 */
export const MissingParameterError = NamedError.create(
  "MissingParameterError",
  z.object({
    parameter: z.string(),
    context: z.string(),
  }),
)

/**
 * Error thrown when an unsupported memory type is requested
 */
export const UnsupportedMemoryTypeError = NamedError.create(
  "UnsupportedMemoryTypeError",
  z.object({
    type: z.string(),
    supportedTypes: z.array(z.string()),
  }),
)

/**
 * Error thrown when the memory service is not initialized
 */
export const ServiceNotInitializedError = NamedError.create(
  "ServiceNotInitializedError",
  z.object({
    service: z.string(),
  }),
)

/**
 * Error thrown when a session is not found
 */
export const SessionNotFoundError = NamedError.create(
  "SessionNotFoundError",
  z.object({
    sessionId: z.string(),
  }),
)

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Result returned from memory search operations
 */
export interface MemoryResult {
  id: string
  type: MemoryType
  content: string
  similarity: number
  metadata?: Record<string, unknown>
}

/**
 * Extended result with cross-memory links
 */
export interface CrossMemoryResult extends MemoryResult {
  links?: MemoryRef[]
}

/**
 * Result returned from add memory operations
 */
export interface AddMemoryResult {
  id: string
  type: MemoryType
}

/**
 * Session data structure
 */
export interface SessionData {
  id: string
  agentIds: string[]
  messages: SessionMessage[]
  createdAt: number
  expiresAt: number
}

/**
 * Session message structure
 */
export interface SessionMessage {
  id: string
  role: "user" | "assistant" | "agent" | "system"
  content: string
  agentId?: string
  timestamp: number
}

/**
 * Project node for indexing
 */
export interface ProjectNode {
  entityType: string
  entityId: string
  title: string
  content?: string
  filePath?: string
  lineNumber?: number
  metadata?: Record<string, unknown>
}

/**
 * Project relation for indexing
 */
export interface ProjectRelation {
  sourceId: string
  targetId: string
  relationType: string
  weight?: number
}

/**
 * Search options for advanced queries
 */
export interface AdvancedSearchOptions {
  query: string
  limit?: number
  minSimilarity?: number
  useRegex?: boolean
  filters?: Record<string, unknown>
}

/**
 * Index project options
 */
export interface IndexProjectOptions {
  files: Array<{
    path: string
    content: string
    type?: string
  }>
  clearExisting?: boolean
}

/**
 * Memory suggestion with relevance score
 */
export interface MemorySuggestion {
  key: string
  value: string
  relevance: number
}

/**
 * Extracted memory from task
 */
export interface ExtractedMemory {
  key: string
  value: string
}

/**
 * Memory pattern configuration
 */
interface MemoryPatternConfig {
  keywords: string[]
  key: string
  value: string
}

/**
 * Memory patterns file structure
 */
interface MemoryPatternsFile {
  patterns: MemoryPatternConfig[]
}

/** Memory extraction prompt template */
const MEMORY_EXTRACTION_PROMPT = `Extract 0-3 key learnings from this task that would help with future similar tasks.

Task: {task}
Tool calls: {toolCalls}
Outcome: {outcome}`

// ============================================================================
// SessionMemoryService - SQLite-backed session memory
// ============================================================================

/**
 * SessionMemoryService provides persistent storage for session-level memories.
 * Uses SQLite for durability across restarts with TTL-based expiration.
 */
class SessionMemoryService {
  private initialized = false
  private vectorStore: IVectorStore | null = null

  /** Default TTL for sessions in milliseconds (60 minutes) */
  private readonly DEFAULT_TTL_MS = 60 * 60 * 1000

  /**
   * Initialize the session memory service
   */
  async init(): Promise<void> {
    if (this.initialized) return
    this.initialized = true
    log.info("session_memory_service_initialized")
  }

  /**
   * Get or initialize the vector store for semantic search
   */
  private async getVectorStore(): Promise<IVectorStore> {
    if (!this.vectorStore) {
      this.vectorStore = await getSharedVectorStore()
    }
    return this.vectorStore
  }

  /**
   * Create a new session with the specified agent IDs
   * @param agentIds - Array of agent IDs to associate with the session
   * @param ttlMinutes - Optional TTL in minutes (default: 60)
   * @returns The created session ID
   */
  async createSession(agentIds: string[], ttlMinutes: number = 60): Promise<string> {
    await this.init()

    const id = crypto.randomUUID()
    const now = Date.now()
    const expiresAt = now + ttlMinutes * 60 * 1000

    Database.use((db) =>
      db.insert(session_memory).values({
        id,
        agent_ids: JSON.stringify(agentIds),
        created_at: now,
        expires_at: expiresAt,
        time_created: now,
        time_updated: now,
      }),
    )

    log.info("session_created", { id, agentIds, ttlMinutes })
    return id
  }

  /**
   * Load a session from the database
   * @param sessionId - The session ID to load
   * @returns The session data or null if not found
   */
  async loadSession(sessionId: string): Promise<SessionData | null> {
    await this.init()

    const session = Database.use((db) => db.select().from(session_memory).where(eq(session_memory.id, sessionId)).get())

    if (!session) return null

    // Load messages
    const messages = Database.use((db) =>
      db.select().from(session_message).where(eq(session_message.session_id, sessionId)).all(),
    )

    return {
      id: session.id,
      agentIds: JSON.parse(session.agent_ids),
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role as SessionMessage["role"],
        content: m.content,
        agentId: m.agent_id ?? undefined,
        timestamp: m.timestamp,
      })),
      createdAt: session.created_at,
      expiresAt: session.expires_at,
    }
  }

  /**
   * Save session data to the database
   * @param session - The session data to save
   */
  async saveSession(session: SessionData): Promise<void> {
    await this.init()

    const now = Date.now()

    Database.use((db) =>
      db
        .update(session_memory)
        .set({
          agent_ids: JSON.stringify(session.agentIds),
          expires_at: session.expiresAt,
          time_updated: now,
        })
        .where(eq(session_memory.id, session.id)),
    )

    log.info("session_saved", { id: session.id })
  }

  /**
   * Add a message to a session
   * @param sessionId - The session ID
   * @param message - The message to add
   * @throws {SessionNotFoundError} if session doesn't exist
   */
  async addMessage(sessionId: string, message: { role: string; content: string; agentId?: string }): Promise<void> {
    await this.init()

    // Verify session exists
    const session = await this.loadSession(sessionId)
    if (!session) {
      throw new SessionNotFoundError({ sessionId })
    }

    const id = crypto.randomUUID()
    const now = Date.now()

    Database.use((db) =>
      db.insert(session_message).values({
        id,
        session_id: sessionId,
        role: message.role,
        content: message.content,
        agent_id: message.agentId ?? null,
        timestamp: now,
        time_created: now,
        time_updated: now,
      }),
    )

    // Store embedding for semantic search
    try {
      const vs = await this.getVectorStore()
      await vs.store({
        node_type: "session_message",
        node_id: id,
        entity_title: `${message.role}: ${message.content.slice(0, 100)}`,
        vector_type: "content",
        metadata: { sessionId, role: message.role, agentId: message.agentId },
      })
    } catch (error) {
      log.warn("failed_to_store_message_embedding", { sessionId, error: String(error) })
    }

    log.info("message_added", { sessionId, messageId: id, role: message.role })
  }

  /**
   * Search session messages with multi-keyword matching and similarity scoring
   * @param sessionId - The session ID to search within
   * @param query - The search query (supports multi-keyword)
   * @param options - Search options including limit and regex support
   * @returns Array of matching memory results with similarity scores
   */
  async searchSession(
    sessionId: string,
    query: string,
    options: { limit?: number; useRegex?: boolean } = {},
  ): Promise<MemoryResult[]> {
    await this.init()

    const limit = options.limit ?? 10

    // Get all messages for the session
    const messages = Database.use((db) =>
      db.select().from(session_message).where(eq(session_message.session_id, sessionId)).all(),
    )

    if (messages.length === 0) return []

    // Parse query into keywords
    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2)

    let results: Array<{ message: (typeof messages)[0]; score: number }> = []

    if (options.useRegex) {
      // Regex-based matching
      try {
        const regex = new RegExp(query, "gi")
        results = messages
          .map((m) => {
            const matches = m.content.match(regex)
            const score = matches ? matches.length / m.content.split(/\s+/).length : 0
            return { message: m, score }
          })
          .filter((r) => r.score > 0)
      } catch {
        // Invalid regex, fall back to keyword matching
        log.warn("invalid_regex_fallback_to_keyword", { query })
        results = this.keywordMatch(messages, keywords)
      }
    } else {
      // Multi-keyword matching with scoring
      results = this.keywordMatch(messages, keywords)
    }

    // Also try vector search for better semantic matching
    try {
      const vs = await this.getVectorStore()
      const vecResults = await vs.search(query, { limit: limit * 2, min_similarity: 0.1 })

      // Merge vector results with keyword results
      const vecIds = new Set(vecResults.map((r) => r.node_id))
      for (const vec of vecResults) {
        const msg = messages.find((m) => m.id === vec.node_id)
        if (msg && !results.find((r) => r.message.id === msg.id)) {
          results.push({ message: msg, score: vec.similarity })
        } else if (msg) {
          // Boost score for messages found by both methods
          const existing = results.find((r) => r.message.id === msg.id)
          if (existing) {
            existing.score = Math.min(1, existing.score + vec.similarity * 0.5)
          }
        }
      }
    } catch (error) {
      log.warn("vector_search_fallback", { error: String(error) })
    }

    // Sort by score and return
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((r) => ({
        id: r.message.id,
        type: "session" as MemoryType,
        content: r.message.content,
        similarity: r.score,
        metadata: {
          role: r.message.role,
          agentId: r.message.agent_id,
          timestamp: r.message.timestamp,
        },
      }))
  }

  /**
   * Multi-keyword matching with TF-IDF-like scoring
   */
  private keywordMatch(
    messages: Array<{
      time_created: number
      time_updated: number
      id: string
      session_id: string
      role: string
      content: string
      agent_id: string | null
      timestamp: number
    }>,
    keywords: string[],
  ): Array<{ message: (typeof messages)[0]; score: number }> {
    return messages
      .map((m) => {
        const contentLower = m.content.toLowerCase()
        const words = contentLower.split(/\s+/)
        const wordSet = new Set(words)

        // Calculate keyword matches
        let matchCount = 0
        let exactMatches = 0

        for (const keyword of keywords) {
          // Check for exact word match
          if (wordSet.has(keyword)) {
            exactMatches++
            matchCount += 2 // Boost for exact match
          }
          // Check for partial match
          else if (contentLower.includes(keyword)) {
            matchCount += 1
          }
        }

        // Calculate score based on coverage and density
        const coverage = keywords.length > 0 ? matchCount / (keywords.length * 2) : 0
        const density = words.length > 0 ? matchCount / words.length : 0

        // Combined score: prioritize coverage but also consider density
        const score = Math.min(1, coverage * 0.7 + density * 0.3)

        return { message: m, score }
      })
      .filter((r) => r.score > 0)
  }

  /**
   * Get all messages for a session
   * @param sessionId - The session ID
   * @returns Array of session messages
   */
  async getMessages(sessionId: string): Promise<SessionMessage[]> {
    await this.init()

    const messages = Database.use((db) =>
      db.select().from(session_message).where(eq(session_message.session_id, sessionId)).all(),
    )

    return messages.map((m) => ({
      id: m.id,
      role: m.role as SessionMessage["role"],
      content: m.content,
      agentId: m.agent_id ?? undefined,
      timestamp: m.timestamp,
    }))
  }

  /**
   * End a session by setting its expiration to now
   * @param sessionId - The session ID to end
   */
  async endSession(sessionId: string): Promise<void> {
    await this.init()

    const now = Date.now()
    Database.use((db) =>
      db.update(session_memory).set({ expires_at: now, time_updated: now }).where(eq(session_memory.id, sessionId)),
    )

    log.info("session_ended", { sessionId })

    // Trigger knowledge graph indexing on session end
    try {
      const { triggerSessionEndIndex } = await import("../learning/knowledge-index-manager")
      await triggerSessionEndIndex()
    } catch (error) {
      log.warn("failed_to_trigger_session_end_index", { error: String(error) })
    }
  }

  /**
   * Clean up expired sessions from the database
   * @returns Number of sessions cleaned up
   */
  async cleanup(): Promise<number> {
    await this.init()

    const now = Date.now()

    // Find expired sessions
    const expired = Database.use((db) =>
      db.select({ id: session_memory.id }).from(session_memory).where(lt(session_memory.expires_at, now)).all(),
    )

    if (expired.length === 0) return 0

    // Delete expired sessions (cascade will delete messages)
    const expiredIds = expired.map((s) => s.id)
    Database.use((db) => db.delete(session_memory).where(inArray(session_memory.id, expiredIds)))

    log.info("sessions_cleaned_up", { count: expired.length })
    return expired.length
  }

  /**
   * Check if the service is initialized
   */
  isInitialized(): boolean {
    return this.initialized
  }
}

// ============================================================================
// EvolutionMemoryService - Vector-based evolution memory
// ============================================================================

/**
 * EvolutionMemoryService manages long-term memories from self-evolution processes.
 * Uses vector embeddings for semantic search and similarity matching.
 */
class EvolutionMemoryService {
  private vectorStore: IVectorStore | null = null
  private initialized = false

  /**
   * Initialize the evolution memory service
   */
  async init(): Promise<void> {
    if (this.initialized) return
    this.initialized = true
    log.info("evolution_memory_service_initialized")
  }

  /**
   * Get the shared vector store instance
   */
  private async getVectorStore(): Promise<IVectorStore> {
    if (!this.vectorStore) {
      this.vectorStore = await getSharedVectorStore()
    }
    return this.vectorStore
  }

  /**
   * Add a skill/memory to the evolution store
   * @param params - The memory parameters
   * @returns The created memory result
   */
  async addSkill(params: AddMemoryParams): Promise<AddMemoryResult> {
    if (!this.initialized) {
      await this.init()
    }

    const id = crypto.randomUUID()
    const vs = await this.getVectorStore()

    await vs.store({
      node_type: "skill",
      node_id: id,
      entity_title: params.content.slice(0, 100),
      vector_type: "content",
      metadata: {
        ...params.metadata,
        type: "skill",
        content: params.content,
        tags: params.tags,
      },
    })

    log.info("evolution_memory_added", { id, type: "skill" })
    return { id, type: "evolution" }
  }

  /**
   * Search for skills/memories matching the query
   * @param query - The search query
   * @param limit - Maximum results to return
   * @returns Array of matching memory results
   */
  async searchSkills(query: string, limit: number = 10): Promise<MemoryResult[]> {
    if (!this.initialized) {
      await this.init()
    }

    const vs = await this.getVectorStore()
    const results = await vs.search(query, { limit, min_similarity: 0.2 })

    return results.map((r) => ({
      id: r.id,
      type: "evolution" as MemoryType,
      content: (r.metadata?.content as string) ?? r.entity_title,
      similarity: r.similarity,
      metadata: r.metadata,
    }))
  }

  /**
   * Check if the service is initialized
   */
  isInitialized(): boolean {
    return this.initialized
  }
}

// ============================================================================
// ProjectMemoryService - Knowledge graph-based project memory
// ============================================================================

/**
 * ProjectMemoryService manages project-level knowledge and patterns.
 * Uses KnowledgeGraph for entity relationships and VectorStore for semantic search.
 */
class ProjectMemoryService {
  private knowledgeGraph: KnowledgeGraph | null = null
  private vectorStore: IVectorStore | null = null
  private initialized = false

  /**
   * Initialize the project memory service
   */
  async init(): Promise<void> {
    if (this.initialized) return
    this.initialized = true
    log.info("project_memory_service_initialized")
  }

  /**
   * Get the knowledge graph, initializing if necessary
   */
  private async getKnowledgeGraph(): Promise<KnowledgeGraph> {
    if (!this.knowledgeGraph) {
      this.knowledgeGraph = new KnowledgeGraph()
    }
    return this.knowledgeGraph!
  }

  /**
   * Get the shared vector store instance
   */
  private async getVectorStore(): Promise<IVectorStore> {
    if (!this.vectorStore) {
      this.vectorStore = await getSharedVectorStore()
    }
    return this.vectorStore
  }

  /**
   * Index project files and entities into the knowledge graph
   * Uses AST-based CodeAnalyzer for accurate entity extraction
   * @param options - Indexing options including files to index
   * @returns Statistics about the indexing operation
   */
  async indexProject(options: IndexProjectOptions): Promise<{ entitiesAdded: number; relationsAdded: number }> {
    if (!this.initialized) {
      await this.init()
    }

    const kg = await this.getKnowledgeGraph()
    const vs = await this.getVectorStore()
    const analyzer = new CodeAnalyzer()

    // Build resolved paths map for dependency resolution
    const resolvedPaths = new Map<string, string>()
    for (const file of options.files) {
      resolvedPaths.set(file.path, file.path)
    }

    // Clear existing data if requested
    if (options.clearExisting) {
      const stats = await kg.getStats()
      log.info("clearing_existing_project_memory", { nodes: stats.nodes, edges: stats.edges })
    }

    let entitiesAdded = 0
    let relationsAdded = 0

    for (const file of options.files) {
      // Create file entity
      const fileId = crypto.randomUUID()
      await kg.addNode({
        type: "file",
        entity_type: file.type ?? "file",
        entity_id: file.path,
        title: file.path,
        content: file.content.slice(0, 1000), // Store preview
      })
      entitiesAdded++

      // Store embedding for semantic search
      try {
        await vs.store({
          node_type: "project_file",
          node_id: fileId,
          entity_title: file.path,
          vector_type: "code",
          metadata: {
            path: file.path,
            type: file.type,
            contentPreview: file.content.slice(0, 500),
          },
        })
      } catch (error) {
        log.warn("failed_to_store_file_embedding", { path: file.path, error: String(error) })
      }

      // Use AST-based CodeAnalyzer for accurate entity extraction
      try {
        const analysis = analyzer.analyze(file.content, file.path, resolvedPaths)

        // Extract entities
        for (const entity of analysis.entities) {
          const entityId = `${file.path}#${entity.name}`
          const projMemId = crypto.randomUUID()
          const now = Date.now()

          // Store in project_memory table
          Database.use((db) =>
            db.insert(project_memory).values({
              id: projMemId,
              entity_type: entity.type,
              entity_id: entityId,
              title: entity.name,
              content: entity.documentation ?? entity.signature ?? "",
              file_path: file.path,
              line_number: entity.lineNumber,
              metadata: JSON.stringify({
                type: entity.type,
                name: entity.name,
                exported: entity.exported,
                async: entity.async,
                static: entity.static,
                visibility: entity.visibility,
                generics: entity.generics,
                extends: entity.extends,
                implements: entity.implements,
                decorators: entity.decorators,
              }),
              time_created: now,
              time_updated: now,
            }),
          )

          entitiesAdded++

          // Also add to knowledge graph for cross-referencing
          await kg.addNode({
            type: "code_entity",
            entity_type: entity.type,
            entity_id: entityId,
            title: entity.name,
            content: entity.documentation ?? entity.signature ?? "",
            metadata: {
              filePath: file.path,
              lineNumber: entity.lineNumber,
              exported: entity.exported,
            },
          })
        }

        // Extract import relations
        for (const imp of analysis.imports) {
          const source = imp.source
          // Skip node_modules (bare imports)
          if (!source.startsWith(".") && !source.startsWith("/")) {
            continue
          }

          // Try to resolve the path
          let targetFile: string | undefined
          const extensions = ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"]
          for (const ext of extensions) {
            targetFile = resolvedPaths.get(source + ext)
            if (targetFile) break
          }

          if (targetFile) {
            const relationId = crypto.randomUUID()
            const now = Date.now()

            Database.use((db) =>
              db.insert(project_memory_relation).values({
                id: relationId,
                source_id: file.path,
                target_id: targetFile!,
                relation_type: "imports",
                weight: 1,
                time_created: now,
                time_updated: now,
              }),
            )

            relationsAdded++

            // Add to knowledge graph
            await kg.addEdge({
              relation: "imports",
              source_id: file.path,
              target_id: targetFile,
              weight: 1,
            })
          }
        }

        // Extract method call relations
        for (const call of analysis.methodCalls) {
          // Skip internal calls (calls within same class)
          if (call.calleeObject && file.path.includes(call.calleeObject)) {
            continue
          }

          // Add method call as a weak relation
          if (call.calleeObject) {
            await kg.addEdge({
              relation: "calls",
              source_id: call.callerFunction ? `${file.path}#${call.callerFunction}` : file.path,
              target_id: `${call.calleeObject}.${call.calleeName}`,
              weight: 0.5,
            })
          }
        }
      } catch (error) {
        log.warn("failed_to_analyze_file", {
          path: file.path,
          error: error instanceof Error ? error.message : String(error),
        })
        // Fallback to basic regex for unsupported file types
        const entityPatterns = [
          { pattern: /(?:export\s+)?function\s+(\w+)/g, type: "function" },
          { pattern: /(?:export\s+)?class\s+(\w+)/g, type: "class" },
          { pattern: /(?:export\s+)?interface\s+(\w+)/g, type: "interface" },
          { pattern: /(?:export\s+)?type\s+(\w+)/g, type: "type" },
          { pattern: /(?:export\s+)?const\s+(\w+)/g, type: "constant" },
        ]

        for (const { pattern, type } of entityPatterns) {
          let match: RegExpExecArray | null
          while ((match = pattern.exec(file.content)) !== null) {
            const currentMatch = match!
            const entityName = currentMatch[1]
            const entityId = `${file.path}#${entityName}`
            const lineNum = file.content.slice(0, currentMatch.index).split("\n").length
            const projMemId = crypto.randomUUID()
            const now = Date.now()

            Database.use((db) =>
              db.insert(project_memory).values({
                id: projMemId,
                entity_type: type,
                entity_id: entityId,
                title: entityName,
                content: file.content.slice(Math.max(0, currentMatch.index - 100), currentMatch.index + 200),
                file_path: file.path,
                line_number: lineNum,
                metadata: JSON.stringify({ type, name: entityName }),
                time_created: now,
                time_updated: now,
              }),
            )

            entitiesAdded++
          }
        }
      }
    }

    log.info("project_indexed", {
      filesProcessed: options.files.length,
      entitiesAdded,
      relationsAdded,
    })

    return { entitiesAdded, relationsAdded }
  }

  /**
   * Index incremental changes to the project
   * @param changes - Array of file changes
   */
  async indexChanges(changes: Array<{ file: string; type: string; content?: string }>): Promise<void> {
    if (!this.initialized) {
      await this.init()
    }

    for (const change of changes) {
      if (change.type === "delete") {
        // Remove from project_memory
        Database.use((db) => db.delete(project_memory).where(eq(project_memory.file_path, change.file)))
        // Remove relations
        Database.use((db) =>
          db
            .delete(project_memory_relation)
            .where(
              or(
                eq(project_memory_relation.source_id, change.file),
                eq(project_memory_relation.target_id, change.file),
              ),
            ),
        )
        log.info("project_memory_deleted", { file: change.file })
      } else if (change.type === "add" || change.type === "modify") {
        if (change.content) {
          await this.indexProject({
            files: [{ path: change.file, content: change.content }],
            clearExisting: false,
          })
        }
      }
    }
  }

  /**
   * Search for project entities by name or content
   * @param query - The search query
   * @param limit - Maximum results to return
   * @returns Array of matching memory results
   */
  async searchProject(query: string, limit: number = 10): Promise<MemoryResult[]> {
    if (!this.initialized) {
      await this.init()
    }

    // Search in project_memory table
    const results = Database.use((db) =>
      db
        .select()
        .from(project_memory)
        .where(
          or(
            like(project_memory.title, `%${query}%`),
            like(project_memory.entity_id, `%${query}%`),
            like(project_memory.file_path, `%${query}%`),
            like(project_memory.content, `%${query}%`),
          ),
        )
        .limit(limit)
        .all(),
    )

    // Also try vector search
    let vecResults: MemoryResult[] = []
    try {
      const vs = await this.getVectorStore()
      const vecSearchResults = await vs.search(query, { limit, min_similarity: 0.2 })

      vecResults = vecSearchResults.map((r) => ({
        id: r.id,
        type: "project" as MemoryType,
        content: (r.metadata?.contentPreview as string) ?? r.entity_title,
        similarity: r.similarity,
        metadata: r.metadata,
      }))
    } catch (error) {
      log.warn("project_vector_search_fallback", { error: String(error) })
    }

    // Merge results
    const merged = new Map<string, MemoryResult>()

    // Add database results with text-based similarity
    for (const r of results) {
      const contentLower = (r.content ?? "").toLowerCase()
      const queryLower = query.toLowerCase()
      const similarity = contentLower.includes(queryLower) ? 0.8 : 0.5

      merged.set(r.id, {
        id: r.id,
        type: "project" as MemoryType,
        content: r.content ?? r.title,
        similarity,
        metadata: {
          entityType: r.entity_type,
          entityId: r.entity_id,
          filePath: r.file_path,
          lineNumber: r.line_number,
        },
      })
    }

    // Add vector results
    for (const r of vecResults) {
      if (!merged.has(r.id)) {
        merged.set(r.id, r)
      }
    }

    return Array.from(merged.values())
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
  }

  /**
   * Get a specific entity by ID
   * @param id - The entity ID
   * @returns The entity or null if not found
   */
  async getEntity(id: string): Promise<MemoryResult | null> {
    if (!this.initialized) {
      await this.init()
    }

    const result = Database.use((db) => db.select().from(project_memory).where(eq(project_memory.id, id)).get())

    if (!result) return null

    return {
      id: result.id,
      type: "project" as MemoryType,
      content: result.content ?? result.title,
      similarity: 1,
      metadata: {
        entityType: result.entity_type,
        entityId: result.entity_id,
        filePath: result.file_path,
        lineNumber: result.line_number,
        metadata: result.metadata ? JSON.parse(result.metadata) : undefined,
      },
    }
  }

  /**
   * Get statistics about the project memory
   * @returns Statistics including entity counts
   */
  async getStats(): Promise<{ totalEntities: number; byType: Record<string, number> }> {
    if (!this.initialized) {
      await this.init()
    }

    const entities = Database.use((db) => db.select().from(project_memory).all())

    const byType: Record<string, number> = {}
    for (const e of entities) {
      byType[e.entity_type] = (byType[e.entity_type] ?? 0) + 1
    }

    return {
      totalEntities: entities.length,
      byType,
    }
  }

  /**
   * Check if the service is initialized
   */
  isInitialized(): boolean {
    return this.initialized
  }
}

// ============================================================================
// MemoryService - Main controller with robust error handling
// ============================================================================

/**
 * MemoryService is the main entry point for the three-level memory system.
 * Coordinates between SessionMemoryService, EvolutionMemoryService, and ProjectMemoryService.
 *
 * @example
 * ```typescript
 * const memory = new MemoryService()
 * await memory.init()
 *
 * // Add a session memory
 * const sessionId = await memory.createSession(['agent-1'])
 * await memory.add({
 *   memoryType: 'session',
 *   content: 'Hello world',
 *   metadata: { sessionId, role: 'user' }
 * })
 *
 * // Search across all memory types
 * const results = await memory.search({ query: 'hello', limit: 10 })
 * ```
 */
export class MemoryService {
  private session: SessionMemoryService
  private evolution: EvolutionMemoryService
  private project: ProjectMemoryService
  private initialized = false
  private initPromise: Promise<void> | null = null
  private bridge: MemoryLearningBridge | null = null
  private bridgeInitialized = false

  constructor() {
    this.session = new SessionMemoryService()
    this.evolution = new EvolutionMemoryService()
    this.project = new ProjectMemoryService()
  }

  /**
   * Initialize the memory learning bridge
   */
  private async initBridge(): Promise<void> {
    if (this.bridgeInitialized) return

    try {
      this.bridge = new MemoryLearningBridge(undefined, undefined, undefined, {
        ...DEFAULT_MEMORY_BRIDGE_CONFIG,
        enabled: true,
        syncToKnowledgeGraph: true,
        useVectorSearch: true,
        deduplication: true,
        crossMemoryLinking: true,
      })
      await this.bridge.initialize()
      this.bridgeInitialized = true
      log.info("memory_learning_bridge_initialized")
    } catch (error) {
      log.warn("memory_learning_bridge_init_failed", { error: String(error) })
      // Continue without bridge - graceful degradation
      this.bridge = null
      this.bridgeInitialized = true
    }
  }

  /**
   * Initialize all underlying memory services.
   * This method is safe to call multiple times.
   */
  async init(): Promise<void> {
    if (this.initialized) return

    // Prevent concurrent initialization
    if (this.initPromise) {
      return this.initPromise
    }

    this.initPromise = this.doInit()
    await this.initPromise
    this.initPromise = null
  }

  /**
   * Internal initialization logic
   */
  private async doInit(): Promise<void> {
    try {
      await Promise.all([
        this.session.init(),
        this.evolution.init(),
        this.project.init(),
        this.initBridge(), // Initialize memory learning bridge
      ])
      this.initialized = true
      log.info("memory_service_initialized")
    } catch (error) {
      log.error("memory_service_init_failed", { error: String(error) })
      throw error
    }
  }

  /**
   * Ensure the service is initialized before operations
   * @throws {ServiceNotInitializedError} if service is not initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new ServiceNotInitializedError({ service: "MemoryService" })
    }
  }

  /**
   * Add a memory entry to the appropriate service based on type
   * @param params - The memory parameters
   * @returns Array of results from the add operation
   * @throws {MissingParameterError} if required parameters are missing
   * @throws {UnsupportedMemoryTypeError} if an unsupported memory type is specified
   * @throws {ServiceNotInitializedError} if service is not initialized
   */
  async add(params: AddMemoryParams): Promise<AddMemoryResult[]> {
    this.ensureInitialized()

    // Validate required parameters based on memory type
    this.validateAddParams(params)

    let results: AddMemoryResult[]

    switch (params.memoryType) {
      case "session": {
        const sessionId = params.metadata?.sessionId as string
        if (!sessionId) {
          throw new MissingParameterError({
            parameter: "metadata.sessionId",
            context: "Session memory requires a sessionId",
          })
        }

        await this.session.addMessage(sessionId, {
          role: (params.metadata?.role as string) ?? "user",
          content: params.content,
          agentId: params.metadata?.agentId as string | undefined,
        })

        results = [{ id: sessionId, type: "session" }]
        break
      }

      case "evolution": {
        const result = await this.evolution.addSkill(params)
        results = [result]
        break
      }

      case "project": {
        // For project memory, we store as a knowledge node
        const id = crypto.randomUUID()
        const kg = await this.project["getKnowledgeGraph"]()

        await kg.addNode({
          type: "memory",
          entity_type: params.metadata?.entityType as string,
          entity_id: params.metadata?.entityId as string,
          title: params.content.slice(0, 100),
          content: params.content,
          metadata: params.metadata,
        })

        results = [{ id, type: "project" }]
        break
      }

      default:
        throw new UnsupportedMemoryTypeError({
          type: params.memoryType as string,
          supportedTypes: ["session", "evolution", "project"],
        })
    }

    // Sync to learning bridge if initialized
    if (this.bridge && results.length > 0) {
      await this.syncToBridge(params, results[0])
    }

    return results
  }

  /**
   * Sync memory to learning bridge
   */
  private async syncToBridge(params: AddMemoryParams, result: AddMemoryResult): Promise<void> {
    if (!this.bridge) return

    try {
      const memoryData = {
        id: result.id,
        type: result.type,
        content: params.content,
        metadata: params.metadata,
        createdAt: Date.now(),
      }

      switch (result.type) {
        case "session":
          await this.bridge.syncSessionMemory(result.id, memoryData)
          break
        case "evolution":
          await this.bridge.syncEvolutionMemory(result.id, memoryData)
          break
        case "project":
          await this.bridge.storeMemory(result.id, params.content, params.metadata ?? {})
          break
      }

      log.debug("memory_synced_to_bridge", { id: result.id, type: result.type })
    } catch (error) {
      log.warn("memory_bridge_sync_failed", { id: result.id, error: String(error) })
    }
  }

  /**
   * Validate add parameters
   * @throws {MissingParameterError} if required parameters are missing
   */
  private validateAddParams(params: AddMemoryParams): void {
    if (!params.memoryType) {
      throw new MissingParameterError({
        parameter: "memoryType",
        context: "Memory type is required for add operation",
      })
    }

    if (!params.content) {
      throw new MissingParameterError({
        parameter: "content",
        context: "Content is required for add operation",
      })
    }
  }

  /**
   * Search for memories across all services
   * @param params - Search parameters
   * @returns Array of matching memory results
   * @throws {ServiceNotInitializedError} if service is not initialized
   */
  async search(params: SearchParams): Promise<MemoryResult[]> {
    this.ensureInitialized()

    const memoryType = params.memoryType ?? "project"

    switch (memoryType) {
      case "session": {
        const sessionId = params.filters?.sessionId as string
        if (!sessionId) {
          throw new MissingParameterError({
            parameter: "filters.sessionId",
            context: "Session search requires a sessionId filter",
          })
        }
        return this.session.searchSession(sessionId, params.query, {
          limit: params.limit,
          useRegex: params.filters?.useRegex as boolean,
        })
      }

      case "evolution": {
        return this.evolution.searchSkills(params.query, params.limit ?? 10)
      }

      case "project": {
        return this.project.searchProject(params.query, params.limit ?? 10)
      }

      default:
        throw new UnsupportedMemoryTypeError({
          type: memoryType,
          supportedTypes: ["session", "evolution", "project"],
        })
    }
  }

  // ========================================================================
  // Session Management Methods
  // ========================================================================

  /**
   * Create a new session
   * @param agentIds - Array of agent IDs
   * @param ttlMinutes - Session TTL in minutes
   * @returns The session ID
   */
  async createSession(agentIds: string[], ttlMinutes?: number): Promise<string> {
    await this.init()
    return this.session.createSession(agentIds, ttlMinutes)
  }

  /**
   * Load a session by ID
   * @param sessionId - The session ID
   * @returns The session data or null
   */
  async loadSession(sessionId: string): Promise<SessionData | null> {
    await this.init()
    return this.session.loadSession(sessionId)
  }

  /**
   * Save session data
   * @param session - The session data to save
   */
  async saveSession(session: SessionData): Promise<void> {
    await this.init()
    return this.session.saveSession(session)
  }

  /**
   * End a session
   * @param sessionId - The session ID
   */
  async endSession(sessionId: string): Promise<void> {
    await this.init()
    return this.session.endSession(sessionId)
  }

  /**
   * Get messages for a session
   * @param sessionId - The session ID
   * @returns Array of session messages
   */
  async getSessionMessages(sessionId: string): Promise<SessionMessage[]> {
    await this.init()
    return this.session.getMessages(sessionId)
  }

  // ========================================================================
  // Project Management Methods
  // ========================================================================

  /**
   * Index a project
   * @param options - Indexing options
   * @returns Statistics about the indexing
   */
  async indexProject(options: IndexProjectOptions): Promise<{ entitiesAdded: number; relationsAdded: number }> {
    await this.init()
    return this.project.indexProject(options)
  }

  /**
   * Index project changes
   * @param changes - Array of file changes
   */
  async indexChanges(changes: Array<{ file: string; type: string; content?: string }>): Promise<void> {
    await this.init()
    return this.project.indexChanges(changes)
  }

  /**
   * Get project memory statistics
   * @returns Project memory statistics
   */
  async getProjectStats(): Promise<{ totalEntities: number; byType: Record<string, number> }> {
    await this.init()
    return this.project.getStats()
  }

  // ========================================================================
  // Cleanup Methods
  // ========================================================================

  /**
   * Clean up expired sessions
   * @returns Number of sessions cleaned up
   */
  async cleanup(): Promise<number> {
    await this.init()
    return this.session.cleanup()
  }

  /**
   * Check if the service is initialized
   * @returns true if initialized
   */
  isInitialized(): boolean {
    return this.initialized
  }

  // ========================================================================
  // Service Accessors
  // ========================================================================

  /**
   * Get the session memory service
   * @returns The session memory service instance
   */
  getSessionService(): SessionMemoryService {
    return this.session
  }

  /**
   * Get the evolution memory service
   * @returns The evolution memory service instance
   */
  getEvolutionService(): EvolutionMemoryService {
    return this.evolution
  }

  /**
   * Get the project memory service
   * @returns The project memory service instance
   */
  getProjectService(): ProjectMemoryService {
    return this.project
  }

  // ========================================================================
  // Unified Memory Methods (from evolution/memory.ts)
  // ========================================================================

  /**
   * Get relevant memories using hybrid search (vector + keyword + temporal decay + MMR)
   * This is the primary method for retrieving contextual memories.
   * @param query - The search query
   * @param options - Search options
   * @returns Array of memory suggestions sorted by relevance
   */
  async getRelevantMemories(
    query: string,
    options: {
      projectDir?: string
      limit?: number
      types?: Array<"session" | "evolution" | "project">
    } = {},
  ): Promise<MemorySuggestion[]> {
    const projectDir = options.projectDir ?? Instance.directory
    const limit = options.limit ?? 5
    const allMemories = await getMemories(projectDir)

    if (allMemories.length === 0) return []

    const taskWords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2)

    // Vector search
    let vectorResults: Array<{ key: string; value: string; score: number }> = []
    try {
      const vs = await getSharedVectorStore()
      const vecSearchResults = await vs.search(query, { limit: 20, min_similarity: 0.1 })

      for (const r of vecSearchResults) {
        const memory = allMemories.find((m) => m.id === r.id || m.key === r.entity_title)
        if (memory) {
          vectorResults.push({ key: memory.key, value: memory.value, score: r.similarity })
        }
      }
    } catch (error) {
      log.warn("vector_search_failed", { error: String(error) })
    }

    // Keyword matching with temporal decay
    const keywordResults = allMemories
      .map((memory) => {
        const keywordMatches = taskWords.filter(
          (word) => memory.key.toLowerCase().includes(word) || memory.value.toLowerCase().includes(word),
        ).length

        const temporalScore = MemoryService.calculateTemporalDecay(memory.lastUsedAt)
        const usageBoost = Math.log10(memory.usageCount + 1) * 0.1

        return { key: memory.key, value: memory.value, score: keywordMatches * temporalScore + usageBoost }
      })
      .filter((m) => m.score > 0)

    // Merge results
    const mergedMap = new Map<string, { key: string; value: string; score: number }>()
    for (const r of vectorResults) {
      mergedMap.set(r.key, { ...r, score: r.score * 1.5 })
    }
    for (const r of keywordResults) {
      const existing = mergedMap.get(r.key)
      if (!existing || r.score > existing.score) {
        mergedMap.set(r.key, r)
      }
    }

    const mergedResults = Array.from(mergedMap.values()).sort((a, b) => b.score - a.score)
    const diverseResults = MemoryService.mmrReRank(mergedResults)

    // Update usage stats
    for (const result of diverseResults.slice(0, limit)) {
      const memory = allMemories.find((m) => m.key === result.key)
      if (memory) {
        incrementMemoryUsage(projectDir, memory.id).catch((e) =>
          log.warn("failed_to_increment_usage", { error: String(e) }),
        )
      }
    }

    return diverseResults.slice(0, limit)
  }

  /**
   * Extract memories from a task using LLM
   * @param params - Extraction parameters
   * @returns Array of extracted memories
   */
  async extractMemoriesWithLLM(params: {
    projectDir?: string
    sessionID: string
    task: string
    toolCalls: string[]
    outcome: string
    modelProviderID: string
    modelID: string
  }): Promise<ExtractedMemory[]> {
    const projectDir = params.projectDir ?? Instance.directory
    const memories: ExtractedMemory[] = []
    let modelKey = ""
    let hasLanguageModel = false

    try {
      const model = await Provider.getModel(params.modelProviderID, params.modelID)
      modelKey = `${params.modelProviderID}/${params.modelID}`
      const languageModel = await Provider.getLanguage(model)
      hasLanguageModel = !!languageModel

      const prompt = MEMORY_EXTRACTION_PROMPT.replace("{task}", params.task.slice(0, 500))
        .replace("{toolCalls}", params.toolCalls.slice(0, 20).join(", "))
        .replace("{outcome}", params.outcome)

      const result = await generateObject({
        model: languageModel,
        system: "You are a helpful assistant that extracts key learnings from development tasks.",
        prompt,
        schema: z.object({
          memories: z.array(
            z.object({
              key: z.string(),
              value: z.string(),
            }),
          ),
        }),
      })

      const extractedArray = result.object?.memories ?? []
      if (extractedArray.length === 0) {
        log.info("No memories extracted - model returned empty", { modelKey })
      }

      for (const item of extractedArray) {
        if (item.key && item.value) {
          const newMemory = await saveMemory(projectDir, {
            key: item.key,
            value: item.value,
            context: params.task,
            sessionIDs: [params.sessionID],
          })

          const vs = await getSharedVectorStore()
          try {
            await vs.store({
              node_type: "memory",
              node_id: newMemory.id,
              entity_title: `${item.key}: ${item.value}`,
              vector_type: "content",
              metadata: { key: item.key, value: item.value },
            })
          } catch (vectorError) {
            if (vectorError instanceof Error && vectorError.name === "VectorDimensionMismatchError") {
              log.warn("Skipping vector storage due to dimension mismatch", {
                key: item.key,
                error: vectorError.message,
              })
            } else {
              throw vectorError
            }
          }

          memories.push({ key: item.key, value: item.value })
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === "VectorDimensionMismatchError") {
        log.warn("Memory extraction skipped vector storage due to dimension mismatch", {
          providerID: params.modelProviderID,
          modelID: params.modelID,
        })
      } else {
        log.error("Failed to extract memories with LLM", {
          error: String(error),
          providerID: params.modelProviderID,
          modelID: params.modelID,
          modelKey,
          hasLanguageModel,
        })
      }
    }

    if (memories.length > 0) {
      log.info("Extracted memories", { count: memories.length, keys: memories.map((m) => m.key) })
      try {
        Bus.publish(TuiEvent.MemoryConfirm, { sessionID: params.sessionID, memories })
      } catch (e) {
        log.warn("Failed to publish memory confirm event", { error: String(e) })
      }
    }

    return memories
  }

  /**
   * Extract memories using pattern matching
   * @param params - Extraction parameters
   */
  async extractMemories(params: {
    projectDir?: string
    sessionID: string
    task: string
    toolCalls: string[]
  }): Promise<void> {
    const projectDir = params.projectDir ?? Instance.directory
    const patterns = await MemoryService.loadMemoryPatterns()
    const existingMemories = await getMemories(projectDir)

    const combinedText = `${params.task} ${params.toolCalls.join(" ")}`.toLowerCase()

    for (const pattern of patterns) {
      const keywordRegex = new RegExp(pattern.keywords.join("|"), "i")
      if (keywordRegex.test(combinedText)) {
        const existing = existingMemories.find((m) => m.key === pattern.key)

        if (existing) {
          if (!existing.sessionIDs.includes(params.sessionID)) {
            existing.sessionIDs.push(params.sessionID)
            log.info("Memory already exists, updated sessionIDs", { key: pattern.key, sessionID: params.sessionID })
          }
        } else {
          const newMemory = await saveMemory(projectDir, {
            key: pattern.key,
            value: pattern.value,
            context: params.task,
            sessionIDs: [params.sessionID],
          })

          const vs = await getSharedVectorStore()
          await vs.store({
            node_type: "memory",
            node_id: newMemory.id,
            entity_title: `${pattern.key}: ${pattern.value}`,
            vector_type: "content",
            metadata: { key: pattern.key, value: pattern.value },
          })

          log.info("Saved new memory from pattern", { key: pattern.key })
        }
      }
    }
  }

  // ========================================================================
  // Static Helper Methods
  // ========================================================================

  /** Temporal decay lambda (~1% per day) */
  private static readonly TEMPORAL_DECAY_LAMBDA = 0.00001

  /** MMR lambda for re-ranking */
  private static readonly MMR_LAMBDA = 0.5

  /** Calculate temporal decay score */
  private static calculateTemporalDecay(lastUsedAt: number): number {
    const age = Date.now() - lastUsedAt
    return Math.exp(-MemoryService.TEMPORAL_DECAY_LAMBDA * age)
  }

  /** MMR re-ranking for diversity */
  private static mmrReRank(
    items: Array<{ key: string; value: string; score: number }>,
  ): Array<{ key: string; value: string; relevance: number }> {
    if (items.length <= 1) {
      return items.map((i) => ({ key: i.key, value: i.value, relevance: i.score }))
    }

    const selected: Array<{ key: string; value: string; relevance: number }> = []
    const remaining = [...items]

    remaining.sort((a, b) => b.score - a.score)
    const first = remaining.shift()!
    selected.push({ key: first.key, value: first.value, relevance: first.score })

    while (remaining.length > 0) {
      let bestIdx = -1
      let bestMmr = -Infinity

      for (let i = 0; i < remaining.length; i++) {
        const item = remaining[i]
        let maxSimilarity = 0

        for (const sel of selected) {
          const selWords = new Set(sel.key.toLowerCase().split(/\W+/))
          const itemWords = new Set(item.key.toLowerCase().split(/\W+/))
          const intersection = [...selWords].filter((w) => itemWords.has(w) && w.length > 2).length
          const union = selWords.size + itemWords.size - intersection
          const similarity = union > 0 ? intersection / union : 0
          maxSimilarity = Math.max(maxSimilarity, similarity)
        }

        const mmr = MemoryService.MMR_LAMBDA * item.score - (1 - MemoryService.MMR_LAMBDA) * maxSimilarity
        if (mmr > bestMmr) {
          bestMmr = mmr
          bestIdx = i
        }
      }

      if (bestIdx >= 0) {
        const selectedItem = remaining.splice(bestIdx, 1)[0]
        selected.push({ key: selectedItem.key, value: selectedItem.value, relevance: selectedItem.score })
      }
    }

    return selected
  }

  /** Memory patterns cache */
  private static memoryPatterns: MemoryPatternConfig[] = []

  /** Load memory patterns from config or use defaults */
  private static async loadMemoryPatterns(): Promise<MemoryPatternConfig[]> {
    if (MemoryService.memoryPatterns.length > 0) return MemoryService.memoryPatterns

    try {
      const configPath = resolve(__dirname, "../evolution/memory-patterns.json")
      const content = await readFile(configPath, "utf-8")
      const config: MemoryPatternsFile = JSON.parse(content)
      MemoryService.memoryPatterns = config.patterns
    } catch {
      MemoryService.memoryPatterns = [
        {
          keywords: ["typescript", "tsconfig", "type annotation"],
          key: "typescript-tips",
          value: "Use explicit type annotations",
        },
        { keywords: ["test", "testing", "jest", "vitest"], key: "testing-approach", value: "Write tests first (TDD)" },
        {
          keywords: ["refactor", "clean", "improve"],
          key: "refactoring-guidance",
          value: "Make small, incremental changes",
        },
        {
          keywords: ["error", "bug", "fix", "issue"],
          key: "debugging-tips",
          value: "Start with minimal reproduction case",
        },
      ]
    }
    return MemoryService.memoryPatterns
  }
}

/**
 * Singleton instance of MemoryService
 */
export const Memory = new MemoryService()
