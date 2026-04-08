# Novel Engine 11-Dimensional Refactoring Plan — Evaluation

## Executive Summary

The refactoring plan is **ambitious and well-architected conceptually**, but significantly **overestimates the current problems** while **underestimating the complexity of migration**. The plan proposes ~18,150 LOC across ~159 files over 18 weeks — however, the actual current codebase is already ~24,000 LOC across 44 modules with far more sophistication than the plan acknowledges.

**Verdict**: The architectural direction is sound (modularization is needed), but the plan needs major recalibration on scope, current state accuracy, and migration strategy.

---

## 1. Accuracy of Current State Assessment

### ❌ Major Issues

#### 1.1 Orchestrator Size Wrong
- **Plan claims**: ~8,000 lines
- **Actual**: 4,034 lines
- **Impact**: Inflates the "monolith" problem by 2x, skewing the entire justification

#### 1.2 Module Count Severely Understated
- **Plan claims**: 3 dimensions tracked (narrative, psychological, world)
- **Actual**: **20+ dimensions** already tracked:
  - Narrative, Psychological, Character State, Character Lifecycle
  - Relationships (pairwise), Multiway Relationships, Relationship Inertia
  - World State, Procedural World, World Bible/Lore
  - Knowledge Graph, Hierarchical Memory
  - Motifs, Archetypes, Plot Templates
  - Branches, Visual Panels, Thematic Analysis
  - Continuity (temporal/spatial), Multi-Thread POV
  - Saga Planning, Observability

#### 1.3 Existing Sophistication Ignored
The plan treats the current engine as a simple 3-dimension system. In reality, it already has:
- **Knowledge graph** with nodes, edges, groups, memberships (955 LOC)
- **Hierarchical memory** with arc/chapter/scene levels (503 LOC)
- **Enhanced pattern mining** with archetypes, motifs, templates, auto-skills (932 LOC)
- **Multi-thread narrative** with parallel POV, conflict detection, arbitration (1,203 LOC)
- **Multi-arc architect** with volume/act/beat planning, Chekhov's gun tracking (581 LOC)
- **Character lifecycle** with aging, death, transformation (437 LOC)
- **Procedural world** generation with regions, ecology, conflicts (814 LOC)
- **World bible keeper** for lore consistency (452 LOC)
- **Relationship inertia** with plot hooks (388 LOC)
- **Continuity analyzer** for temporal/spatial consistency (298 LOC)
- **Learning bridge** integrating with OpenCode's evolution system (672 LOC)
- **Observability** with metrics, health reports, tracing (443 LOC)

### ✅ Accurate Observations

- Orchestrator does have too many responsibilities (~40 methods)
- Cross-module coordination is ad-hoc rather than systematic
- No unified interface across modules
- LLM calls are sequential and numerous (20+ per cycle)

---

## 2. Architecture Design Evaluation

### ✅ Strengths

#### 2.1 Unified Dimension Interface
```typescript
interface DimensionController {
  readonly name: string;
  readonly dependencies: string[];
  readonly priority: number;
  initialize/load/injectToPrompt/extractFromStory/applyUpdate/...
}
```
**Good**: This is a clean, testable interface. Enables polymorphism and independent testing.

#### 2.2 Dependency-Aware Loading
The topological sort + level-based parallel loading is well-designed and would improve performance.

#### 2.3 Cross-Dimension Rule Engine
The event-driven rule system is a genuine improvement over the current ad-hoc coordination.

#### 2.4 Infrastructure Layers
The 6 infrastructure layers address real problems:
- **Data Flow Management**: Time travel via snapshots is a useful feature
- **LLM Resource Management**: Batching + caching would reduce 20+ calls significantly
- **Observability**: Per-dimension metrics would help debugging
- **Strategy & Config**: Novel type profiles (romance/thriller/fantasy) is a great feature
- **Quality Assurance**: Validation pipeline is needed
- **Storage Abstraction**: Backend routing (vector/SQLite/JSON) is overkill but the batch ops are useful

### ⚠️ Concerns

#### 2.5 "Complete Rewrite" Strategy
**Risk**: The plan proposes scrapping 24,000 LOC and writing 18,150 new LOC. This is dangerous because:
- Current system is **production-tested** and **works**
- 18 weeks of rewrite = 18 weeks of no new features
- Migration of existing story data is non-trivial
- High risk of regressions in complex subsystems (multi-thread narrative, knowledge graph, pattern mining)

**Recommendation**: **Strangler Fig pattern** — incrementally extract modules into the new dimension interface while keeping the orchestrator functional. Phases:
1. Define `DimensionController` interface
2. Extract 1-2 simple dimensions first (e.g., motif tracking → literary-style dimension)
3. Validate the interface works in practice
4. Gradually extract remaining modules
5. Only then shrink the orchestrator

#### 2.6 Dimension Granularity
Some proposed dimensions are too fine-grained:
- **Foreshadowing/Payoff** could be part of Narrative Consistency
- **World Rules Self-Consistency** could be part of World Consistency
- **Reader Experience** is a meta-dimension that should be a quality metric, not a full dimension

**Recommendation**: Consolidate to **7-8 core dimensions**:
1. Narrative (includes foreshadowing, events, timeline)
2. Psychological (character state, emotions, trauma, skills)
3. World (locations, items, rules, procedural generation)
4. Relationship (pairwise + multiway + inertia)
5. Theme & Motif (themes, motifs, archetypes, patterns)
6. Style & Perspective (prose style, POV, voice)
7. Structure (pacing, tension, multi-thread, saga planning)
8. Quality (reader experience, consistency, scoring — meta-dimension)

#### 2.7 Storage Over-Engineering
The `UnifiedStore` with backend routing (vector/SQLite/JSON) is unnecessary complexity. Current system already uses the right storage for each use case. The batch operations are useful, but the routing logic adds a layer of indirection that will cause debugging headaches.

**Recommendation**: Keep dimension-specific stores, add a `BatchStore` interface for bulk operations only.

#### 2.8 Conflict Resolution via LLM Negotiation
```typescript
// LLM-mediated negotiation for equal-priority conflicts
const resolution = await this.llmClient.resolve(prompt);
```
**Concern**: Adding LLM calls to conflict resolution will explode the already-high LLM call count. This should be rule-based first, LLM only for truly ambiguous cases.

---

## 3. Missing Considerations

### 3.1 What the Plan Doesn't Account For

| Current Feature | Plan Treatment |
|----------------|----------------|
| Multi-thread narrative (1,203 LOC) | Not mentioned |
| Knowledge graph (955 LOC) | Reduced to "narrative dimension" |
| Pattern mining (932 LOC) | Split across theme/style dimensions |
| Procedural world (814 LOC) | Reduced to "world dimension" |
| Branch management (1,121 LOC combined) | Mentioned briefly in orchestrator |
| Learning bridge (672 LOC) | Not mentioned |
| Character lifecycle (437 LOC) | Reduced to "psychological dimension" |
| Continuity analyzer (298 LOC) | Not mentioned |
| Validation/retry (748 LOC) | Partially covered by QA layer |

### 3.2 Performance Reality
- Current cycle: 20+ LLM calls sequentially
- Plan proposes: 11 dimensions × extraction + rule engine + conflict resolution + QA checks
- **Without LLM batching**, the new system would be **slower**, not faster
- The LLM Resource Management layer is **essential** and should be Phase 1, not Phase 5

### 3.3 Migration Complexity
The plan's migration strategy (Section 11) is overly optimistic:
```typescript
async migrateOldStateToDimensions(oldState: LegacyStoryState) {
  const narrativeData = { events: oldState.events, ... };
  await this.dimensionRegistry.get('narrative').save(narrativeData);
}
```
This assumes a simple field mapping. In reality:
- `story_bible.json` has deeply nested, interlinked data
- Knowledge graph has 3 SQLite databases with relationships
- Pattern mining has discovered skills/traumas that don't map cleanly
- Branch history has parent-child trees with evaluations

---

## 4. Revised Work Estimate

| Component | Plan Estimate | Realistic Estimate | Notes |
|-----------|--------------|-------------------|-------|
| Core Infrastructure | 800 LOC / 4 files | 1,200 LOC / 6 files | Interface + registry + event bus + more |
| Dimension Extraction (from existing) | 2,400 LOC / 15 files | 4,000 LOC / 20 files | Refactoring 24K LOC is harder than writing new |
| New Dimensions | 4,000 LOC / 40 files | 2,500 LOC / 16 files | Many "new" dimensions already exist |
| Coordination Layer | 800 LOC / 6 files | 1,200 LOC / 8 files | Rule engine + conflict resolver |
| Infrastructure Layers | 5,900 LOC / 22 files | 4,500 LOC / 18 files | Can reuse existing (observability, performance, validation) |
| Tests | 3,000 LOC / 60 files | 4,000 LOC / 70 files | More tests needed for extraction correctness |
| Migration & Docs | 500 LOC / 5 files | 1,500 LOC / 8 files | Data migration is complex |
| **Total** | **~18,150 LOC / ~159 files** | **~18,900 LOC / ~146 files** | Similar LOC, fewer files (consolidation) |

**Timeline**: 18 weeks is optimistic for a complete rewrite. With incremental approach:
- Phase 1 (Interface + Registry + 1 dimension): **3 weeks**
- Phase 2 (Extract 3 more dimensions): **4 weeks**
- Phase 3 (Extract remaining + coordination): **6 weeks**
- Phase 4 (Infrastructure layers): **4 weeks**
- Phase 5 (Testing + migration + polish): **3 weeks**
- **Total: 20 weeks** (incremental, production-safe)

---

## 5. Recommendations

### 5.1 What to Keep from the Plan
✅ Unified `DimensionController` interface
✅ Dependency-aware loading order
✅ Cross-dimension rule engine
✅ Novel type profiles (romance/thriller/fantasy)
✅ LLM call batching and caching
✅ Validation pipeline
✅ Time travel via snapshots

### 5.2 What to Change
❌ **Don't rewrite** — incrementally extract using Strangler Fig pattern
❌ **Don't split** existing sophisticated modules (pattern mining, knowledge graph, multi-thread)
❌ **Don't over-engineer** storage (keep existing stores, add batch ops)
❌ **Don't make Reader Experience a dimension** — it's a quality metric
❌ **Don't use LLM for conflict resolution** by default — rules first

### 5.3 What to Add
➕ **Phase 0**: Audit existing modules, map to proposed dimensions
➕ **Preserve multi-thread narrative** as first-class concern (it's not a dimension, it's a generation strategy)
➕ **Preserve knowledge graph** — it's not "narrative consistency", it's a factual constraint system
➕ **Add integration tests** that compare old vs new output for regression detection
➕ **Add feature flags** to toggle new architecture on/off during transition

### 5.4 Revised Dimension Mapping

| Proposed Dimension | Current Modules | Action |
|-------------------|-----------------|--------|
| Narrative | narrative-skeleton, state-extractor (events), branch-manager | Extract + enhance with foreshadowing |
| Psychological | character-deepener, character-lifecycle, state-extractor (emotions) | Extract + merge lifecycle |
| World | procedural-world, world-bible-keeper, state-extractor (world) | Extract + add rules consistency |
| Relationship | relationship-analyzer, multiway-relationships, relationship-inertia | Extract + merge all three |
| Theme & Motif | thematic-analyst, motif-tracker, pattern-miner-enhanced (motifs) | Extract + merge |
| Style & Perspective | dynamic-prompt (style), visual-orchestrator (camera specs) | Extract from prompt/visual |
| Structure | multi-thread-narrative, multi-arc-architect, evolution-rules (chaos) | Extract — this is generation strategy |
| Quality (meta) | observability, validation, continuity-analyzer | Extract as quality layer, not dimension |

---

## 6. Conclusion

The refactoring plan identifies **real problems** (monolithic orchestrator, lack of unified interfaces, sequential LLM calls) and proposes **sound architectural patterns** (unified interface, dependency loading, rule engine). However:

1. **The current system is 3-5x more sophisticated than the plan acknowledges** — this isn't a simple 3-dimension engine
2. **Complete rewrite is too risky** — incremental extraction is safer and equally fast long-term
3. **11 dimensions is too granular** — 7-8 consolidated dimensions would be more maintainable
4. **Migration is under-estimated** — existing data structures are complex and interlinked
5. **Some existing features are generation strategies, not dimensions** — multi-thread narrative, knowledge graph, branch management

**Final recommendation**: Adopt the plan's architectural vision (unified interface, coordination layer, infrastructure layers) but execute via **incremental extraction** over **20 weeks**, consolidating to **7-8 core dimensions** while **preserving existing sophisticated modules** as-is.
