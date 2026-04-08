/**
 * SQLite-vec implementation of the VectorStore interface
 *
 * Uses the sqlite-vec extension for fast vector similarity search.
 * Falls back to text-based search when the extension is not available.
 */

import { Database, getConfiguredEmbeddingDim, validateVectorDimensions, storeEmbeddingDim } from "../storage/db"
import { vector_memory, vector_sync_meta } from "./learning.sql"
import { knowledge_nodes } from "./knowledge-graph"
import { eq, sql, and } from "drizzle-orm"
import { Log } from "../util/log"
import { NamedError } from "@opencode-ai/util/error"
import z from "zod"
import type {
  IVectorStore,
  VectorEntry,
  SearchResult,
  SearchOptions,
  VectorStats,
  VectorStoreConfig,
  VectorType,
  EmbeddingModel,
  EmbeddingGenerator,
} from "./vector-store-interface"
import { EmbeddingService } from "./embedding-service"

const log = Log.create({ service: "sqlite-vec-store" })

// [ENH] Dimension mismatch error
export const VectorDimensionMismatchError = NamedError.create(
  "VectorDimensionMismatchError",
  z.object({
    provided: z.number(),
    expected: z.number(),
  }),
)

/**
 * SQLite-vec implementation of IVectorStore
 */
export class SqliteVecStore implements IVectorStore {
  private config: VectorStoreConfig
  private vecTableInitialized: boolean = false
  private ftsTableInitialized: boolean = false
  private initialized: boolean = false
  private readonly SYNC_VERSION = 1
  // [ENH] Cache for configured embedding dimension
  private configuredDim: number

  constructor(config: VectorStoreConfig = {}) {
    // [ENH] Get configured dimension from db.ts (uses database stored dimension)
    // Environment variable support removed - use opencode.jsonc instead
    const sqlite = Database.raw()
    let validatedDim = validateVectorDimensions(sqlite, log)

    // [ENH] Check if config file has explicit dimension setting
    // If so, override the database stored dimension
    try {
      // Read config file directly (synchronous)
      const fs = require("fs")
      const path = require("path")
      const os = require("os")

      // Try to find opencode.jsonc in common locations
      const configPaths = [
        path.join(process.cwd(), "opencode.jsonc"),
        path.join(process.cwd(), "opencode.json"),
        path.join(os.homedir(), ".config", "opencode", "opencode.jsonc"),
        path.join(os.homedir(), ".opencode", "opencode.jsonc"),
      ]

      for (const configPath of configPaths) {
        if (fs.existsSync(configPath)) {
          const content = fs.readFileSync(configPath, "utf-8")
          // Simple JSON parsing (won't handle comments, but good enough for dimension check)
          try {
            const config = JSON.parse(content.replace(/\/\/.*$/gm, "").replace(/,\s*}/g, "}"))
            if (config.embedding?.dimensions) {
              const configDim = config.embedding.dimensions
              if (configDim !== validatedDim) {
                log.info("vector_dimension_overriding_from_config", {
                  storedDimension: validatedDim,
                  configuredDimension: configDim,
                  path: configPath,
                })
                validatedDim = configDim
                storeEmbeddingDim(sqlite, validatedDim)
              }
              break
            }
          } catch (parseError) {
            log.debug("config_parse_failed", { path: configPath, error: String(parseError) })
          }
        }
      }
    } catch (error) {
      log.debug("vector_dimension_config_check_failed", { error: String(error) })
    }

    this.config = {
      defaultModel: config.defaultModel ?? "simple",
      defaultDimensions: config.defaultDimensions ?? validatedDim,
      initializeVecTable: config.initializeVecTable ?? true,
      embeddingGenerator: config.embeddingGenerator,
    }
    this.configuredDim = validatedDim
  }

  /**
   * Create a VectorStore with automatic embedding model configuration
   *
   * @param modelConfig - Embedding model configuration (model ID or full config)
   * @param storeConfig - Additional VectorStore configuration
   * @returns SqliteVecStore instance with configured embedding generator
   *
   * @example
   * // Using config file (recommended)
   * // Configure in opencode.jsonc:
   * // { "embedding": { "provider": "dashscope", "model": "text-embedding-v4", "apiKey": "sk-..." } }
   * const store = await SqliteVecStore.withEmbeddingModel("dashscope/text-embedding-v4")
   *
   * // Using custom configuration
   * const store = await SqliteVecStore.withEmbeddingModel({
   *   modelId: "dashscope/text-embedding-v4",
   *   apiKey: "sk-...", // Use your API key from config file
   *   dimensions: 1536,
   * })
   */
  static async withEmbeddingModel(
    modelConfig: string | EmbeddingService.EmbeddingModelConfig,
    storeConfig: Omit<VectorStoreConfig, "embeddingGenerator" | "defaultDimensions"> = {},
  ): Promise<SqliteVecStore> {
    // Normalize config
    const config: EmbeddingService.EmbeddingModelConfig =
      typeof modelConfig === "string" ? { modelId: modelConfig } : modelConfig

    // Create service with auto-configuration
    const { generator, dimensions } = await EmbeddingService.createService(config)

    return new SqliteVecStore({
      ...storeConfig,
      embeddingGenerator: generator,
      defaultDimensions: dimensions,
    })
  }

  async init(): Promise<void> {
    if (this.initialized) return

    try {
      if (this.config.initializeVecTable) {
        await this.ensureVecTable()
      }
      // [ENH] Initialize FTS5 table for fallback search acceleration
      await this.ensureFtsTable()
    } catch (error) {
      log.warn("vec_table_init_failed", { error: String(error) })
    }

    if (this.vecTableInitialized) {
      await this.maybeSync()
    }

    this.initialized = true
  }

  isInitialized(): boolean {
    return this.initialized
  }

  private async ensureVecTable(): Promise<void> {
    if (this.vecTableInitialized) return

    const sqlite = Database.raw()
    try {
      sqlite.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS vec_vector_memory USING vec0(
          id TEXT,
          embedding float[${this.config.defaultDimensions}]
        )
      `)
      this.vecTableInitialized = true
      log.info("vec_table_created")
    } catch (error) {
      log.warn("vec_table_not_available", {
        error: error instanceof Error ? error.message : String(error),
        note: "Vector search will use text-based fallback",
      })
    }
  }

  // [ENH] FTS5 table for fallback search acceleration
  private async ensureFtsTable(): Promise<void> {
    if (this.ftsTableInitialized) return

    const sqlite = Database.raw()
    try {
      // Create FTS5 virtual table for full-text search on entity_title
      sqlite.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS vector_memory_fts USING fts5(
          entity_title,
          content='vector_memory',
          content_rowid='rowid'
        )
      `)

      // Create triggers to keep FTS index in sync
      sqlite.exec(`
        CREATE TRIGGER IF NOT EXISTS vector_memory_fts_insert AFTER INSERT ON vector_memory BEGIN
          INSERT INTO vector_memory_fts(rowid, entity_title) VALUES (new.rowid, new.entity_title);
        END
      `)

      sqlite.exec(`
        CREATE TRIGGER IF NOT EXISTS vector_memory_fts_delete AFTER DELETE ON vector_memory BEGIN
          INSERT INTO vector_memory_fts(vector_memory_fts, rowid, entity_title) 
          VALUES('delete', old.rowid, old.entity_title);
        END
      `)

      sqlite.exec(`
        CREATE TRIGGER IF NOT EXISTS vector_memory_fts_update AFTER UPDATE ON vector_memory BEGIN
          INSERT INTO vector_memory_fts(vector_memory_fts, rowid, entity_title) 
          VALUES('delete', old.rowid, old.entity_title);
          INSERT INTO vector_memory_fts(rowid, entity_title) VALUES (new.rowid, new.entity_title);
        END
      `)

      this.ftsTableInitialized = true
      log.info("fts_table_created")
    } catch (error) {
      log.warn("fts_table_not_available", {
        error: error instanceof Error ? error.message : String(error),
        note: "Fallback search will use full table scan",
      })
    }
  }

  private async maybeSync(): Promise<void> {
    const needsSync = Database.use((db) => {
      const nodesCount = db
        .select({ count: sql<number>`count(*)` })
        .from(knowledge_nodes)
        .get() as { count: number } | undefined
      const totalNodes = nodesCount?.count ?? 0

      if (totalNodes === 0) return false

      const syncMeta = db.select().from(vector_sync_meta).where(eq(vector_sync_meta.id, "sync_state")).get()

      if (!syncMeta) return true

      if (syncMeta.sync_version !== this.SYNC_VERSION) {
        log.info("sync_version_mismatch", { stored: syncMeta.sync_version, current: this.SYNC_VERSION })
        return true
      }

      if (syncMeta.nodes_synced_count !== totalNodes) {
        log.info("node_count_mismatch", { synced: syncMeta.nodes_synced_count, total: totalNodes })
        return true
      }

      return false
    })

    if (needsSync) {
      log.info("starting_knowledge_nodes_sync")
      const result = await this.syncKnowledgeNodes()
      log.info("sync_complete", result)

      const cleanupResult = await this.cleanupOrphanedVectors()
      if (cleanupResult.removed > 0) {
        log.info("cleanup_after_sync", cleanupResult)
      }
    }
  }

  private async updateSyncMeta(syncedCount: number): Promise<void> {
    const now = Date.now()
    Database.use((db) => {
      db.insert(vector_sync_meta)
        .values({
          id: "sync_state",
          sync_version: this.SYNC_VERSION,
          last_synced_at: now,
          nodes_synced_count: syncedCount,
        })
        .onConflictDoUpdate({
          target: vector_sync_meta.id,
          set: {
            sync_version: this.SYNC_VERSION,
            last_synced_at: now,
            nodes_synced_count: syncedCount,
          },
        })
    })
  }

  async store(entry: Omit<VectorEntry, "id">): Promise<string> {
    if (!this.initialized) await this.init()

    // [ENH] Dimension validation - use configured dimension from db.ts
    const embedding = entry.embedding ?? (await this.generateEmbedding(entry.entity_title, entry.vector_type))
    const expectedDim = this.configuredDim

    if (embedding.length !== expectedDim) {
      throw new VectorDimensionMismatchError({
        provided: embedding.length,
        expected: expectedDim,
      })
    }

    const id = crypto.randomUUID()
    const embeddingJson = JSON.stringify(Array.from(embedding))
    const now = Date.now()

    Database.use((db) => {
      db.insert(vector_memory).values({
        id,
        node_type: entry.node_type,
        node_id: entry.node_id,
        entity_title: entry.entity_title,
        vector_type: entry.vector_type,
        embedding: embeddingJson,
        model: entry.model ?? this.config.defaultModel!,
        dimensions: embedding.length,
        metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
        // [ENH] TTL: Store expiration timestamp if provided
        expires_at: entry.expires_at ? entry.expires_at.getTime() : null,
        time_created: now,
        time_updated: now,
      })
    })

    // [SYNC] Auto-sync to knowledge_node for graph-based queries
    this.syncToKnowledgeNode(id, entry, embeddingJson, now)

    if (this.vecTableInitialized) {
      const sqlite = Database.raw()
      sqlite.prepare("INSERT INTO vec_vector_memory(id, embedding) VALUES (?, vec_f32(?))").run(id, embeddingJson)
    }

    log.info("vector_stored", {
      id,
      node_type: entry.node_type,
      vector_type: entry.vector_type,
      dimensions: embedding.length,
    })
    return id
  }

  /**
   * [SYNC] Sync vector entry to knowledge_node table for graph queries
   * This ensures both vector search and graph traversal work on the same data
   */
  private syncToKnowledgeNode(id: string, entry: Omit<VectorEntry, "id">, embeddingJson: string, now: number): void {
    // Map node_type to KnowledgeGraph NodeType
    const nodeType = this.mapNodeType(entry.node_type)

    Database.use((db) => {
      db.insert(knowledge_nodes)
        .values({
          id,
          type: nodeType,
          entity_type: entry.node_type,
          entity_id: entry.node_id,
          title: entry.entity_title,
          content: "",
          embedding: embeddingJson,
          metadata: JSON.stringify({
            vector_type: entry.vector_type,
            model: entry.model ?? this.config.defaultModel,
            dimensions: embeddingJson ? JSON.parse(embeddingJson).length : 0,
            ...entry.metadata,
          }),
          memory_type: this.inferMemoryType(entry.node_type),
          time_created: now,
          time_updated: now,
        })
        .onConflictDoNothing()
        .run()
    })
  }

  /**
   * [SYNC] Map vector_memory node_type to knowledge_node type
   */
  private mapNodeType(nodeType: string): string {
    const typeMap: Record<string, string> = {
      module: "file",
      file: "file",
      project_file: "file",
      skill: "skill",
      memory: "memory",
      constraint: "constraint",
      agenda: "agenda",
      code_entity: "code_entity",
    }
    return typeMap[nodeType] ?? "memory"
  }

  /**
   * [SYNC] Infer memory_type from node_type
   */
  private inferMemoryType(nodeType: string): string | null {
    const memoryTypeMap: Record<string, string> = {
      module: "project",
      file: "project",
      project_file: "project",
      skill: "evolution",
      memory: "session",
      constraint: "project",
      agenda: "evolution",
      code_entity: "project",
    }
    return memoryTypeMap[nodeType] ?? null
  }

  async storeBatch(entries: Omit<VectorEntry, "id">[]): Promise<string[]> {
    const ids: string[] = []
    for (const entry of entries) {
      const id = await this.store(entry)
      ids.push(id)
    }
    return ids
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    if (!this.initialized) await this.init()

    const vecResults = this.vecTableInitialized ? await this.searchVec(query, options) : []
    const fallbackResults = await this.searchFallback(query, {
      ...options,
      limit: options.limit ? options.limit * 2 : 20,
    })

    const merged = new Map<string, SearchResult>()

    for (const r of vecResults) {
      merged.set(r.id, { ...r, source: "vec" })
    }

    for (const r of fallbackResults) {
      if (!merged.has(r.id)) {
        merged.set(r.id, { ...r, source: "fallback" })
      }
    }

    const results = Array.from(merged.values())
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, options.limit ?? 10)

    log.info("vector_search_combined", {
      query: query.slice(0, 50),
      total: results.length,
      from_vec: vecResults.length,
      from_fallback: fallbackResults.length,
    })

    return results
  }

  private async searchVec(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const limit = options.limit ?? 10
    const minSimilarity = options.min_similarity ?? 0.3
    const now = Date.now()

    const queryEmbedding = await this.generateEmbedding(query, "content")
    const embeddingJson = JSON.stringify(Array.from(queryEmbedding))

    const sqlite = Database.raw()
    const vecResults = sqlite
      .prepare(
        `
        SELECT id, vec_distance_cosine(embedding, vec_f32(?)) as distance
        FROM vec_vector_memory
        WHERE id IS NOT NULL
        ORDER BY distance ASC
        LIMIT ?
      `,
      )
      .all(embeddingJson, limit * 2) as { id: string; distance: number }[]

    const results: SearchResult[] = []
    for (const vec of vecResults) {
      if (vec.distance === null) continue
      const similarity = 1 - vec.distance
      if (similarity < minSimilarity) continue

      const row = Database.use((db) =>
        db
          .select({
            id: vector_memory.id,
            node_type: vector_memory.node_type,
            node_id: vector_memory.node_id,
            entity_title: vector_memory.entity_title,
            metadata: vector_memory.metadata,
            expires_at: vector_memory.expires_at,
          })
          .from(vector_memory)
          .where(
            and(
              eq(vector_memory.id, vec.id),
              // [ENH] TTL: Exclude expired entries
              sql`(${vector_memory.expires_at} IS NULL OR ${vector_memory.expires_at} > ${now})`,
            ),
          )
          .get(),
      ) as any

      // Skip if not found or expired
      if (!row) continue

      results.push({
        id: row.id,
        node_type: row.node_type,
        node_id: row.node_id,
        entity_title: row.entity_title,
        similarity,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      })

      if (results.length >= limit) break
    }

    return results
  }

  private async searchFallback(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const limit = options.limit ?? 10
    const minSimilarity = options.min_similarity ?? 0.3
    const now = Date.now()

    // [ENH] Try FTS5 search first for better performance
    if (this.ftsTableInitialized) {
      try {
        const ftsResults = await this.searchFts(query, options)
        if (ftsResults.length > 0) {
          return ftsResults
        }
        // FTS returned no results, fall through to full scan
      } catch (error) {
        log.debug("fts_search_failed_falling_back", { error: String(error) })
      }
    }

    // Full table scan fallback (original behavior)
    let queryBuilder = Database.use((db) =>
      db
        .select({
          id: knowledge_nodes.id,
          type: knowledge_nodes.type,
          entity_type: knowledge_nodes.entity_type,
          entity_id: knowledge_nodes.entity_id,
          title: knowledge_nodes.title,
          content: knowledge_nodes.content,
          embedding: knowledge_nodes.embedding,
          metadata: knowledge_nodes.metadata,
        })
        .from(knowledge_nodes),
    )

    if (options.node_type) {
      queryBuilder = queryBuilder.where(eq(knowledge_nodes.type, options.node_type)) as any
    }

    const results = queryBuilder.all() as any[]
    const queryEmbedding = await this.generateEmbedding(query, "content")

    const scored = results
      .map((row) => {
        let similarity = 0
        if (row.embedding) {
          try {
            const storedEmbedding = new Float32Array(JSON.parse(row.embedding))
            similarity = this.cosineSimilarity(queryEmbedding, storedEmbedding)
          } catch {
            similarity = this.textSimilarity(query.toLowerCase(), `${row.title} ${row.content || ""}`.toLowerCase())
          }
        } else {
          similarity = this.textSimilarity(query.toLowerCase(), `${row.title} ${row.content || ""}`.toLowerCase())
        }

        return {
          id: row.id,
          node_type: row.type,
          node_id: row.entity_id,
          entity_title: row.title,
          similarity,
          metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        }
      })
      .filter((r) => r.similarity >= minSimilarity)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)

    return scored
  }

  // [ENH] FTS5-based search for better fallback performance
  private async searchFts(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const limit = options.limit ?? 10
    const minSimilarity = options.min_similarity ?? 0.3
    const now = Date.now()

    const sqlite = Database.raw()

    // Escape special FTS5 characters and build search query
    const searchTerms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 1)
      .join(" OR ")
    if (!searchTerms) return []

    // Query FTS table for matching titles
    const ftsMatches = sqlite
      .prepare(
        `
      SELECT rowid, entity_title
      FROM vector_memory_fts
      WHERE vector_memory_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `,
      )
      .all(searchTerms, limit * 2) as { rowid: number; entity_title: string }[]

    if (ftsMatches.length === 0) return []

    // Get full records from vector_memory, filtering expired entries
    const results: SearchResult[] = []
    for (const match of ftsMatches) {
      const row = Database.use((db) =>
        db
          .select({
            id: vector_memory.id,
            node_type: vector_memory.node_type,
            node_id: vector_memory.node_id,
            entity_title: vector_memory.entity_title,
            embedding: vector_memory.embedding,
            metadata: vector_memory.metadata,
            expires_at: vector_memory.expires_at,
          })
          .from(vector_memory)
          .where(
            and(
              eq(vector_memory.id, match.rowid.toString()),
              // [ENH] TTL: Exclude expired entries
              sql`(${vector_memory.expires_at} IS NULL OR ${vector_memory.expires_at} > ${now})`,
            ),
          )
          .get(),
      ) as any

      if (row) {
        // Calculate similarity for ranking
        let similarity = minSimilarity
        if (row.embedding) {
          try {
            const storedEmbedding = new Float32Array(JSON.parse(row.embedding))
            const queryEmbedding = await this.generateEmbedding(query, "content")
            similarity = this.cosineSimilarity(queryEmbedding, storedEmbedding)
          } catch {
            // Use text similarity as fallback
            similarity = this.textSimilarity(query.toLowerCase(), row.entity_title.toLowerCase())
          }
        }

        if (similarity >= minSimilarity) {
          results.push({
            id: row.id,
            node_type: row.node_type,
            node_id: row.node_id,
            entity_title: row.entity_title,
            similarity,
            metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
          })
        }
      }

      if (results.length >= limit) break
    }

    return results.sort((a, b) => b.similarity - a.similarity)
  }

  async getById(id: string): Promise<VectorEntry | null> {
    const row = Database.use((db) => db.select().from(vector_memory).where(eq(vector_memory.id, id)).get())

    if (!row) return null

    return {
      id: row.id,
      node_type: row.node_type,
      node_id: row.node_id,
      entity_title: row.entity_title,
      vector_type: row.vector_type as VectorType,
      embedding: new Float32Array(JSON.parse(row.embedding)),
      model: row.model as EmbeddingModel,
      dimensions: row.dimensions,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    }
  }

  async deleteById(id: string): Promise<void> {
    Database.use((db) => db.delete(vector_memory).where(eq(vector_memory.id, id)))

    if (this.vecTableInitialized) {
      const sqlite = Database.raw()
      sqlite.prepare("DELETE FROM vec_vector_memory WHERE id = ?").run(id)
    }

    log.info("vector_deleted", { id })
  }

  async deleteByNodeId(nodeId: string): Promise<void> {
    await this.deleteById(nodeId)
  }

  async getStats(): Promise<VectorStats> {
    const now = Date.now()

    // [ENH] TTL: Count all vectors and expired vectors
    const all = Database.use((db) =>
      db
        .select({
          vector_type: vector_memory.vector_type,
          model: vector_memory.model,
          expires_at: vector_memory.expires_at,
        })
        .from(vector_memory)
        .all(),
    )

    const by_type: Record<string, number> = {}
    const by_model: Record<string, number> = {}
    let expired_count = 0

    for (const v of all) {
      // [ENH] TTL: Count expired vectors
      if (v.expires_at && v.expires_at < now) {
        expired_count++
      } else {
        by_type[v.vector_type] = (by_type[v.vector_type] || 0) + 1
        by_model[v.model] = (by_model[v.model] || 0) + 1
      }
    }

    return {
      total_vectors: all.length - expired_count,
      by_type,
      by_model,
      expired_vectors: expired_count,
    }
  }

  async clear(): Promise<void> {
    Database.use((db) => {
      db.delete(vector_memory)
      // [SYNC] Also clear knowledge_nodes for consistency
      db.delete(knowledge_nodes)
    })

    if (this.vecTableInitialized) {
      const sqlite = Database.raw()
      sqlite.exec("DELETE FROM vec_vector_memory")
    }

    log.info("vector_store_cleared")
  }

  getConfig(): VectorStoreConfig {
    return { ...this.config }
  }

  setConfig(config: Partial<VectorStoreConfig>): void {
    this.config = { ...this.config, ...config }
  }

  async syncKnowledgeNodes(): Promise<{ synced: number; skipped: number }> {
    const nodes = Database.use((db) => db.select().from(knowledge_nodes).all()) as {
      id: string
      type: string
      entity_type: string
      entity_id: string
      title: string
      content: string | null
      embedding: string | null
    }[]

    if (nodes.length === 0) {
      await this.updateSyncMeta(0)
      return { synced: 0, skipped: 0 }
    }

    const existingIds = new Set(
      Database.use((db) => db.select({ id: vector_memory.id }).from(vector_memory).all()).map((r) => r.id),
    )

    const nodesToSync: typeof nodes = []
    let skipped = 0

    for (const node of nodes) {
      if (existingIds.has(node.id)) {
        skipped++
      } else {
        nodesToSync.push(node)
      }
    }

    if (nodesToSync.length === 0) {
      await this.updateSyncMeta(nodes.length)
      return { synced: 0, skipped }
    }

    const BATCH_SIZE = 50
    const sqlite = Database.raw()

    for (let i = 0; i < nodesToSync.length; i += BATCH_SIZE) {
      const batch = nodesToSync.slice(i, i + BATCH_SIZE)
      const now = Date.now()

      const vectorMemoryValues = batch.map((node) => {
        let embedding: Float32Array
        if (node.embedding) {
          try {
            embedding = new Float32Array(JSON.parse(node.embedding))
          } catch {
            embedding = this.simpleEmbedding(`${node.title} ${node.content || ""}`)
          }
        } else {
          embedding = this.simpleEmbedding(`${node.title} ${node.content || ""}`)
        }

        return {
          id: node.id,
          node_type: node.type,
          node_id: node.entity_id,
          entity_title: node.title,
          vector_type: "content" as const,
          embedding: JSON.stringify(Array.from(embedding)),
          model: this.config.defaultModel!,
          dimensions: embedding.length,
          metadata: null,
          time_created: now,
          time_updated: now,
        }
      })

      Database.use((db) => {
        db.transaction(() => {
          for (const values of vectorMemoryValues) {
            db.insert(vector_memory).values(values)
          }
        })
      })

      if (this.vecTableInitialized) {
        const insertStmt = sqlite.prepare("INSERT INTO vec_vector_memory(id, embedding) VALUES (?, vec_f32(?))")
        for (const values of vectorMemoryValues) {
          insertStmt.run(values.id, values.embedding)
        }
      }
    }

    await this.updateSyncMeta(nodes.length)

    log.info("knowledge_nodes_synced", { synced: nodesToSync.length, skipped })
    return { synced: nodesToSync.length, skipped }
  }

  /**
   * Migrate vector_memory data to knowledge_node table
   * Note: Edge generation is handled by Memory.indexProject() for proper AST analysis
   *
   * @returns Statistics about the migration
   */
  async migrateToKnowledgeGraph(): Promise<{
    nodesMigrated: number
    edgesCreated: number
    errors: string[]
  }> {
    const errors: string[] = []
    let nodesMigrated = 0

    const now = Date.now()

    // Migrate vector_memory -> knowledge_node
    try {
      const existingNodeIds = new Set(
        Database.use((db) => db.select({ id: knowledge_nodes.id }).from(knowledge_nodes).all()).map((r) => r.id),
      )

      const vectorsToMigrate = Database.use((db) => db.select().from(vector_memory).all()).filter(
        (v) => !existingNodeIds.has(v.id),
      )

      for (const v of vectorsToMigrate) {
        const nodeType = this.mapNodeType(v.node_type)
        const memoryType = this.inferMemoryType(v.node_type)

        Database.use((db) => {
          db.insert(knowledge_nodes)
            .values({
              id: v.id,
              type: nodeType,
              entity_type: v.node_type,
              entity_id: v.node_id,
              title: v.entity_title,
              content: v.metadata ?? "",
              embedding: v.embedding,
              metadata: JSON.stringify({
                vector_type: v.vector_type,
                model: v.model,
                dimensions: v.dimensions,
              }),
              memory_type: memoryType,
              time_created: v.time_created ?? now,
              time_updated: v.time_updated ?? now,
            })
            .onConflictDoNothing()
            .run()
        })
        nodesMigrated++
      }

      log.info("migrated_vector_to_knowledge_node", { count: nodesMigrated })
    } catch (error) {
      errors.push(`Failed to migrate nodes: ${error instanceof Error ? error.message : String(error)}`)
    }

    // Note: Edges are generated by Memory.indexProject() via AST analysis
    // This provides more accurate relationships (imports, calls) instead of path-based inference
    return { nodesMigrated, edgesCreated: 0, errors }
  }

  async cleanupOrphanedVectors(): Promise<{ removed: number }> {
    const vectorIds = new Set(
      Database.use((db) => db.select({ id: vector_memory.id }).from(vector_memory).all()).map((r) => r.id),
    )

    const nodeIds = new Set(
      Database.use((db) => db.select({ id: knowledge_nodes.id }).from(knowledge_nodes).all()).map((r) => r.id),
    )

    const orphanedIds = [...vectorIds].filter((id) => !nodeIds.has(id))

    if (orphanedIds.length === 0) return { removed: 0 }

    const sqlite = Database.raw()

    if (this.vecTableInitialized) {
      const deleteStmt = sqlite.prepare("DELETE FROM vec_vector_memory WHERE rowid = ?")
      for (const id of orphanedIds) {
        deleteStmt.run(id)
      }
    }

    Database.use((db) => {
      db.delete(vector_memory).where(sql`${vector_memory.id} IN (${orphanedIds.map((id) => sql`${id}`)})`)
    })

    await this.updateSyncMeta(nodeIds.size)

    log.info("orphaned_vectors_cleaned", { removed: orphanedIds.length })
    return { removed: orphanedIds.length }
  }

  // [ENH] TTL: Clean up expired vectors
  async cleanupExpiredVectors(): Promise<{ removed: number }> {
    const now = Date.now()

    // Find expired vector IDs
    const expiredIds = Database.use((db) =>
      db
        .select({ id: vector_memory.id })
        .from(vector_memory)
        .where(sql`${vector_memory.expires_at} IS NOT NULL AND ${vector_memory.expires_at} < ${now}`)
        .all(),
    ).map((r) => r.id)

    if (expiredIds.length === 0) return { removed: 0 }

    const sqlite = Database.raw()

    // Remove from vec table
    if (this.vecTableInitialized) {
      const deleteStmt = sqlite.prepare("DELETE FROM vec_vector_memory WHERE rowid = ?")
      for (const id of expiredIds) {
        deleteStmt.run(id)
      }
    }

    // Remove from vector_memory table
    Database.use((db) => {
      db.delete(vector_memory).where(sql`${vector_memory.id} IN (${expiredIds.map((id) => sql`${id}`)})`)
    })

    log.info("expired_vectors_cleaned", { removed: expiredIds.length })
    return { removed: expiredIds.length }
  }

  // [ENH] Use external embedding generator if provided, otherwise fallback to simple embedding
  async generateEmbedding(text: string, _vectorType: VectorType): Promise<Float32Array> {
    // [ENH] Use project's default embedding model if configured
    if (this.config.embeddingGenerator) {
      try {
        const result = await this.config.embeddingGenerator(text, _vectorType)
        log.debug("generateEmbedding_result", { length: result.length, expected: this.configuredDim })
        return result
      } catch (error) {
        log.warn("external_embedding_failed_using_fallback", {
          error: error instanceof Error ? error.message : String(error),
          note: "Consider checking embedding service availability",
        })
        // Fall back to simple embedding - do not throw, let the system continue
      }
    }
    return this.simpleEmbedding(text)
  }

  /**
   * Simple embedding for fallback/development
   * @deprecated Use external embedding generator for production
   */
  private simpleEmbedding(text: string): Float32Array {
    const words = text.toLowerCase().split(/\W+/)
    const wordFreq: Record<string, number> = {}

    for (const word of words) {
      if (word.length > 2) {
        wordFreq[word] = (wordFreq[word] || 0) + 1
      }
    }

    const hash1 = this.hashString(text)
    const hash2 = this.hashString(text.split("").reverse().join(""))
    const dimensions = this.configuredDim

    const embedding: number[] = []
    for (let i = 0; i < dimensions; i++) {
      const freqSum = Object.values(wordFreq).reduce((a, b) => a + b, 0)

      const value =
        Math.sin(hash1 * (i + 1) * 0.1) * 0.3 +
        Math.cos(hash2 * (i + 1) * 0.1) * 0.3 +
        (freqSum > 0
          ? (Object.entries(wordFreq).reduce(
              (sum, [w, f]) => sum + Math.sin(this.hashString(w) * (i + 1) * 0.01) * f,
              0,
            ) /
              freqSum) *
            0.4
          : 0)

      embedding.push(Math.tanh(value))
    }

    return new Float32Array(this.normalize(embedding))
  }

  private hashString(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i)
      hash = hash & hash
    }
    return Math.abs(hash)
  }

  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) return 0

    let dotProduct = 0
    let normA = 0
    let normB = 0

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }

    if (normA === 0 || normB === 0) return 0
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
  }

  private textSimilarity(a: string, b: string): number {
    const setA = new Set(a.split(/\W+/).filter((w) => w.length > 2))
    const setB = new Set(b.split(/\W+/).filter((w) => w.length > 2))

    if (setA.size === 0 && setB.size === 0) return 0

    const intersection = new Set([...setA].filter((x) => setB.has(x)))
    const union = new Set([...setA, ...setB])

    return intersection.size / union.size
  }

  private normalize(vec: number[]): number[] {
    const magnitude = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0))
    if (magnitude === 0) return vec
    return vec.map((v) => v / magnitude)
  }
}

/**
 * Factory function to create a SqliteVecStore instance
 */
export function createSqliteVecStore(config?: VectorStoreConfig): IVectorStore {
  return new SqliteVecStore(config)
}
