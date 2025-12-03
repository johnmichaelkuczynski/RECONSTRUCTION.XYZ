import Anthropic from '@anthropic-ai/sdk';

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

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

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
  if (aggressiveness === "conservative") {
    systemPrompt = `You are a coherence editor. Make MINIMAL changes to fix ONLY internal contradictions and clarity issues. Preserve structure and wording.`;
  } else if (aggressiveness === "moderate") {
    systemPrompt = `You are a coherence improver. Fix internal contradictions, improve term clarity, strengthen hierarchical structure. May expand moderately.`;
  } else {
    systemPrompt = `You are a coherence maximizer. Achieve 9-10/10 coherence. May expand significantly, restructure completely, add extensive context. PRIORITIZE MAXIMUM INTERNAL COHERENCE.`;
  }

  const userPrompt = `Rewrite this text to maximize INTERNAL COHERENCE (internal consistency, clarity, hierarchical structure).

CRITICAL RULES:
1. You MAY keep false claims (coherence ≠ truth)
2. You MAY keep unverified claims (coherence ≠ evidence)  
3. You MAY assume expert knowledge (coherence ≠ accessibility)
4. You MUST fix: internal contradictions, unclear terms, sequential-only structure
5. You MUST detect and eliminate faux-placeholder coherence (replace buzzwords with grounded terms, make structure hierarchical not sequential)

ORIGINAL TEXT:
${text}

Output ONLY the rewritten text. No headers, no labels, no commentary.`;

  const message = await anthropic.messages.create({
    model: "claude-3-7-sonnet-20250219",
    max_tokens: 4096,
    temperature: 0.7,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }]
  });

  const rewrittenText = message.content[0].type === 'text' ? message.content[0].text : '';

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
