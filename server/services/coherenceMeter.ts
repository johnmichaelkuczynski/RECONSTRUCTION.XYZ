import Anthropic from '@anthropic-ai/sdk';

// Utility to strip markdown formatting from text
function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')         // Remove heading markers
    .replace(/\*\*\*([^*]+)\*\*\*/g, '$1') // Remove bold+italic
    .replace(/\*\*([^*]+)\*\*/g, '$1')   // Remove bold
    .replace(/\*([^*]+)\*/g, '$1')       // Remove italic
    .replace(/___([^_]+)___/g, '$1')     // Remove bold+italic (underscores)
    .replace(/__([^_]+)__/g, '$1')       // Remove bold (underscores)
    .replace(/_([^_]+)_/g, '$1')         // Remove italic (underscores)
    .replace(/~~([^~]+)~~/g, '$1')       // Remove strikethrough
    .replace(/`([^`]+)`/g, '$1')         // Remove inline code
    .replace(/^\s*[-*+]\s+/gm, '')       // Remove bullet points
    .replace(/^\s*\d+\.\s+/gm, '')       // Remove numbered lists
    .replace(/^\s*>\s*/gm, '')           // Remove blockquotes
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links, keep text
    .trim();
}

export interface CoherenceAnalysisResult {
  score: number;
  assessment: "PASS" | "WEAK" | "FAIL";
  analysis: string;
  subscores: {
    internalLogic: number;
    clarity: number;
    structuralUnity: number;
    fauxCoherenceDetection: number;
  };
}

export interface CoherenceRewriteResult {
  rewrittenText: string;
  changes: string;
}

// Global Context Object for cross-chunk coherence preservation
export interface GlobalContextObject {
  coreTopics: string[];
  centralFramework: string | null;
  keyConcepts: string[];
  argumentDirection: string | null;
  emotionalTrajectory: string | null;
  instructionalGoal: string | null;
  mathematicalAssumptions: string | null;
}

// Global Coherence State (GCS) - mode-specific state that evolves across chunks
// This is NOT a summary - it's a state vector that must be carried forward

// Base interface for all coherence states
export interface BaseCoherenceState {
  mode: string;
  stateHistory: string[]; // Log of state transitions
}

// LC_STATE: Logical Consistency (Non-Contradiction Only)
export interface LogicalConsistencyState extends BaseCoherenceState {
  mode: "logical-consistency";
  assertions: string[];           // list of atomic claims already asserted
  negations: string[];            // list of claims explicitly denied
  disjoint_pairs: [string, string][]; // pairs that cannot both be true in this text's frame
}

// LCH_STATE: Logical Cohesiveness (Argument Structure)
export interface LogicalCohesivenessState extends BaseCoherenceState {
  mode: "logical-cohesiveness";
  thesis: string;                 // what the argument is trying to establish
  support_queue: string[];        // claims promised but not yet supported
  current_stage: "setup" | "support" | "objection" | "reply" | "synthesis" | "conclusion";
  bridge_required: string;        // what must connect prior chunk to next
}

// SCI_STATE: Scientific/Explanatory (Mechanism Continuity)
export interface ScientificExplanatoryState extends BaseCoherenceState {
  mode: "scientific-explanatory";
  causal_graph_nodes: string[];   // variables named so far (runoff, imperviousness, peak flow, etc.)
  causal_edges: { from: string; to: string; direction: "+" | "-"; mechanism: string }[];
  level: "physical" | "socio-economic" | "institutional" | "mixed";
  active_feedback_loops: { name: string; participants: string[]; status: "active" | "resolved" }[];
  mechanism_requirements: Record<string, string>; // for each major claim: what mechanism was given
}

// THEME_STATE: Thematic/Psychological (Emotional & Mood Flow)
export interface ThematicPsychologicalState extends BaseCoherenceState {
  mode: "thematic-psychological";
  dominant_affect: string;        // anxious | sober | outraged | hopeful | etc.
  tempo: "calm" | "urgent" | "escalating" | "resolving";
  stance: string;                 // analytic | warning | elegiac | motivational | etc.
}

// INST_STATE: Instructional (Clear, Actionable Message)
export interface InstructionalState extends BaseCoherenceState {
  mode: "instructional";
  goal: string;                   // the target outcome the instructions aim at
  steps_done: string[];           // ordered steps already provided
  prereqs: string[];              // assumptions required before later steps
  open_loops: string[];           // steps promised but not yet given
}

// MOT_STATE: Motivational (Consistent Emotional Direction)
export interface MotivationalState extends BaseCoherenceState {
  mode: "motivational";
  direction: "encourage" | "pressure" | "reassure" | "challenge" | "warn";
  intensity: number;              // 1-5
  target: string;                 // who is being motivated (reader, policymaker, student)
}

// MATH_STATE: Mathematical (Proof Validity)
export interface MathematicalState extends BaseCoherenceState {
  mode: "mathematical";
  givens: string[];               // axioms/assumptions introduced
  proved: string[];               // lemmas established
  goal: string;                   // theorem statement
  proof_method: "direct" | "contradiction" | "induction" | "construction" | "cases";
  dependencies: Record<string, string[]>; // what each step relies on
}

// PHIL_STATE: Philosophical (Conceptual Rigor; Dialectical Engagement)
export interface PhilosophicalState extends BaseCoherenceState {
  mode: "philosophical";
  core_concepts: Record<string, string>; // term → role
  distinctions: [string, string][];      // A vs B pairs
  dialectic: { objections_raised: string[]; replies_pending: string[] };
  no_equivocation: string[];             // list of terms that must not silently change meaning
}

// Union type for all coherence states
export type GlobalCoherenceState = 
  | LogicalConsistencyState
  | LogicalCohesivenessState
  | ScientificExplanatoryState
  | ThematicPsychologicalState
  | InstructionalState
  | MotivationalState
  | MathematicalState
  | PhilosophicalState;

// Mode-specific diff payloads matching each template's fields
export interface LogicalConsistencyDiff {
  mode: "logical-consistency";
  new_assertions: string[];
  new_negations: string[];
  new_disjoint_pairs: [string, string][];
  contradictions_detected: string[]; // If any, marks FAIL
}

export interface LogicalCohesivenessDiff {
  mode: "logical-cohesiveness";
  thesis_update: string | null;
  claims_supported: string[];       // Move from support_queue when supported
  new_claims_requiring_support: string[];
  stage_shift: { from: string; to: string } | null;
  bridge_for_next_chunk: string;
}

export interface ScientificExplanatoryDiff {
  mode: "scientific-explanatory";
  new_causal_nodes: string[];
  new_causal_edges: { from: string; to: string; direction: "+" | "-"; mechanism: string }[];
  new_feedback_loops: { name: string; participants: string[] }[];
  resolved_loops: string[];
  level_shift: { from: string; to: string } | null;
  mechanism_requirements_added: Record<string, string>;
}

export interface ThematicPsychologicalDiff {
  mode: "thematic-psychological";
  affect_change: { from: string; to: string } | null;
  tempo_change: { from: string; to: string } | null;
  stance_change: { from: string; to: string } | null;
}

export interface InstructionalDiff {
  mode: "instructional";
  new_steps: string[];
  prereqs_satisfied: string[];
  new_open_loops: string[];
  loops_closed: string[];
}

export interface MotivationalDiff {
  mode: "motivational";
  direction_change: { from: string; to: string } | null;
  intensity_change: { from: number; to: number } | null;
  target_change: string | null;
}

export interface MathematicalDiff {
  mode: "mathematical";
  new_givens: string[];
  new_proved: string[];
  goal_update: string | null;
  method_change: { from: string; to: string } | null;
  new_dependencies: Record<string, string[]>;
}

export interface PhilosophicalDiff {
  mode: "philosophical";
  new_concepts: Record<string, string>;  // term → role
  new_distinctions: [string, string][];
  new_objections: string[];
  objections_replied: string[];
  equivocation_violations: string[];     // If any, marks FAIL
}

// Union type for all mode-specific diffs
export type ModeSpecificDiff = 
  | LogicalConsistencyDiff
  | LogicalCohesivenessDiff
  | ScientificExplanatoryDiff
  | ThematicPsychologicalDiff
  | InstructionalDiff
  | MotivationalDiff
  | MathematicalDiff
  | PhilosophicalDiff;

// Backwards-compatible generic diff (for parsing fallback)
export interface CoherenceStateDiff {
  newElements: string[];
  resolvedElements: string[];
  abandonedElements: string[];
  levelOrPhaseShift: { from: string; to: string } | null;
  trajectoryChange: { from: string; to: string } | null;
  modeSpecific?: ModeSpecificDiff;
}

// Legacy interfaces for backward compatibility
export interface ActiveMechanism {
  cause: string;
  effect: string;
  mechanism: string;
  status: "active" | "resolved" | "abandoned";
  introducedInChunk: number;
}

export interface FeedbackLoop {
  loopName: string;
  participants: string[];
  evidence: string;
  status: "active" | "resolved";
  introducedInChunk: number;
}

export interface OpenThread {
  claim: string;
  requiredFollowUp: string;
  introducedInChunk: number;
}

export interface LiveCausalState {
  activeMechanisms: ActiveMechanism[];
  feedbackLoops: FeedbackLoop[];
  explanatoryLevel: "mechanism" | "system" | "policy" | "behavior";
  openThreads: OpenThread[];
  causalHistory: string[];
}

export interface StateDiff {
  newMechanisms: ActiveMechanism[];
  resolvedMechanisms: string[];
  abandonedMechanisms: string[];
  newLoops: FeedbackLoop[];
  resolvedLoops: string[];
  newThreads: OpenThread[];
  resolvedThreads: string[];
  levelShift: { from: string; to: string } | null;
}

export interface ChunkCoherenceResult {
  chunkIndex: number;
  status: "preserved" | "weakened" | "shifted";
  strainLocations: string[];
  repairSuggestions: string[];
  analysis: string;
  score: number;
}

export interface GlobalCoherenceAnalysisResult {
  globalContextObject: GlobalContextObject;
  chunkResults: ChunkCoherenceResult[];
  overallScore: number;
  overallAssessment: "PASS" | "WEAK" | "FAIL";
  aggregatedAnalysis: string;
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// Initialize Global Coherence State (GCS) based on mode
export function initializeGCS(mode: string, gco: GlobalContextObject): GlobalCoherenceState {
  const baseHistory = [`[Chunk 0] Initial state seeded from GCO`];
  
  switch (mode) {
    case "logical-consistency":
      return {
        mode: "logical-consistency",
        stateHistory: baseHistory,
        assertions: gco.keyConcepts || [],
        negations: [],
        disjoint_pairs: []
      };
    
    case "logical-cohesiveness":
      return {
        mode: "logical-cohesiveness",
        stateHistory: baseHistory,
        thesis: gco.argumentDirection || "",
        support_queue: gco.keyConcepts || [],
        current_stage: "setup",
        bridge_required: ""
      };
    
    case "scientific-explanatory":
      return {
        mode: "scientific-explanatory",
        stateHistory: baseHistory,
        causal_graph_nodes: gco.keyConcepts || [],
        causal_edges: [],
        level: detectCausalLevel(gco),
        active_feedback_loops: [],
        mechanism_requirements: {}
      };
    
    case "thematic-psychological":
      return {
        mode: "thematic-psychological",
        stateHistory: baseHistory,
        dominant_affect: gco.emotionalTrajectory || "neutral",
        tempo: "calm",
        stance: "analytic"
      };
    
    case "instructional":
      return {
        mode: "instructional",
        stateHistory: baseHistory,
        goal: gco.instructionalGoal || "Complete the task",
        steps_done: [],
        prereqs: [],
        open_loops: []
      };
    
    case "motivational":
      return {
        mode: "motivational",
        stateHistory: baseHistory,
        direction: "encourage",
        intensity: 3,
        target: "reader"
      };
    
    case "mathematical":
      return {
        mode: "mathematical",
        stateHistory: baseHistory,
        givens: gco.mathematicalAssumptions ? [gco.mathematicalAssumptions] : [],
        proved: [],
        goal: "",
        proof_method: "direct",
        dependencies: {}
      };
    
    case "philosophical":
      return {
        mode: "philosophical",
        stateHistory: baseHistory,
        core_concepts: {},
        distinctions: [],
        dialectic: { objections_raised: [], replies_pending: [] },
        no_equivocation: gco.keyConcepts || []
      };
    
    default:
      return {
        mode: "logical-consistency",
        stateHistory: baseHistory,
        assertions: [],
        negations: [],
        disjoint_pairs: []
      };
  }
}

function detectCausalLevel(gco: GlobalContextObject): "physical" | "socio-economic" | "institutional" | "mixed" {
  const conceptsLower = (gco.keyConcepts || []).map(c => c.toLowerCase()).join(" ");
  if (conceptsLower.includes("policy") || conceptsLower.includes("regulation") || conceptsLower.includes("institution")) return "institutional";
  if (conceptsLower.includes("economic") || conceptsLower.includes("social") || conceptsLower.includes("behavior")) return "socio-economic";
  if (conceptsLower.includes("physical") || conceptsLower.includes("mechanism") || conceptsLower.includes("hydro")) return "physical";
  return "mixed";
}

// Serialize GCS for injection into prompts with worked examples
export function serializeGCS(state: GlobalCoherenceState): string {
  const mode = state.mode;
  let stateDetails = "";
  let workedExample = "";
  
  switch (mode) {
    case "logical-consistency": {
      const s = state as LogicalConsistencyState;
      stateDetails = `
LC_STATE:
- assertions: [${s.assertions.join(", ") || "None yet"}]
- negations: [${s.negations.join(", ") || "None"}]
- disjoint_pairs: [${s.disjoint_pairs.map(([a, b]) => `(${a}, ${b})`).join(", ") || "None"}]`;
      workedExample = `
WORKED EXAMPLE:
- Chunk 1: "Levees reduce small floods." → assertions += [levees_reduce_small_floods]
- Chunk 3: "Levees do not reduce small floods." → CONTRADICTION → FAIL
- Chunk 3: "Levees reduce small floods but increase catastrophic risk." → PASS (not contradiction)`;
      break;
    }
    case "logical-cohesiveness": {
      const s = state as LogicalCohesivenessState;
      stateDetails = `
LCH_STATE:
- thesis: "${s.thesis || "Not yet established"}"
- support_queue: [${s.support_queue.join(", ") || "Empty"}]
- current_stage: ${s.current_stage.toUpperCase()}
- bridge_required: "${s.bridge_required || "None"}"`;
      workedExample = `
WORKED EXAMPLE:
- Chunk 1 thesis: "Flood control fails due to feedback loops."
- Chunk 2: adds example of treadmill effect → advances support → PASS
- Chunk 3: restates "feedback loops exist" with no new support → stall → FAIL
- Chunk 4: introduces "insurance incentives" without linking to thesis → missing bridge → FAIL unless it connects: "Insurance subsidies amplify the treadmill by..."`;
      break;
    }
    case "scientific-explanatory": {
      const s = state as ScientificExplanatoryState;
      const activeLoops = s.active_feedback_loops.filter(l => l.status === "active");
      stateDetails = `
SCI_STATE:
- causal_graph_nodes: [${s.causal_graph_nodes.join(", ") || "None"}]
- causal_edges: [${s.causal_edges.map(e => `${e.from} →${e.direction} ${e.to}`).join(", ") || "None"}]
- level: ${s.level.toUpperCase()}
- active_feedback_loops: [${activeLoops.map(l => l.name).join(", ") || "None"}]
- mechanism_requirements: {${Object.entries(s.mechanism_requirements).map(([k, v]) => `"${k}": "${v}"`).join(", ") || ""}}`;
      workedExample = `
WORKED EXAMPLE:
- Chunk 1: "impervious surfaces ↑ → infiltration ↓ → runoff ↑" → store as edges
- Next chunk: "Drainage expansion induces development."
- To be coherent, it MUST carry through mechanism: "Drainage capacity ↑ → perceived risk ↓ → development ↑ → imperviousness ↑ → runoff ↑"
- If chunk merely says "feedback loops happen" without edges → FAIL (resets from mechanism to slogan)
- PASS conditions: extend loop, use loop to explain new phenomenon, or explicitly close it`;
      break;
    }
    case "thematic-psychological": {
      const s = state as ThematicPsychologicalState;
      stateDetails = `
THEME_STATE:
- dominant_affect: ${s.dominant_affect}
- tempo: ${s.tempo}
- stance: ${s.stance}`;
      workedExample = `
WORKED EXAMPLE:
- Chunk 1: sober/analytic tone
- Chunk 2 shifts to alarmist moralizing ("disastrous betrayal...") with no ramp → FAIL
- Chunk 2 shifts to cautionary warning but signals it ("This is where the risk becomes political...") → PASS`;
      break;
    }
    case "instructional": {
      const s = state as InstructionalState;
      stateDetails = `
INST_STATE:
- goal: "${s.goal}"
- steps_done: [${s.steps_done.join(", ") || "None yet"}]
- prereqs: [${s.prereqs.join(", ") || "None"}]
- open_loops: [${s.open_loops.join(", ") || "None"}]`;
      workedExample = `
WORKED EXAMPLE:
- Chunk 1: Step 1 "Map drainage basins." Step 2 "Identify choke points."
- Chunk 2 jumps to "Implement permeable pavement" without prerequisites ("identify candidate corridors") → FAIL
- Chunk 2 includes missing prereq step → PASS`;
      break;
    }
    case "motivational": {
      const s = state as MotivationalState;
      stateDetails = `
MOT_STATE:
- direction: ${s.direction.toUpperCase()}
- intensity: ${s.intensity}/5
- target: ${s.target}`;
      workedExample = `
WORKED EXAMPLE:
- Chunk 1: reassure (2/5) "manageable with planning"
- Chunk 2: doom (5/5) "hopeless unless revolution" → reversal → FAIL
- Chunk 2: escalate to urgency (3/5) with continuity → PASS`;
      break;
    }
    case "mathematical": {
      const s = state as MathematicalState;
      stateDetails = `
MATH_STATE:
- givens: [${s.givens.join(", ") || "None"}]
- proved: [${s.proved.join(", ") || "None yet"}]
- goal: "${s.goal || "Not stated"}"
- proof_method: ${s.proof_method.toUpperCase()}
- dependencies: {${Object.entries(s.dependencies).map(([k, v]) => `"${k}": [${v.join(", ")}]`).join(", ") || ""}}`;
      workedExample = `
WORKED EXAMPLE:
- Chunk 1 defines assumption A and aims to prove T.
- Chunk 2 uses lemma L without proving it or citing it as known → FAIL
- Chunk 2 proves L then uses it → PASS`;
      break;
    }
    case "philosophical": {
      const s = state as PhilosophicalState;
      stateDetails = `
PHIL_STATE:
- core_concepts: {${Object.entries(s.core_concepts).map(([k, v]) => `"${k}": "${v}"`).join(", ") || ""}}
- distinctions: [${s.distinctions.map(([a, b]) => `(${a} vs ${b})`).join(", ") || "None"}]
- dialectic: {objections: [${s.dialectic.objections_raised.join(", ")}], replies_pending: [${s.dialectic.replies_pending.join(", ")}]}
- no_equivocation: [${s.no_equivocation.join(", ") || "None"}]`;
      workedExample = `
WORKED EXAMPLE:
- Chunk 1: "structural cause" = policy/institutional determinants.
- Chunk 3 uses "structural" to mean "physical infrastructure" → EQUIVOCATION → FAIL
- Chunk 3 explicitly marks shift ("structural in the engineering sense") → PASS`;
      break;
    }
  }
  
  // Add expected diff format for this mode
  let expectedDiffFormat = "";
  switch (mode) {
    case "logical-consistency":
      expectedDiffFormat = `
EXPECTED STATE_UPDATE FORMAT:
{"mode":"logical-consistency","new_assertions":["..."],"new_negations":["..."],"new_disjoint_pairs":[["A","B"]],"contradictions_detected":["..."]}`;
      break;
    case "logical-cohesiveness":
      expectedDiffFormat = `
EXPECTED STATE_UPDATE FORMAT:
{"mode":"logical-cohesiveness","thesis_update":"...or null","claims_supported":["..."],"new_claims_requiring_support":["..."],"stage_shift":{"from":"setup","to":"support"},"bridge_for_next_chunk":"..."}`;
      break;
    case "scientific-explanatory":
      expectedDiffFormat = `
EXPECTED STATE_UPDATE FORMAT:
{"mode":"scientific-explanatory","new_causal_nodes":["..."],"new_causal_edges":[{"from":"X","to":"Y","direction":"+","mechanism":"..."}],"new_feedback_loops":[{"name":"...","participants":["..."]}],"resolved_loops":["..."],"level_shift":null,"mechanism_requirements_added":{"claim":"mechanism"}}`;
      break;
    case "thematic-psychological":
      expectedDiffFormat = `
EXPECTED STATE_UPDATE FORMAT:
{"mode":"thematic-psychological","affect_change":{"from":"sober","to":"urgent"},"tempo_change":{"from":"calm","to":"escalating"},"stance_change":null}`;
      break;
    case "instructional":
      expectedDiffFormat = `
EXPECTED STATE_UPDATE FORMAT:
{"mode":"instructional","new_steps":["..."],"prereqs_satisfied":["..."],"new_open_loops":["..."],"loops_closed":["..."]}`;
      break;
    case "motivational":
      expectedDiffFormat = `
EXPECTED STATE_UPDATE FORMAT:
{"mode":"motivational","direction_change":{"from":"encourage","to":"warn"},"intensity_change":{"from":2,"to":4},"target_change":null}`;
      break;
    case "mathematical":
      expectedDiffFormat = `
EXPECTED STATE_UPDATE FORMAT:
{"mode":"mathematical","new_givens":["..."],"new_proved":["..."],"goal_update":"...or null","method_change":null,"new_dependencies":{"step":"[deps]"}}`;
      break;
    case "philosophical":
      expectedDiffFormat = `
EXPECTED STATE_UPDATE FORMAT:
{"mode":"philosophical","new_concepts":{"term":"role"},"new_distinctions":[["A","B"]],"new_objections":["..."],"objections_replied":["..."],"equivocation_violations":["..."]}`;
      break;
  }
  
  return `
GLOBAL COHERENCE STATE (must be preserved or deliberately evolved):
Mode: ${mode.toUpperCase().replace(/-/g, " ")}
${stateDetails}
${workedExample}
${expectedDiffFormat}`;
}

// Update GCS after processing a chunk - applies mode-specific diffs to state fields
export function updateGCS(state: GlobalCoherenceState, diff: CoherenceStateDiff, chunkIndex: number): GlobalCoherenceState {
  const historyEntry = buildHistoryEntry(diff, chunkIndex);
  const newHistory = [...state.stateHistory, historyEntry];
  
  // If mode-specific diff is available, use it; otherwise fall back to generic
  const ms = diff.modeSpecific;
  
  switch (state.mode) {
    case "logical-consistency": {
      const s = state as LogicalConsistencyState;
      if (ms && ms.mode === "logical-consistency") {
        const d = ms as LogicalConsistencyDiff;
        return {
          ...s,
          stateHistory: newHistory,
          assertions: [...s.assertions, ...d.new_assertions],
          negations: [...s.negations, ...d.new_negations],
          disjoint_pairs: [...s.disjoint_pairs, ...d.new_disjoint_pairs]
        };
      }
      // Fallback to generic
      return {
        ...s,
        stateHistory: newHistory,
        assertions: [...s.assertions, ...diff.newElements],
        negations: [...s.negations, ...diff.abandonedElements]
      };
    }
    
    case "logical-cohesiveness": {
      const s = state as LogicalCohesivenessState;
      if (ms && ms.mode === "logical-cohesiveness") {
        const d = ms as LogicalCohesivenessDiff;
        const newQueue = [...s.support_queue, ...d.new_claims_requiring_support]
          .filter(c => !d.claims_supported.includes(c));
        let newStage = s.current_stage;
        if (d.stage_shift) {
          newStage = d.stage_shift.to as typeof s.current_stage;
        }
        return {
          ...s,
          stateHistory: newHistory,
          thesis: d.thesis_update || s.thesis,
          support_queue: newQueue,
          current_stage: newStage,
          bridge_required: d.bridge_for_next_chunk || s.bridge_required
        };
      }
      // Fallback
      let newStage = s.current_stage;
      if (diff.levelOrPhaseShift) {
        newStage = diff.levelOrPhaseShift.to as typeof s.current_stage;
      }
      return {
        ...s,
        stateHistory: newHistory,
        support_queue: [...s.support_queue, ...diff.newElements].filter(c => !diff.resolvedElements.includes(c)),
        current_stage: newStage
      };
    }
    
    case "scientific-explanatory": {
      const s = state as ScientificExplanatoryState;
      if (ms && ms.mode === "scientific-explanatory") {
        const d = ms as ScientificExplanatoryDiff;
        const newNodes = [...s.causal_graph_nodes, ...d.new_causal_nodes.filter(n => !s.causal_graph_nodes.includes(n))];
        const newEdges = [...s.causal_edges, ...d.new_causal_edges];
        // Add new loops, then REMOVE resolved ones entirely (not just status flip)
        const existingActiveLoops = s.active_feedback_loops.filter(l => !d.resolved_loops.includes(l.name));
        const newLoopsToAdd = d.new_feedback_loops.map(l => ({ ...l, status: "active" as const }));
        const finalActiveLoops = [...existingActiveLoops, ...newLoopsToAdd];
        const newMechReqs = { ...s.mechanism_requirements, ...d.mechanism_requirements_added };
        let newLevel = s.level;
        if (d.level_shift) {
          newLevel = d.level_shift.to as typeof s.level;
        }
        return {
          ...s,
          stateHistory: newHistory,
          causal_graph_nodes: newNodes,
          causal_edges: newEdges,
          level: newLevel,
          active_feedback_loops: finalActiveLoops,
          mechanism_requirements: newMechReqs
        };
      }
      // Fallback
      let newLevel = s.level;
      if (diff.levelOrPhaseShift) {
        newLevel = diff.levelOrPhaseShift.to as typeof s.level;
      }
      return {
        ...s,
        stateHistory: newHistory,
        causal_graph_nodes: [...s.causal_graph_nodes, ...diff.newElements.filter(e => !s.causal_graph_nodes.includes(e))],
        level: newLevel
      };
    }
    
    case "thematic-psychological": {
      const s = state as ThematicPsychologicalState;
      if (ms && ms.mode === "thematic-psychological") {
        const d = ms as ThematicPsychologicalDiff;
        return {
          ...s,
          stateHistory: newHistory,
          dominant_affect: d.affect_change?.to || s.dominant_affect,
          tempo: (d.tempo_change?.to as typeof s.tempo) || s.tempo,
          stance: d.stance_change?.to || s.stance
        };
      }
      // Fallback
      return {
        ...s,
        stateHistory: newHistory,
        dominant_affect: diff.levelOrPhaseShift?.to || s.dominant_affect,
        tempo: (diff.trajectoryChange?.to as typeof s.tempo) || s.tempo
      };
    }
    
    case "instructional": {
      const s = state as InstructionalState;
      if (ms && ms.mode === "instructional") {
        const d = ms as InstructionalDiff;
        // prereqs_satisfied means those prereqs are now met - REMOVE them from pending prereqs
        const remainingPrereqs = s.prereqs.filter(p => !d.prereqs_satisfied.includes(p));
        return {
          ...s,
          stateHistory: newHistory,
          steps_done: [...s.steps_done, ...d.new_steps],
          prereqs: remainingPrereqs,
          open_loops: [...s.open_loops.filter(l => !d.loops_closed.includes(l)), ...d.new_open_loops]
        };
      }
      // Fallback - resolvedElements = prereqs now satisfied, remove them
      return {
        ...s,
        stateHistory: newHistory,
        steps_done: [...s.steps_done, ...diff.newElements],
        prereqs: s.prereqs.filter(p => !diff.resolvedElements.includes(p)),
        open_loops: s.open_loops.filter(l => !diff.resolvedElements.includes(l))
      };
    }
    
    case "motivational": {
      const s = state as MotivationalState;
      if (ms && ms.mode === "motivational") {
        const d = ms as MotivationalDiff;
        return {
          ...s,
          stateHistory: newHistory,
          direction: (d.direction_change?.to as typeof s.direction) || s.direction,
          intensity: d.intensity_change?.to ?? s.intensity,
          target: d.target_change || s.target
        };
      }
      // Fallback
      let newDirection = s.direction;
      if (diff.levelOrPhaseShift) {
        newDirection = diff.levelOrPhaseShift.to as typeof s.direction;
      }
      let newIntensity = s.intensity;
      if (diff.trajectoryChange) {
        const trend = diff.trajectoryChange.to;
        if (trend === "increasing") newIntensity = Math.min(5, s.intensity + 1);
        else if (trend === "decreasing") newIntensity = Math.max(1, s.intensity - 1);
      }
      return {
        ...s,
        stateHistory: newHistory,
        direction: newDirection,
        intensity: newIntensity
      };
    }
    
    case "mathematical": {
      const s = state as MathematicalState;
      if (ms && ms.mode === "mathematical") {
        const d = ms as MathematicalDiff;
        return {
          ...s,
          stateHistory: newHistory,
          givens: [...s.givens, ...d.new_givens.filter(g => !s.givens.includes(g))],
          proved: [...s.proved, ...d.new_proved],
          goal: d.goal_update || s.goal,
          proof_method: (d.method_change?.to as typeof s.proof_method) || s.proof_method,
          dependencies: { ...s.dependencies, ...d.new_dependencies }
        };
      }
      // Fallback
      let newMethod = s.proof_method;
      if (diff.levelOrPhaseShift) {
        newMethod = diff.levelOrPhaseShift.to as typeof s.proof_method;
      }
      return {
        ...s,
        stateHistory: newHistory,
        givens: [...s.givens, ...diff.newElements.filter(e => !s.givens.includes(e))],
        proved: [...s.proved, ...diff.resolvedElements],
        proof_method: newMethod
      };
    }
    
    case "philosophical": {
      const s = state as PhilosophicalState;
      if (ms && ms.mode === "philosophical") {
        const d = ms as PhilosophicalDiff;
        // no_equivocation is the trusted vocabulary that must NOT change meaning
        // equivocation_violations are logged in history but do NOT get added to no_equivocation
        // New objections go to BOTH objections_raised AND replies_pending (until replied)
        const updatedRepliesPending = [
          ...s.dialectic.replies_pending.filter(r => !d.objections_replied.includes(r)),
          ...d.new_objections // New objections need replies
        ];
        return {
          ...s,
          stateHistory: d.equivocation_violations.length > 0 
            ? [...newHistory, `[EQUIVOCATION DETECTED: ${d.equivocation_violations.join(", ")}]`]
            : newHistory,
          core_concepts: { ...s.core_concepts, ...d.new_concepts },
          distinctions: [...s.distinctions, ...d.new_distinctions],
          dialectic: {
            objections_raised: [...s.dialectic.objections_raised, ...d.new_objections],
            replies_pending: updatedRepliesPending
          },
          no_equivocation: s.no_equivocation // Keep stable - violations don't get added here
        };
      }
      // Fallback - newElements are new objections needing replies
      const fallbackRepliesPending = [
        ...s.dialectic.replies_pending.filter(r => !diff.resolvedElements.includes(r)),
        ...diff.newElements
      ];
      return {
        ...s,
        stateHistory: newHistory,
        dialectic: {
          objections_raised: [...s.dialectic.objections_raised, ...diff.newElements],
          replies_pending: fallbackRepliesPending
        },
        no_equivocation: s.no_equivocation
      };
    }
    
    default:
      return { ...(state as BaseCoherenceState & Record<string, unknown>), stateHistory: newHistory } as GlobalCoherenceState;
  }
}

function buildHistoryEntry(diff: CoherenceStateDiff, chunkIndex: number): string {
  const parts: string[] = [];
  if (diff.newElements.length > 0) parts.push(`+${diff.newElements.join(", ")}`);
  if (diff.resolvedElements.length > 0) parts.push(`✓${diff.resolvedElements.join(", ")}`);
  if (diff.abandonedElements.length > 0) parts.push(`✗${diff.abandonedElements.join(", ")}`);
  if (diff.levelOrPhaseShift) parts.push(`⚠Level: ${diff.levelOrPhaseShift.from}→${diff.levelOrPhaseShift.to}`);
  if (diff.trajectoryChange) parts.push(`↔Trajectory: ${diff.trajectoryChange.from}→${diff.trajectoryChange.to}`);
  return `[Chunk ${chunkIndex}] ${parts.length > 0 ? parts.join("; ") : "State preserved"}`;
}

// Build initial causal state from GCO for scientific/explanatory mode (legacy function)
export function buildInitialCausalState(gco: GlobalContextObject): LiveCausalState {
  const initialMechanisms: ActiveMechanism[] = [];
  const initialThreads: OpenThread[] = [];
  
  // Seed mechanisms from central framework if it describes causal relationships
  if (gco.centralFramework) {
    initialMechanisms.push({
      cause: "Central framework",
      effect: gco.centralFramework,
      mechanism: gco.centralFramework,
      status: "active",
      introducedInChunk: 0
    });
  }
  
  // Seed open threads from argument direction
  if (gco.argumentDirection) {
    initialThreads.push({
      claim: gco.argumentDirection,
      requiredFollowUp: "Must be developed and supported throughout",
      introducedInChunk: 0
    });
  }
  
  // Detect explanatory level from key concepts
  let explanatoryLevel: "mechanism" | "system" | "policy" | "behavior" = "mechanism";
  const conceptsLower = gco.keyConcepts.map(c => c.toLowerCase()).join(" ");
  if (conceptsLower.includes("policy") || conceptsLower.includes("regulation") || conceptsLower.includes("law")) {
    explanatoryLevel = "policy";
  } else if (conceptsLower.includes("system") || conceptsLower.includes("network") || conceptsLower.includes("ecosystem")) {
    explanatoryLevel = "system";
  } else if (conceptsLower.includes("behavior") || conceptsLower.includes("action") || conceptsLower.includes("response")) {
    explanatoryLevel = "behavior";
  }
  
  return {
    activeMechanisms: initialMechanisms,
    feedbackLoops: [],
    explanatoryLevel,
    openThreads: initialThreads,
    causalHistory: [`[Chunk 0] Initial state seeded from GCO. Level: ${explanatoryLevel}`]
  };
}

// Merge state diff into live state after processing a chunk
export function mergeState(liveState: LiveCausalState, diff: StateDiff, chunkIndex: number): LiveCausalState {
  const historyEntries: string[] = [];
  
  // Add new mechanisms
  const updatedMechanisms = [...liveState.activeMechanisms];
  for (const mech of diff.newMechanisms) {
    updatedMechanisms.push({ ...mech, introducedInChunk: chunkIndex });
    historyEntries.push(`+Mechanism: ${mech.mechanism}`);
  }
  
  // Mark resolved mechanisms
  for (const resolved of diff.resolvedMechanisms) {
    const idx = updatedMechanisms.findIndex(m => m.mechanism.includes(resolved) && m.status === "active");
    if (idx >= 0) {
      updatedMechanisms[idx].status = "resolved";
      historyEntries.push(`✓Resolved: ${resolved}`);
    }
  }
  
  // Mark abandoned mechanisms (causal continuity break!)
  for (const abandoned of diff.abandonedMechanisms) {
    const idx = updatedMechanisms.findIndex(m => m.mechanism.includes(abandoned) && m.status === "active");
    if (idx >= 0) {
      updatedMechanisms[idx].status = "abandoned";
      historyEntries.push(`✗Abandoned: ${abandoned}`);
    }
  }
  
  // Add new loops
  const updatedLoops = [...liveState.feedbackLoops];
  for (const loop of diff.newLoops) {
    updatedLoops.push({ ...loop, introducedInChunk: chunkIndex });
    historyEntries.push(`+Loop: ${loop.loopName}`);
  }
  
  // Mark resolved loops
  for (const resolved of diff.resolvedLoops) {
    const idx = updatedLoops.findIndex(l => l.loopName.includes(resolved) && l.status === "active");
    if (idx >= 0) {
      updatedLoops[idx].status = "resolved";
      historyEntries.push(`✓Loop resolved: ${resolved}`);
    }
  }
  
  // Update threads
  const updatedThreads = [...liveState.openThreads];
  for (const thread of diff.newThreads) {
    updatedThreads.push({ ...thread, introducedInChunk: chunkIndex });
    historyEntries.push(`+Thread: ${thread.claim}`);
  }
  for (const resolved of diff.resolvedThreads) {
    const idx = updatedThreads.findIndex(t => t.claim.includes(resolved));
    if (idx >= 0) {
      updatedThreads.splice(idx, 1);
      historyEntries.push(`✓Thread resolved: ${resolved}`);
    }
  }
  
  // Handle level shift
  let newLevel = liveState.explanatoryLevel;
  if (diff.levelShift) {
    newLevel = diff.levelShift.to as "mechanism" | "system" | "policy" | "behavior";
    historyEntries.push(`⚠Level shift: ${diff.levelShift.from} → ${diff.levelShift.to}`);
  }
  
  return {
    activeMechanisms: updatedMechanisms,
    feedbackLoops: updatedLoops,
    explanatoryLevel: newLevel,
    openThreads: updatedThreads,
    causalHistory: [
      ...liveState.causalHistory,
      `[Chunk ${chunkIndex}] ${historyEntries.length > 0 ? historyEntries.join("; ") : "No state changes"}`
    ]
  };
}

// Serialize live state for injection into prompts
function serializeLiveState(state: LiveCausalState): string {
  const activeMechs = state.activeMechanisms.filter(m => m.status === "active");
  const activeLoops = state.feedbackLoops.filter(l => l.status === "active");
  
  return `
LIVE CAUSAL STATE (must be preserved or deliberately evolved):
- Explanatory Level: ${state.explanatoryLevel.toUpperCase()}
- Active Mechanisms (${activeMechs.length}):
${activeMechs.map(m => `  * ${m.cause} → ${m.effect} via ${m.mechanism}`).join("\n") || "  None yet"}
- Active Feedback Loops (${activeLoops.length}):
${activeLoops.map(l => `  * ${l.loopName}: ${l.participants.join(" ↔ ")}`).join("\n") || "  None yet"}
- Open Threads requiring follow-up (${state.openThreads.length}):
${state.openThreads.map(t => `  * "${t.claim}" - needs: ${t.requiredFollowUp}`).join("\n") || "  None"}`;
}

// STEP 1: Extract Global Context Object (GCO) - lightweight, non-generative
export async function extractGlobalContextObject(fullText: string): Promise<GlobalContextObject> {
  const systemPrompt = `You are a document analyzer. Extract ONLY the following structural elements from the text. Do NOT rewrite, evaluate, or generate new content. This is a lightweight extraction task.

Return a JSON object with these fields:
- coreTopics: Array of 1-5 main topics/subjects
- centralFramework: The main explanatory or argumentative framework (or null if none)
- keyConcepts: Array of key concepts, variables, or entities mentioned
- argumentDirection: The direction of argument if present (e.g., "proving X", "refuting Y", "explaining Z")
- emotionalTrajectory: Emotional/motivational arc if present (e.g., "building urgency", "calming reassurance")
- instructionalGoal: The instructional objective if present (e.g., "teach X", "guide through Y")
- mathematicalAssumptions: Mathematical assumptions or proof targets if present`;

  const userPrompt = `Extract the Global Context Object from this text. Keep total output under 300 words.

TEXT:
${fullText.substring(0, 8000)}

Respond with ONLY valid JSON, no markdown formatting.`;

  const message = await anthropic.messages.create({
    model: "claude-3-7-sonnet-20250219",
    max_tokens: 1024,
    temperature: 0,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }]
  });

  const output = message.content[0].type === 'text' ? message.content[0].text : '{}';
  
  try {
    const cleanJson = output.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleanJson);
    return {
      coreTopics: parsed.coreTopics || [],
      centralFramework: parsed.centralFramework || null,
      keyConcepts: parsed.keyConcepts || [],
      argumentDirection: parsed.argumentDirection || null,
      emotionalTrajectory: parsed.emotionalTrajectory || null,
      instructionalGoal: parsed.instructionalGoal || null,
      mathematicalAssumptions: parsed.mathematicalAssumptions || null
    };
  } catch {
    return {
      coreTopics: [],
      centralFramework: null,
      keyConcepts: [],
      argumentDirection: null,
      emotionalTrajectory: null,
      instructionalGoal: null,
      mathematicalAssumptions: null
    };
  }
}

// Result type that includes state diff for ALL modes
export interface ChunkAnalysisWithState {
  result: ChunkCoherenceResult;
  stateDiff: CoherenceStateDiff | null;
}

// STEP 2 & 3: Analyze chunk with GCO injection and mode-specific rules
// Now accepts and returns GlobalCoherenceState for ALL modes
export async function analyzeChunkWithGCO(
  chunkText: string, 
  chunkIndex: number,
  gco: GlobalContextObject, 
  coherenceMode: string,
  gcs?: GlobalCoherenceState
): Promise<ChunkAnalysisWithState> {
  
  const modeRules: Record<string, string> = {
    "logical-consistency": `Check for contradictions between this chunk and the GCO. Ignore argument strength or style. Look for: direct logical conflicts, claims that contradict earlier established facts, inconsistent use of terms.`,
    
    "logical-cohesiveness": `Check whether this chunk advances, supports, or presupposes argumentative steps implied by the GCO. Flag: gaps in reasoning, logical jumps, regressions relative to earlier structure, missing premises.`,
    
    "scientific-explanatory": `CRITICAL: You must evaluate CAUSAL CONTINUITY, not just coherence.
Check whether this chunk:
1. CONTINUES active causal mechanisms from previous chunks (or deliberately resolves them)
2. Does NOT abandon mechanisms without resolution (this is a major failure)
3. Does NOT reset to re-explain what was already explained
4. Maintains the same explanatory level (mechanism/system/policy/behavior)
5. Advances open threads rather than ignoring them
6. Does NOT switch from mechanism to correlation or vice versa without justification`,
    
    "thematic-psychological": `Check whether tone, affect, and psychological framing continue or intentionally shift relative to the GCO. Flag: abrupt or unjustified affective breaks, tonal inconsistencies.`,
    
    "instructional": `Check whether this chunk: presupposes steps not yet introduced, reorders instructions inconsistently, breaks actionability established earlier.`,
    
    "motivational": `Check whether emotional direction (urgency, encouragement, warning, etc.) remains aligned with the GCO. Flag: motivational reversals or dilution.`,
    
    "mathematical": `Check whether this chunk: uses assumptions consistent with the GCO, does not invoke results not yet established, preserves proof direction (forward, backward, contradiction, induction).`,
    
    "philosophical": `Check whether core concepts retain the same meaning, scope, and contrast classes as defined or implied in the GCO. Flag: equivocation, category drift, or silent redefinition.`
  };

  const gcoSummary = `
GLOBAL CONTEXT OBJECT (static backdrop):
- Core Topics: ${gco.coreTopics.join(", ") || "Not specified"}
- Central Framework: ${gco.centralFramework || "None identified"}
- Key Concepts: ${gco.keyConcepts.join(", ") || "Not specified"}
- Argument Direction: ${gco.argumentDirection || "None identified"}
- Emotional Trajectory: ${gco.emotionalTrajectory || "None identified"}
- Instructional Goal: ${gco.instructionalGoal || "None identified"}
- Mathematical Assumptions: ${gco.mathematicalAssumptions || "None identified"}`;

  // Serialize GCS for ALL modes - this is the live evolving state
  const gcsSummary = gcs ? serializeGCS(gcs) : "";

  const systemPrompt = `You are evaluating a text chunk for STATE CONTINUITY across chunks.

CORE PRINCIPLE: Coherence is NOT agreement or non-contradiction. Coherence is CONTINUITY OF STATE UNDER TRANSFORMATION.

The chunk must be evaluated as a STATE TRANSITION from GCS_n to GCS_n+1:
- Does this chunk CONTINUE, REFINE, or DELIBERATELY SHIFT the existing coherence state?
- Or does it UNINTENTIONALLY RESET, DILUTE, or SCRAMBLE the state?

COHERENCE MODE: ${coherenceMode}
MODE-SPECIFIC RULE: ${modeRules[coherenceMode] || modeRules["logical-consistency"]}

FAILURE DETECTION - Flag coherence degradation when:
- State is RE-ASSERTED instead of ADVANCED
- Level/phase/trajectory silently changes
- Concepts or elements are reused with altered roles
- Progress stalls via repetition rather than development

CRITICAL: Never return "incoherent", "error", or "cannot evaluate". Always provide constructive analysis.`;

  const userPrompt = `Evaluate this chunk as a STATE TRANSITION.

${gcoSummary}
${gcsSummary}

CHUNK ${chunkIndex + 1}:
${chunkText}

Provide analysis in this EXACT JSON format:
{
  "status": "preserved" | "weakened" | "shifted",
  "strainLocations": ["specific state continuity break 1", "specific break 2"],
  "repairSuggestions": ["how to restore state continuity"],
  "score": 1-10,
  "analysis": "Detailed explanation of state transition status",
  "stateDiff": {
    "newElements": ["new propositions/mechanisms/steps/concepts introduced"],
    "resolvedElements": ["elements that were properly concluded or addressed"],
    "abandonedElements": ["elements that were dropped without resolution"],
    "levelOrPhaseShift": null or {"from": "previous", "to": "current"},
    "trajectoryChange": null or {"from": "previous", "to": "current"}
  }
}

SCORING FOR STATE CONTINUITY:
- 9-10: State perfectly preserved or deliberately evolved
- 7-8: Minor gaps but state model preserved
- 5-6: Some elements abandoned or level shifted without justification
- 3-4: Major state discontinuity, resets or abandons core elements
- 1-2: Complete state break, no connection to previous state

Respond with ONLY valid JSON.`;

  const message = await anthropic.messages.create({
    model: "claude-3-7-sonnet-20250219",
    max_tokens: 2048,
    temperature: 0.2,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }]
  });

  const output = message.content[0].type === 'text' ? message.content[0].text : '{}';
  
  try {
    const cleanJson = output.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleanJson);
    
    const result: ChunkCoherenceResult = {
      chunkIndex,
      status: parsed.status || "preserved",
      strainLocations: parsed.strainLocations || [],
      repairSuggestions: parsed.repairSuggestions || [],
      analysis: parsed.analysis || "Analysis completed",
      score: parsed.score || 7
    };
    
    // Extract state diff for ALL modes (unified format)
    let stateDiff: CoherenceStateDiff | null = null;
    if (parsed.stateDiff) {
      stateDiff = {
        newElements: parsed.stateDiff.newElements || [],
        resolvedElements: parsed.stateDiff.resolvedElements || [],
        abandonedElements: parsed.stateDiff.abandonedElements || [],
        levelOrPhaseShift: parsed.stateDiff.levelOrPhaseShift || null,
        trajectoryChange: parsed.stateDiff.trajectoryChange || null
      };
    }
    
    return { result, stateDiff };
  } catch {
    return {
      result: {
        chunkIndex,
        status: "preserved",
        strainLocations: [],
        repairSuggestions: [],
        analysis: output,
        score: 7
      },
      stateDiff: null
    };
  }
}

// Full global coherence analysis with chunking
export async function analyzeGlobalCoherence(
  fullText: string,
  coherenceMode: string,
  wordsPerChunk: number = 400
): Promise<GlobalCoherenceAnalysisResult> {
  
  // Validate coherence mode
  const validModes = ["logical-consistency", "logical-cohesiveness", "scientific-explanatory", "thematic-psychological", "instructional", "motivational", "mathematical", "philosophical"];
  const normalizedMode = validModes.includes(coherenceMode) ? coherenceMode : "logical-consistency";
  
  // Split into chunks (~400 words each for API context limits)
  const words = fullText.split(/\s+/);
  const chunks: string[] = [];
  
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    chunks.push(words.slice(i, i + wordsPerChunk).join(' '));
  }

  // STEP 1: Extract Global Context Object
  console.log("Extracting Global Context Object...");
  const gco = await extractGlobalContextObject(fullText);
  
  // Validate GCO was extracted successfully
  if (!gco.coreTopics.length && !gco.centralFramework && !gco.keyConcepts.length) {
    console.warn("GCO extraction returned minimal data - proceeding with limited context");
  }
  
  // STEP 1: Initialize Global Coherence State (GCS) for the selected mode
  // This applies to ALL modes, not just scientific-explanatory
  let gcs = initializeGCS(normalizedMode, gco);
  console.log(`Initialized Global Coherence State for mode: ${normalizedMode}`);
  
  // STEP 2 & 3: Analyze each chunk with GCO + GCS injection
  // Thread GCS through each chunk as state transitions
  console.log(`Analyzing ${chunks.length} chunks with GCS state tracking (mode: ${normalizedMode})...`);
  const chunkResults: ChunkCoherenceResult[] = [];
  
  for (let i = 0; i < chunks.length; i++) {
    const analysisResult = await analyzeChunkWithGCO(chunks[i], i, gco, normalizedMode, gcs);
    chunkResults.push(analysisResult.result);
    
    // STEP 3: Update GCS after each chunk (state transition GCS_n → GCS_n+1)
    if (analysisResult.stateDiff) {
      gcs = updateGCS(gcs, analysisResult.stateDiff, i + 1);
      console.log(`Chunk ${i + 1}: Updated GCS state`);
    }
  }
  
  // Calculate overall score
  const avgScore = chunkResults.reduce((sum, r) => sum + r.score, 0) / chunkResults.length;
  const overallScore = Math.round(avgScore * 10) / 10;
  
  // Determine overall assessment
  let overallAssessment: "PASS" | "WEAK" | "FAIL";
  if (overallScore >= 8) overallAssessment = "PASS";
  else if (overallScore >= 5) overallAssessment = "WEAK";
  else overallAssessment = "FAIL";
  
  // Generate aggregated analysis
  const statusCounts = {
    preserved: chunkResults.filter(r => r.status === "preserved").length,
    weakened: chunkResults.filter(r => r.status === "weakened").length,
    shifted: chunkResults.filter(r => r.status === "shifted").length
  };
  
  // Include state evolution history in the analysis (applies to ALL modes)
  const stateEvolutionReport = `

STATE EVOLUTION HISTORY:
${gcs.stateHistory.join("\n")}
`;
  
  const aggregatedAnalysis = `
GLOBAL COHERENCE ANALYSIS (${normalizedMode})
============================================

GLOBAL CONTEXT OBJECT:
- Core Topics: ${gco.coreTopics.join(", ") || "Not identified"}
- Central Framework: ${gco.centralFramework || "None"}
- Key Concepts: ${gco.keyConcepts.join(", ") || "None identified"}
- Argument Direction: ${gco.argumentDirection || "None"}
${stateEvolutionReport}
CHUNK ANALYSIS SUMMARY:
- Total Chunks: ${chunks.length}
- Preserved: ${statusCounts.preserved} (${Math.round(statusCounts.preserved/chunks.length*100)}%)
- Weakened: ${statusCounts.weakened} (${Math.round(statusCounts.weakened/chunks.length*100)}%)
- Shifted: ${statusCounts.shifted} (${Math.round(statusCounts.shifted/chunks.length*100)}%)

OVERALL SCORE: ${overallScore}/10
ASSESSMENT: ${overallAssessment}

${chunkResults.map((r, i) => `
CHUNK ${i + 1}: ${r.status.toUpperCase()} (Score: ${r.score}/10)
${r.strainLocations.length > 0 ? `Strain Locations: ${r.strainLocations.join("; ")}` : "No strain detected"}
${r.repairSuggestions.length > 0 ? `Repair Suggestions: ${r.repairSuggestions.join("; ")}` : ""}
`).join("\n")}
`.trim();

  return {
    globalContextObject: gco,
    chunkResults,
    overallScore,
    overallAssessment,
    aggregatedAnalysis
  };
}

// Rewrite chunks with global coherence preservation
export async function rewriteWithGlobalCoherence(
  fullText: string,
  coherenceMode: string,
  aggressiveness: "conservative" | "moderate" | "aggressive" = "moderate",
  wordsPerChunk: number = 400
): Promise<{ rewrittenText: string; gco: GlobalContextObject; changes: string }> {
  
  // Validate coherence mode
  const validModes = ["logical-consistency", "logical-cohesiveness", "scientific-explanatory", "thematic-psychological", "instructional", "motivational", "mathematical", "philosophical"];
  const normalizedMode = validModes.includes(coherenceMode) ? coherenceMode : "logical-consistency";
  
  // Split into chunks (~400 words each for API context limits)
  const words = fullText.split(/\s+/);
  const chunks: string[] = [];
  
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    chunks.push(words.slice(i, i + wordsPerChunk).join(' '));
  }

  // Extract GCO first
  console.log("Extracting Global Context Object for rewrite...");
  const gco = await extractGlobalContextObject(fullText);
  
  // Validate GCO was extracted successfully
  if (!gco.coreTopics.length && !gco.centralFramework && !gco.keyConcepts.length) {
    console.warn("GCO extraction returned minimal data - proceeding with limited context");
  }
  
  const aggressivenessInstructions = {
    conservative: "Make minimal changes. Only fix clear coherence breaks. Preserve author voice completely.",
    moderate: "Fix coherence issues while preserving core meaning. Improve flow and connections between ideas.",
    aggressive: `MAXIMUM COHERENCE MODE - COMPLETE TRANSFORMATION REQUIRED:
You are NOT doing light editing. You are COMPLETELY REWRITING this text to achieve 9-10/10 coherence.

MANDATORY ACTIONS:
1. RESTRUCTURE the entire argument from scratch if the original is poorly organized
2. ADD missing logical connections, premises, and supporting arguments
3. REMOVE or REWRITE any incoherent, repetitive, or poorly-expressed passages
4. EXPAND underdeveloped points with full explanations
5. CREATE smooth transitions between every paragraph
6. ENSURE every sentence advances the argument purposefully
7. ELIMINATE all vagueness, ambiguity, and weak phrasing

DO NOT just paraphrase the original. If the input is incoherent garbage, your output must be a COMPLETELY RESTRUCTURED, PROFESSIONALLY WRITTEN version that makes the argument clearly and compellingly.

The output should read like it was written by a skilled professional writer, not like the original with minor fixes.`
  };

  // Mode-specific rewrite rules matching the analysis rules
  const modeRewriteRules: Record<string, string> = {
    "logical-consistency": "Fix any contradictions with established facts. Ensure consistent use of terms and remove conflicting claims.",
    "logical-cohesiveness": "Strengthen argumentative connections. Fill gaps in reasoning, add missing premises, and ensure each claim supports the next.",
    "scientific-explanatory": "Maintain CAUSAL CONTINUITY. Continue active mechanisms, advance explanations without resetting, preserve explanatory level.",
    "thematic-psychological": "Smooth tone transitions, maintain affect consistency, and ensure psychological framing continues naturally.",
    "instructional": "Ensure steps are in correct order, no skipped prerequisites, and maintain actionability throughout.",
    "motivational": "Keep emotional direction aligned. Avoid motivational reversals or dilution of urgency/encouragement.",
    "mathematical": "Ensure proof steps follow from assumptions. Don't invoke unestablished results. Maintain proof direction.",
    "philosophical": "Preserve concept meanings throughout. Avoid equivocation, category drift, or silent redefinition of terms."
  };

  const gcoSummary = `
GLOBAL CONTEXT OBJECT (MUST BE PRESERVED AND REFERENCED):
- Core Topics: ${gco.coreTopics.join(", ") || "Not specified"}
- Central Framework: ${gco.centralFramework || "None identified"}
- Key Concepts: ${gco.keyConcepts.join(", ") || "Not specified"}
- Argument Direction: ${gco.argumentDirection || "None identified"}
- Emotional Trajectory: ${gco.emotionalTrajectory || "None identified"}
- Instructional Goal: ${gco.instructionalGoal || "None identified"}
- Mathematical Assumptions: ${gco.mathematicalAssumptions || "None identified"}`;

  // Initialize Global Coherence State (GCS) for ALL modes
  let gcs = initializeGCS(normalizedMode, gco);
  console.log(`Initialized Global Coherence State for rewrite (mode: ${normalizedMode})`);

  // Rewrite each chunk with GCS state tracking for ALL modes
  console.log(`Rewriting ${chunks.length} chunks with GCS state preservation (mode: ${normalizedMode})...`);
  const rewrittenChunks: string[] = [];
  const allChanges: string[] = [];
  
  for (let i = 0; i < chunks.length; i++) {
    // Serialize GCS for injection into prompt (applies to ALL modes)
    const gcsSummary = serializeGCS(gcs);
    
    const systemPrompt = `You are rewriting text to maintain STATE CONTINUITY across chunks.

CORE PRINCIPLE: Coherence is CONTINUITY OF STATE UNDER TRANSFORMATION.
Each chunk must be rewritten as a state transition from GCS_n to GCS_n+1.

${aggressivenessInstructions[aggressiveness]}

COHERENCE MODE: ${normalizedMode}
MODE-SPECIFIC RULE: ${modeRewriteRules[normalizedMode]}

CRITICAL RULES:
1. CONTINUE state elements from the GCS - do NOT abandon them
2. ADVANCE the state - do NOT reset or re-establish what was already established
3. ADDRESS open threads/claims that need follow-up
4. Each chunk must INHERIT and EVOLVE the coherence state`;

    const userPrompt = `Rewrite this chunk to maintain STATE CONTINUITY.

${gcoSummary}
${gcsSummary}

${i > 0 ? `PREVIOUS CHUNK ENDED WITH: "${rewrittenChunks[i-1].slice(-200)}..."` : "This is the first chunk."}

CHUNK ${i + 1} OF ${chunks.length}:
${chunks[i]}

REWRITE REQUIREMENTS FOR STATE CONTINUITY:
1. Continue all active elements listed in the GCS
2. Address open threads/claims that need follow-up
3. Do NOT reset or re-establish what was already established
4. Maintain the current level/phase/trajectory
5. If introducing new elements, they must connect to existing ones

Provide:
1. REWRITTEN_TEXT: The improved version maintaining state continuity
2. CHANGES: How you preserved/advanced the state
3. STATE_UPDATE: JSON describing any state changes

CRITICAL: Do NOT use any markdown formatting in the rewritten text. No #, ##, *, **, -, or any other markdown symbols. Output plain prose only.

Format your response as:
REWRITTEN_TEXT:
[your rewritten text here - plain text only, no markdown]

CHANGES:
[bullet points of changes]

STATE_UPDATE:
{"newElements": [], "resolvedElements": [], "abandonedElements": [], "levelOrPhaseShift": null, "trajectoryChange": null}`;

    // Use higher temperature for aggressive mode to allow more creative restructuring
    const rewriteTemperature = aggressiveness === "aggressive" ? 0.6 : aggressiveness === "moderate" ? 0.4 : 0.2;
    
    const message = await anthropic.messages.create({
      model: "claude-3-7-sonnet-20250219",
      max_tokens: 6000,
      temperature: rewriteTemperature,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }]
    });

    const output = message.content[0].type === 'text' ? message.content[0].text : chunks[i];
    
    // Parse rewritten text and changes
    const textMatch = output.match(/REWRITTEN_TEXT:\s*([\s\S]*?)(?=CHANGES:|$)/i);
    const changesMatch = output.match(/CHANGES:\s*([\s\S]*?)(?=STATE_UPDATE:|$)/i);
    
    rewrittenChunks.push(stripMarkdown(textMatch ? textMatch[1].trim() : chunks[i]));
    if (changesMatch) {
      allChanges.push(`Chunk ${i + 1}: ${changesMatch[1].trim()}`);
    }
    
    // Parse and merge state updates for ALL modes (unified GCS system)
    const stateMatch = output.match(/STATE_UPDATE:\s*(\{[\s\S]*?\})/i);
    if (stateMatch) {
      try {
        const stateUpdate = JSON.parse(stateMatch[1]);
        const diff: CoherenceStateDiff = {
          newElements: stateUpdate.newElements || [],
          resolvedElements: stateUpdate.resolvedElements || [],
          abandonedElements: stateUpdate.abandonedElements || [],
          levelOrPhaseShift: stateUpdate.levelOrPhaseShift || null,
          trajectoryChange: stateUpdate.trajectoryChange || null
        };
        gcs = updateGCS(gcs, diff, i + 1);
      } catch {
        // Ignore parse errors for state update
      }
    }
  }

  return {
    rewrittenText: rewrittenChunks.join("\n\n"),
    gco,
    changes: allChanges.join("\n\n")
  };
}

export async function analyzeCoherence(text: string): Promise<CoherenceAnalysisResult> {
  const systemPrompt = `You are a coherence analyzer specializing in evaluating INTERNAL LOGICAL CONSISTENCY, CLARITY, and STRUCTURAL UNITY.

CRITICAL PRINCIPLES (NEVER VIOLATE):
1. Coherence ≠ Truth: A text can be entirely false and still perfectly coherent. Never penalize for factual inaccuracy.
2. Coherence ≠ Verification: Unverified or unproven claims are fine if internally consistent. Never penalize for lack of evidence.
3. Coherence ≠ Accessibility: Assuming prior knowledge is standard in advanced discourse. Only flag if assumptions create actual CONTRADICTIONS within the text.
4. Detect Faux-Placeholder Coherence: Sequential listing with buzzwords (meaningless jargon) that lack determinate properties is NOT coherence.

COHERENCE IS:
- Internal hang-togetherness: Do parts fit logically?
- Consistency: Are terms used with stable meanings?
- Hierarchical structure: Do claims build on each other (not just list sequentially)?
- Non-contradiction: No direct logical conflicts within the text itself

COHERENCE IS NOT:
- External truth or accuracy
- Scientific plausibility  
- Empirical verification
- Accessibility to non-experts`;

  const userPrompt = `Analyze this text for INTERNAL COHERENCE ONLY. Do not penalize for falsehood, lack of verification, or assumed knowledge.

TEXT:
${text}

Provide analysis in this EXACT format:

INTERNAL LOGIC SCORE: [X]/10
[Check ONLY for internal contradictions within the text. 10 = no contradictions, 1 = severe contradictions. Ignore external truth.]

CLARITY SCORE: [X]/10
[Are terms used consistently with stable meanings? 10 = crystal clear terms, 1 = terms are placeholder buzzwords without meaning.]

STRUCTURAL UNITY SCORE: [X]/10
[Is organization hierarchical with claims building on each other? 10 = hierarchical argument, 1 = just sequential listing.]

FAUX-COHERENCE SCORE: [X]/10
[CRITICAL: Detect if text has FAKE/PLACEHOLDER coherence. Score 1-2 if text exhibits: (a) Buzzwords/jargon cited but never defined or grounded (e.g., "Myth of the Mental", "linguistic idealism", "disjunctivism" mentioned but not explained), (b) Sequential listing disguised as argument (e.g., "First... Second... Third..." without logical dependencies), (c) Vague umbrella claims that assume buzzwords have determinate properties they lack. Score 9-10 if text has: (a) Terms with canonical/grounded meanings used consistently, (b) Hierarchical argumentation where claims actually build on each other, (c) Concrete logical relationships. WARNING: Academic jargon ≠ automatic faux-coherence! Only mark low if jargon is shuffled WITHOUT grounding or hierarchical dependencies.]

OVERALL COHERENCE SCORE: [X]/10
[Calculate this as: (Internal Logic + Clarity + Structural Unity + Faux-Coherence) / 4. Round to nearest 0.5.]

ASSESSMENT: [PASS if ≥8, WEAK if 5-7, FAIL if ≤4]

DETAILED REPORT:
[Specific analysis. Remember: NEVER penalize for falsehood, unverified claims, or assumed knowledge!]

CALIBRATION EXAMPLES:
1. "Coffee boosts intelligence by multiplying brain cells, creating neural pathways" = Score 9.5 (Internal Logic: 10, Clarity: 9, Structural Unity: 10, Faux-Coherence: 9 - clear causal chain, perfect internal logic despite being FALSE)
2. "Sense-perceptions are presentations not representations; regress arguments doom linguistic mediation theories" = Score 9.5 (Internal Logic: 10, Clarity: 10, Structural Unity: 9, Faux-Coherence: 10 - tight deduction, canonical philosophical terms, hierarchical)
3. "This dissertation examines transcendental empiricism, discussing McDowell's minimal empiricism and Dreyfus's Myth of the Mental critique" = Score 2 (Internal Logic: 4, Clarity: 2, Structural Unity: 2, Faux-Coherence: 1 - buzzwords without grounding, sequential listing, vague jargon assuming meaning it lacks)`;

  const message = await anthropic.messages.create({
    model: "claude-3-7-sonnet-20250219",
    max_tokens: 4096,
    temperature: 0.3,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }]
  });

  const output = message.content[0].type === 'text' ? message.content[0].text : '';

  const internalLogicMatch = output.match(/INTERNAL LOGIC SCORE:\s*(\d+(?:\.\d+)?)\/10/i);
  const clarityMatch = output.match(/CLARITY SCORE:\s*(\d+(?:\.\d+)?)\/10/i);
  const structuralUnityMatch = output.match(/STRUCTURAL UNITY SCORE:\s*(\d+(?:\.\d+)?)\/10/i);
  const fauxDetectionMatch = output.match(/FAUX-COHERENCE SCORE:\s*(\d+(?:\.\d+)?)\/10/i);
  const overallScoreMatch = output.match(/OVERALL COHERENCE SCORE:\s*(\d+(?:\.\d+)?)\/10/i);
  const assessmentMatch = output.match(/ASSESSMENT:\s*(PASS|WEAK|FAIL)/i);

  const score = overallScoreMatch ? parseFloat(overallScoreMatch[1]) : 5;
  const assessment = (assessmentMatch ? assessmentMatch[1].toUpperCase() : "WEAK") as "PASS" | "WEAK" | "FAIL";

  return {
    score,
    assessment,
    analysis: output,
    subscores: {
      internalLogic: internalLogicMatch ? parseInt(internalLogicMatch[1]) : 5,
      clarity: clarityMatch ? parseInt(clarityMatch[1]) : 5,
      structuralUnity: structuralUnityMatch ? parseInt(structuralUnityMatch[1]) : 5,
      fauxCoherenceDetection: fauxDetectionMatch ? parseInt(fauxDetectionMatch[1]) : 5
    }
  };
}

export interface MathProofValidityResult {
  score: number;
  verdict: "VALID" | "FLAWED" | "INVALID";
  analysis: string;
  subscores: {
    claimTruth: number;
    inferenceValidity: number;
    boundaryConditions: number;
    overallSoundness: number;
  };
  flaws: string[];
  counterexamples: string[];
}

export async function analyzeMathProofValidity(text: string): Promise<MathProofValidityResult> {
  const systemPrompt = `You are a rigorous mathematical proof validator. Your task is to verify MATHEMATICAL CORRECTNESS, not just logical flow.

CRITICAL DISTINCTION:
- Standard coherence checks if steps follow from premises (logical flow)
- Mathematical validity checks if the MATHEMATICAL CLAIMS ARE TRUE

YOU MUST CHECK:
1. CLAIM TRUTH: Are the mathematical statements actually true? Test with concrete values.
2. INFERENCE VALIDITY: Does each step follow mathematically (not just logically) from previous steps?
3. BOUNDARY CONDITIONS: Do the claims hold at boundary cases? Test edge cases explicitly.
4. COUNTEREXAMPLES: Actively search for counterexamples that would invalidate claims.

VERIFICATION METHODOLOGY:
- For inequalities: TEST SPECIFIC VALUES. Don't just accept claims like "p! < 2^p" - compute p! and 2^p for p = 3, 5, 7, 10 and CHECK.
- For universal claims: Look for counterexamples in the claimed domain.
- For existence claims: Can you exhibit a witness?
- For growth rate claims: Compute actual values and compare.

SCORING:
- CLAIM TRUTH (0-10): Are the mathematical claims empirically/provably true?
- INFERENCE VALIDITY (0-10): Are inference steps mathematically sound?
- BOUNDARY CONDITIONS (0-10): Do claims hold at edges of claimed domains?
- OVERALL SOUNDNESS (0-10): Would this proof be accepted by a mathematician?

A proof with good "logical flow" but FALSE mathematical claims should score LOW.`;

  const userPrompt = `MATHEMATICAL PROOF VALIDITY ANALYSIS

Analyze this proof for MATHEMATICAL CORRECTNESS, not just logical coherence.

PROOF TO VALIDATE:
${text}

YOUR TASK:
1. IDENTIFY all mathematical claims (inequalities, growth rates, divisibility claims, etc.)
2. TEST each claim with SPECIFIC VALUES - show your calculations
3. IDENTIFY any false claims or unsubstantiated assumptions
4. CHECK boundary conditions and edge cases
5. SEARCH for counterexamples
6. VERIFY each inference step is mathematically (not just logically) valid

OUTPUT FORMAT:

CLAIM TRUTH SCORE: [X]/10
[List each major claim and whether it's TRUE/FALSE with evidence. COMPUTE specific values.]

INFERENCE VALIDITY SCORE: [X]/10
[For each inference step, is the mathematical reasoning sound? Point out gaps.]

BOUNDARY CONDITIONS SCORE: [X]/10
[Test edge cases. What happens at boundaries of claimed domains?]

OVERALL SOUNDNESS SCORE: [X]/10
[Would a mathematician accept this proof? Why or why not?]

COUNTEREXAMPLES FOUND:
[List any counterexamples that invalidate claims]

FLAWS IDENTIFIED:
[List all mathematical errors, false claims, and gaps in the proof]

VERDICT: [VALID if overall ≥ 8 and no fatal flaws / FLAWED if 4-7 or has repairable issues / INVALID if ≤ 3 or has fatal flaws]

DETAILED ANALYSIS:
[Full mathematical critique with calculations shown]`;

  const message = await anthropic.messages.create({
    model: "claude-3-7-sonnet-20250219",
    max_tokens: 6000,
    temperature: 0.2,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }]
  });

  const output = message.content[0].type === 'text' ? message.content[0].text : '';

  const claimTruthMatch = output.match(/CLAIM TRUTH SCORE:\s*(\d+(?:\.\d+)?)\/10/i);
  const inferenceMatch = output.match(/INFERENCE VALIDITY SCORE:\s*(\d+(?:\.\d+)?)\/10/i);
  const boundaryMatch = output.match(/BOUNDARY CONDITIONS SCORE:\s*(\d+(?:\.\d+)?)\/10/i);
  const soundnessMatch = output.match(/OVERALL SOUNDNESS SCORE:\s*(\d+(?:\.\d+)?)\/10/i);
  const verdictMatch = output.match(/VERDICT:\s*(VALID|FLAWED|INVALID)/i);

  const claimTruth = claimTruthMatch ? parseFloat(claimTruthMatch[1]) : 5;
  const inferenceValidity = inferenceMatch ? parseFloat(inferenceMatch[1]) : 5;
  const boundaryConditions = boundaryMatch ? parseFloat(boundaryMatch[1]) : 5;
  const overallSoundness = soundnessMatch ? parseFloat(soundnessMatch[1]) : 5;

  const score = (claimTruth + inferenceValidity + boundaryConditions + overallSoundness) / 4;
  const verdict = (verdictMatch ? verdictMatch[1].toUpperCase() : 
    score >= 8 ? "VALID" : score >= 4 ? "FLAWED" : "INVALID") as "VALID" | "FLAWED" | "INVALID";

  const flawsSection = output.match(/FLAWS IDENTIFIED:\s*([\s\S]*?)(?=VERDICT:|DETAILED ANALYSIS:|$)/i);
  const counterexamplesSection = output.match(/COUNTEREXAMPLES FOUND:\s*([\s\S]*?)(?=FLAWS IDENTIFIED:|VERDICT:|DETAILED ANALYSIS:|$)/i);

  const flaws = flawsSection ? 
    flawsSection[1].split(/\n/).filter(line => line.trim().match(/^[-•\d.]/)).map(line => line.trim()) : [];
  const counterexamples = counterexamplesSection ?
    counterexamplesSection[1].split(/\n/).filter(line => line.trim().match(/^[-•\d.]/)).map(line => line.trim()) : [];

  return {
    score: Math.round(score * 10) / 10,
    verdict,
    analysis: output,
    subscores: {
      claimTruth,
      inferenceValidity,
      boundaryConditions,
      overallSoundness
    },
    flaws,
    counterexamples
  };
}

export async function rewriteForCoherence(
  text: string, 
  aggressiveness: "conservative" | "moderate" | "aggressive" = "moderate"
): Promise<CoherenceRewriteResult> {
  
  let systemPrompt = "";
  let temperature = 0.5;
  
  if (aggressiveness === "conservative") {
    systemPrompt = `You are a coherence editor. Make MINIMAL changes to fix ONLY internal contradictions and clarity issues. Preserve structure and wording.`;
    temperature = 0.3;
  } else if (aggressiveness === "moderate") {
    systemPrompt = `You are a coherence improver. Fix internal contradictions, improve term clarity, strengthen hierarchical structure. May expand moderately.`;
    temperature = 0.5;
  } else {
    systemPrompt = `You are a MAXIMUM COHERENCE TRANSFORMER. Your job is to take ANY input - no matter how poorly written - and produce a 9-10/10 coherent masterpiece.

CRITICAL MANDATE:
This is NOT light editing. You must COMPLETELY TRANSFORM the text into professional-grade writing.

MANDATORY ACTIONS:
1. RESTRUCTURE the entire argument from scratch if poorly organized
2. ADD missing logical connections, premises, and supporting arguments  
3. REMOVE or COMPLETELY REWRITE any incoherent, repetitive, or poorly-expressed passages
4. EXPAND underdeveloped points with full explanations
5. CREATE smooth, professional transitions between every paragraph
6. ENSURE every sentence advances the argument purposefully
7. ELIMINATE all vagueness, ambiguity, and weak phrasing
8. REPLACE buzzwords and jargon with clear, grounded language

YOUR OUTPUT MUST:
- Read like it was written by a skilled professional writer
- Have crystal-clear logical flow from start to finish
- Leave no logical gaps or unexplained leaps
- Be something a discerning reader would find compelling and well-structured

DO NOT produce a slightly polished version of garbage. If the input is incoherent, your output must be a COMPLETELY RESTRUCTURED, PROFESSIONALLY WRITTEN version.`;
    temperature = 0.7;
  }

  const userPrompt = `${aggressiveness === "aggressive" ? "COMPLETELY TRANSFORM" : "Rewrite"} this text to ${aggressiveness === "aggressive" ? "achieve MAXIMUM (9-10/10)" : "maximize"} COHERENCE.

${aggressiveness === "aggressive" ? `WARNING: The input may be poorly written. Do NOT just paraphrase it. You must produce dramatically superior output.

` : ""}CRITICAL RULES:
1. You MAY keep false claims (coherence ≠ truth)
2. You MAY keep unverified claims (coherence ≠ evidence)  
3. You MAY assume expert knowledge (coherence ≠ accessibility)
4. You MUST fix: internal contradictions, unclear terms, sequential-only structure
5. You MUST detect and eliminate faux-placeholder coherence (replace buzzwords with grounded terms, make structure hierarchical not sequential)
${aggressiveness === "aggressive" ? `6. You MUST completely restructure if the original is poorly organized
7. You MUST add missing logical connections and expand underdeveloped points
8. Your output MUST read like professional-grade writing` : ""}

ORIGINAL TEXT:
${text}

Output ONLY the rewritten text. No headers, no labels, no commentary, and NO MARKDOWN FORMATTING (no #, ##, *, **, -, etc.). Plain prose only.`;

  const message = await anthropic.messages.create({
    model: "claude-3-7-sonnet-20250219",
    max_tokens: 8192,
    temperature: temperature,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }]
  });

  const rewrittenText = stripMarkdown(message.content[0].type === 'text' ? message.content[0].text : '');

  const changesAnalysisPrompt = `Compare these two versions and explain what coherence changes were made (focus on internal consistency, clarity, structural improvements only):

ORIGINAL:
${text}

REWRITTEN:
${rewrittenText}

Provide concise bullet points of changes made to improve internal coherence.`;

  const changesMessage = await anthropic.messages.create({
    model: "claude-3-7-sonnet-20250219",
    max_tokens: 1024,
    temperature: 0.3,
    messages: [{ role: "user", content: changesAnalysisPrompt }]
  });

  const changes = changesMessage.content[0].type === 'text' ? changesMessage.content[0].text : '';

  return {
    rewrittenText,
    changes
  };
}

export interface ReconstructionResult {
  reconstructedText: string;
  changes: string;
  wasReconstructed: boolean;
  adjacentMaterialAdded: string;
  originalLimitationsIdentified: string;
}

export async function reconstructToMaxCoherence(
  text: string,
  coherenceType: string = "logical-consistency"
): Promise<ReconstructionResult> {
  
  // STAGE 1: THESIS EXTRACTION
  // Identify what the author is TRYING to say, even from incoherent rambling
  const thesisExtractionPrompt = `You are a philosophical archaeologist. Your task is to excavate the CORE THESIS and CONCEPTUAL TERRITORY from potentially incoherent text.

The input may be:
- Rambling, disorganized thoughts
- Half-formed ideas expressed poorly
- Confused but gesturing toward a real insight
- A diamond buried in rough ore

YOUR TASK:
1. Identify the CORE THESIS the author seems to be reaching for
2. Identify the CONCEPTUAL TERRITORY they're operating in (epistemology? ontology? philosophy of language? ethics?)
3. Identify KEY DISTINCTIONS they seem to be trying to make
4. Identify what PROBLEM or QUESTION they're grappling with

INPUT TEXT:
${text}

Respond in EXACTLY this format:

CORE_THESIS: [State what the author appears to be arguing, even if poorly expressed. This should be a single clear statement of their apparent position.]

CONCEPTUAL_TERRITORY: [What domain of thought is this? What are the relevant philosophical/scientific/logical frameworks?]

KEY_DISTINCTIONS: [What distinctions is the author trying to draw? List 2-4 key contrasts they seem to be gesturing at.]

CENTRAL_PROBLEM: [What question or problem is driving their thinking?]

AUTHOR_INTENT: [In 1-2 sentences, what does this person WANT to communicate? What insight are they reaching for?]`;

  const thesisMessage = await anthropic.messages.create({
    model: "claude-3-7-sonnet-20250219",
    max_tokens: 2000,
    temperature: 0.4,
    messages: [{ role: "user", content: thesisExtractionPrompt }]
  });

  const thesisOutput = thesisMessage.content[0].type === 'text' ? thesisMessage.content[0].text : '';
  
  const coreThesisMatch = thesisOutput.match(/CORE_THESIS:\s*([\s\S]*?)(?=CONCEPTUAL_TERRITORY:|$)/i);
  const territoryMatch = thesisOutput.match(/CONCEPTUAL_TERRITORY:\s*([\s\S]*?)(?=KEY_DISTINCTIONS:|$)/i);
  const distinctionsMatch = thesisOutput.match(/KEY_DISTINCTIONS:\s*([\s\S]*?)(?=CENTRAL_PROBLEM:|$)/i);
  const problemMatch = thesisOutput.match(/CENTRAL_PROBLEM:\s*([\s\S]*?)(?=AUTHOR_INTENT:|$)/i);
  const intentMatch = thesisOutput.match(/AUTHOR_INTENT:\s*([\s\S]*?)$/i);

  const coreThesis = coreThesisMatch ? coreThesisMatch[1].trim() : 'Unable to extract thesis';
  const territory = territoryMatch ? territoryMatch[1].trim() : 'General philosophy';
  const distinctions = distinctionsMatch ? distinctionsMatch[1].trim() : '';
  const problem = problemMatch ? problemMatch[1].trim() : '';
  const intent = intentMatch ? intentMatch[1].trim() : '';

  // STAGE 2: GAP DIAGNOSIS
  // Identify what argumentative pillars are missing to make this a coherent essay
  const gapDiagnosisPrompt = `Given the following extracted thesis and conceptual territory, identify what argumentative elements are MISSING that would be needed to construct a maximally coherent essay.

EXTRACTED CORE THESIS: ${coreThesis}

CONCEPTUAL TERRITORY: ${territory}

KEY DISTINCTIONS ATTEMPTED: ${distinctions}

CENTRAL PROBLEM: ${problem}

What is needed to turn this into a 9-10/10 coherent essay? Identify:

1. MISSING_DEFINITIONS: What key terms need to be precisely defined?
2. MISSING_EXAMPLES: What concrete examples would illustrate the distinctions?
3. MISSING_ARGUMENTS: What logical steps are needed to support the thesis?
4. MISSING_FRAMEWORKS: What conceptual frameworks would organize the argument?
5. MISSING_QUALIFICATIONS: What objections or edge cases need to be addressed?

Respond in the exact format above, with each category followed by 2-4 specific items.`;

  const gapMessage = await anthropic.messages.create({
    model: "claude-3-7-sonnet-20250219",
    max_tokens: 2000,
    temperature: 0.4,
    messages: [{ role: "user", content: gapDiagnosisPrompt }]
  });

  const gapOutput = gapMessage.content[0].type === 'text' ? gapMessage.content[0].text : '';

  // STAGE 3: SYNTHESIS OF THEMATICALLY-ADJACENT MATERIAL
  // Generate the actual supporting content
  const synthesisPrompt = `You are generating THEMATICALLY-ADJACENT MATERIAL to fill the gaps identified in an argumentative reconstruction.

CORE THESIS TO SUPPORT: ${coreThesis}

CONCEPTUAL TERRITORY: ${territory}

DISTINCTIONS TO ARTICULATE: ${distinctions}

CENTRAL PROBLEM BEING ADDRESSED: ${problem}

GAPS TO FILL:
${gapOutput}

YOUR TASK:
Generate the following supporting material that stays THEMATICALLY ADJACENT to the core thesis:

1. PRECISE DEFINITIONS for key terms (2-3 definitions with clear criteria)
2. CONCRETE EXAMPLES that illustrate each major distinction (2-4 examples using everyday or mathematical/logical cases)
3. SUPPORTING ARGUMENTS that logically connect to the thesis (2-3 argument chains)
4. A STRUCTURAL FRAMEWORK for organizing the essay (a clear progression from opening to conclusion)

RULES FOR THEMATIC ADJACENCY:
- All examples must illuminate the same conceptual territory as the original thesis
- All definitions must be relevant to the distinctions being drawn
- All arguments must support or qualify the core position
- The material should feel like what a domain expert would naturally add
- Use analogies from logic, mathematics, language, or everyday life as appropriate

Output the material in clear sections. Do not produce the final essay yet - just the raw material.`;

  const synthesisMessage = await anthropic.messages.create({
    model: "claude-3-7-sonnet-20250219",
    max_tokens: 4000,
    temperature: 0.6,
    messages: [{ role: "user", content: synthesisPrompt }]
  });

  const synthesizedMaterial = synthesisMessage.content[0].type === 'text' ? synthesisMessage.content[0].text : '';

  // STAGE 4: COMPOSE FINAL RECONSTRUCTION
  // Assemble everything into a maximally coherent essay
  const compositionPrompt = `You are composing the FINAL RECONSTRUCTION - a maximally coherent essay that articulates what the original author was trying to say, but couldn't express clearly.

ORIGINAL INPUT (incoherent/poorly expressed):
${text}

EXTRACTED CORE THESIS:
${coreThesis}

AUTHOR'S APPARENT INTENT:
${intent}

SYNTHESIZED SUPPORTING MATERIAL:
${synthesizedMaterial}

YOUR TASK:
Compose a MAXIMALLY COHERENT essay (aim for 9-10/10 coherence) that:

1. OPENS with a clear statement establishing the conceptual territory and central question
2. INTRODUCES the key distinctions with precise definitions
3. PROVIDES concrete examples that illuminate each distinction
4. BUILDS the argument step by step with clear logical progression
5. ADDRESSES potential objections or edge cases
6. CONCLUDES by synthesizing the thesis in its strongest form

CRITICAL REQUIREMENTS:
- The essay must PRESERVE the original author's thesis and direction
- The essay must ADD substantial thematically-adjacent material (examples, definitions, arguments)
- The essay must achieve MAXIMUM COHERENCE through clear structure and logical flow
- Output PLAIN TEXT ONLY - no markdown formatting, no headers, no bullet points
- Write in clear, academic prose
- The result should read as a unified, polished philosophical essay
- Do NOT include any meta-commentary about the reconstruction process

OUTPUT:
Write ONLY the final essay. No preamble, no explanation, no labels. Just the essay in plain prose.`;

  const compositionMessage = await anthropic.messages.create({
    model: "claude-3-7-sonnet-20250219",
    max_tokens: 10000,
    temperature: 0.5,
    messages: [{ role: "user", content: compositionPrompt }]
  });

  const reconstructedText = stripMarkdown(compositionMessage.content[0].type === 'text' ? compositionMessage.content[0].text : '');

  // STAGE 5: ANALYZE RECONSTRUCTION
  const analysisPrompt = `Compare the ORIGINAL text to the RECONSTRUCTED text and provide a concise summary of:
1. The core thesis that was preserved
2. What thematically-adjacent material was synthesized
3. The key transformations made to achieve maximum coherence

ORIGINAL:
${text}

RECONSTRUCTED:
${reconstructedText}

Provide a concise summary (4-6 sentences) of how the reconstruction transforms incoherent input into a maximally coherent essay while preserving the author's core intent.`;

  const analysisMessage = await anthropic.messages.create({
    model: "claude-3-7-sonnet-20250219",
    max_tokens: 1500,
    temperature: 0.3,
    messages: [{ role: "user", content: analysisPrompt }]
  });

  const analysisOutput = analysisMessage.content[0].type === 'text' ? analysisMessage.content[0].text : '';

  return {
    reconstructedText,
    changes: analysisOutput,
    wasReconstructed: true,
    adjacentMaterialAdded: `Synthesized: definitions, concrete examples, supporting arguments, and structural framework. Core thesis "${coreThesis.substring(0, 100)}..." was preserved and articulated with maximum coherence.`,
    originalLimitationsIdentified: `The original text was ${text.length < 200 ? 'fragmentary' : 'disorganized'} and lacked: precise definitions, concrete examples, clear logical structure, and explicit argumentation. These were synthesized from thematically-adjacent material.`
  };
}

export interface ScientificExplanatoryResult {
  overallScore: number;
  overallAssessment: "PASS" | "WEAK" | "FAIL";
  logicalConsistency: {
    score: number;
    assessment: "PASS" | "WEAK" | "FAIL";
    analysis: string;
  };
  scientificAccuracy: {
    score: number;
    assessment: "PASS" | "WEAK" | "FAIL";
    analysis: string;
    inaccuracies: string[];
  };
  fullAnalysis: string;
}

export async function analyzeScientificExplanatoryCoherence(text: string): Promise<ScientificExplanatoryResult> {
  const systemPrompt = `You are a scientific coherence analyzer that evaluates text on TWO SEPARATE DIMENSIONS:

1. LOGICAL CONSISTENCY: Does the text avoid internal contradictions? Do the claims follow from each other logically? Is the argument structurally sound?

2. SCIENTIFIC ACCURACY: Are the scientific claims factually correct? Do they align with established scientific knowledge, natural laws, and known mechanisms? Are there any scientific inaccuracies, misconceptions, or false claims?

CRITICAL: These are INDEPENDENT dimensions. A text can be:
- Logically consistent but scientifically false (e.g., "Dragons breathe fire because their stomachs contain methane, which ignites when exposed to oxygen in their throats" - internally coherent but scientifically fictional)
- Logically inconsistent but scientifically accurate (e.g., mixing correct facts with contradictory statements)
- Both consistent and accurate (ideal)
- Neither consistent nor accurate (worst case)

You must evaluate BOTH dimensions separately and provide distinct scores for each.`;

  const userPrompt = `Analyze this text for BOTH logical consistency AND scientific accuracy.

TEXT TO ANALYZE:
${text}

Provide your analysis in this EXACT format:

=== LOGICAL CONSISTENCY ANALYSIS ===

LOGICAL CONSISTENCY SCORE: [X]/10
[10 = perfectly consistent, no contradictions; 1 = severe contradictions throughout]

LOGICAL ASSESSMENT: [PASS if ≥8 / WEAK if 5-7 / FAIL if ≤4]

LOGICAL ANALYSIS:
[Detailed analysis of internal consistency, structural coherence, and logical flow. Check for:
- Direct contradictions between statements
- Logical gaps in reasoning
- Terms used inconsistently
- Claims that don't follow from premises]

=== SCIENTIFIC ACCURACY ANALYSIS ===

SCIENTIFIC ACCURACY SCORE: [X]/10
[10 = all scientific claims are accurate and well-supported; 1 = major scientific errors throughout]

SCIENTIFIC ASSESSMENT: [PASS if ≥8 / WEAK if 5-7 / FAIL if ≤4]

SCIENTIFIC INACCURACIES FOUND:
[List each scientific inaccuracy, misconception, or false claim. If none, state "None identified."]
- [Inaccuracy 1]: [Explanation of why it's incorrect and what the actual scientific fact is]
- [Inaccuracy 2]: ...

SCIENTIFIC ANALYSIS:
[Detailed analysis of scientific accuracy. Check for:
- Alignment with established scientific knowledge
- Correct understanding of natural laws and mechanisms
- Accurate representation of scientific concepts
- Proper use of scientific terminology
- Claims that contradict empirical evidence]

=== OVERALL ASSESSMENT ===

OVERALL SCORE: [X]/10
[Average of logical consistency and scientific accuracy scores]

OVERALL ASSESSMENT: [PASS if both dimensions ≥8 / WEAK if either is 5-7 / FAIL if either is ≤4]

SUMMARY:
[Brief summary of the text's strengths and weaknesses in both dimensions]`;

  const message = await anthropic.messages.create({
    model: "claude-3-7-sonnet-20250219",
    max_tokens: 6000,
    temperature: 0.3,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }]
  });

  const output = message.content[0].type === 'text' ? message.content[0].text : '';

  // Helper function to derive assessment from score
  const deriveAssessment = (score: number): "PASS" | "WEAK" | "FAIL" => {
    if (score >= 8) return "PASS";
    if (score >= 5) return "WEAK";
    return "FAIL";
  };

  // Parse logical consistency section with multiple fallback patterns
  const logicalScoreMatch = output.match(/LOGICAL CONSISTENCY SCORE:\s*(\d+(?:\.\d+)?)\/10/i) ||
                            output.match(/LOGICAL.*SCORE:\s*(\d+(?:\.\d+)?)\/10/i) ||
                            output.match(/CONSISTENCY SCORE:\s*(\d+(?:\.\d+)?)\/10/i);
  const logicalAssessmentMatch = output.match(/LOGICAL ASSESSMENT:\s*(PASS|WEAK|FAIL)/i);
  const logicalAnalysisMatch = output.match(/LOGICAL ANALYSIS:\s*([\s\S]*?)(?===\s*SCIENTIFIC|SCIENTIFIC ACCURACY|$)/i);

  // Parse scientific accuracy section with multiple fallback patterns  
  const scientificScoreMatch = output.match(/SCIENTIFIC ACCURACY SCORE:\s*(\d+(?:\.\d+)?)\/10/i) ||
                               output.match(/SCIENTIFIC.*SCORE:\s*(\d+(?:\.\d+)?)\/10/i) ||
                               output.match(/ACCURACY SCORE:\s*(\d+(?:\.\d+)?)\/10/i);
  const scientificAssessmentMatch = output.match(/SCIENTIFIC ASSESSMENT:\s*(PASS|WEAK|FAIL)/i);
  const scientificAnalysisMatch = output.match(/SCIENTIFIC ANALYSIS:\s*([\s\S]*?)(?===\s*OVERALL|OVERALL ASSESSMENT|$)/i);
  
  // Try multiple patterns for inaccuracies section
  const inaccuraciesMatch = output.match(/SCIENTIFIC INACCURACIES FOUND:\s*([\s\S]*?)(?=SCIENTIFIC ANALYSIS:|===|$)/i) ||
                            output.match(/INACCURACIES(?:\s+FOUND)?:\s*([\s\S]*?)(?=SCIENTIFIC ANALYSIS:|ANALYSIS:|===|$)/i);

  // Parse overall assessment section
  const overallScoreMatch = output.match(/OVERALL SCORE:\s*(\d+(?:\.\d+)?)\/10/i);
  const overallAssessmentMatch = output.match(/OVERALL ASSESSMENT:\s*(PASS|WEAK|FAIL)/i);

  // Extract scores with safe defaults
  const logicalScore = logicalScoreMatch ? parseFloat(logicalScoreMatch[1]) : 5;
  const scientificScore = scientificScoreMatch ? parseFloat(scientificScoreMatch[1]) : 5;
  const overallScore = overallScoreMatch ? parseFloat(overallScoreMatch[1]) : (logicalScore + scientificScore) / 2;

  // Derive assessments - use parsed value if available, otherwise derive from score
  const logicalAssessment = logicalAssessmentMatch ? 
    logicalAssessmentMatch[1].toUpperCase() as "PASS" | "WEAK" | "FAIL" : 
    deriveAssessment(logicalScore);
  
  const scientificAssessment = scientificAssessmentMatch ? 
    scientificAssessmentMatch[1].toUpperCase() as "PASS" | "WEAK" | "FAIL" : 
    deriveAssessment(scientificScore);
  
  // Overall assessment: FAIL if either fails, WEAK if either is weak, else PASS
  const overallAssessment = overallAssessmentMatch ? 
    overallAssessmentMatch[1].toUpperCase() as "PASS" | "WEAK" | "FAIL" :
    (logicalAssessment === "FAIL" || scientificAssessment === "FAIL") ? "FAIL" :
    (logicalAssessment === "WEAK" || scientificAssessment === "WEAK") ? "WEAK" : "PASS";

  // Parse inaccuracies with robust extraction
  const inaccuracies: string[] = [];
  if (inaccuraciesMatch && inaccuraciesMatch[1]) {
    const inaccuracyText = inaccuraciesMatch[1].trim();
    
    // Skip if it explicitly says none
    if (!inaccuracyText.toLowerCase().includes('none identified') && 
        !inaccuracyText.toLowerCase().includes('no inaccuracies') &&
        !inaccuracyText.toLowerCase().includes('none found') &&
        inaccuracyText.length > 10) {
      
      // Try to extract bullet points or numbered items
      const lines = inaccuracyText.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 5);
      
      for (const line of lines) {
        // Remove bullet points, numbers, dashes at start
        const cleanedLine = line.replace(/^[-•*\d.)\]]+\s*/, '').trim();
        if (cleanedLine.length > 5 && 
            !cleanedLine.toLowerCase().includes('none identified') &&
            !cleanedLine.toLowerCase().includes('no inaccuracies')) {
          inaccuracies.push(cleanedLine);
        }
      }
    }
  }

  // Extract logical and scientific analysis text with fallbacks
  const logicalAnalysisText = logicalAnalysisMatch ? logicalAnalysisMatch[1].trim() : 
    'Logical consistency analysis not available in expected format. See full analysis below.';
  const scientificAnalysisText = scientificAnalysisMatch ? scientificAnalysisMatch[1].trim() : 
    'Scientific accuracy analysis not available in expected format. See full analysis below.';

  return {
    overallScore: Math.round(overallScore * 10) / 10,
    overallAssessment,
    logicalConsistency: {
      score: Math.round(logicalScore * 10) / 10,
      assessment: logicalAssessment,
      analysis: logicalAnalysisText
    },
    scientificAccuracy: {
      score: Math.round(scientificScore * 10) / 10,
      assessment: scientificAssessment,
      analysis: scientificAnalysisText,
      inaccuracies
    },
    fullAnalysis: output
  };
}

export interface ScientificRewriteResult {
  rewrittenText: string;
  changes: string;
  correctionsApplied: string[];
  scientificAccuracyScore: number;
}

export async function rewriteScientificExplanatory(
  text: string,
  aggressiveness: "conservative" | "moderate" | "aggressive" = "moderate"
): Promise<ScientificRewriteResult> {
  
  let aggressivenessInstructions = "";
  if (aggressiveness === "conservative") {
    aggressivenessInstructions = `CONSERVATIVE MODE: Make minimal changes. Only correct the most egregious scientific errors while preserving the author's voice and structure. If a claim is merely unverified (not demonstrably false), leave it with appropriate hedging language.`;
  } else if (aggressiveness === "moderate") {
    aggressivenessInstructions = `MODERATE MODE: Correct all scientifically inaccurate claims. Replace pseudoscientific explanations with evidence-based alternatives. Add hedging language for claims that lack strong evidence. Preserve overall structure but rewrite passages as needed.`;
  } else {
    aggressivenessInstructions = `AGGRESSIVE MODE: Completely rewrite to achieve maximum scientific accuracy (target 9-10/10). Remove all pseudoscientific content. Replace speculative claims with established science. May significantly restructure or expand with accurate scientific content. Every claim must be defensible by current scientific consensus.`;
  }

  const systemPrompt = `You are a scientific accuracy editor specializing in correcting pseudoscience, misconceptions, and scientifically inaccurate claims. Your PRIMARY MISSION is to ensure the output is SCIENTIFICALLY ACCURATE according to established science, empirical evidence, and known natural mechanisms.

CRITICAL RULES:
1. You MUST NOT preserve false claims - coherence does NOT trump truth
2. You MUST replace pseudoscientific explanations with actual scientific mechanisms
3. You MUST correct claims that contradict established physics, chemistry, biology, etc.
4. You MUST add appropriate uncertainty language for claims that lack strong evidence
5. You MUST remove or reframe unfalsifiable claims
6. Logical coherence is SECONDARY - a text can be coherent but wrong. Your job is to make it BOTH coherent AND scientifically accurate.

WHAT COUNTS AS SCIENTIFICALLY INACCURATE:
- Claims contradicting established physics, chemistry, biology, medicine
- Pseudoscientific mechanisms (e.g., "quantum healing", "detox through feet", "water memory")
- Misrepresentation of how natural systems work
- Correlation-causation fallacies presented as fact
- Appeals to "energy", "vibrations", "frequencies" without physical grounding
- Claims that violate thermodynamics, conservation laws, or basic biology
- Alternative medicine claims without evidence
- Conspiracy-adjacent scientific claims

${aggressivenessInstructions}`;

  const userPrompt = `Rewrite this text to be SCIENTIFICALLY ACCURATE while maintaining logical coherence.

TEXT TO REWRITE:
${text}

INSTRUCTIONS:
1. Identify ALL scientifically inaccurate or pseudoscientific claims
2. Replace them with accurate scientific explanations
3. If a claim has no scientific basis, either remove it or explicitly frame it as speculation/belief
4. Maintain the text's readability and flow
5. Preserve the author's general intent where possible, but NEVER at the cost of scientific accuracy

OUTPUT FORMAT:
First, output the completely rewritten text with all scientific corrections applied.
Then add a separator "---CORRECTIONS---" followed by a numbered list of the scientific corrections you made.

CRITICAL: Do NOT use any markdown formatting in the rewritten text. No #, ##, *, **, -, or any markdown symbols. Plain prose only.

REWRITTEN TEXT:`;

  const message = await anthropic.messages.create({
    model: "claude-3-7-sonnet-20250219",
    max_tokens: 8192,
    temperature: 0.5,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }]
  });

  const fullOutput = message.content[0].type === 'text' ? message.content[0].text : '';
  
  // Parse the output to separate rewritten text from corrections
  const separatorMatch = fullOutput.match(/---CORRECTIONS---/i);
  let rewrittenText = fullOutput;
  let correctionsSection = "";
  
  if (separatorMatch) {
    const parts = fullOutput.split(/---CORRECTIONS---/i);
    rewrittenText = stripMarkdown(parts[0].trim());
    correctionsSection = parts[1] ? parts[1].trim() : "";
  } else {
    rewrittenText = stripMarkdown(rewrittenText);
  }

  // Parse corrections into array
  const correctionsApplied: string[] = [];
  if (correctionsSection) {
    const lines = correctionsSection.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 5);
    
    for (const line of lines) {
      const cleanedLine = line.replace(/^[-•*\d.)\]]+\s*/, '').trim();
      if (cleanedLine.length > 5) {
        correctionsApplied.push(cleanedLine);
      }
    }
  }

  // Generate a comparison of changes
  const changesAnalysisPrompt = `Compare these two versions and explain what SCIENTIFIC ACCURACY changes were made:

ORIGINAL (may contain inaccuracies):
${text}

CORRECTED VERSION:
${rewrittenText}

List the key scientific corrections made, focusing on:
- What pseudoscientific or inaccurate claims were removed/corrected
- What accurate scientific explanations replaced them
- Any claims that were hedged with uncertainty language

Provide concise bullet points.`;

  const changesMessage = await anthropic.messages.create({
    model: "claude-3-7-sonnet-20250219",
    max_tokens: 2048,
    temperature: 0.3,
    messages: [{ role: "user", content: changesAnalysisPrompt }]
  });

  const changes = changesMessage.content[0].type === 'text' ? changesMessage.content[0].text : '';

  // Quick validation pass to estimate accuracy score
  const validationPrompt = `Rate the scientific accuracy of this text on a scale of 1-10, where 10 means every claim is supported by established science.

TEXT:
${rewrittenText}

Respond with ONLY a number from 1-10.`;

  const validationMessage = await anthropic.messages.create({
    model: "claude-3-7-sonnet-20250219",
    max_tokens: 10,
    temperature: 0,
    messages: [{ role: "user", content: validationPrompt }]
  });

  const scoreText = validationMessage.content[0].type === 'text' ? validationMessage.content[0].text : '5';
  const scientificAccuracyScore = parseFloat(scoreText.match(/\d+(?:\.\d+)?/)?.[0] || '5');

  return {
    rewrittenText,
    changes,
    correctionsApplied,
    scientificAccuracyScore: Math.min(10, Math.max(1, scientificAccuracyScore))
  };
}

// Math Proof Coherence Analysis - checks ONLY structural coherence, NOT truth
export interface MathCoherenceResult {
  score: number;
  assessment: "PASS" | "WEAK" | "FAIL";
  analysis: string;
  subscores: {
    logicalFlow: number;
    notationalConsistency: number;
    stepJustification: number;
    structuralClarity: number;
  };
}

export async function analyzeMathCoherence(text: string): Promise<MathCoherenceResult> {
  const systemPrompt = `You are a mathematical proof STRUCTURAL COHERENCE analyzer.

CRITICAL: You are evaluating INTERNAL STRUCTURAL COHERENCE only. NOT whether the proof is correct or the theorem is true.

A proof can be PERFECTLY COHERENT while proving something false. A proof can be INCOHERENT while proving something true.

COHERENCE CRITERIA (what you ARE checking):
1. LOGICAL FLOW: Do steps follow from previous steps in a clear progression?
2. NOTATIONAL CONSISTENCY: Are symbols and terms used consistently throughout?
3. STEP JUSTIFICATION: Is each step accompanied by a reason (even if that reason is wrong)?
4. STRUCTURAL CLARITY: Is the proof organized with clear beginning, middle, end?

WHAT YOU ARE NOT CHECKING:
- Whether the theorem is true
- Whether individual claims are mathematically correct
- Whether the proof actually proves what it claims
- External mathematical validity

A proof with perfect structure that "proves" 1=2 should score HIGH on coherence.
A jumbled mess of correct statements should score LOW on coherence.`;

  const userPrompt = `Analyze this mathematical proof for STRUCTURAL COHERENCE only.

Do NOT evaluate whether the mathematics is correct. Only evaluate the STRUCTURE.

PROOF:
${text}

OUTPUT FORMAT:

LOGICAL FLOW SCORE: [X]/10
[Does each step follow clearly from the previous? Are transitions smooth?]

NOTATIONAL CONSISTENCY SCORE: [X]/10
[Are variables and symbols used consistently? Same notation throughout?]

STEP JUSTIFICATION SCORE: [X]/10
[Does each step have a stated reason/justification? (correctness of reason is irrelevant)]

STRUCTURAL CLARITY SCORE: [X]/10
[Is there clear organization: statement, proof body, conclusion?]

OVERALL COHERENCE SCORE: [X]/10
[Average of above scores]

ASSESSMENT: [PASS if ≥8 / WEAK if 5-7 / FAIL if ≤4]

STRUCTURAL ANALYSIS:
[Describe the structural strengths and weaknesses. Do NOT comment on mathematical correctness.]`;

  const message = await anthropic.messages.create({
    model: "claude-3-7-sonnet-20250219",
    max_tokens: 3000,
    temperature: 0.3,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }]
  });

  const output = message.content[0].type === 'text' ? message.content[0].text : '';

  const logicalFlowMatch = output.match(/LOGICAL FLOW SCORE:\s*(\d+(?:\.\d+)?)\/10/i);
  const notationalMatch = output.match(/NOTATIONAL CONSISTENCY SCORE:\s*(\d+(?:\.\d+)?)\/10/i);
  const justificationMatch = output.match(/STEP JUSTIFICATION SCORE:\s*(\d+(?:\.\d+)?)\/10/i);
  const clarityMatch = output.match(/STRUCTURAL CLARITY SCORE:\s*(\d+(?:\.\d+)?)\/10/i);
  const overallMatch = output.match(/OVERALL COHERENCE SCORE:\s*(\d+(?:\.\d+)?)\/10/i);
  const assessmentMatch = output.match(/ASSESSMENT:\s*(PASS|WEAK|FAIL)/i);

  const logicalFlow = logicalFlowMatch ? parseFloat(logicalFlowMatch[1]) : 5;
  const notationalConsistency = notationalMatch ? parseFloat(notationalMatch[1]) : 5;
  const stepJustification = justificationMatch ? parseFloat(justificationMatch[1]) : 5;
  const structuralClarity = clarityMatch ? parseFloat(clarityMatch[1]) : 5;

  const score = overallMatch ? parseFloat(overallMatch[1]) : 
    (logicalFlow + notationalConsistency + stepJustification + structuralClarity) / 4;
  const assessment = (assessmentMatch ? assessmentMatch[1].toUpperCase() : 
    score >= 8 ? "PASS" : score >= 5 ? "WEAK" : "FAIL") as "PASS" | "WEAK" | "FAIL";

  return {
    score: Math.round(score * 10) / 10,
    assessment,
    analysis: output,
    subscores: {
      logicalFlow,
      notationalConsistency,
      stepJustification,
      structuralClarity
    }
  };
}

// Math Proof Max Coherence Rewrite - improves ONLY structural coherence, preserves the theorem being proved
export interface MathMaxCoherenceRewriteResult {
  rewrittenProof: string;
  changes: string;
  coherenceScore: number;
}

export async function rewriteMathMaxCoherence(
  text: string,
  aggressiveness: "conservative" | "moderate" | "aggressive" = "moderate"
): Promise<MathMaxCoherenceRewriteResult> {
  let intensityGuide = "";
  if (aggressiveness === "conservative") {
    intensityGuide = "Make MINIMAL changes. Fix only obvious structural issues. Preserve original wording as much as possible.";
  } else if (aggressiveness === "moderate") {
    intensityGuide = "Make moderate improvements. Reorganize for clarity, add transitions, improve notation consistency.";
  } else {
    intensityGuide = "Maximize structural coherence. Completely restructure if needed. Add extensive justifications. Polish every transition.";
  }

  const systemPrompt = `You are a mathematical proof STRUCTURAL EDITOR.

YOUR GOAL: Improve the STRUCTURAL COHERENCE of proofs WITHOUT changing the mathematical content.

WHAT YOU DO:
- Improve logical flow between steps
- Make notation consistent throughout
- Add or clarify step justifications
- Improve overall structure and organization
- Add clear transitions between sections
- Format for maximum readability

WHAT YOU DO NOT DO:
- Fix mathematical errors
- Change the theorem being proved
- Add correct steps that were missing
- Remove incorrect steps
- Verify truth of claims

You are a FORMATTER, not a MATHEMATICIAN.

If the proof says 2+2=5, you KEEP that claim but make sure it flows well with surrounding steps.

${intensityGuide}`;

  const userPrompt = `Rewrite this mathematical proof to maximize STRUCTURAL COHERENCE.

CRITICAL: Preserve ALL mathematical content exactly. Only improve structure, flow, formatting, and clarity.

ORIGINAL PROOF:
${text}

Output the structurally improved proof with NO commentary or headers - just the improved proof text. CRITICAL: Do NOT use any markdown formatting. No #, ##, *, **, -, or any markdown symbols. Plain prose only.`;

  const message = await anthropic.messages.create({
    model: "claude-3-7-sonnet-20250219",
    max_tokens: 6000,
    temperature: 0.5,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }]
  });

  const rewrittenProof = stripMarkdown(message.content[0].type === 'text' ? message.content[0].text : '');

  // Analyze what structural changes were made
  const changesPrompt = `Compare these two versions of a proof and describe the STRUCTURAL changes made (not mathematical changes).

Focus on: logical flow improvements, notation consistency, step justifications added, structural reorganization.

ORIGINAL:
${text}

REWRITTEN:
${rewrittenProof}

List the structural improvements in bullet points.`;

  const changesMessage = await anthropic.messages.create({
    model: "claude-3-7-sonnet-20250219",
    max_tokens: 1500,
    temperature: 0.3,
    messages: [{ role: "user", content: changesPrompt }]
  });

  const changes = changesMessage.content[0].type === 'text' ? changesMessage.content[0].text : '';

  // Quick coherence score for the rewritten proof
  const scorePrompt = `Rate the structural coherence of this mathematical proof on a scale of 1-10.
Only consider: logical flow, notation consistency, step justifications, structural clarity.
Do NOT consider mathematical correctness.

PROOF:
${rewrittenProof}

Respond with ONLY a number from 1-10.`;

  const scoreMessage = await anthropic.messages.create({
    model: "claude-3-7-sonnet-20250219",
    max_tokens: 10,
    temperature: 0,
    messages: [{ role: "user", content: scorePrompt }]
  });

  const scoreText = scoreMessage.content[0].type === 'text' ? scoreMessage.content[0].text : '7';
  const coherenceScore = parseFloat(scoreText.match(/\d+(?:\.\d+)?/)?.[0] || '7');

  return {
    rewrittenProof,
    changes,
    coherenceScore: Math.min(10, Math.max(1, coherenceScore))
  };
}

// Math Proof Maximize Truth Rewrite - corrects proofs or finds adjacent truths
export interface MathProofRewriteResult {
  correctedProof: string;
  theoremStatus: "TRUE" | "FALSE" | "PARTIALLY_TRUE";
  originalTheorem: string;
  correctedTheorem: string | null;
  proofStrategy: string;
  keyCorrections: string[];
  validityScore: number;
}

export async function rewriteMathMaximizeTruth(text: string): Promise<MathProofRewriteResult> {
  const systemPrompt = `You are a rigorous mathematician tasked with providing CORRECT mathematical proofs.

YOUR MISSION:
You will be given a mathematical proof that may be broken, incomplete, or attempting to prove a false theorem.

YOUR JOB IS NOT to simply reformat or polish the proof. YOUR JOB IS to provide a CORRECT, RIGOROUS proof.

STEP 1: DETERMINE IF THE THEOREM IS TRUE OR FALSE
- First, extract the theorem/claim being proved
- Test it with specific values, edge cases, and boundary conditions
- Actively search for counterexamples
- Determine: Is this theorem TRUE, FALSE, or PARTIALLY TRUE (true under certain conditions)?

STEP 2: PROVIDE A CORRECT PROOF
If the theorem is TRUE:
- If the original proof can be fixed with minor corrections, fix it and provide the corrected proof
- If the original proof is fundamentally flawed or uses wrong approach, provide a COMPLETELY DIFFERENT correct proof
- The proof must be mathematically rigorous with every step justified

If the theorem is FALSE:
- Identify WHY it is false (provide counterexample)
- Find a SIMILAR theorem that IS true (e.g., if the original claimed "for all n > 1" but it only holds for primes, state the corrected theorem)
- YOU MUST PROVIDE A COMPLETE, STEP-BY-STEP PROOF OF THE CORRECTED THEOREM
- The proof of the corrected theorem must be just as rigorous as if you were proving the original
- Do NOT just state the corrected theorem - you MUST prove it

If the theorem is PARTIALLY TRUE:
- Identify the conditions under which it IS true
- State the corrected theorem with proper conditions
- YOU MUST PROVE THE CORRECTED THEOREM with a complete step-by-step proof

CRITICAL RULES:
1. NEVER output a broken proof - every proof you output MUST be valid
2. NEVER just reformat without fixing mathematical errors
3. ALWAYS verify your proof is correct before outputting
4. Show key calculations explicitly
5. If you cannot prove something, say so - do not fake a proof
6. WHEN THEOREM IS FALSE: You MUST provide a COMPLETE proof of the corrected/adjacent theorem - never just state it without proof
7. The CORRECTED PROOF section must ALWAYS contain a complete mathematical proof, not just an explanation`;

  const userPrompt = `MATHEMATICAL PROOF CORRECTION REQUEST

Here is a proof that may contain errors or attempt to prove a false theorem:

---BEGIN PROOF---
${text}
---END PROOF---

REQUIRED OUTPUT FORMAT:

THEOREM EXTRACTION:
[State the theorem being proved in the original text]

THEOREM STATUS: [TRUE / FALSE / PARTIALLY_TRUE]

VERIFICATION:
[Show your work testing the theorem - compute specific values, check edge cases, search for counterexamples]

COUNTEREXAMPLES (if theorem is false):
[Provide specific counterexamples that disprove the theorem]

CORRECTED THEOREM (if original is false or partially true):
[State the corrected/modified theorem that IS true]

PROOF STRATEGY:
[Briefly explain your approach - are you fixing the original proof or providing a new one?]

---CORRECTED PROOF---
[CRITICAL: Provide a COMPLETE, STEP-BY-STEP mathematical proof here. 
If the original theorem was FALSE, you MUST prove the CORRECTED theorem with the same rigor you would use for any mathematical proof.
Include:
- Clear statement of what is being proved
- All logical steps numbered or clearly separated
- Justification for each step
- Final conclusion (QED)
DO NOT just explain why the original was wrong - PROVE the corrected theorem!]

KEY CORRECTIONS:
[List the main mathematical errors that were fixed or why a new approach was needed]

VALIDITY VERIFICATION:
[Confirm your proof is valid by checking key steps]`;

  const message = await anthropic.messages.create({
    model: "claude-3-7-sonnet-20250219",
    max_tokens: 10000,
    temperature: 1, // Must be 1 when extended thinking is enabled
    thinking: {
      type: "enabled",
      budget_tokens: 8000
    },
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }]
  });

  let output = '';
  for (const block of message.content) {
    if (block.type === 'text') {
      output = block.text;
      break;
    }
  }

  // Enhanced parsing with multiple fallback patterns
  
  // Parse theorem extraction with multiple patterns
  const theoremExtractionMatch = output.match(/THEOREM EXTRACTION:\s*([\s\S]*?)(?=THEOREM STATUS:|VERIFICATION:|$)/i) ||
                                  output.match(/(?:the )?theorem(?:\s+being\s+proved)?(?:\s+is)?:\s*([\s\S]*?)(?=THEOREM STATUS:|VERIFICATION:|STATUS:|$)/i) ||
                                  output.match(/(?:original\s+)?claim:\s*([\s\S]*?)(?=THEOREM STATUS:|VERIFICATION:|STATUS:|$)/i);
  
  // Parse theorem status with flexible matching
  const theoremStatusMatch = output.match(/THEOREM STATUS:\s*(TRUE|FALSE|PARTIALLY[_\s]?TRUE)/i) ||
                             output.match(/STATUS:\s*(TRUE|FALSE|PARTIALLY[_\s]?TRUE)/i) ||
                             output.match(/(?:the\s+theorem\s+is\s+)(TRUE|FALSE|PARTIALLY[_\s]?TRUE)/i);
  
  // Parse corrected theorem with multiple patterns
  const correctedTheoremMatch = output.match(/CORRECTED THEOREM[^:]*:\s*([\s\S]*?)(?=PROOF STRATEGY:|---CORRECTED PROOF---|CORRECTED PROOF:|$)/i) ||
                                output.match(/(?:a\s+)?similar\s+true\s+theorem:\s*([\s\S]*?)(?=PROOF STRATEGY:|---CORRECTED PROOF---|$)/i) ||
                                output.match(/modified\s+theorem:\s*([\s\S]*?)(?=PROOF STRATEGY:|---CORRECTED PROOF---|$)/i);
  
  // Parse proof strategy
  const proofStrategyMatch = output.match(/PROOF STRATEGY:\s*([\s\S]*?)(?=---CORRECTED PROOF---|CORRECTED PROOF:|PROOF:|$)/i) ||
                             output.match(/APPROACH:\s*([\s\S]*?)(?=---CORRECTED PROOF---|CORRECTED PROOF:|PROOF:|$)/i);
  
  // Parse the corrected proof with multiple patterns
  const correctedProofMatch = output.match(/---CORRECTED PROOF---\s*([\s\S]*?)(?=KEY CORRECTIONS:|VALIDITY VERIFICATION:|CORRECTIONS:|$)/i) ||
                              output.match(/CORRECTED PROOF:\s*([\s\S]*?)(?=KEY CORRECTIONS:|VALIDITY VERIFICATION:|CORRECTIONS:|$)/i) ||
                              output.match(/(?:here is the |the )?(?:rigorous |correct |valid )?proof:\s*([\s\S]*?)(?=KEY CORRECTIONS:|VALIDITY|CORRECTIONS:|$)/i);
  
  // Parse key corrections
  const keyCorrectionsMatch = output.match(/KEY CORRECTIONS:\s*([\s\S]*?)(?=VALIDITY VERIFICATION:|VERIFICATION:|$)/i) ||
                              output.match(/CORRECTIONS(?:\s+MADE)?:\s*([\s\S]*?)(?=VALIDITY|VERIFICATION:|$)/i) ||
                              output.match(/(?:main\s+)?(?:errors?|issues?)\s+(?:fixed|corrected):\s*([\s\S]*?)(?=VALIDITY|VERIFICATION:|$)/i);

  // Track whether we found explicit status (for validation)
  const hasExplicitStatus = !!theoremStatusMatch;
  
  // Extract values
  const originalTheorem = theoremExtractionMatch ? theoremExtractionMatch[1].trim().substring(0, 500) : "";
  
  // Normalize theorem status - but track if it was explicit
  let rawStatus = theoremStatusMatch ? theoremStatusMatch[1].toUpperCase().replace(/\s+/g, '_') : "";
  if (rawStatus.includes('PARTIAL')) rawStatus = "PARTIALLY_TRUE";
  
  // If no explicit status found, try to infer from content
  let theoremStatus: "TRUE" | "FALSE" | "PARTIALLY_TRUE";
  if (hasExplicitStatus && ["TRUE", "FALSE", "PARTIALLY_TRUE"].includes(rawStatus)) {
    theoremStatus = rawStatus as "TRUE" | "FALSE" | "PARTIALLY_TRUE";
  } else {
    // Infer from output content
    if (output.toLowerCase().includes('false') && 
        (output.toLowerCase().includes('counterexample') || output.toLowerCase().includes('corrected theorem'))) {
      theoremStatus = "FALSE";
    } else if (output.toLowerCase().includes('partially') || output.toLowerCase().includes('conditions')) {
      theoremStatus = "PARTIALLY_TRUE";
    } else {
      theoremStatus = "TRUE"; // Default assumption if proof appears complete
    }
  }
  
  // Get corrected theorem only if theorem was false/partial
  const correctedTheorem = (theoremStatus !== "TRUE" && correctedTheoremMatch && correctedTheoremMatch[1].trim().length > 10) 
    ? correctedTheoremMatch[1].trim().substring(0, 500) 
    : null;
  
  const proofStrategy = proofStrategyMatch ? proofStrategyMatch[1].trim().substring(0, 300) : "Proof corrected using rigorous mathematical reasoning";
  
  // For corrected proof, use the matched section or fall back to extracting from the full output
  let correctedProof = "";
  if (correctedProofMatch && correctedProofMatch[1].trim().length > 50) {
    correctedProof = correctedProofMatch[1].trim();
  } else {
    // Fallback: Try to extract any substantial proof-like content
    const proofFallback = output.match(/(?:proof|demonstrate|show that|we have|therefore|thus|hence|QED|∎|□)[\s\S]{100,}/i);
    if (proofFallback) {
      correctedProof = proofFallback[0].trim();
    } else {
      // Last resort: use the entire output after removing obvious header sections
      correctedProof = output
        .replace(/THEOREM EXTRACTION:[\s\S]*?(?=THEOREM STATUS:|$)/gi, '')
        .replace(/THEOREM STATUS:[\s\S]*?(?=VERIFICATION:|$)/gi, '')
        .replace(/VERIFICATION:[\s\S]*?(?=COUNTEREXAMPLES|CORRECTED THEOREM|$)/gi, '')
        .trim();
    }
  }

  // Parse key corrections into array
  const keyCorrections: string[] = [];
  if (keyCorrectionsMatch && keyCorrectionsMatch[1]) {
    const lines = keyCorrectionsMatch[1].split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 5);
    
    for (const line of lines) {
      const cleanedLine = line.replace(/^[-•*\d.)\]]+\s*/, '').trim();
      if (cleanedLine.length > 5 && 
          !cleanedLine.toLowerCase().startsWith('validity') &&
          !cleanedLine.toLowerCase().startsWith('verification')) {
        keyCorrections.push(cleanedLine);
      }
    }
  }

  // Validate the corrected proof
  const validationPrompt = `Rate the mathematical validity of this proof on a scale of 1-10, where 10 means the proof is completely rigorous and correct.

PROOF:
${correctedProof}

Consider:
- Are all claims true?
- Does each step follow logically from previous steps?
- Are there any gaps in reasoning?
- Would a mathematician accept this proof?

Respond with ONLY a number from 1-10.`;

  const validationMessage = await anthropic.messages.create({
    model: "claude-3-7-sonnet-20250219",
    max_tokens: 10,
    temperature: 0,
    messages: [{ role: "user", content: validationPrompt }]
  });

  const scoreText = validationMessage.content[0].type === 'text' ? validationMessage.content[0].text : '5';
  const parsedScore = parseFloat(scoreText.match(/\d+(?:\.\d+)?/)?.[0] || '');
  const validityScore = isNaN(parsedScore) ? 5 : Math.min(10, Math.max(1, parsedScore));

  // Validation: Ensure we have a non-empty proof
  if (!correctedProof || correctedProof.length < 50) {
    throw new Error("Failed to generate a valid corrected proof. Please try again.");
  }

  // Validation: If theorem is FALSE or PARTIALLY_TRUE, we should have a corrected theorem
  // If we don't, add a note to the proof strategy
  const finalCorrectedTheorem = (theoremStatus !== "TRUE" && !correctedTheorem) 
    ? "See corrected proof for the modified theorem statement"
    : correctedTheorem;
  
  const finalProofStrategy = (!proofStrategy || proofStrategy.length < 10)
    ? `Proof ${theoremStatus === "TRUE" ? "corrected" : "replaced with proof of corrected theorem"}`
    : proofStrategy;

  // Add default correction if none parsed
  if (keyCorrections.length === 0) {
    keyCorrections.push(theoremStatus === "TRUE" 
      ? "Proof structure and rigor improved"
      : "Original theorem corrected and new proof provided");
  }

  return {
    correctedProof,
    theoremStatus,
    originalTheorem,
    correctedTheorem: finalCorrectedTheorem,
    proofStrategy: finalProofStrategy,
    keyCorrections,
    validityScore
  };
}
