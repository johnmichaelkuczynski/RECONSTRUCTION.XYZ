import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { 
  GlobalSkeleton, 
  ChunkDelta, 
  StitchResult,
  ReconstructionDocument,
  ReconstructionChunk
} from "@shared/schema";

const anthropic = new Anthropic();
const openai = new OpenAI();

const PRIMARY_MODEL = "claude-sonnet-4-5-20250929";
const FALLBACK_MODEL = "gpt-4-turbo";

const MAX_INPUT_WORDS = 20000;
const TARGET_CHUNK_SIZE = 500;
const MAX_CHUNK_OUTPUT_WORDS = 600;
const CHUNK_DELAY_MS = 2000;
const MAX_CHUNK_RETRIES = 2;

// Length mode types
type LengthMode = 'heavy_compression' | 'moderate_compression' | 'maintain' | 'moderate_expansion' | 'heavy_expansion';

interface LengthConfig {
  targetMin: number;
  targetMax: number;
  targetMid: number;
  lengthRatio: number;
  lengthMode: LengthMode;
  chunkTargetWords: number;
}

// Helper to parse numbers with commas and shorthand (1.5k, 2k, etc.)
function parseWordCount(numStr: string): number {
  if (!numStr) return NaN;
  
  // Remove commas: "1,500" -> "1500"
  let cleaned = numStr.replace(/,/g, '').trim();
  
  // Handle shorthand like "1.5k" or "2k"
  const kMatch = cleaned.match(/^(\d+(?:\.\d+)?)\s*k$/i);
  if (kMatch) {
    const value = parseFloat(kMatch[1]);
    return isNaN(value) ? NaN : Math.round(value * 1000);
  }
  
  const result = parseInt(cleaned, 10);
  return isNaN(result) ? NaN : result;
}

// Parse target length from custom instructions
export function parseTargetLength(customInstructions: string | null | undefined): { targetMin: number; targetMax: number } | null {
  if (!customInstructions) return null;
  
  const text = customInstructions.toLowerCase();
  
  // "X-Y words" or "X to Y words" pattern (supports commas and shorthand)
  // Matches: "1200-1600 words", "1,200 to 1,600 words", "1.5k-2k words"
  const rangeMatch = text.match(/([\d,]+(?:\.\d+)?k?)\s*(?:-|–|—|\bto\b)\s*([\d,]+(?:\.\d+)?k?)\s*words?/i);
  if (rangeMatch) {
    return {
      targetMin: parseWordCount(rangeMatch[1]),
      targetMax: parseWordCount(rangeMatch[2])
    };
  }
  
  // "at least X words" pattern
  const atLeastMatch = text.match(/at\s+least\s+([\d,]+(?:\.\d+)?k?)\s*words?/i);
  if (atLeastMatch) {
    const min = parseWordCount(atLeastMatch[1]);
    return { targetMin: min, targetMax: Math.round(min * 1.3) };
  }
  
  // "no more than X words" or "maximum X words" pattern
  const maxMatch = text.match(/(?:no\s+more\s+than|maximum|max|under)\s+([\d,]+(?:\.\d+)?k?)\s*words?/i);
  if (maxMatch) {
    const max = parseWordCount(maxMatch[1]);
    return { targetMin: Math.round(max * 0.7), targetMax: max };
  }
  
  // "approximately X words" or "around X words" pattern
  const approxMatch = text.match(/(?:approximately|approx|about|around|roughly|~)\s*([\d,]+(?:\.\d+)?k?)\s*words?/i);
  if (approxMatch) {
    const target = parseWordCount(approxMatch[1]);
    return { targetMin: Math.round(target * 0.9), targetMax: Math.round(target * 1.1) };
  }
  
  // Plain "X words" pattern (supports "2k words", "1500 words", "1,500 words")
  const plainMatch = text.match(/([\d,]+(?:\.\d+)?k?)\s*words?/i);
  if (plainMatch) {
    const target = parseWordCount(plainMatch[1]);
    // Only accept reasonable word counts (50+) and valid numbers
    if (!isNaN(target) && target >= 50) {
      return { targetMin: Math.round(target * 0.9), targetMax: Math.round(target * 1.1) };
    }
  }
  
  // "X+ words" pattern (e.g., "2000+ words")
  const plusMatch = text.match(/([\d,]+(?:\.\d+)?k?)\+\s*words?/i);
  if (plusMatch) {
    const min = parseWordCount(plusMatch[1]);
    return { targetMin: min, targetMax: Math.round(min * 1.3) };
  }
  
  // Check for expand/compress keywords without numbers
  if (text.match(/\b(expand|enrich|elaborate|develop|longer)\b/i)) {
    return null; // Signal to use expansion ratio
  }
  if (text.match(/\b(compress|summarize|condense|shorten|brief)\b/i)) {
    return null; // Signal to use compression ratio
  }
  
  return null;
}

// Determine length mode based on ratio
function getLengthMode(ratio: number): LengthMode {
  if (ratio < 0.5) return 'heavy_compression';
  if (ratio < 0.8) return 'moderate_compression';
  if (ratio < 1.2) return 'maintain';
  if (ratio < 1.8) return 'moderate_expansion';
  return 'heavy_expansion';
}

// Calculate length configuration
export function calculateLengthConfig(
  totalInputWords: number,
  targetMin: number | null,
  targetMax: number | null,
  customInstructions: string | null | undefined
): LengthConfig {
  // Default: maintain length (ratio 1.0)
  let actualMin = targetMin ?? totalInputWords;
  let actualMax = targetMax ?? totalInputWords;
  
  // Check for expand/compress keywords if no explicit numbers
  if (targetMin === null && targetMax === null && customInstructions) {
    const text = customInstructions.toLowerCase();
    if (text.match(/\b(expand|enrich|elaborate|develop|longer)\b/i)) {
      actualMin = Math.round(totalInputWords * 1.3);
      actualMax = Math.round(totalInputWords * 1.5);
    } else if (text.match(/\b(compress|summarize|condense|shorten|brief)\b/i)) {
      actualMin = Math.round(totalInputWords * 0.3);
      actualMax = Math.round(totalInputWords * 0.5);
    }
  }
  
  const targetMid = Math.floor((actualMin + actualMax) / 2);
  const lengthRatio = targetMid / totalInputWords;
  const lengthMode = getLengthMode(lengthRatio);
  const numChunks = Math.ceil(totalInputWords / TARGET_CHUNK_SIZE);
  const chunkTargetWords = Math.ceil(targetMid / numChunks);
  
  return {
    targetMin: actualMin,
    targetMax: actualMax,
    targetMid,
    lengthRatio,
    lengthMode,
    chunkTargetWords
  };
}

// Length guidance templates for different modes
function getLengthGuidanceTemplate(mode: LengthMode): string {
  switch (mode) {
    case 'heavy_compression':
      return `LENGTH MODE: HEAVY COMPRESSION
You must significantly compress this chunk while preserving core arguments.
- Remove examples, keep only the most critical one
- Remove repetition and redundancy
- Convert detailed explanations to concise statements
- Preserve thesis statements and key claims verbatim
- Remove transitional phrases and rhetorical flourishes`;

    case 'moderate_compression':
      return `LENGTH MODE: MODERATE COMPRESSION
You must compress this chunk while preserving argument structure.
- Keep the strongest 1-2 examples, remove weaker ones
- Tighten prose without losing meaning
- Preserve all key claims and their primary support
- Remove redundancy but keep necessary emphasis`;

    case 'maintain':
      return `LENGTH MODE: MAINTAIN LENGTH
Your output should be approximately the same length as input.
- Improve clarity and coherence without changing length significantly
- Replace weak examples with stronger ones of similar length
- Restructure sentences for better flow
- Do not add or remove substantial content`;

    case 'moderate_expansion':
      return `LENGTH MODE: MODERATE EXPANSION
You must expand this chunk while maintaining focus.
- Add 1-2 supporting examples or evidence for key claims
- Elaborate on implications of major points
- Add transitional sentences to improve flow
- Expand terse statements into fuller explanations
- Do NOT add tangential content or padding`;

    case 'heavy_expansion':
      return `LENGTH MODE: HEAVY EXPANSION
You must significantly expand this chunk with substantive additions.
- Add 2-3 concrete examples (historical, empirical, or hypothetical)
- Elaborate on each major claim with supporting analysis
- Add relevant context and background
- Develop implications and consequences of arguments
- Add appropriate qualifications and nuances
- Do NOT add filler or padding—all additions must be substantive`;
  }
}

async function callWithFallback(
  prompt: string,
  maxTokens: number,
  temperature: number
): Promise<string> {
  try {
    const message = await anthropic.messages.create({
      model: PRIMARY_MODEL,
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: "user", content: prompt }]
    });
    return message.content[0].type === 'text' ? message.content[0].text : '';
  } catch (error: any) {
    const status = error?.status || error?.response?.status;
    const isRetryable = status === 404 || status === 429 || status === 503 || status === 529;
    
    if (isRetryable) {
      console.log(`[CC] Claude model error (${status}), falling back to GPT-4 Turbo`);
      try {
        const completion = await openai.chat.completions.create({
          model: FALLBACK_MODEL,
          max_tokens: maxTokens,
          temperature,
          messages: [{ role: "user", content: prompt }]
        });
        return completion.choices[0]?.message?.content || '';
      } catch (fallbackError: any) {
        console.error(`[CC] Fallback to GPT-4 also failed:`, fallbackError?.message);
        throw fallbackError;
      }
    }
    throw error;
  }
}

interface ChunkBoundary {
  start: number;
  end: number;
  text: string;
  wordCount: number;
}

export function smartChunk(text: string): ChunkBoundary[] {
  const words = text.trim().split(/\s+/);
  const totalWords = words.length;
  
  if (totalWords <= TARGET_CHUNK_SIZE) {
    return [{
      start: 0,
      end: text.length,
      text: text,
      wordCount: totalWords
    }];
  }
  
  const paragraphs = text.split(/\n\s*\n/);
  const chunks: ChunkBoundary[] = [];
  let currentChunk = "";
  let currentWordCount = 0;
  let currentStart = 0;
  let charPosition = 0;
  
  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i].trim();
    if (!para) {
      charPosition += paragraphs[i].length + 2;
      continue;
    }
    
    const paraWords = para.split(/\s+/).length;
    
    if (currentWordCount + paraWords > TARGET_CHUNK_SIZE && currentWordCount > 0) {
      chunks.push({
        start: currentStart,
        end: charPosition,
        text: currentChunk.trim(),
        wordCount: currentWordCount
      });
      currentChunk = para;
      currentWordCount = paraWords;
      currentStart = charPosition;
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + para;
      currentWordCount += paraWords;
    }
    
    charPosition += paragraphs[i].length + 2;
  }
  
  if (currentChunk.trim()) {
    chunks.push({
      start: currentStart,
      end: text.length,
      text: currentChunk.trim(),
      wordCount: currentWordCount
    });
  }
  
  return chunks;
}

export async function extractGlobalSkeleton(
  text: string,
  audienceParameters?: string,
  rigorLevel?: string
): Promise<GlobalSkeleton> {
  const startTime = Date.now();
  
  const skeletonPrompt = `You are a document structure analyst. Extract the GLOBAL SKELETON of this document in a FAST, LIGHTWEIGHT pass.

DOCUMENT:
${text}

Extract and return as JSON:
{
  "outline": ["8-20 numbered claims or sections identifying the document's structure"],
  "thesis": "The central argument or purpose in one sentence",
  "keyTerms": [{"term": "important term", "meaning": "how it's used in THIS document"}],
  "commitmentLedger": [{"type": "asserts|rejects|assumes", "claim": "explicit commitment"}],
  "entities": [{"name": "person/org/variable", "type": "person|organization|policy|variable|concept", "role": "role in document"}]
}

RULES:
1. Be FAST - extract structure, do NOT rewrite or reconstruct anything
2. The outline should have 8-20 items capturing the logical progression
3. Key terms are domain-specific terms with their meanings AS USED IN THIS DOCUMENT
4. Commitment ledger captures EXPLICIT claims: "The document asserts X", "rejects Y", "assumes Z"
5. Entities include people, organizations, policies, variables, or technical terms that must be referenced consistently

Return ONLY valid JSON, no explanation.`;

  const responseText = await callWithFallback(skeletonPrompt, 4000, 0.2);
  
  let skeleton: GlobalSkeleton;
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      skeleton = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error("No JSON found in response");
    }
  } catch (e) {
    skeleton = {
      outline: ["Document structure could not be parsed"],
      thesis: "Thesis extraction failed",
      keyTerms: [],
      commitmentLedger: [],
      entities: []
    };
  }
  
  skeleton.audienceParameters = audienceParameters;
  skeleton.rigorLevel = rigorLevel;
  
  console.log(`[CC] Skeleton extraction completed in ${Date.now() - startTime}ms`);
  return skeleton;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isOutputTruncated(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  
  const lastChar = trimmed[trimmed.length - 1];
  const validEndings = ['.', '!', '?', '"', "'", ')', ']', '—', ':'];
  
  if (!validEndings.includes(lastChar)) {
    const sentences = trimmed.match(/[.!?]["']?\s/g);
    if (!sentences || sentences.length < 2) {
      return true;
    }
  }
  
  return false;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

export async function reconstructChunkConstrained(
  chunkText: string,
  chunkIndex: number,
  totalChunks: number,
  skeleton: GlobalSkeleton,
  contentAnalysis?: any,
  targetOutputWords?: number,
  onCheckpoint?: (chunkIdx: number, output: string) => Promise<void>,
  lengthConfig?: LengthConfig
): Promise<{ outputText: string; delta: ChunkDelta }> {
  const startTime = Date.now();
  const inputWords = countWords(chunkText);
  
  // Calculate per-chunk target based on length ratio if config is provided
  let targetWords: number;
  if (lengthConfig) {
    // Apply the ratio to this specific chunk's input
    targetWords = Math.round(inputWords * lengthConfig.lengthRatio);
    console.log(`[CC] Chunk ${chunkIndex}: input=${inputWords}, ratio=${lengthConfig.lengthRatio.toFixed(2)}, target=${targetWords}`);
  } else {
    targetWords = targetOutputWords || inputWords;
  }
  
  // Apply reasonable bounds
  const absoluteMin = 50; // Never go below 50 words
  const absoluteMax = 2000; // Never exceed 2000 words per chunk
  targetWords = Math.max(absoluteMin, Math.min(targetWords, absoluteMax));
  
  const minWords = Math.round(targetWords * 0.85);
  const maxWords = Math.round(targetWords * 1.15);
  
  // Get length guidance based on mode
  const lengthGuidance = lengthConfig ? getLengthGuidanceTemplate(lengthConfig.lengthMode) : '';
  
  const relevantOutline = skeleton.outline.slice(
    Math.floor(chunkIndex * skeleton.outline.length / totalChunks),
    Math.ceil((chunkIndex + 1) * skeleton.outline.length / totalChunks)
  );
  
  let attempt = 0;
  let outputText = "";
  let delta: ChunkDelta = {
    newClaimsIntroduced: [],
    termsUsed: [],
    conflictsDetected: [],
    ledgerAdditions: []
  };
  
  while (attempt < MAX_CHUNK_RETRIES) {
    attempt++;
    
    const targetForAttempt = attempt === 1 ? targetWords : Math.round(targetWords * 0.85);
    const minForAttempt = Math.round(targetForAttempt * 0.75);
    const maxForAttempt = Math.min(Math.round(targetForAttempt * 1.1), MAX_CHUNK_OUTPUT_WORDS);
    
    const reconstructPrompt = `You are reconstructing chunk ${chunkIndex + 1} of ${totalChunks} of a document.

*** CRITICAL OUTPUT LENGTH REQUIREMENT ***
- Input chunk length: ${inputWords} words
- YOUR OUTPUT MUST BE: ${minForAttempt}-${maxForAttempt} words
- Target: approximately ${targetForAttempt} words

HARD REQUIREMENTS:
1. Your output MUST be at least ${minForAttempt} words - shorter outputs FAIL
2. Your output MUST NOT exceed ${maxForAttempt} words - longer outputs FAIL
3. Your output MUST end with a complete sentence - no truncation allowed
4. Count your words before submitting

${lengthGuidance ? `${lengthGuidance}\n` : ''}${attempt > 1 ? `RETRY ATTEMPT ${attempt}: Previous output was too short or truncated. YOU MUST produce ${minForAttempt}-${maxForAttempt} words this time.` : ''}
*** END LENGTH REQUIREMENT ***

GLOBAL SKELETON (you MUST maintain consistency with this):
THESIS: ${skeleton.thesis}

RELEVANT OUTLINE SECTION: 
${relevantOutline.map((item, i) => `${i + 1}. ${item}`).join('\n')}

KEY TERMS (use these EXACTLY as defined):
${skeleton.keyTerms.map(t => `- ${t.term}: ${t.meaning}`).join('\n')}

COMMITMENT LEDGER (do NOT contradict these):
${skeleton.commitmentLedger.map(c => `- ${c.type.toUpperCase()}: ${c.claim}`).join('\n')}

ENTITIES (reference consistently):
${skeleton.entities.map(e => `- ${e.name} (${e.type}): ${e.role}`).join('\n')}

CHUNK TO RECONSTRUCT:
${chunkText}

INSTRUCTIONS:
1. Reconstruct this chunk into polished, substantive prose
2. You MUST NOT contradict the commitment ledger
3. You MUST use key terms as defined in the skeleton
4. You MUST maintain consistency with the thesis and outline
5. If you detect a conflict between the chunk content and the skeleton, FLAG IT explicitly
6. Generate fresh examples and substantive content that DEVELOPS the position
7. Output should be plain prose - no markdown headers, no bullet points
8. COMPLETE YOUR OUTPUT - do not stop mid-sentence

After the reconstruction, provide a DELTA REPORT as JSON:
{
  "newClaimsIntroduced": ["any new claims you introduced"],
  "termsUsed": ["key terms from skeleton that you used"],
  "conflictsDetected": [{"skeletonItem": "what skeleton item", "chunkContent": "what chunk said", "description": "nature of conflict"}],
  "ledgerAdditions": [{"type": "asserts|rejects|assumes", "claim": "new commitment introduced"}]
}

Format your response as:
===RECONSTRUCTION===
[Your reconstructed text here - plain prose, no markdown, ${minForAttempt}-${maxForAttempt} words]
===DELTA===
[Your JSON delta report here]`;

    const responseText = await callWithFallback(reconstructPrompt, 4000, 0.5);
    
    const reconstructionMatch = responseText.match(/===RECONSTRUCTION===\s*([\s\S]*?)(?:===DELTA===|$)/);
    if (reconstructionMatch) {
      outputText = reconstructionMatch[1].trim();
    } else {
      outputText = responseText.split('===DELTA===')[0].trim();
    }
    
    const deltaMatch = responseText.match(/===DELTA===\s*([\s\S]*)/);
    if (deltaMatch) {
      try {
        const jsonMatch = deltaMatch[1].match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          delta = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        console.log(`[CC] Delta parsing failed for chunk ${chunkIndex}`);
      }
    }
    
    const outputWordCount = countWords(outputText);
    const isTruncated = isOutputTruncated(outputText);
    const isTooShort = outputWordCount < minForAttempt;
    
    if (!isTruncated && !isTooShort) {
      console.log(`[CC] Chunk ${chunkIndex + 1}/${totalChunks} completed: ${outputWordCount} words (target: ${targetForAttempt}) in ${Date.now() - startTime}ms`);
      break;
    }
    
    if (attempt < MAX_CHUNK_RETRIES) {
      console.log(`[CC] Chunk ${chunkIndex + 1} validation failed (truncated: ${isTruncated}, short: ${isTooShort}, got ${outputWordCount} words). Retrying...`);
      await delay(1000);
    } else {
      console.log(`[CC] Chunk ${chunkIndex + 1} max retries reached. Proceeding with ${outputWordCount} words.`);
    }
  }
  
  if (onCheckpoint) {
    await onCheckpoint(chunkIndex, outputText);
  }
  
  return { outputText, delta };
}

export async function stitchAndValidate(
  skeleton: GlobalSkeleton,
  chunks: { text: string; delta: ChunkDelta }[]
): Promise<{ finalOutput: string; stitchResult: StitchResult }> {
  const startTime = Date.now();
  
  const deltasSummary = chunks.map((chunk, i) => ({
    chunkIndex: i,
    claims: chunk.delta.newClaimsIntroduced,
    conflicts: chunk.delta.conflictsDetected
  }));
  
  const stitchPrompt = `You are the GLOBAL CONSISTENCY VALIDATOR for a multi-chunk document reconstruction.

GLOBAL SKELETON:
THESIS: ${skeleton.thesis}

OUTLINE:
${skeleton.outline.map((item, i) => `${i + 1}. ${item}`).join('\n')}

KEY TERMS:
${skeleton.keyTerms.map(t => `- ${t.term}: ${t.meaning}`).join('\n')}

COMMITMENT LEDGER:
${skeleton.commitmentLedger.map(c => `- ${c.type.toUpperCase()}: ${c.claim}`).join('\n')}

CHUNK DELTAS (summary of what each chunk introduced):
${JSON.stringify(deltasSummary, null, 2)}

RECONSTRUCTED CHUNKS:
${chunks.map((chunk, i) => `\n=== CHUNK ${i + 1} ===\n${chunk.text}`).join('\n')}

YOUR TASK:
1. Detect cross-chunk contradictions (Chunk A says X, Chunk B says not-X)
2. Detect terminology drift (a term used differently across chunks)
3. Detect missing premises (claims made without proper setup)
4. Detect redundancies (same point made multiple times)
5. Generate a repair plan for any issues found
6. Produce the FINAL COHERENT OUTPUT by:
   - Executing micro-repairs on flagged chunks
   - Ensuring smooth transitions between chunks
   - Maintaining thesis consistency throughout

Return your response as:
===VALIDATION===
{
  "contradictions": [{"chunk1": 0, "chunk2": 1, "description": "description"}],
  "terminologyDrift": [{"term": "term", "chunk": 0, "originalMeaning": "x", "driftedMeaning": "y"}],
  "missingPremises": [{"location": 0, "description": "description"}],
  "redundancies": [{"chunks": [0, 2], "description": "same point"}],
  "repairPlan": [{"chunkIndex": 0, "repairAction": "what to fix"}]
}
===FINAL_OUTPUT===
[The complete, coherent, repaired document - plain prose, no markdown formatting]`;

  const responseText = await callWithFallback(stitchPrompt, 12000, 0.3);
  
  let stitchResult: StitchResult = {
    contradictions: [],
    terminologyDrift: [],
    missingPremises: [],
    redundancies: [],
    repairPlan: []
  };
  
  let finalOutput = "";
  
  const validationMatch = responseText.match(/===VALIDATION===\s*([\s\S]*?)(?:===FINAL_OUTPUT===|$)/);
  if (validationMatch) {
    try {
      const jsonMatch = validationMatch[1].match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        stitchResult = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.log("[CC] Stitch validation JSON parsing failed");
    }
  }
  
  const finalMatch = responseText.match(/===FINAL_OUTPUT===\s*([\s\S]*)/);
  if (finalMatch) {
    finalOutput = finalMatch[1].trim();
  } else {
    finalOutput = chunks.map(c => c.text).join("\n\n");
  }
  
  console.log(`[CC] Stitch validation completed in ${Date.now() - startTime}ms`);
  console.log(`[CC] Issues found: ${stitchResult.contradictions.length} contradictions, ${stitchResult.terminologyDrift.length} term drifts, ${stitchResult.repairPlan.length} repairs needed`);
  
  return { finalOutput, stitchResult };
}

export interface CCReconstructionResult {
  reconstructedText: string;
  changes: string;
  wasReconstructed: boolean;
  adjacentMaterialAdded: string;
  originalLimitationsIdentified: string;
  skeleton?: GlobalSkeleton;
  stitchResult?: StitchResult;
  chunksProcessed?: number;
}

export async function crossChunkReconstruct(
  text: string,
  audienceParameters?: string,
  rigorLevel?: string,
  customInstructions?: string,
  contentAnalysis?: any
): Promise<CCReconstructionResult> {
  const totalStartTime = Date.now();
  const wordCount = text.trim().split(/\s+/).length;
  
  if (wordCount > MAX_INPUT_WORDS) {
    throw new Error(`Input exceeds maximum of ${MAX_INPUT_WORDS} words (got ${wordCount})`);
  }
  
  if (wordCount <= TARGET_CHUNK_SIZE) {
    console.log(`[CC] Short document (${wordCount} words), using single-pass reconstruction`);
    return {
      reconstructedText: text,
      changes: "Document too short for multi-chunk processing, using standard reconstruction",
      wasReconstructed: false,
      adjacentMaterialAdded: "",
      originalLimitationsIdentified: "Document is short enough for single-pass processing"
    };
  }
  
  // Parse and calculate length configuration from custom instructions
  const parsedLength = parseTargetLength(customInstructions);
  const lengthConfig = calculateLengthConfig(
    wordCount,
    parsedLength?.targetMin ?? null,
    parsedLength?.targetMax ?? null,
    customInstructions
  );
  
  console.log(`[CC] Starting 3-pass reconstruction for ${wordCount} word document`);
  console.log(`[CC] Length config: target=${lengthConfig.targetMin}-${lengthConfig.targetMax} words, ratio=${lengthConfig.lengthRatio.toFixed(2)}, mode=${lengthConfig.lengthMode}`);
  
  console.log("[CC] Pass 1: Extracting global skeleton...");
  const skeleton = await extractGlobalSkeleton(text, audienceParameters, rigorLevel);
  
  console.log("[CC] Chunking document...");
  const chunkBoundaries = smartChunk(text);
  console.log(`[CC] Created ${chunkBoundaries.length} chunks, per-chunk target ~${lengthConfig.chunkTargetWords} words`);
  
  console.log("[CC] Pass 2: Constrained chunk reconstruction (sequential with delays)...");
  const processedChunks: { text: string; delta: ChunkDelta }[] = [];
  let totalOutputWords = 0;
  
  for (let i = 0; i < chunkBoundaries.length; i++) {
    const { outputText, delta } = await reconstructChunkConstrained(
      chunkBoundaries[i].text,
      i,
      chunkBoundaries.length,
      skeleton,
      contentAnalysis,
      undefined, // Let lengthConfig determine target
      undefined, // onCheckpoint
      lengthConfig
    );
    processedChunks.push({ text: outputText, delta });
    totalOutputWords += countWords(outputText);
    
    if (i < chunkBoundaries.length - 1) {
      console.log(`[CC] Waiting ${CHUNK_DELAY_MS}ms before next chunk...`);
      await delay(CHUNK_DELAY_MS);
    }
  }
  
  console.log(`[CC] All chunks processed. Total output: ${totalOutputWords} words (target: ${lengthConfig.targetMin}-${lengthConfig.targetMax})`);
  
  // Check if we're significantly under target and log warning
  if (totalOutputWords < lengthConfig.targetMin * 0.8) {
    console.log(`[CC] WARNING: Output ${totalOutputWords} words is significantly below minimum target ${lengthConfig.targetMin}`);
  }
  
  console.log("[CC] Pass 3: Global consistency stitch...");
  const { finalOutput, stitchResult } = await stitchAndValidate(skeleton, processedChunks);
  
  const totalTime = Date.now() - totalStartTime;
  console.log(`[CC] Complete 3-pass reconstruction finished in ${totalTime}ms`);
  
  const finalWordCount = countWords(finalOutput);
  
  const changesDescription = [
    `Processed ${chunkBoundaries.length} chunks through 3-pass CC system (${lengthConfig.lengthMode} mode).`,
    `Input: ${wordCount} words → Output: ${finalWordCount} words (target: ${lengthConfig.targetMin}-${lengthConfig.targetMax}).`,
    `Skeleton: ${skeleton.outline.length} outline items, ${skeleton.keyTerms.length} key terms, ${skeleton.commitmentLedger.length} commitments.`,
    stitchResult.contradictions.length > 0 ? `Resolved ${stitchResult.contradictions.length} cross-chunk contradictions.` : "No contradictions detected.",
    stitchResult.terminologyDrift.length > 0 ? `Fixed ${stitchResult.terminologyDrift.length} terminology drift issues.` : "Terminology consistent across chunks.",
    stitchResult.repairPlan.length > 0 ? `Applied ${stitchResult.repairPlan.length} repairs.` : "No repairs needed."
  ].join(" ");
  
  return {
    reconstructedText: finalOutput,
    changes: changesDescription,
    wasReconstructed: true,
    adjacentMaterialAdded: processedChunks
      .flatMap(c => c.delta.newClaimsIntroduced)
      .slice(0, 5)
      .join("; ") || "Fresh examples and substantive content added to each chunk",
    originalLimitationsIdentified: `Original document (${wordCount} words) processed with ${lengthConfig.lengthMode} mode (ratio: ${lengthConfig.lengthRatio.toFixed(2)})`,
    skeleton,
    stitchResult,
    chunksProcessed: chunkBoundaries.length
  };
}
