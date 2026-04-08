# 11-Dimensional Novel Engine Refactoring Plan

## Executive Summary

This document outlines the complete refactoring strategy for transforming the existing 3-dimensional novel engine into an 11-dimensional architecture. The refactoring adopts a **complete rewrite approach** rather than incremental patches, splitting the monolithic orchestrator (~8,000 lines) into 11 independent dimension controllers with a lightweight coordination layer (~500 lines) and 6 essential infrastructure layers.

### Why Complete Refactoring?

- **Current architecture**: Tightly coupled, 8,000+ line orchestrator mixing concerns
- **Incremental approach**: Would require patching around existing structure, creating technical debt
- **Complete refactoring**: Clean separation, each dimension independently testable, easier to maintain and extend

### Complete Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLI Interface Layer                         │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────────┐
│                     Orchestrator (500 lines)                        │
│         Only handles: cycle flow, registration, coordination        │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        │                        │                        │
┌───────▼───────┐       ┌───────▼───────┐       ┌───────▼───────┐
│  Data Flow    │       │  LLM Resource  │       │  Observability│
│  Management   │       │  Management    │       │  Layer        │
└───────┬───────┘       └───────┬───────┘       └───────┬───────┘
        │                        │                        │
┌───────▼───────┐       ┌───────▼───────┐       ┌───────▼───────┐
│  Strategy &   │       │  Quality       │       │  Storage      │
│  Config Layer │       │  Assurance     │       │  Abstraction  │
└───────┬───────┘       └───────┬───────┘       └───────┬───────┘
        │                        │                        │
        └────────────────────────┼────────────────────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        │                        │                        │
┌───────▼───────┐       ┌───────▼───────┐       ┌───────▼───────┐
│  Dimension 1  │       │  Dimension 2  │   ... │  Dimension 11 │
│  Narrative    │       │  Psychological│       │  Reader Exp   │
└───────────────┘       └───────────────┘       └───────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  Cross-Dimension        │
                    │  Coordination (3 layers)│
                    └─────────────────────────┘
```

---

## 1. Current Architecture Problems

### 1.1 Monolithic Orchestrator

The current `EvolutionOrchestrator` handles all responsibilities:

- Story generation cycle
- Branch management
- State extraction
- Character deepening
- Relationship analysis
- Visual panel generation
- Pattern mining
- Thematic analysis

**Problem**: ~8,000 lines in a single file, impossible to test dimensions independently.

### 1.2 Limited Dimensionality

Only 3 dimensions are tracked:

1. **Narrative Consistency**: Plot events, cause-effect chains
2. **Psychological Consistency**: Character emotions, stress, traits
3. **World Consistency**: Locations, items, timeline

**Missing**: Theme, foreshadowing, pacing, relationship networks, world rules, perspective, style, reader experience.

### 1.3 No Cross-Dimension Coordination

Dimensions operate in silos with no mechanism for:

- Theme influencing pacing decisions
- Foreshadowing affecting relationship development
- Reader experience guiding style choices
- Conflict resolution when dimensions disagree

### 1.4 Tight Coupling

```typescript
// Current: Everything in orchestrator.ts
class EvolutionOrchestrator {
  async runNovelCycle() {
    // 1. Load state
    // 2. Generate story (mixes all concerns)
    // 3. Extract state (hardcoded for 3 dimensions)
    // 4. Analyze relationships
    // 5. Generate visuals
    // ... 8000 lines of mixed logic
  }
}
```

---

## 2. Proposed 11-Dimensional Architecture

### 2.1 The 11 Dimensions

| # | Dimension | What It Tracks | Key Metrics |
|---|-----------|----------------|-------------|
| 1 | **Narrative Consistency** | Plot events, cause-effect, timeline | Event coherence, causality chains |
| 2 | **Psychological Consistency** | Character emotions, stress, growth | Stress level, attachment style, trauma |
| 3 | **World Consistency** | Locations, items, physics, timeline | Spatial consistency, temporal order |
| 4 | **Theme Evolution** | Core themes, subthemes, motif development | Theme prominence, evolution trajectory |
| 5 | **Foreshadowing/Payoff** | Setup-payoff pairs, promise fulfillment | Setup count, payoff rate, urgency |
| 6 | **Pacing/Tension** | Scene rhythm, tension arcs, breathing room | Tension level, pacing speed, variety |
| 7 | **Relationship Network** | Character dynamics, alliances, conflicts | Relationship strength, faction alignment |
| 8 | **World Rules Self-Consistency** | Magic systems, technology limits, social rules | Rule violations, exception count |
| 9 | **Narrative Perspective** | POV consistency, voice, unreliable narration | POV shifts, voice drift, reliability |
| 10 | **Literary Style** | Prose quality, sentence rhythm, imagery density | Style score, imagery variety, repetition |
| 11 | **Reader Experience** | Engagement hooks, clarity, emotional payoff | Hook strength, clarity score, satisfaction |

### 2.2 Unified Dimension Interface

All dimensions implement the same interface:

```typescript
interface DimensionController {
  readonly name: string;
  readonly dependencies: string[];
  readonly priority: number;
  
  initialize(): Promise<void>;
  load(state: StoryState): Promise<DimensionData>;
  injectToPrompt(basePrompt: string, data: DimensionData): Promise<string>;
  extractFromStory(storySegment: string, currentState: StoryState): Promise<DimensionUpdate>;
  applyUpdate(currentData: DimensionData, update: DimensionUpdate): Promise<DimensionData>;
  detectConflicts(data: DimensionData, allDimensions: Map<string, DimensionData>): DimensionConflict[];
  resolveConflict(data: DimensionData, conflict: DimensionConflict): Promise<DimensionData>;
  save(data: DimensionData): Promise<void>;
}
```

### 2.3 Dimension Registry

Central registry manages all dimensions:

```typescript
class DimensionRegistry {
  private dimensions: Map<string, DimensionController> = new Map();
  
  register(controller: DimensionController): void {
    if (this.dimensions.has(controller.name)) {
      throw new Error(`Dimension ${controller.name} already registered`);
    }
    this.dimensions.set(controller.name, controller);
  }
  
  get(name: string): DimensionController {
    const controller = this.dimensions.get(name);
    if (!controller) throw new Error(`Dimension ${name} not found`);
    return controller;
  }
  
  getAll(): DimensionController[] {
    return Array.from(this.dimensions.values())
      .sort((a, b) => a.priority - b.priority);
  }
  
  async loadAll(state: StoryState): Promise<Map<string, DimensionData>> {
    const result = new Map<string, DimensionData>();
    const controllers = this.getAll();
    
    // Load in dependency order
    for (const controller of controllers) {
      const data = await controller.load(state);
      result.set(controller.name, data);
    }
    
    return result;
  }
  
  async extractAll(
    storySegment: string, 
    state: StoryState
  ): Promise<Map<string, DimensionUpdate>> {
    const updates = new Map<string, DimensionUpdate>();
    
    // Extract in parallel for performance
    const extractPromises = Array.from(this.dimensions.entries()).map(
      async ([name, controller]) => {
        const update = await controller.extractFromStory(storySegment, state);
        return [name, update] as const;
      }
    );
    
    const results = await Promise.all(extractPromises);
    for (const [name, update] of results) {
      updates.set(name, update);
    }
    
    return updates;
  }
  
  async applyAll(
    updates: Map<string, DimensionUpdate>
  ): Promise<Map<string, DimensionData>> {
    const newData = new Map<string, DimensionData>();
    
    const applyPromises = Array.from(updates.entries()).map(
      async ([name, update]) => {
        const controller = this.get(name);
        const currentData = await controller.load(await this.getCurrentState());
        const updatedData = await controller.applyUpdate(currentData, update);
        return [name, updatedData] as const;
      }
    );
    
    const results = await Promise.all(applyPromises);
    for (const [name, data] of results) {
      newData.set(name, data);
    }
    
    return newData;
  }
  
  async saveAll(data: Map<string, DimensionData>): Promise<void> {
    const savePromises = Array.from(data.entries()).map(
      async ([name, dimensionData]) => {
        const controller = this.get(name);
        await controller.save(dimensionData);
      }
    );
    
    await Promise.all(savePromises);
  }
}
```

---

## 3. Cross-Dimension Coordination

### 3.1 Dependency Graph

Dimensions are NOT independent. They form a dependency graph:

```
Level 0 (Foundation):
  ├── Narrative Consistency
  ├── World Consistency
  └── World Rules Self-Consistency

Level 1 (Character):
  ├── Psychological Consistency (depends on: Narrative, World)
  └── Relationship Network (depends on: Psychological, Narrative)

Level 2 (Structure):
  ├── Theme Evolution (depends on: Narrative, Character Psychology)
  ├── Foreshadowing/Payoff (depends on: Narrative, Theme)
  ├── Pacing/Tension (depends on: Narrative, Psychological)
  └── Narrative Perspective (depends on: Narrative, World)

Level 3 (Style):
  ├── Literary Style (depends on: Perspective, Theme, Pacing)
  └── Reader Experience (depends on: ALL above dimensions)
```

### 3.2 Types of Dimension Interactions

| Type | Description | Example |
|------|-------------|---------|
| **Data Dependency** | Output of Dimension A is input of Dimension B | Theme needs narrative events to evolve |
| **Constraint** | Dimension A restricts Dimension B's behavior | World rules limit what magic system can do |
| **Coordination** | Multiple dimensions negotiate a decision | Pacing and foreshadowing agree on next chapter focus |
| **Competition** | Multiple dimensions compete for narrative resource | Theme wants philosophical depth, pacing wants action |

### 3.3 Three-Layer Coordination Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Coordination Layer                    │
├─────────────────────────────────────────────────────────┤
│  Layer 1: Data Dependency (Load Order)                   │
│  └─ Dimensions load in topological order                 │
│  └─ Guaranteed: dependencies available before use        │
├─────────────────────────────────────────────────────────┤
│  Layer 2: Event/Rule Engine (Reactive Coordination)      │
│  └─ Cross-dimension rules fire automatically             │
│  └─ Example: "If foreshadowing urgent, pacing increases" │
├─────────────────────────────────────────────────────────┤
│  Layer 3: Conflict Resolution (Priority-Based)           │
│  └─ When dimensions disagree, priority decides           │
│  └─ Higher priority wins, or negotiated compromise       │
└─────────────────────────────────────────────────────────┘
```

### 3.4 Cross-Dimension Rule Engine

```typescript
interface CrossDimensionRule {
  name: string;
  when: (allData: Map<string, DimensionData>) => boolean;
  then: (allData: Map<string, DimensionData>) => Promise<void>;
  priority: number;
}

class CrossDimensionRuleEngine {
  private rules: CrossDimensionRule[] = [];
  
  register(rule: CrossDimensionRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => b.priority - a.priority);
  }
  
  async evaluate(allData: Map<string, DimensionData>): Promise<void> {
    for (const rule of this.rules) {
      if (rule.when(allData)) {
        await rule.then(allData);
      }
    }
  }
}

// Example Coordination Rules

const rules: CrossDimensionRule[] = [
  // Rule 1: Foreshadowing + Pacing Coordination
  {
    name: 'foreshadowing_pacing_coordination',
    when: (data) => {
      const f = data.get('foreshadowing');
      const p = data.get('pacing');
      return f.hasUrgentPayoff() && p.isLowTension();
    },
    then: async (data) => {
      const f = data.get('foreshadowing');
      const p = data.get('pacing');
      p.suggestHintForNextChapter(f.getUrgentPayoff());
    },
    priority: 8
  },
  
  // Rule 2: Theme + Style Coordination
  {
    name: 'theme_style_coordination',
    when: (data) => {
      const t = data.get('theme');
      const s = data.get('style');
      return t.isDominantTheme('tragedy') && s.isCurrentStyle('comedic');
    },
    then: async (data) => {
      const s = data.get('style');
      s.shiftStyleToward('somber');
    },
    priority: 7
  },
  
  // Rule 3: Relationship + Psychological Coordination
  {
    name: 'relationship_psychological_coordination',
    when: (data) => {
      const r = data.get('relationship');
      const p = data.get('psychological');
      return r.hasBetrayal() && p.getStressLevel() < 60;
    },
    then: async (data) => {
      const p = data.get('psychological');
      p.increaseStress(20, 'betrayal_trauma');
    },
    priority: 9
  },
  
  // Rule 4: World Rules + Narrative Coordination
  {
    name: 'world_rules_narrative_coordination',
    when: (data) => {
      const w = data.get('world_rules');
      const n = data.get('narrative');
      return w.detectViolation(n.getLastEvent());
    },
    then: async (data) => {
      const n = data.get('narrative');
      n.flagInconsistency('world_rule_violation');
    },
    priority: 10
  },
  
  // Rule 5: Reader Experience + All Dimensions Coordination
  {
    name: 'reader_experience_coordination',
    when: (data) => {
      const r = data.get('reader_experience');
      return r.getEngagementScore() < 0.6;
    },
    then: async (data) => {
      const pacing = data.get('pacing');
      const foreshadowing = data.get('foreshadowing');
      
      if (pacing.isSlow()) {
        pacing.suggestActionScene();
      }
      if (foreshadowing.hasSetupButNoPayoff()) {
        foreshadowing.hintAtUpcomingPayoff();
      }
    },
    priority: 6
  }
];
```

### 3.5 Conflict Resolution

```typescript
interface DimensionConflict {
  dimensionA: string;
  dimensionB: string;
  type: 'contradiction' | 'resource_competition' | 'priority_clash';
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

class ConflictResolver {
  async resolveAll(
    data: Map<string, DimensionData>,
    conflicts: DimensionConflict[]
  ): Promise<Map<string, DimensionData>> {
    const resolved = new Map(data);
    
    for (const conflict of conflicts) {
      const controllerA = this.registry.get(conflict.dimensionA);
      const controllerB = this.registry.get(conflict.dimensionB);
      
      // Higher priority dimension wins
      if (controllerA.priority > controllerB.priority) {
        const resolvedData = await controllerA.resolveConflict(
          resolved.get(conflict.dimensionA)!,
          conflict
        );
        resolved.set(conflict.dimensionA, resolvedData);
      } else if (controllerB.priority > controllerA.priority) {
        const resolvedData = await controllerB.resolveConflict(
          resolved.get(conflict.dimensionB)!,
          conflict
        );
        resolved.set(conflict.dimensionB, resolvedData);
      } else {
        // Equal priority: negotiate compromise
        const [dataA, dataB] = await this.negotiate(
          controllerA,
          controllerB,
          resolved.get(conflict.dimensionA)!,
          resolved.get(conflict.dimensionB)!,
          conflict
        );
        resolved.set(conflict.dimensionA, dataA);
        resolved.set(conflict.dimensionB, dataB);
      }
    }
    
    return resolved;
  }
  
  private async negotiate(
    controllerA: DimensionController,
    controllerB: DimensionController,
    dataA: DimensionData,
    dataB: DimensionData,
    conflict: DimensionConflict
  ): Promise<[DimensionData, DimensionData]> {
    // LLM-mediated negotiation for equal-priority conflicts
    const prompt = this.buildNegotiationPrompt(controllerA, controllerB, conflict);
    const resolution = await this.llmClient.resolve(prompt);
    
    return [
      controllerA.applyUpdate(dataA, resolution.updateA),
      controllerB.applyUpdate(dataB, resolution.updateB)
    ];
  }
}
```

---

## 4. Refactored Orchestrator

The orchestrator becomes a lightweight coordinator (~200 lines):

```typescript
class EvolutionOrchestrator {
  private registry: DimensionRegistry;
  private conflictResolver: ConflictResolver;
  private ruleEngine: CrossDimensionRuleEngine;
  private llmClient: LLMClient;
  
  constructor(config: EngineConfig) {
    this.registry = new DimensionRegistry();
    this.conflictResolver = new ConflictResolver(this.registry);
    this.ruleEngine = new CrossDimensionRuleEngine();
    this.llmClient = new LLMClient(config.modelProvider);
    
    this.registerDefaultDimensions();
    this.registerDefaultRules();
  }
  
  private registerDefaultDimensions(): void {
    this.registry.register(new NarrativeConsistencyController());
    this.registry.register(new PsychologicalConsistencyController());
    this.registry.register(new WorldConsistencyController());
    this.registry.register(new ThemeEvolutionController());
    this.registry.register(new ForeshadowingPayoffController());
    this.registry.register(new PacingTensionController());
    this.registry.register(new RelationshipNetworkController());
    this.registry.register(new WorldRulesConsistencyController());
    this.registry.register(new NarrativePerspectiveController());
    this.registry.register(new LiteraryStyleController());
    this.registry.register(new ReaderExperienceController());
  }
  
  private registerDefaultRules(): void {
    this.ruleEngine.register({
      name: 'foreshadowing_pacing_coordination',
      when: (data) => {
        const f = data.get('foreshadowing');
        const p = data.get('pacing');
        return f.hasUrgentPayoff() && p.isLowTension();
      },
      then: async (data) => {
        const f = data.get('foreshadowing');
        const p = data.get('pacing');
        p.suggestHintForNextChapter(f.getUrgentPayoff());
      },
      priority: 8
    });
    
    // ... more rules
  }
  
  async runNovelCycle(
    promptContent: string,
    useBranches: boolean = false
  ): Promise<string> {
    // 1. Load current state
    const state = await this.loadState();
    
    // 2. Load all dimension data (in dependency order)
    const dimensionData = await this.registry.loadAll(state);
    
    // 3. Build enriched prompt with dimension injection
    let enrichedPrompt = promptContent;
    for (const [name, data] of dimensionData) {
      const controller = this.registry.get(name);
      enrichedPrompt = await controller.injectToPrompt(enrichedPrompt, data);
    }
    
    // 4. Generate story segment via LLM
    const storySegment = await this.generate(enrichedPrompt, useBranches);
    
    // 5. Extract dimension updates from story (parallel)
    const updates = await this.registry.extractAll(storySegment, state);
    
    // 6. Apply updates to dimension data
    const newData = await this.registry.applyAll(updates);
    
    // 7. Run cross-dimension rule engine
    await this.ruleEngine.evaluate(newData);
    
    // 8. Detect cross-dimension conflicts
    const conflicts = this.detectConflicts(newData);
    
    // 9. Resolve conflicts
    const resolvedData = await this.conflictResolver.resolveAll(newData, conflicts);
    
    // 10. Save all dimensions (parallel)
    await this.registry.saveAll(resolvedData);
    await this.saveState(state);
    
    return storySegment;
  }
  
  private async generate(
    enrichedPrompt: string,
    useBranches: boolean
  ): Promise<string> {
    const response = await this.llmClient.generate({
      prompt: enrichedPrompt,
      maxTokens: 2000,
      temperature: 0.8,
    });
    
    return response.text;
  }
  
  private detectConflicts(
    data: Map<string, DimensionData>
  ): DimensionConflict[] {
    const conflicts: DimensionConflict[] = [];
    
    for (const [nameA, dataA] of data) {
      for (const [nameB, dataB] of data) {
        if (nameA >= nameB) continue;
        
        const controllerA = this.registry.get(nameA);
        const newConflicts = controllerA.detectConflicts(dataA, data);
        conflicts.push(...newConflicts);
      }
    }
    
    return conflicts;
  }
}
```

---

## 5. Complete File Structure

```
novel-engine/
├── core/
│   ├── orchestrator.ts                    # Lightweight coordinator (~200 lines)
│   ├── dimension-registry.ts              # Dimension registration and lifecycle
│   ├── conflict-resolver.ts               # Cross-dimension conflict resolution
│   └── rule-engine.ts                     # Cross-dimension rule evaluation
│
├── dimensions/
│   ├── narrative-consistency/
│   │   ├── narrative-controller.ts        # Narrative consistency controller
│   │   ├── narrative-types.ts             # Type definitions
│   │   ├── narrative-extractor.ts         # LLM-based state extraction
│   │   ├── narrative-store.ts             # SQLite persistence
│   │   └── narrative-injector.ts          # Prompt injection logic
│   │
│   ├── psychological-consistency/
│   │   ├── psychological-controller.ts
│   │   ├── psychological-types.ts
│   │   ├── psychological-extractor.ts
│   │   ├── psychological-store.ts
│   │   └── psychological-injector.ts
│   │
│   ├── world-consistency/
│   │   ├── world-controller.ts
│   │   ├── world-types.ts
│   │   ├── world-extractor.ts
│   │   ├── world-store.ts
│   │   └── world-injector.ts
│   │
│   ├── theme-evolution/                   # NEW
│   │   ├── theme-controller.ts
│   │   ├── theme-types.ts
│   │   ├── theme-extractor.ts
│   │   ├── theme-store.ts
│   │   └── theme-injector.ts
│   │
│   ├── foreshadowing-payoff/              # NEW
│   │   ├── foreshadowing-controller.ts
│   │   ├── foreshadowing-types.ts
│   │   ├── foreshadowing-extractor.ts
│   │   ├── foreshadowing-store.ts
│   │   └── foreshadowing-injector.ts
│   │
│   ├── pacing-tension/                    # NEW
│   │   ├── pacing-controller.ts
│   │   ├── pacing-types.ts
│   │   ├── pacing-extractor.ts
│   │   ├── pacing-store.ts
│   │   └── pacing-injector.ts
│   │
│   ├── relationship-network/              # NEW
│   │   ├── relationship-controller.ts
│   │   ├── relationship-types.ts
│   │   ├── relationship-extractor.ts
│   │   ├── relationship-store.ts
│   │   └── relationship-injector.ts
│   │
│   ├── world-rules/                       # NEW
│   │   ├── worldrules-controller.ts
│   │   ├── worldrules-types.ts
│   │   ├── worldrules-extractor.ts
│   │   ├── worldrules-store.ts
│   │   └── worldrules-injector.ts
│   │
│   ├── narrative-perspective/             # NEW
│   │   ├── perspective-controller.ts
│   │   ├── perspective-types.ts
│   │   ├── perspective-extractor.ts
│   │   ├── perspective-store.ts
│   │   └── perspective-injector.ts
│   │
│   ├── literary-style/                    # NEW
│   │   ├── style-controller.ts
│   │   ├── style-types.ts
│   │   ├── style-extractor.ts
│   │   ├── style-store.ts
│   │   └── style-injector.ts
│   │
│   └── reader-experience/                 # NEW
│       ├── readerexp-controller.ts
│       ├── readerexp-types.ts
│       ├── readerexp-extractor.ts
│       ├── readerexp-store.ts
│       └── readerexp-injector.ts
│
├── shared/
│   ├── dimension-interface.ts             # Unified DimensionController interface
│   ├── llm-client.ts                      # LLM client wrapper
│   ├── store-base.ts                      # Base store class
│   ├── types.ts                           # Common types
│   └── utils.ts                           # Shared utilities
│
├── coordination/
│   ├── rules/
│   │   ├── foreshadowing-pacing-rule.ts   # Cross-dimension rules
│   │   ├── theme-style-rule.ts
│   │   ├── relationship-psychology-rule.ts
│   │   ├── worldrules-narrative-rule.ts
│   │   └── readerexp-coordination-rule.ts
│   └── coordinator.ts                     # Main coordination logic
│
└── tests/
    ├── dimensions/
    │   ├── narrative-consistency.test.ts
    │   ├── psychological-consistency.test.ts
    │   └── ... (all 11 dimensions)
    ├── coordination/
    │   ├── conflict-resolver.test.ts
    │   ├── rule-engine.test.ts
    │   └── coordinator.test.ts
    └── integration/
        └── full-cycle.test.ts
```

---

## 6. Dimension Implementation Examples

### 6.1 Theme Evolution Dimension

```typescript
// theme-types.ts
interface ThemeData extends DimensionData {
  coreThemes: ThemeEntry[];
  subthemes: SubthemeEntry[];
  motifs: MotifEntry[];
  evolution: ThemeEvolutionTrack[];
  currentProminence: Map<string, number>;
}

interface ThemeEntry {
  id: string;
  name: string;
  description: string;
  prominence: number; // 0-1
  evolution: 'emerging' | 'developing' | 'dominant' | 'resolving';
  relatedCharacters: string[];
  relatedEvents: string[];
}

// theme-controller.ts
class ThemeEvolutionController implements DimensionController {
  readonly name = 'theme';
  readonly dependencies = ['narrative', 'psychological'];
  readonly priority = 5;
  
  async load(state: StoryState): Promise<ThemeData> {
    return this.store.load(state);
  }
  
  async injectToPrompt(prompt: string, data: ThemeData): Promise<string> {
    const dominantThemes = data.coreThemes
      .filter(t => t.evolution === 'dominant')
      .map(t => t.name)
      .join(', ');
    
    const emergingThemes = data.coreThemes
      .filter(t => t.evolution === 'emerging')
      .map(t => t.name)
      .join(', ');
    
    return `${prompt}

## Theme Guidance
- Dominant themes to reinforce: ${dominantThemes}
- Emerging themes to develop: ${emergingThemes}
- Current motifs to echo: ${data.motifs.slice(-3).map(m => m.description).join(', ')}
- Ensure theme evolution feels natural, not forced`;
  }
  
  async extractFromStory(
    story: string, 
    state: StoryState
  ): Promise<DimensionUpdate> {
    return this.extractor.extractThemes(story, state);
  }
  
  async applyUpdate(
    current: ThemeData, 
    update: DimensionUpdate
  ): Promise<ThemeData> {
    // Merge new theme observations
    // Update prominence scores
    // Check for evolution transitions
    return this.mergeUpdates(current, update);
  }
  
  detectConflicts(
    data: ThemeData, 
    allDimensions: Map<string, DimensionData>
  ): DimensionConflict[] {
    const conflicts: DimensionConflict[] = [];
    const narrative = allDimensions.get('narrative');
    
    // Check if theme contradicts established narrative events
    for (const theme of data.coreThemes) {
      if (theme.evolution === 'resolving' && narrative?.hasUnresolvedPlot()) {
        conflicts.push({
          dimensionA: 'theme',
          dimensionB: 'narrative',
          type: 'contradiction',
          description: `Theme "${theme.name}" resolving but plot unresolved`,
          severity: 'high'
        });
      }
    }
    
    return conflicts;
  }
  
  async save(data: ThemeData): Promise<void> {
    await this.store.save(data);
  }
}
```

### 6.2 Foreshadowing/Payoff Dimension

```typescript
// foreshadowing-types.ts
interface ForeshadowingData extends DimensionData {
  setups: SetupEntry[];
  payoffs: PayoffEntry[];
  pendingPayoffs: PendingPayoff[];
  payoffRate: number; // 0-1, how well setups are paid off
}

interface SetupEntry {
  id: string;
  description: string;
  chapterIntroduced: number;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  payoffDeadline?: number; // Chapter by which it should pay off
  relatedThemes: string[];
  relatedCharacters: string[];
}

// foreshadowing-controller.ts
class ForeshadowingPayoffController implements DimensionController {
  readonly name = 'foreshadowing';
  readonly dependencies = ['narrative', 'theme'];
  readonly priority = 7;
  
  async load(state: StoryState): Promise<ForeshadowingData> {
    return this.store.load(state);
  }
  
  async injectToPrompt(prompt: string, data: ForeshadowingData): Promise<string> {
    const urgentPayoffs = data.pendingPayoffs
      .filter(p => p.urgency === 'critical' || p.urgency === 'high')
      .map(p => `- ${p.description} (setup in ch.${p.setupChapter})`)
      .join('\n');
    
    return `${prompt}

## Foreshadowing Guidance
- Urgent payoffs needed:
${urgentPayoffs || 'None urgent'}

- Remember: Every setup demands payoff
- Chekhov's Gun: If mentioned in Ch.1, fire by Ch.10`;
  }
  
  hasUrgentPayoff(): boolean {
    return this.data.pendingPayoffs.some(
      p => p.urgency === 'critical' || p.urgency === 'high'
    );
  }
  
  getUrgentPayoff(): PendingPayoff | null {
    return this.data.pendingPayoffs.find(
      p => p.urgency === 'critical' || p.urgency === 'high'
    ) || null;
  }
}
```

### 6.3 Pacing/Tension Dimension

```typescript
// pacing-types.ts
interface PacingData extends DimensionData {
  tensionArcs: TensionArc[];
  sceneTypes: SceneTypeEntry[];
  pacingHistory: PacingRecord[];
  currentTension: number; // 0-1
  targetTension: number; // Where we want to be
  variety: number; // 0-1, how varied the pacing is
}

// pacing-controller.ts
class PacingTensionController implements DimensionController {
  readonly name = 'pacing';
  readonly dependencies = ['narrative', 'psychological'];
  readonly priority = 6;
  
  suggestHintForNextChapter(payoff: PendingPayoff): void {
    this.pendingHints.push({
      type: 'payoff',
      description: payoff.description,
      urgency: payoff.urgency
    });
  }
  
  isLowTension(): boolean {
    return this.data.currentTension < 0.4;
  }
  
  isSlow(): boolean {
    const recent = this.data.pacingHistory.slice(-5);
    return recent.every(r => r.pace === 'slow');
  }
  
  suggestActionScene(): void {
    this.pendingHints.push({
      type: 'action',
      description: 'Consider an action scene or confrontation',
      urgency: 'medium'
    });
  }
}
```

---

## 7. Implementation Strategy

### Phase 1: Foundation (Weeks 1-2)

**Goal**: Set up core infrastructure and interfaces

1. Create unified `DimensionController` interface
2. Implement `DimensionRegistry` class
3. Implement base store class (`StoreBase`)
4. Set up directory structure for all 11 dimensions
5. Write comprehensive test scaffolding

**Deliverables**:
- `core/dimension-registry.ts`
- `shared/dimension-interface.ts`
- `shared/store-base.ts`
- Test framework for all dimensions

### Phase 2: Migrate Existing Dimensions (Weeks 3-4)

**Goal**: Refactor existing 3 dimensions into new architecture

1. Extract `NarrativeConsistencyController` from orchestrator
2. Extract `PsychologicalConsistencyController` from orchestrator
3. Extract `WorldConsistencyController` from orchestrator
4. Ensure all 3 pass existing tests
5. Integration test: Run full novel cycle with migrated dimensions

**Deliverables**:
- `dimensions/narrative-consistency/` (5 files)
- `dimensions/psychological-consistency/` (5 files)
- `dimensions/world-consistency/` (5 files)
- All tests passing

### Phase 3: Implement New Dimensions (Weeks 5-10)

**Goal**: Build all 8 new dimensions

**Week 5-6**: Theme + Foreshadowing
- `dimensions/theme-evolution/`
- `dimensions/foreshadowing-payoff/`
- Cross-dimension rules between theme and foreshadowing

**Week 7-8**: Pacing + Relationship
- `dimensions/pacing-tension/`
- `dimensions/relationship-network/`
- Coordination rules with psychological and narrative

**Week 9**: World Rules + Perspective
- `dimensions/world-rules/`
- `dimensions/narrative-perspective/`

**Week 10**: Style + Reader Experience
- `dimensions/literary-style/`
- `dimensions/reader-experience/`
- Reader experience coordination with all dimensions

**Deliverables**:
- 8 new dimension directories (40 files total)
- Unit tests for each dimension
- Integration tests for dimension pairs

### Phase 4: Cross-Dimension Coordination (Weeks 11-12)

**Goal**: Implement coordination layer

1. Build `CrossDimensionRuleEngine`
2. Implement all coordination rules
3. Build `ConflictResolver`
4. Implement negotiation logic
5. Test conflict scenarios

**Deliverables**:
- `coordination/rules/` (5+ rule files)
- `coordination/coordinator.ts`
- `core/conflict-resolver.ts`
- Coordination test suite

### Phase 5: Refactor Orchestrator (Week 13)

**Goal**: Replace monolithic orchestrator with lightweight coordinator

1. Strip orchestrator down to coordination logic only
2. Wire up dimension registry
3. Wire up rule engine
4. Wire up conflict resolver
5. Integration test: Full novel cycle with all 11 dimensions

**Deliverables**:
- `core/orchestrator.ts` (~200 lines)
- Full integration test suite
- Performance benchmarks

### Phase 6: Testing & Optimization (Weeks 14-16)

**Goal**: Comprehensive testing and performance optimization

1. Unit tests: All 11 dimensions (55+ tests)
2. Integration tests: Dimension pairs (55 combinations)
3. Full cycle tests: End-to-end novel generation
4. Performance: Parallelize where possible
5. Memory optimization: Lazy loading for dimension data

**Deliverables**:
- 100+ test cases
- Performance benchmarks
- Memory profiling reports

### Phase 7: Migration & Deployment (Weeks 17-18)

**Goal**: Migrate existing data and deploy

1. Data migration: Convert old state format to new dimension format
2. Backward compatibility: Ensure old stories can be loaded
3. Documentation: Update AGENTS.md, API docs
4. User testing: Run with real stories
5. Bug fixes and polish

**Deliverables**:
- Migration script
- Updated documentation
- Release notes

---

## 8. Coordination Rules Reference

### Complete Rule Set

| Rule Name | Dimensions | Trigger | Action | Priority |
|-----------|------------|---------|--------|----------|
| `foreshadowing_pacing` | Foreshadowing + Pacing | Urgent payoff + low tension | Increase tension, hint at payoff | 8 |
| `theme_style` | Theme + Style | Tragic theme + comedic style | Shift style toward somber | 7 |
| `relationship_psychology` | Relationship + Psychological | Betrayal + low stress | Increase stress from betrayal | 9 |
| `worldrules_narrative` | World Rules + Narrative | Rule violation detected | Flag inconsistency | 10 |
| `pacing_readerexp` | Pacing + Reader Experience | Slow pacing + low engagement | Suggest action scene | 6 |
| `foreshadowing_theme` | Foreshadowing + Theme | Setup relates to core theme | Reinforce theme in payoff | 7 |
| `perspective_style` | Perspective + Style | POV shift detected | Adjust style for new POV | 6 |
| `psychology_relationship` | Psychological + Relationship | Character trauma | Update affected relationships | 8 |
| `world_pacing` | World + Pacing | Location change | Adjust pacing for travel | 5 |
| `theme_readerexp` | Theme + Reader Experience | Theme too abstract | Add concrete example | 6 |
| `narrative_foreshadowing` | Narrative + Foreshadowing | Major event completed | Check for payoff opportunities | 7 |
| `style_readerexp` | Style + Reader Experience | Repetition detected | Vary sentence structure | 5 |

---

## 9. Work Estimate

| Component | Files | Lines of Code | Complexity |
|-----------|-------|---------------|------------|
| Core Infrastructure | 4 | ~800 | Medium |
| Existing Dimensions (3) | 15 | ~2,400 | High (migration) |
| New Dimensions (8) | 40 | ~4,000 | Medium-High |
| Coordination Layer | 6 | ~800 | High |
| Tests | 60+ | ~3,000 | Medium |
| Migration & Docs | 5 | ~500 | Low |
| **Total** | **~130** | **~11,500** | **High** |

---

## 10. Benefits of Refactored Architecture

### 10.1 Maintainability

- **Before**: 8,000-line monolithic file, impossible to test in isolation
- **After**: Each dimension is independently testable (~400-500 lines each)

### 10.2 Extensibility

- **Before**: Adding a new dimension requires modifying orchestrator
- **After**: Add dimension by implementing interface and registering

### 10.3 Parallelization

- **Before**: Everything sequential
- **After**: Extraction, application, and saving happen in parallel

### 10.4 Conflict Detection

- **Before**: No mechanism to detect cross-dimension conflicts
- **After**: Automatic detection and resolution with priority system

### 10.5 Coordination

- **Before**: Dimensions operate in silos
- **After**: Rule engine enables intelligent cross-dimension coordination

### 10.6 Type Safety

- **Before**: Mixed types, implicit contracts
- **After**: Strong TypeScript interfaces, compile-time guarantees

---

## 11. Migration Strategy

### 11.1 Data Migration

```typescript
async migrateOldStateToDimensions(oldState: LegacyStoryState): Promise<void> {
  // Migrate narrative consistency
  const narrativeData = {
    events: oldState.events,
    causalChains: oldState.causalChains,
    timeline: oldState.timeline,
  };
  await this.dimensionRegistry.get('narrative').save(narrativeData);
  
  // Migrate psychological consistency
  const psychData = {
    characters: oldState.characters,
    stressLevels: oldState.stressLevels,
    emotions: oldState.emotions,
  };
  await this.dimensionRegistry.get('psychological').save(psychData);
  
  // Migrate world consistency
  const worldData = {
    locations: oldState.locations,
    items: oldState.items,
    worldState: oldState.worldState,
  };
  await this.dimensionRegistry.get('world').save(worldData);
  
  // New dimensions start empty (will be populated during generation)
}
```

### 11.2 Backward Compatibility

- Old story files can be loaded via migration script
- New dimensions auto-initialize from empty state
- All existing CLI commands continue to work
- Visual panel generation continues to work (uses narrative dimension)

---

## 12. Testing Strategy

### 12.1 Unit Tests (Per Dimension)

Each dimension gets 5 test files:

```typescript
describe('NarrativeConsistencyController', () => {
  test('load extracts narrative state correctly');
  test('injectToPrompt adds narrative guidance to prompt');
  test('extractFromStory identifies event changes');
  test('applyUpdate merges updates without data loss');
  test('detectConflicts identifies timeline contradictions');
  test('resolveConflict prioritizes recent events');
  test('save persists to correct storage location');
});
```

### 12.2 Integration Tests

```typescript
describe('Dimension Coordination', () => {
  test('foreshadowing triggers pacing adjustment');
  test('theme influences style selection');
  test('relationship betrayal increases psychological stress');
  test('world rule violation flags narrative inconsistency');
  test('reader experience low engagement triggers pacing change');
});

describe('Full Novel Cycle', () => {
  test('runNovelCycle with all 11 dimensions completes');
  test('conflicts are detected and resolved');
  test('state is saved correctly after cycle');
  test('performance meets benchmark (< 30s per chapter)');
});
```

### 12.3 Performance Tests

```typescript
describe('Performance', () => {
  test('loadAll completes in < 2s for 100-chapter story');
  test('extractAll completes in < 5s per chapter');
  test('conflict detection completes in < 1s');
  test('memory usage stays under 500MB for 1000-chapter story');
});
```

---

## 13. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| LLM extraction accuracy for new dimensions | High | Start with rule-based extractors, gradually add LLM |
| Cross-dimension conflicts too frequent | Medium | Tune priorities, add more specific rules |
| Performance degradation with 11 dimensions | Medium | Parallelize operations, lazy load dimensions |
| Migration data loss | High | Comprehensive migration tests, backup old format |
| Complexity overwhelms users | Low | Keep CLI interface same, complexity is internal |

---

## 14. Conclusion

This refactoring transforms a monolithic, tightly-coupled novel engine into a modular, extensible 11-dimensional architecture. The key benefits are:

1. **Maintainability**: Each dimension independently testable and modifiable
2. **Extensibility**: New dimensions added via interface implementation
3. **Coordination**: Rule engine enables intelligent cross-dimension interaction
4. **Conflict Resolution**: Automatic detection and resolution of inconsistencies
5. **Performance**: Parallel operations where possible

The estimated effort is **~11,500 lines of code across ~130 files**, organized into 7 implementation phases over 18 weeks.

The architecture treats dimensions like an orchestra: each has its own part, but the conductor (coordinator + rule engine) ensures they play harmonious music together.

---

---

## 15. Core Infrastructure Layers

Beyond the 11 dimensions and cross-dimension coordination, a production-ready system requires 6 essential infrastructure layers. These address the real operational problems identified in the current codebase.

### 15.1 Data Flow Management Layer

**Problem**: The current orchestrator is entirely sequential. State loading, extraction, and saving happen one dimension at a time with no batching, no time travel support, and no event-driven reactivity.

#### 15.1.1 StateManager

Manages the complete state lifecycle:

```typescript
interface StateSnapshot {
  version: number;
  chapter: number;
  dimensions: Map<string, DimensionData>;
  metadata: {
    timestamp: number;
    branchId?: string;
    generationId: string;
  };
}

class StateManager {
  private currentVersion: number = 0;
  private snapshots: StateSnapshot[] = [];
  private maxSnapshots: number = 100; // Keep last 100 snapshots for time travel
  
  // Create a new state snapshot
  async createSnapshot(
    chapter: number,
    dimensions: Map<string, DimensionData>,
    branchId?: string
  ): Promise<StateSnapshot> {
    const snapshot: StateSnapshot = {
      version: ++this.currentVersion,
      chapter,
      dimensions: new Map(dimensions),
      metadata: {
        timestamp: Date.now(),
        branchId,
        generationId: crypto.randomUUID()
      }
    };
    
    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots = this.snapshots.slice(-this.maxSnapshots);
    }
    
    await this.persistSnapshot(snapshot);
    return snapshot;
  }
  
  // Time travel: restore to any previous snapshot
  async restoreToSnapshot(version: number): Promise<Map<string, DimensionData>> {
    const snapshot = this.snapshots.find(s => s.version === version);
    if (!snapshot) throw new Error(`Snapshot version ${version} not found`);
    
    this.currentVersion = snapshot.version;
    return new Map(snapshot.dimensions);
  }
  
  // Get all available snapshot versions for time travel UI
  getAvailableSnapshots(): Array<{
    version: number;
    chapter: number;
    timestamp: number;
    branchId?: string;
  }> {
    return this.snapshots.map(s => ({
      version: s.version,
      chapter: s.chapter,
      timestamp: s.metadata.timestamp,
      branchId: s.metadata.branchId
    }));
  }
  
  // Differential: calculate what changed between two snapshots
  getDiff(fromVersion: number, toVersion: number): StateDiff {
    const from = this.snapshots.find(s => s.version === fromVersion);
    const to = this.snapshots.find(s => s.version === toVersion);
    
    if (!from || !to) throw new Error('Invalid snapshot versions');
    
    const diff: StateDiff = {
      from: fromVersion,
      to: toVersion,
      dimensionChanges: new Map()
    };
    
    for (const [dimName, toData] of to.dimensions) {
      const fromData = from.dimensions.get(dimName);
      if (fromData !== toData) {
        diff.dimensionChanges.set(dimName, {
          dimension: dimName,
          from: fromData,
          to: toData
        });
      }
    }
    
    return diff;
  }
  
  private async persistSnapshot(snapshot: StateSnapshot): Promise<void> {
    // Serialize to .opencode/novel/snapshots/v{version}.json
    await writeFile(
      this.getSnapshotPath(snapshot.version),
      JSON.stringify(snapshot, this.snapshotReplacer, 2)
    );
  }
  
  private getSnapshotPath(version: number): string {
    return path.join(
      getNovelRoot(),
      'snapshots',
      `v${version}.json`
    );
  }
}
```

#### 15.1.2 EventBus

Enables reactive, async communication between dimensions:

```typescript
type EventHandler = (event: DimensionEvent) => void | Promise<void>;

interface DimensionEvent {
  type: string;
  source: string; // Dimension that emitted
  target?: string; // Target dimension (undefined = broadcast)
  payload: unknown;
  timestamp: number;
  correlationId: string;
}

class EventBus {
  private handlers: Map<string, EventHandler[]> = new Map();
  private eventLog: DimensionEvent[] = [];
  private maxLogSize = 1000;
  
  // Subscribe to events
  on(eventType: string, handler: EventHandler): void {
    const handlers = this.handlers.get(eventType) || [];
    handlers.push(handler);
    this.handlers.set(eventType, handlers);
  }
  
  // Unsubscribe
  off(eventType: string, handler: EventHandler): void {
    const handlers = this.handlers.get(eventType) || [];
    const index = handlers.indexOf(handler);
    if (index >= 0) handlers.splice(index, 1);
  }
  
  // Emit event (synchronous handlers)
  emit(event: DimensionEvent): void {
    this.logEvent(event);
    
    const handlers = this.handlers.get(event.type) || [];
    for (const handler of handlers) {
      try {
        handler(event);
      } catch (error) {
        log.error('Event handler failed', { 
          eventType: event.type, 
          handler: handler.name,
          error 
        });
      }
    }
  }
  
  // Emit event (async, waits for all handlers)
  async emitAsync(event: DimensionEvent): Promise<void> {
    this.logEvent(event);
    
    const handlers = this.handlers.get(event.type) || [];
    const results = await Promise.allSettled(
      handlers.map(h => h(event))
    );
    
    // Log failures but don't fail the event
    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        log.error('Async event handler failed', {
          eventType: event.type,
          handler: handlers[i].name,
          error: result.reason
        });
      }
    });
  }
  
  private logEvent(event: DimensionEvent): void {
    this.eventLog.push(event);
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog = this.eventLog.slice(-this.maxLogSize);
    }
  }
  
  // Get recent events for debugging
  getRecentEvents(count: number = 50): DimensionEvent[] {
    return this.eventLog.slice(-count);
  }
}

// Standard event types
const DimensionEvents = {
  // Narrative events
  NARRATIVE_EVENT_ADDED: 'narrative:event_added',
  NARRATIVE_TIMELINE_CHANGED: 'narrative:timeline_changed',
  
  // Psychological events
  CHARACTER_STRESS_CHANGED: 'psychological:stress_changed',
  CHARACTER_TRAUMA_ADDED: 'psychological:trauma_added',
  CHARACTER_SKILL_GAINED: 'psychological:skill_gained',
  
  // Theme events
  THEME_PROMINENCE_CHANGED: 'theme:prominence_changed',
  THEME_EVOLUTION_TRANSITION: 'theme:evolution_transition',
  
  // Foreshadowing events
  FORESHADOWING_SETUP_CREATED: 'foreshadowing:setup_created',
  FORESHADOWING_PAYOFF_DELIVERED: 'foreshadowing:payoff_delivered',
  FORESHADOWING_URGENT: 'foreshadowing:urgent',
  
  // Pacing events
  PACING_TENSION_CHANGED: 'pacing:tension_changed',
  PACING_SPEED_CHANGED: 'pacing:speed_changed',
  
  // Relationship events
  RELATIONSHIP_STRENGTH_CHANGED: 'relationship:strength_changed',
  RELATIONSHIP_BETRAYAL: 'relationship:betrayal',
  FACTION_FORMED: 'relationship:faction_formed',
  
  // World events
  WORLD_RULE_VIOLATED: 'world:rule_violated',
  WORLD_LOCATION_DISCOVERED: 'world:location_discovered',
  
  // Quality events
  QUALITY_SCORE_UPDATED: 'quality:score_updated',
  QUALITY_ISSUE_DETECTED: 'quality:issue_detected'
} as const;
```

#### 15.1.3 DataFlowOrchestrator

Manages the actual data loading, updating, and saving flow:

```typescript
class DataFlowOrchestrator {
  private registry: DimensionRegistry;
  private stateManager: StateManager;
  private eventBus: EventBus;
  
  // Load all dimensions in optimal order (dependency-aware parallel)
  async loadAllDimensions(state: StoryState): Promise<Map<string, DimensionData>> {
    const controllers = this.registry.getAll();
    const loaded = new Map<string, DimensionData>();
    
    // Build dependency graph
    const graph = this.buildDependencyGraph(controllers);
    const levels = this.topologicalSort(graph);
    
    // Load level by level (parallel within each level)
    for (const level of levels) {
      const loadPromises = level.map(async (name) => {
        const controller = this.registry.get(name);
        const data = await controller.load(state);
        loaded.set(name, data);
        
        // Emit loaded event
        this.eventBus.emit({
          type: DimensionEvents.DIMENSION_LOADED,
          source: name,
          payload: { dimension: name },
          timestamp: Date.now(),
          correlationId: crypto.randomUUID()
        });
      });
      
      await Promise.all(loadPromises);
    }
    
    return loaded;
  }
  
  // Save all dimensions in parallel
  async saveAllDimensions(data: Map<string, DimensionData>): Promise<void> {
    const savePromises = Array.from(data.entries()).map(
      async ([name, dimensionData]) => {
        const controller = this.registry.get(name);
        await controller.save(dimensionData);
        
        this.eventBus.emit({
          type: DimensionEvents.DIMENSION_SAVED,
          source: name,
          payload: { dimension: name },
          timestamp: Date.now(),
          correlationId: crypto.randomUUID()
        });
      }
    );
    
    await Promise.allSettled(savePromises);
  }
  
  // Cascade update: when one dimension changes, update dependents
  async cascadeUpdate(
    sourceDimension: string,
    allData: Map<string, DimensionData>
  ): Promise<Map<string, DimensionData>> {
    const dependents = this.getDependents(sourceDimension);
    const updated = new Map(allData);
    
    for (const dependent of dependents) {
      const controller = this.registry.get(dependent);
      const currentData = updated.get(dependent)!;
      
      // Let the dimension react to the source change
      const newData = await controller.reactToDimensionChange(
        currentData,
        sourceDimension,
        updated.get(sourceDimension)!
      );
      
      updated.set(dependent, newData);
    }
    
    return updated;
  }
  
  private buildDependencyGraph(
    controllers: DimensionController[]
  ): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    
    for (const controller of controllers) {
      graph.set(controller.name, controller.dependencies);
    }
    
    return graph;
  }
  
  private topologicalSort(
    graph: Map<string, string[]>
  ): string[][] {
    // Returns levels of dimensions that can be loaded in parallel
    const levels: string[][] = [];
    const visited = new Set<string>();
    const remaining = new Set(graph.keys());
    
    while (remaining.size > 0) {
      const level: string[] = [];
      
      for (const name of remaining) {
        const deps = graph.get(name) || [];
        if (deps.every(d => visited.has(d))) {
          level.push(name);
        }
      }
      
      for (const name of level) {
        visited.add(name);
        remaining.delete(name);
      }
      
      if (level.length === 0) {
        throw new Error('Circular dependency detected in dimensions');
      }
      
      levels.push(level);
    }
    
    return levels;
  }
}
```

---

### 15.2 LLM Resource Management Layer

**Problem**: The current code makes 18+ separate LLM calls per chapter sequentially. With 11 dimensions each needing extraction, this would explode to 29+ calls. We need optimization, caching, rate limiting, and fallback.

#### 15.2.1 LLMCallOptimizer

Merges multiple dimension extractions into a single LLM call:

```typescript
interface ExtractionRequest {
  dimension: string;
  prompt: string;
  expectedSchema: ZodSchema;
}

interface ExtractionResult {
  dimension: string;
  data: unknown;
  success: boolean;
  error?: string;
}

class LLMCallOptimizer {
  private maxCallsPerCycle: number = 5; // Limit LLM calls per chapter
  private batchSize: number = 3; // Max dimensions per combined prompt
  
  // Group extraction requests to minimize LLM calls
  async batchExtract(
    requests: ExtractionRequest[],
    storySegment: string,
    currentState: StoryState
  ): Promise<Map<string, ExtractionResult>> {
    const results = new Map<string, ExtractionResult>();
    const batches = this.createBatches(requests);
    
    for (const batch of batches) {
      if (batch.length === 1) {
        // Single dimension: direct extraction
        const result = await this.extractSingle(batch[0], storySegment);
        results.set(batch[0].dimension, result);
      } else {
        // Multiple dimensions: combined extraction
        const batchResults = await this.extractBatch(batch, storySegment);
        for (const [dim, result] of batchResults) {
          results.set(dim, result);
        }
      }
    }
    
    return results;
  }
  
  // Create optimal batches based on compatibility
  private createBatches(
    requests: ExtractionRequest[]
  ): ExtractionRequest[][] {
    const batches: ExtractionRequest[][] = [];
    let currentBatch: ExtractionRequest[] = [];
    
    for (const request of requests) {
      if (currentBatch.length >= this.batchSize) {
        batches.push([...currentBatch]);
        currentBatch = [];
      }
      
      // Check if this request is compatible with current batch
      if (this.isCompatibleWithBatch(request, currentBatch)) {
        currentBatch.push(request);
      } else {
        if (currentBatch.length > 0) {
          batches.push([...currentBatch]);
        }
        currentBatch = [request];
      }
    }
    
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }
    
    return batches;
  }
  
  // Check if a request can be batched with others
  private isCompatibleWithBatch(
    request: ExtractionRequest,
    batch: ExtractionRequest[]
  ): boolean {
    // Compatible if they use similar context
    // Incompatible if they need conflicting system prompts
    const incompatibles = new Map<string, string[]>([
      ['style', ['perspective']], // Style and perspective need different contexts
      ['world_rules', ['narrative']] // World rules need rule definitions
    ]);
    
    for (const existing of batch) {
      const incompatible = incompatibles.get(request.dimension) || [];
      if (incompatible.includes(existing.dimension)) return false;
      
      const existingIncompatible = incompatibles.get(existing.dimension) || [];
      if (existingIncompatible.includes(request.dimension)) return false;
    }
    
    return true;
  }
  
  // Extract multiple dimensions in one LLM call
  private async extractBatch(
    batch: ExtractionRequest[],
    storySegment: string
  ): Promise<Map<string, ExtractionResult>> {
    const combinedPrompt = this.buildCombinedPrompt(batch, storySegment);
    
    const response = await callLLM({
      prompt: combinedPrompt,
      callType: 'batch_dimension_extraction',
      temperature: 0.3,
      useRetry: true
    });
    
    // Parse response into individual dimension results
    return this.parseBatchResponse(response, batch);
  }
  
  // Build a combined prompt for multiple dimensions
  private buildCombinedPrompt(
    batch: ExtractionRequest[],
    storySegment: string
  ): string {
    const dimensionNames = batch.map(r => r.dimension).join(', ');
    
    return `Analyze the following story segment and extract information for these dimensions: ${dimensionNames}

Story:
${storySegment}

For each dimension, extract ONLY the relevant information. Return as JSON:
{
  "${batch[0].dimension}": { /* extracted data */ },
  "${batch[1].dimension}": { /* extracted data */ },
  ...
}`;
  }
}
```

#### 15.2.2 LLMCache

Caches LLM results to avoid redundant calls:

```typescript
interface CacheEntry {
  key: string;
  result: unknown;
  timestamp: number;
  ttl: number; // Time to live in ms
  hitCount: number;
}

class LLMCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number = 500;
  private defaultTTL: number = 3600000; // 1 hour
  
  // Get cached result
  get(key: string): unknown | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    // Check TTL
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    entry.hitCount++;
    return entry.result;
  }
  
  // Cache result
  set(key: string, result: unknown, ttl?: number): void {
    // Evict if at capacity
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }
    
    this.cache.set(key, {
      key,
      result,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
      hitCount: 0
    });
  }
  
  // Generate cache key from prompt+context
  generateKey(prompt: string, callType: string, temperature: number): string {
    const hash = crypto.createHash('md5')
      .update(`${callType}:${temperature}:${prompt}`)
      .digest('hex');
    return hash;
  }
  
  // Get cache statistics
  getStats(): {
    size: number;
    hitRate: number;
    totalHits: number;
    totalMisses: number;
  } {
    let totalHits = 0;
    for (const entry of this.cache.values()) {
      totalHits += entry.hitCount;
    }
    
    return {
      size: this.cache.size,
      hitRate: totalHits / (totalHits + this.misses) || 0,
      totalHits,
      misses: this.misses
    };
  }
  
  private evictLRU(): void {
    // Remove least recently used entry
    let oldest: CacheEntry | null = null;
    for (const entry of this.cache.values()) {
      if (!oldest || entry.timestamp < oldest.timestamp) {
        oldest = entry;
      }
    }
    if (oldest) this.cache.delete(oldest.key);
  }
  
  private misses: number = 0;
  
  // Track miss for stats
  recordMiss(): void {
    this.misses++;
  }
  
  // Clear expired entries
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }
}
```

#### 15.2.3 RateLimiter

Prevents API quota exhaustion:

```typescript
class RateLimiter {
  private calls: number[] = []; // Timestamps of recent calls
  private maxCallsPerMinute: number = 60;
  private maxCallsPerHour: number = 1000;
  private maxTokensPerDay: number = 1000000;
  private tokensUsedToday: number = 0;
  
  async waitForSlot(tokens: number = 0): Promise<void> {
    // Check daily token limit
    if (this.tokensUsedToday + tokens > this.maxTokensPerDay) {
      throw new Error('Daily token limit exceeded');
    }
    
    // Check per-minute rate
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    this.calls = this.calls.filter(t => t > oneMinuteAgo);
    
    if (this.calls.length >= this.maxCallsPerMinute) {
      const waitTime = this.calls[0] + 60000 - now;
      log.info('Rate limiting', { waitTime });
      await this.sleep(waitTime);
    }
    
    // Check per-hour rate
    const oneHourAgo = now - 3600000;
    const callsLastHour = this.calls.filter(t => t > oneHourAgo).length;
    
    if (callsLastHour >= this.maxCallsPerHour) {
      const waitTime = this.calls.find(t => t > oneHourAgo)! + 3600000 - now;
      log.info('Hourly rate limiting', { waitTime });
      await this.sleep(waitTime);
    }
    
    this.calls.push(now);
    this.tokensUsedToday += tokens;
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  resetDailyTokens(): void {
    this.tokensUsedToday = 0;
  }
}
```

#### 15.2.4 FallbackStrategy

Provides graceful degradation when LLM fails:

```typescript
type FallbackHandler<T> = (
  dimension: string,
  context: FallbackContext
) => Promise<T>;

interface FallbackContext {
  currentState: StoryState;
  previousData: DimensionData | null;
  retryCount: number;
}

class FallbackStrategy {
  private fallbacks: Map<string, FallbackHandler<unknown>> = new Map();
  
  register(dimension: string, handler: FallbackHandler<unknown>): void {
    this.fallbacks.set(dimension, handler);
  }
  
  async execute<T>(
    dimension: string,
    primaryFn: () => Promise<T>,
    context: FallbackContext
  ): Promise<T> {
    try {
      return await primaryFn();
    } catch (error) {
      log.warn('LLM call failed, using fallback', {
        dimension,
        error: error.message
      });
      
      const fallback = this.fallbacks.get(dimension);
      if (!fallback) {
        throw new Error(`No fallback registered for dimension ${dimension}`);
      }
      
      return fallback(dimension, context) as Promise<T>;
    }
  }
}

// Example: Fallback for theme extraction
fallbackStrategy.register('theme', async (dim, ctx) => {
  // Rule-based fallback: keep previous theme data unchanged
  return {
    coreThemes: ctx.previousData?.coreThemes || [],
    subthemes: ctx.previousData?.subthemes || [],
    motifs: ctx.previousData?.motifs || [],
    evolution: ctx.previousData?.evolution || [],
    currentProminence: ctx.previousData?.currentProminence || new Map()
  } as ThemeData;
});
```

---

### 15.3 Observability Layer

**Problem**: Current observability only tracks basic metrics. With 11 dimensions, we need per-dimension performance tracking, health checking, distributed tracing, and alerting.

#### 15.3.1 MetricsCollector

```typescript
interface DimensionMetrics {
  dimension: string;
  
  // Performance
  loadTimeMs: number;
  extractTimeMs: number;
  injectTimeMs: number;
  saveTimeMs: number;
  
  // Data quality
  dataSize: number; // Size of dimension data in bytes
  updateFrequency: number; // Updates per chapter
  conflictCount: number; // Times involved in conflicts
  
  // LLM usage
  llmCalls: number;
  llmTokensUsed: number;
  llmFailures: number;
  
  // Cache
  cacheHits: number;
  cacheMisses: number;
}

class MetricsCollector {
  private metrics: Map<string, DimensionMetrics> = new Map();
  private history: DimensionMetrics[][] = []; // Per-chapter history
  private traces: TraceEvent[] = [];
  
  startTrace(operation: string, dimension: string): string {
    const traceId = crypto.randomUUID();
    this.traces.push({
      id: traceId,
      operation,
      dimension,
      startTime: Date.now(),
      status: 'running'
    });
    return traceId;
  }
  
  endTrace(traceId: string, metadata?: Record<string, unknown>): void {
    const trace = this.traces.find(t => t.id === traceId);
    if (!trace) return;
    
    trace.endTime = Date.now();
    trace.duration = trace.endTime - trace.startTime;
    trace.status = 'completed';
    trace.metadata = metadata;
  }
  
  recordMetric(dimension: string, metric: Partial<DimensionMetrics>): void {
    const current = this.metrics.get(dimension) || this.createDefaultMetrics(dimension);
    Object.assign(current, metric);
    this.metrics.set(dimension, current);
  }
  
  // Get comprehensive health report
  generateHealthReport(): DimensionHealthReport[] {
    return Array.from(this.metrics.entries()).map(([name, metrics]) => ({
      dimension: name,
      status: this.calculateStatus(metrics),
      performance: this.assessPerformance(metrics),
      dataQuality: this.assessDataQuality(metrics),
      recommendations: this.generateRecommendations(metrics)
    }));
  }
  
  private calculateStatus(metrics: DimensionMetrics): 'healthy' | 'warning' | 'critical' {
    if (metrics.llmFailures > 5 || metrics.conflictCount > 10) return 'critical';
    if (metrics.llmFailures > 2 || metrics.conflictCount > 5) return 'warning';
    return 'healthy';
  }
  
  private assessPerformance(metrics: DimensionMetrics): PerformanceRating {
    const totalTime = metrics.loadTimeMs + metrics.extractTimeMs + 
                      metrics.injectTimeMs + metrics.saveTimeMs;
    
    if (totalTime < 1000) return 'excellent';
    if (totalTime < 3000) return 'good';
    if (totalTime < 5000) return 'acceptable';
    return 'slow';
  }
  
  // Export for external monitoring (Prometheus, Grafana, etc.)
  exportForMonitoring(): MonitoringData {
    return {
      timestamp: Date.now(),
      dimensions: Array.from(this.metrics.values()),
      traces: this.traces.slice(-100), // Last 100 traces
      summary: this.generateSummary()
    };
  }
}
```

#### 15.3.2 AlertSystem

```typescript
interface Alert {
  id: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  dimension: string;
  message: string;
  timestamp: number;
  resolved: boolean;
  resolvedAt?: number;
}

class AlertSystem {
  private alerts: Alert[] = [];
  private listeners: Array<(alert: Alert) => void> = [];
  
  // Define alert rules
  private rules: AlertRule[] = [
    {
      name: 'high_llm_failure_rate',
      condition: (metrics) => metrics.llmFailures > 3,
      severity: 'warning',
      message: (dim) => `Dimension ${dim} has high LLM failure rate`
    },
    {
      name: 'excessive_conflicts',
      condition: (metrics) => metrics.conflictCount > 10,
      severity: 'error',
      message: (dim) => `Dimension ${dim} involved in too many conflicts`
    },
    {
      name: 'slow_performance',
      condition: (metrics) => 
        metrics.loadTimeMs + metrics.extractTimeMs > 5000,
      severity: 'warning',
      message: (dim) => `Dimension ${dim} is running slow`
    }
  ];
  
  // Check all rules against current metrics
  evaluateRules(metrics: DimensionMetrics): void {
    for (const rule of this.rules) {
      if (rule.condition(metrics)) {
        this.triggerAlert({
          id: crypto.randomUUID(),
          severity: rule.severity,
          dimension: metrics.dimension,
          message: rule.message(metrics.dimension),
          timestamp: Date.now(),
          resolved: false
        });
      }
    }
  }
  
  private triggerAlert(alert: Alert): void {
    this.alerts.push(alert);
    
    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(alert);
      } catch (error) {
        log.error('Alert listener failed', { error });
      }
    }
    
    // Log
    log[alert.severity === 'critical' ? 'error' : 'warn']('Alert triggered', {
      alert
    });
  }
  
  // Register alert listener
  onAlert(listener: (alert: Alert) => void): void {
    this.listeners.push(listener);
  }
  
  // Get unresolved alerts
  getActiveAlerts(): Alert[] {
    return this.alerts.filter(a => !a.resolved);
  }
  
  // Resolve an alert
  resolveAlert(alertId: string): void {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      alert.resolvedAt = Date.now();
    }
  }
}
```

---

### 15.4 Strategy & Configuration Layer

**Problem**: Different novel types need different dimension weights. Romance novels prioritize psychological consistency, thrillers prioritize foreshadowing. Current system has story types but no dimension-level configuration.

#### 15.4.1 ProfileManager

```typescript
interface DimensionProfile {
  enabled: boolean;
  priority: number;
  weight: number; // 0-1, importance in overall quality score
  extractionFrequency: 'every_chapter' | 'every_3_chapters' | 'every_5_chapters';
  llmBudget: number; // Max tokens per extraction
  confidenceThreshold: number; // Minimum confidence to accept extraction
}

interface NovelProfile {
  name: string;
  description: string;
  dimensions: Map<string, DimensionProfile>;
  coordinationRules: string[]; // Which coordination rules to enable
  qualityWeights: {
    narrativeWeight: number;
    psychologicalWeight: number;
    themeWeight: number;
    pacingWeight: number;
    styleWeight: number;
  };
}

class ProfileManager {
  private profiles: Map<string, NovelProfile> = new Map();
  private currentProfile: string | null = null;
  
  constructor() {
    this.registerDefaultProfiles();
  }
  
  private registerDefaultProfiles(): void {
    // Romance profile: heavy on psychology and relationships
    this.profiles.set('romance', {
      name: 'romance',
      description: 'Focus on character psychology and relationship development',
      dimensions: new Map([
        ['psychological', { 
          enabled: true, 
          priority: 10, 
          weight: 0.25,
          extractionFrequency: 'every_chapter',
          llmBudget: 2000,
          confidenceThreshold: 0.8
        }],
        ['relationship', {
          enabled: true,
          priority: 9,
          weight: 0.25,
          extractionFrequency: 'every_chapter',
          llmBudget: 2000,
          confidenceThreshold: 0.8
        }],
        ['pacing', {
          enabled: true,
          priority: 6,
          weight: 0.10,
          extractionFrequency: 'every_3_chapters',
          llmBudget: 1000,
          confidenceThreshold: 0.7
        }],
        ['theme', {
          enabled: true,
          priority: 7,
          weight: 0.15,
          extractionFrequency: 'every_chapter',
          llmBudget: 1500,
          confidenceThreshold: 0.7
        }],
        // Other dimensions with lower weights...
      ]),
      coordinationRules: [
        'relationship_psychological_coordination',
        'theme_style_coordination'
      ],
      qualityWeights: {
        narrativeWeight: 0.10,
        psychologicalWeight: 0.30,
        themeWeight: 0.20,
        pacingWeight: 0.15,
        styleWeight: 0.25
      }
    });
    
    // Thriller profile: heavy on foreshadowing and pacing
    this.profiles.set('thriller', {
      name: 'thriller',
      description: 'Focus on suspense, foreshadowing, and tension',
      dimensions: new Map([
        ['foreshadowing', {
          enabled: true,
          priority: 10,
          weight: 0.25,
          extractionFrequency: 'every_chapter',
          llmBudget: 2000,
          confidenceThreshold: 0.85
        }],
        ['pacing', {
          enabled: true,
          priority: 9,
          weight: 0.20,
          extractionFrequency: 'every_chapter',
          llmBudget: 1500,
          confidenceThreshold: 0.8
        }],
        ['narrative', {
          enabled: true,
          priority: 8,
          weight: 0.20,
          extractionFrequency: 'every_chapter',
          llmBudget: 2000,
          confidenceThreshold: 0.8
        }],
        // Other dimensions...
      ]),
      coordinationRules: [
        'foreshadowing_pacing_coordination',
        'pacing_readerexp_coordination'
      ],
      qualityWeights: {
        narrativeWeight: 0.25,
        psychologicalWeight: 0.15,
        themeWeight: 0.15,
        pacingWeight: 0.30,
        styleWeight: 0.15
      }
    });
    
    // Epic fantasy profile: world rules and theme
    this.profiles.set('epic_fantasy', {
      name: 'epic_fantasy',
      description: 'Complex world-building with deep thematic exploration',
      dimensions: new Map([
        ['world_rules', {
          enabled: true,
          priority: 10,
          weight: 0.20,
          extractionFrequency: 'every_chapter',
          llmBudget: 2000,
          confidenceThreshold: 0.9
        }],
        ['theme', {
          enabled: true,
          priority: 9,
          weight: 0.20,
          extractionFrequency: 'every_chapter',
          llmBudget: 2000,
          confidenceThreshold: 0.8
        }],
        ['narrative', {
          enabled: true,
          priority: 8,
          weight: 0.15,
          extractionFrequency: 'every_chapter',
          llmBudget: 2000,
          confidenceThreshold: 0.8
        }],
        // Other dimensions...
      ]),
      coordinationRules: [
        'worldrules_narrative_coordination',
        'theme_style_coordination',
        'foreshadowing_theme_coordination'
      ],
      qualityWeights: {
        narrativeWeight: 0.20,
        psychologicalWeight: 0.15,
        themeWeight: 0.25,
        pacingWeight: 0.15,
        styleWeight: 0.25
      }
    });
  }
  
  // Set active profile
  setActiveProfile(profileName: string): void {
    if (!this.profiles.has(profileName)) {
      throw new Error(`Unknown profile: ${profileName}`);
    }
    this.currentProfile = profileName;
    log.info('Profile switched', { profile: profileName });
  }
  
  // Get current profile
  getCurrentProfile(): NovelProfile {
    if (!this.currentProfile) {
      throw new Error('No profile set. Call setActiveProfile first.');
    }
    return this.profiles.get(this.currentProfile)!;
  }
  
  // Get dimension-specific config
  getDimensionConfig(dimension: string): DimensionProfile {
    const profile = this.getCurrentProfile();
    const config = profile.dimensions.get(dimension);
    if (!config) {
      throw new Error(`Dimension ${dimension} not in profile ${this.currentProfile}`);
    }
    return config;
  }
  
  // Check if dimension should extract this chapter
  shouldExtractThisChapter(dimension: string, chapterNumber: number): boolean {
    const config = this.getDimensionConfig(dimension);
    
    switch (config.extractionFrequency) {
      case 'every_chapter':
        return true;
      case 'every_3_chapters':
        return chapterNumber % 3 === 0;
      case 'every_5_chapters':
        return chapterNumber % 5 === 0;
      default:
        return true;
    }
  }
  
  // Dynamically adjust dimension weight at runtime
  adjustDimensionWeight(dimension: string, newWeight: number): void {
    const profile = this.getCurrentProfile();
    const config = profile.dimensions.get(dimension);
    if (!config) return;
    
    config.weight = Math.max(0, Math.min(1, newWeight));
    log.info('Dimension weight adjusted', {
      dimension,
      newWeight,
      profile: this.currentProfile
    });
  }
}
```

#### 15.4.2 FeatureToggle

```typescript
class FeatureToggle {
  private toggles: Map<string, boolean> = new Map();
  
  // Default toggles
  constructor() {
    this.toggles.set('batch_extraction', true);
    this.toggles.set('cross_dimension_rules', true);
    this.toggles.set('conflict_resolution', true);
    this.toggles.set('llm_cache', true);
    this.toggles.set('time_travel', false); // Experimental
    this.toggles.set('adaptive_weights', false); // Experimental
  }
  
  isEnabled(feature: string): boolean {
    return this.toggles.get(feature) || false;
  }
  
  enable(feature: string): void {
    this.toggles.set(feature, true);
  }
  
  disable(feature: string): void {
    this.toggles.set(feature, false);
  }
  
  // Toggle all experimental features
  enableExperimental(): void {
    this.toggles.set('time_travel', true);
    this.toggles.set('adaptive_weights', true);
  }
}
```

---

### 15.5 Quality Assurance Layer

**Problem**: No mechanism validates dimension data accuracy or detects logical contradictions across dimensions.

#### 15.5.1 ValidationPipeline

```typescript
interface ValidationResult {
  dimension: string;
  passed: boolean;
  checks: ValidationCheck[];
}

interface ValidationCheck {
  name: string;
  passed: boolean;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

class ValidationPipeline {
  private validators: Map<string, ValidatorFn[]> = new Map();
  
  register(dimension: string, validator: ValidatorFn): void {
    const validators = this.validators.get(dimension) || [];
    validators.push(validator);
    this.validators.set(dimension, validators);
  }
  
  async validate(
    dimension: string,
    data: DimensionData
  ): Promise<ValidationResult> {
    const validators = this.validators.get(dimension) || [];
    const checks: ValidationCheck[] = [];
    
    for (const validator of validators) {
      const result = await validator(data);
      checks.push(result);
    }
    
    return {
      dimension,
      passed: checks.every(c => c.severity !== 'error' || c.passed),
      checks
    };
  }
  
  async validateAll(
    allData: Map<string, DimensionData>
  ): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];
    
    const validatePromises = Array.from(allData.entries()).map(
      async ([name, data]) => {
        const result = await this.validate(name, data);
        return result;
      }
    );
    
    return Promise.all(validatePromises);
  }
}

// Example validators
const narrativeValidators: ValidatorFn[] = [
  // Events must have valid timestamps
  (data) => {
    const narrative = data as NarrativeData;
    const invalidEvents = narrative.events.filter(
      e => !e.timestamp || e.timestamp < 0
    );
    return {
      name: 'valid_event_timestamps',
      passed: invalidEvents.length === 0,
      message: invalidEvents.length > 0 
        ? `${invalidEvents.length} events have invalid timestamps`
        : 'All event timestamps are valid',
      severity: 'error'
    };
  },
  
  // Causal chains must not have cycles
  (data) => {
    const narrative = data as NarrativeData;
    const hasCycle = detectCycle(narrative.causalChains);
    return {
      name: 'no_causal_cycles',
      passed: !hasCycle,
      message: hasCycle 
        ? 'Causal chain contains cycles'
        : 'No causal cycles detected',
      severity: 'error'
    };
  },
  
  // Timeline must be ordered
  (data) => {
    const narrative = data as NarrativeData;
    const isOrdered = narrative.timeline.every(
      (t, i) => i === 0 || t.chapter >= narrative.timeline[i - 1].chapter
    );
    return {
      name: 'timeline_ordered',
      passed: isOrdered,
      message: isOrdered
        ? 'Timeline is correctly ordered'
        : 'Timeline has ordering issues',
      severity: 'warning'
    };
  }
];

// Register validators
validationPipeline.register('narrative', ...narrativeValidators);
validationPipeline.register('psychological', ...psychologicalValidators);
validationPipeline.register('foreshadowing', ...foreshadowingValidators);
// ... etc
```

#### 15.5.2 ConsistencyChecker

Cross-dimension logical consistency:

```typescript
class ConsistencyChecker {
  private rules: ConsistencyRule[] = [];
  
  register(rule: ConsistencyRule): void {
    this.rules.push(rule);
  }
  
  async checkAll(data: Map<string, DimensionData>): Promise<ConsistencyIssue[]> {
    const issues: ConsistencyIssue[] = [];
    
    for (const rule of this.rules) {
      const result = await rule.check(data);
      if (!result.passed) {
        issues.push({
          rule: rule.name,
          dimensions: rule.dimensions,
          description: result.message,
          severity: result.severity,
          suggestion: result.suggestion
        });
      }
    }
    
    return issues;
  }
}

// Example consistency rules
const consistencyRules: ConsistencyRule[] = [
  {
    name: 'trauma_stress_consistency',
    dimensions: ['psychological', 'narrative'],
    check: async (data) => {
      const psych = data.get('psychological') as PsychologicalData;
      const narrative = data.get('narrative') as NarrativeData;
      
      // If narrative has traumatic events, psychological should show elevated stress
      const traumaticEvents = narrative.events.filter(e => e.traumatic);
      const hasElevatedStress = psych.characters.some(
        c => c.stress > 70 || c.trauma.length > 0
      );
      
      if (traumaticEvents.length > 0 && !hasElevatedStress) {
        return {
          passed: false,
          message: `Narrative has ${traumaticEvents.length} traumatic events but no elevated stress detected`,
          severity: 'warning',
          suggestion: 'Check if psychological extraction is missing trauma response'
        };
      }
      
      return { passed: true, message: 'OK' };
    }
  },
  {
    name: 'foreshadowing_narrative_consistency',
    dimensions: ['foreshadowing', 'narrative'],
    check: async (data) => {
      const foreshadowing = data.get('foreshadowing') as ForeshadowingData;
      const narrative = data.get('narrative') as NarrativeData;
      
      // All payoff events should reference valid setups
      for (const payoff of foreshadowing.payoffs) {
        const setupExists = foreshadowing.setups.some(
          s => s.id === payoff.setupId
        );
        if (!setupExists) {
          return {
            passed: false,
            message: `Payoff "${payoff.description}" references non-existent setup`,
            severity: 'error',
            suggestion: 'Either create the setup or remove the payoff'
          };
        }
      }
      
      return { passed: true, message: 'OK' };
    }
  },
  {
    name: 'world_rules_magic_consistency',
    dimensions: ['world_rules', 'narrative'],
    check: async (data) => {
      const worldRules = data.get('world_rules') as WorldRulesData;
      const narrative = data.get('narrative') as NarrativeData;
      
      // Check recent events don't violate established world rules
      const recentEvents = narrative.events.slice(-10);
      const violations = worldRules.checkEvents(recentEvents);
      
      if (violations.length > 0) {
        return {
          passed: false,
          message: `${violations.length} events violate world rules`,
          severity: 'error',
          suggestion: 'Review events or update world rules'
        };
      }
      
      return { passed: true, message: 'OK' };
    }
  }
];
```

#### 15.5.3 QualityScorer

```typescript
interface QualityScore {
  overall: number; // 0-100
  byDimension: Map<string, number>;
  breakdown: {
    structural: number; // Narrative, world, relationships
    psychological: number; // Character depth
    thematic: number; // Theme, foreshadowing
    stylistic: number; // Style, perspective
    experiential: number; // Pacing, reader experience
  };
}

class QualityScorer {
  private profileManager: ProfileManager;
  
  calculateQuality(data: Map<string, DimensionData>): QualityScore {
    const profile = this.profileManager.getCurrentProfile();
    const weights = profile.qualityWeights;
    
    const dimensionScores = this.calculateDimensionScores(data);
    
    return {
      overall: this.weightedAverage(dimensionScores, weights),
      byDimension: dimensionScores,
      breakdown: {
        structural: this.average([
          dimensionScores.get('narrative') || 0,
          dimensionScores.get('world') || 0,
          dimensionScores.get('relationship') || 0
        ]),
        psychological: dimensionScores.get('psychological') || 0,
        thematic: this.average([
          dimensionScores.get('theme') || 0,
          dimensionScores.get('foreshadowing') || 0
        ]),
        stylistic: this.average([
          dimensionScores.get('style') || 0,
          dimensionScores.get('perspective') || 0
        ]),
        experiential: this.average([
          dimensionScores.get('pacing') || 0,
          dimensionScores.get('reader_experience') || 0
        ])
      }
    };
  }
  
  private calculateDimensionScores(
    data: Map<string, DimensionData>
  ): Map<string, number> {
    const scores = new Map<string, number>();
    
    for (const [name, dimensionData] of data) {
      scores.set(name, this.scoreDimension(name, dimensionData));
    }
    
    return scores;
  }
  
  private scoreDimension(name: string, data: DimensionData): number {
    // Dimension-specific scoring logic
    switch (name) {
      case 'narrative':
        return this.scoreNarrative(data as NarrativeData);
      case 'psychological':
        return this.scorePsychological(data as PsychologicalData);
      case 'theme':
        return this.scoreTheme(data as ThemeData);
      // ... etc
      default:
        return 50; // Default mid score
    }
  }
  
  private scoreNarrative(data: NarrativeData): number {
    let score = 50; // Base
    
    // Reward: causal chain depth
    score += Math.min(20, data.causalChains.length * 2);
    
    // Reward: event density
    score += Math.min(15, data.events.length);
    
    // Penalty: inconsistencies
    score -= data.inconsistencies.length * 5;
    
    // Penalty: timeline gaps
    score -= this.countTimelineGaps(data) * 3;
    
    return Math.max(0, Math.min(100, score));
  }
}
```

---

### 15.6 Storage Abstraction Layer

**Problem**: 11 dimensions each persisting separately leads to fragmented reads, no batch query support, and no versioning for time travel.

#### 15.6.1 UnifiedStore

Single storage interface routing to appropriate backends:

```typescript
interface StoreOptions {
  compression?: boolean;
  versioning?: boolean;
  batchSize?: number;
}

class UnifiedStore {
  private backends: Map<string, StorageBackend> = new Map();
  private options: StoreOptions;
  
  constructor(options: StoreOptions = {}) {
    this.options = {
      compression: true,
      versioning: true,
      batchSize: 10,
      ...options
    };
    
    // Register backends
    this.backends.set('sqlite', new SQLiteBackend());
    this.backends.set('json', new JSONFileBackend());
    this.backends.set('vector', new VectorDBBackend());
  }
  
  // Save dimension data
  async save<T extends DimensionData>(
    dimension: string,
    data: T,
    version?: number
  ): Promise<void> {
    const backend = this.getBackendForDimension(dimension);
    
    if (this.options.versioning) {
      await backend.saveWithVersion(
        this.getDimensionKey(dimension),
        data,
        version
      );
    } else {
      await backend.save(this.getDimensionKey(dimension), data);
    }
  }
  
  // Load dimension data
  async load<T extends DimensionData>(
    dimension: string,
    version?: number
  ): Promise<T> {
    const backend = this.getBackendForDimension(dimension);
    
    if (version) {
      return backend.loadByVersion<T>(
        this.getDimensionKey(dimension),
        version
      );
    }
    
    return backend.load<T>(this.getDimensionKey(dimension));
  }
  
  // Batch load multiple dimensions
  async loadBatch<T extends DimensionData>(
    dimensions: string[],
    chapter?: number
  ): Promise<Map<string, T>> {
    const results = new Map<string, T>();
    
    // Group by backend for efficient loading
    const byBackend = this.groupByBackend(dimensions);
    
    for (const [backendName, dims] of byBackend) {
      const backend = this.backends.get(backendName)!;
      const loaded = await backend.loadBatch<T>(
        dims.map(d => this.getDimensionKey(d)),
        chapter
      );
      
      for (const [key, data] of loaded) {
        const dim = this.dimensionFromKey(key);
        results.set(dim, data);
      }
    }
    
    return results;
  }
  
  // Batch save multiple dimensions
  async saveBatch(
    data: Map<string, DimensionData>,
    chapter: number
  ): Promise<void> {
    const byBackend = new Map<string, Array<{key: string, data: DimensionData}>>();
    
    for (const [dim, dimData] of data) {
      const backend = this.getBackendForDimension(dim);
      const key = this.getDimensionKey(dim);
      
      if (!byBackend.has(backend)) {
        byBackend.set(backend, []);
      }
      byBackend.get(backend)!.push({ key, data: dimData });
    }
    
    // Save in parallel per backend
    const savePromises = Array.from(byBackend.entries()).map(
      async ([backendName, items]) => {
        const backend = this.backends.get(backendName)!;
        await backend.saveBatch(items, chapter);
      }
    );
    
    await Promise.all(savePromises);
  }
  
  // Get all versions for a dimension
  async getVersions(dimension: string): Promise<VersionInfo[]> {
    const backend = this.getBackendForDimension(dimension);
    return backend.getVersions(this.getDimensionKey(dimension));
  }
  
  // Delete dimension
  async delete(dimension: string): Promise<void> {
    const backend = this.getBackendForDimension(dimension);
    await backend.delete(this.getDimensionKey(dimension));
  }
  
  private getBackendForDimension(dimension: string): string {
    // Routing rules
    const vectorDimensions = ['style', 'theme']; // Use vector DB for similarity
    const relationalDimensions = ['narrative', 'relationship', 'world']; // Use SQLite
    const documentDimensions = ['psychological', 'reader_experience']; // Use JSON
    
    if (vectorDimensions.includes(dimension)) return 'vector';
    if (relationalDimensions.includes(dimension)) return 'sqlite';
    return 'json';
  }
  
  private getDimensionKey(dimension: string): string {
    return `dimension:${dimension}`;
  }
  
  private dimensionFromKey(key: string): string {
    return key.replace('dimension:', '');
  }
  
  private groupByBackend(
    dimensions: string[]
  ): Map<string, string[]> {
    const grouped = new Map<string, string[]>();
    
    for (const dim of dimensions) {
      const backend = this.getBackendForDimension(dim);
      if (!grouped.has(backend)) {
        grouped.set(backend, []);
      }
      grouped.get(backend)!.push(dim);
    }
    
    return grouped;
  }
}
```

#### 15.6.2 SnapshotManager

Periodic snapshots for recovery and analysis:

```typescript
class SnapshotManager {
  private store: UnifiedStore;
  private stateManager: StateManager;
  
  // Create snapshot of all dimensions at current chapter
  async createSnapshot(
    chapter: number,
    dimensions: Map<string, DimensionData>
  ): Promise<Snapshot> {
    const snapshot: Snapshot = {
      id: crypto.randomUUID(),
      chapter,
      timestamp: Date.now(),
      dimensions: new Map(dimensions),
      metadata: {
        totalEvents: this.countEvents(dimensions),
        totalCharacters: this.countCharacters(dimensions),
        qualityScore: this.qualityScorer.calculateQuality(dimensions)
      }
    };
    
    // Save snapshot
    await this.saveSnapshot(snapshot);
    
    // Also save to state manager for time travel
    await this.stateManager.createSnapshot(chapter, dimensions);
    
    log.info('Snapshot created', {
      chapter,
      snapshotId: snapshot.id
    });
    
    return snapshot;
  }
  
  // Auto-snapshot: create at milestones
  async autoSnapshotIfMilestone(
    chapter: number,
    dimensions: Map<string, DimensionData>
  ): Promise<Snapshot | null> {
    const milestones = [1, 5, 10, 25, 50, 100, 250, 500, 1000];
    
    if (milestones.includes(chapter)) {
      return this.createSnapshot(chapter, dimensions);
    }
    
    return null;
  }
  
  // List all snapshots
  async listSnapshots(): Promise<SnapshotInfo[]> {
    const snapshotFiles = await this.listSnapshotFiles();
    return snapshotFiles.map(f => this.parseSnapshotInfo(f));
  }
  
  // Restore from snapshot
  async restoreFromSnapshot(
    snapshotId: string
  ): Promise<Map<string, DimensionData>> {
    const snapshot = await this.loadSnapshot(snapshotId);
    if (!snapshot) {
      throw new Error(`Snapshot ${snapshotId} not found`);
    }
    
    log.info('Restoring from snapshot', {
      snapshotId,
      chapter: snapshot.chapter
    });
    
    return snapshot.dimensions;
  }
  
  // Compact old snapshots (keep only milestones)
  async compactSnapshots(): Promise<void> {
    const snapshots = await this.listSnapshots();
    const milestones = [1, 5, 10, 25, 50, 100, 250, 500, 1000];
    
    for (const snapshot of snapshots) {
      if (!milestones.includes(snapshot.chapter)) {
        await this.deleteSnapshot(snapshot.id);
      }
    }
    
    log.info('Snapshot compaction complete', {
      retained: milestones.length,
      deleted: snapshots.length - milestones.length
    });
  }
}
```

---

## 16. Complete Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                          CLI Commands                                 │
│  /start  /continue  /inject  /evolve  /state  /export  /reset         │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────┐
│                     EvolutionOrchestrator                              │
│   ┌────────────┐  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  │
│   │runNovel    │  │loadState    │  │saveState     │  │branchMgmt  │  │
│   │Cycle()     │  │()           │  │()            │  │()          │  │
│   └────────────┘  └─────────────┘  └──────────────┘  └────────────┘  │
│                                                                        │
│   Delegates to:                                                        │
│   ┌─────────────┐ ┌──────────────┐ ┌──────────────┐ ┌─────────────┐   │
│   │DataFlow     │ │LLMResource   │ │Observability │ │Profile      │   │
│   │Orchestrator │ │Manager       │ │Layer         │ │Manager      │   │
│   └──────┬──────┘ └──────┬───────┘ └──────┬───────┘ └──────┬──────┘   │
└─────────┼────────────────┼────────────────┼────────────────┼──────────┘
          │                │                │                │
┌─────────▼────────────────▼────────────────▼────────────────▼──────────┐
│                     Infrastructure Layer                                │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────────┐   │
│  │StateManager│  │EventBus    │  │LLMCache    │  │FeatureToggle   │   │
│  │(snapshots, │  │(reactive   │  │(dedup,     │  │(enable/disable │   │
│  │time travel)│  │ messaging) │  │  TTL)      │  │  features)     │   │
│  └────────────┘  └────────────┘  └────────────┘  └────────────────┘   │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────────┐   │
│  │RateLimiter │  │Fallback    │  │Metrics     │  │AlertSystem     │   │
│  │(API quota) │  │Strategy    │  │Collector   │  │(thresholds,    │   │
│  │            │  │(degradation)│ │(tracking)  │  │  notifications)│   │
│  └────────────┘  └────────────┘  └────────────┘  └────────────────┘   │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────────┐   │
│  │Validation  │  │Consistency │  │Quality     │  │UnifiedStore    │   │
│  │Pipeline    │  │Checker     │  │Scorer      │  │(routing, batch │   │
│  │(per-dim    │  │(cross-dim  │  │(0-100      │  │  ops, version) │   │
│  │  checks)   │  │  logic)    │  │  score)    │  │                │   │
│  └────────────┘  └────────────┘  └────────────┘  └────────────────┘   │
└───────────────────────────────┬───────────────────────────────────────┘
                                │
┌───────────────────────────────▼───────────────────────────────────────┐
│                    Dimension Registry                                   │
│   ┌────────┐┌────────┐┌──────┐┌──────┐┌────────┐┌──────┐┌──────────┐  │
│   │Narrative││Psych  ││World ││Theme ││Foreshad││Pacing││Relation- │  │
│   │        ││       ││      ││      ││owing   ││      ││ship      │  │
│   └────────┘└────────┘└──────┘└──────┘└────────┘└──────┘└──────────┘  │
│   ┌──────────┐┌──────────┐┌──────────┐┌────────┐┌──────────┐          │
│   │WorldRules││Perspect- ││Style     ││Reader  ││          │          │
│   │          ││ive       ││          ││Experience││          │          │
│   └──────────┘└──────────┘└──────────┘└────────┘└──────────┘          │
│                                                                        │
│   Each dimension: Controller + Extractor + Store + Injector + Types   │
└───────────────────────────────┬───────────────────────────────────────┘
                                │
┌───────────────────────────────▼───────────────────────────────────────┐
│                Cross-Dimension Coordination (3 Layers)                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────┐       │
│  │Layer 1: Data    │  │Layer 2: Event/  │  │Layer 3: Conflict │       │
│  │Dependency       │  │Rule Engine      │  │Resolution        │       │
│  │(load order)     │  │(reactive rules) │  │(priority-based)  │       │
│  └─────────────────┘  └─────────────────┘  └──────────────────┘       │
└───────────────────────────────┬───────────────────────────────────────┘
                                │
┌───────────────────────────────▼───────────────────────────────────────┐
│                        Storage Backends                                 │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────────┐   │
│  │SQLite      │  │JSON Files  │  │Vector DB   │  │Memory Cache    │   │
│  │(narrative, │  │(psych,     │  │(style,     │  │(LRU, for       │   │
│  │relations)  │  │reader exp) │  │  theme)    │  │  perf)         │   │
│  └────────────┘  └────────────┘  └────────────┘  └────────────────┘   │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 17. Updated Work Estimate

| Component | Files | Lines of Code | Complexity |
|-----------|-------|---------------|------------|
| Core Infrastructure | 4 | ~800 | Medium |
| Existing Dimensions (3) | 15 | ~2,400 | High (migration) |
| New Dimensions (8) | 40 | ~4,000 | Medium-High |
| Cross-Dimension Coordination | 6 | ~800 | High |
| **Data Flow Management** | **4** | **~1,000** | **High** |
| **LLM Resource Management** | **4** | **~1,200** | **High** |
| **Observability Layer** | **3** | **~800** | **Medium** |
| **Strategy & Config Layer** | **3** | **~900** | **Medium** |
| **Quality Assurance** | **4** | **~1,000** | **High** |
| **Storage Abstraction** | **4** | **~1,000** | **Medium-High** |
| Tests | 60+ | ~3,000 | Medium |
| Migration & Docs | 5 | ~500 | Low |
| **Total** | **~152** | **~17,400** | **High** |

---

## 18. Conclusion

This refactoring transforms a monolithic, tightly-coupled novel engine into a modular, extensible 11-dimensional architecture with 6 essential infrastructure layers. The complete system comprises:

1. **11 Dimension Controllers** - Each independently testable, responsible for one aspect of story consistency
2. **Cross-Dimension Coordination (3 layers)** - Data dependency, rule engine, conflict resolution
3. **Data Flow Management** - State snapshots, time travel, event bus, batch operations
4. **LLM Resource Management** - Call optimization, caching, rate limiting, fallback strategies
5. **Observability Layer** - Metrics collection, alerting, health monitoring, distributed tracing
6. **Strategy & Configuration** - Novel type profiles, dynamic weight adjustment, feature toggles
7. **Quality Assurance** - Validation pipelines, cross-dimension consistency checks, quality scoring
8. **Storage Abstraction** - Unified store with backend routing, batch operations, versioning

The architecture treats dimensions like an **orchestra**: each plays its own part, but the conductor (coordinator + rule engine + infrastructure) ensures they play harmonious music together. The 6 infrastructure layers are the **concert hall** - providing acoustics (storage), lighting (observability), scheduling (data flow), budget (LLM management), programming (configuration), and quality control (QA).

The estimated effort is **~17,400 lines of code across ~152 files**, organized into 7 implementation phases over 18 weeks.

---

## 19. Visual Generation Module

### 19.1 Position in Architecture

Visual generation is **NOT a dimension** but an **output pipeline** that consumes dimension data to produce image prompts. It sits alongside the 11 dimensions as a parallel output consumer:

```
┌─────────────────────────────────────────────────────────────────┐
│                     Story Generation                              │
│              (11 Dimensions + Coordination)                       │
└──────────────────────────┬──────────────────────────────────────┘
                           │
            ┌──────────────┼──────────────┐
            │              │              │
     ┌──────▼──────┐ ┌────▼─────┐  ┌─────▼──────┐
     │Text Output  │ │Visual    │  │Metadata    │
     │(Story Text) │ │Output    │  │Output      │
     │             │ │(Panels)  │  │(State JSON)│
     └─────────────┘ └──────────┘  └────────────┘
```

The visual module consumes:
- **Narrative dimension**: Key events, locations, actions
- **Psychological dimension**: Character emotions, stress levels
- **Style dimension**: Visual style preferences
- **Perspective dimension**: Camera angles, POV

But does NOT contribute to story state maintenance - it's a pure output transformer.

### 19.2 Current Visual Module Structure

| File | Size | Responsibility |
|------|------|----------------|
| `visual-orchestrator.ts` | 38.4KB | Main orchestration, panel planning, generation |
| `visual-translator.ts` | 24.9KB | Story-to-panel translation, segmentation |
| `visual-prompt-engineer.ts` | 19.0KB | Prompt engineering for image generation |
| `visual-orchestrator.test.ts` | 7.4KB | Unit tests |

**Current Pipeline**:
```
Story Segment → VisualOrchestrator
  → Panel Planning (LLM or rule-based segmentation)
  → VisualPromptEngineer (hybrid engine)
    → Character appearance extraction
    → Scene composition
    → Lighting and mood from psychological state
    → Camera spec from narrative tone
  → VisualPanelSpec[] (output)
  → Save to .opencode/novel/panels/
```

### 19.3 Integration with 11-Dimensional Architecture

The visual module should be enhanced to **consume dimension data** for richer panels:

```typescript
interface VisualDimensionInput {
  // From Narrative dimension
  keyEvents: Array<{
    description: string;
    location: string;
    action: string;
  }>;
  
  // From Psychological dimension
  characterStates: Array<{
    name: string;
    emotion: string;
    stressLevel: number;
    visibleTraits: string[]; // e.g., "trembling hands", "tear-stained face"
  }>;
  
  // From Style dimension
  visualStyle: {
    artStyle: string; // "cinematic", "anime", "oil painting"
    colorPalette: string[];
    lightingMood: string;
  };
  
  // From Perspective dimension
  cameraSpecs: Array<{
    angle: string; // "close-up", "wide shot", "over-the-shoulder"
    focus: string;
    depthOfField: string;
  }>;
  
  // From Pacing dimension
  tensionLevel: number; // 0-1, affects visual composition
  sceneType: 'action' | 'dialogue' | 'contemplation' | 'transition';
}

class VisualOrchestrator {
  private dimensionExtractor: DimensionVisualExtractor;
  
  // Enhanced generation with dimension input
  async generatePanelsWithDimensions(
    storySegment: string,
    dimensionData: Map<string, DimensionData>
  ): Promise<VisualPanelSpec[]> {
    // Extract visual-relevant data from all dimensions
    const visualInput = this.dimensionExtractor.extractFromDimensions(dimensionData);
    
    // Build enriched context
    const context = {
      storySegment,
      characters: visualInput.characterStates,
      events: visualInput.keyEvents,
      style: visualInput.visualStyle,
      cameraSpecs: visualInput.cameraSpecs,
      tensionLevel: visualInput.tensionLevel,
      sceneType: visualInput.sceneType
    };
    
    // Generate panels using existing pipeline
    return this.generatePanels(context);
  }
}
```

### 19.4 Visual Module Refactoring Plan

The visual module needs **minimal refactoring** compared to the 11 dimensions:

| Change | Type | Effort |
|--------|------|--------|
| Add dimension data input interface | New feature | ~200 lines |
| Extract visual cues from dimensions | Enhancement | ~300 lines |
| Merge with existing pipeline | Integration | ~150 lines |
| Update tests | Testing | ~100 lines |
| **Total** | | **~750 lines** |

**Key Principle**: Visual generation remains an **output-only** module. It reads from dimensions but never writes back. It's like a "view" in MVC - a projection of the story state into visual form.

### 19.5 Visual Panel Output Format

```typescript
interface VisualPanelSpec {
  id: string;
  chapter: number;
  panelIndex: number;
  
  // Scene composition
  scene: {
    location: string;
    timeOfDay: string;
    weather: string;
    lighting: string;
  };
  
  // Characters in frame
  characters: Array<{
    name: string;
    position: string; // "center", "left", "right", "background"
    expression: string;
    posture: string;
    visibleEmotions: string[];
  }>;
  
  // Camera spec
  camera: {
    angle: string;
    shotType: 'close-up' | 'medium' | 'wide' | 'extreme-wide';
    focus: string;
    depthOfField: 'shallow' | 'medium' | 'deep';
  };
  
  // Style directives
  style: {
    artStyle: string;
    colorPalette: string[];
    mood: string;
    visualMetaphors?: string[];
  };
  
  // Image generation prompts
  prompts: {
    positive: string; // What to include
    negative: string; // What to avoid
    cfg_scale?: number;
    steps?: number;
  };
  
  // Metadata
  metadata: {
    generatedAt: number;
    sourceDimensions: string[]; // Which dimensions contributed
    confidence: number; // 0-1, how well the panel represents the story
  };
}
```

### 19.6 Visual Module File Structure (Post-Refactoring)

```
novel-engine/
├── visual/
│   ├── orchestrator.ts              # Main orchestration (refactored)
│   ├── translator.ts                # Story-to-panel translation
│   ├── prompt-engineer.ts           # Prompt engineering
│   ├── dimension-extractor.ts       # NEW: Extract visual data from dimensions
│   ├── panel-formatter.ts           # Output formatting
│   ├── types.ts                     # Visual-specific types
│   └── tests/
│       ├── orchestrator.test.ts
│       ├── dimension-extractor.test.ts  # NEW
│       └── integration.test.ts
```

---

## 20. Updated Work Estimate

| Component | Files | Lines of Code | Complexity |
|-----------|-------|---------------|------------|
| Core Infrastructure | 4 | ~800 | Medium |
| Existing Dimensions (3) | 15 | ~2,400 | High (migration) |
| New Dimensions (8) | 40 | ~4,000 | Medium-High |
| Cross-Dimension Coordination | 6 | ~800 | High |
| **Data Flow Management** | **4** | **~1,000** | **High** |
| **LLM Resource Management** | **4** | **~1,200** | **High** |
| **Observability Layer** | **3** | **~800** | **Medium** |
| **Strategy & Config Layer** | **3** | **~900** | **Medium** |
| **Quality Assurance** | **4** | **~1,000** | **High** |
| **Storage Abstraction** | **4** | **~1,000** | **Medium-High** |
| **Visual Generation Module** | **7** | **~750** | **Low-Medium** |
| Tests | 60+ | ~3,000 | Medium |
| Migration & Docs | 5 | ~500 | Low |
| **Total** | **~159** | **~18,150** | **High** |

---

## 21. Conclusion

This refactoring transforms a monolithic, tightly-coupled novel engine into a modular, extensible 11-dimensional architecture with 6 essential infrastructure layers and a dedicated visual output pipeline. The complete system comprises:

1. **11 Dimension Controllers** - Each independently testable, responsible for one aspect of story consistency
2. **Cross-Dimension Coordination (3 layers)** - Data dependency, rule engine, conflict resolution
3. **Data Flow Management** - State snapshots, time travel, event bus, batch operations
4. **LLM Resource Management** - Call optimization, caching, rate limiting, fallback strategies
5. **Observability Layer** - Metrics collection, alerting, health monitoring, distributed tracing
6. **Strategy & Configuration** - Novel type profiles, dynamic weight adjustment, feature toggles
7. **Quality Assurance** - Validation pipelines, cross-dimension consistency checks, quality scoring
8. **Storage Abstraction** - Unified store with backend routing, batch operations, versioning
9. **Visual Generation Pipeline** - Dimension-aware panel generation for image prompts

The architecture treats dimensions like an **orchestra**: each plays its own part, but the conductor (coordinator + rule engine + infrastructure) ensures they play harmonious music together. The 6 infrastructure layers are the **concert hall** - providing acoustics (storage), lighting (observability), scheduling (data flow), budget (LLM management), programming (configuration), and quality control (QA). And the visual pipeline is the **recording studio** - capturing the performance for the audience to experience.

The estimated effort is **~18,150 lines of code across ~159 files**, organized into 7 implementation phases over 18 weeks.

---

*Document Version: 3.0*  
*Created: 2026-04-08*  
*Last Updated: 2026-04-08*  
*Author: Qoder AI Assistant*
