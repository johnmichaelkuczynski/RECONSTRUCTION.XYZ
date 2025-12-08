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
    rewrittenText = parts[0].trim();
    correctionsSection = parts[1] ? parts[1].trim() : "";
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
