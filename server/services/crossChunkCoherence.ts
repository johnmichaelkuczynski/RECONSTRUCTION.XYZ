import Anthropic from "@anthropic-ai/sdk";
import { 
  GlobalSkeleton, 
  ChunkDelta, 
  StitchResult,
  ReconstructionDocument,
  ReconstructionChunk
} from "@shared/schema";

const anthropic = new Anthropic();

const MAX_INPUT_WORDS = 20000;
const TARGET_CHUNK_SIZE = 500;
const MAX_CHUNK_OUTPUT_WORDS = 600;
const CHUNK_DELAY_MS = 2000;
const MAX_CHUNK_RETRIES = 2;

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

  const message = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 4000,
    temperature: 0.2,
    messages: [{ role: "user", content: skeletonPrompt }]
  });

  const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
  
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
  onCheckpoint?: (chunkIdx: number, output: string) => Promise<void>
): Promise<{ outputText: string; delta: ChunkDelta }> {
  const startTime = Date.now();
  const inputWords = countWords(chunkText);
  
  let targetWords = targetOutputWords || inputWords;
  if (targetWords > MAX_CHUNK_OUTPUT_WORDS) {
    console.log(`[CC] Chunk ${chunkIndex} target ${targetWords} exceeds max ${MAX_CHUNK_OUTPUT_WORDS}, capping`);
    targetWords = MAX_CHUNK_OUTPUT_WORDS;
  }
  
  const minWords = Math.round(targetWords * 0.80);
  const maxWords = Math.min(Math.round(targetWords * 1.15), MAX_CHUNK_OUTPUT_WORDS);
  
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

${attempt > 1 ? `RETRY ATTEMPT ${attempt}: Previous output was too short or truncated. YOU MUST produce ${minForAttempt}-${maxForAttempt} words this time.` : ''}
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

    const message = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 4000,
      temperature: 0.5,
      messages: [{ role: "user", content: reconstructPrompt }]
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    
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
    const isTooShort = outputWordCount < minForAttempt * 0.8;
    
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

  const message = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 12000,
    temperature: 0.3,
    messages: [{ role: "user", content: stitchPrompt }]
  });

  const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
  
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
  
  console.log(`[CC] Starting 3-pass reconstruction for ${wordCount} word document`);
  
  console.log("[CC] Pass 1: Extracting global skeleton...");
  const skeleton = await extractGlobalSkeleton(text, audienceParameters, rigorLevel);
  
  console.log("[CC] Chunking document...");
  const chunkBoundaries = smartChunk(text);
  console.log(`[CC] Created ${chunkBoundaries.length} chunks`);
  
  console.log("[CC] Pass 2: Constrained chunk reconstruction (sequential with delays)...");
  const processedChunks: { text: string; delta: ChunkDelta }[] = [];
  
  for (let i = 0; i < chunkBoundaries.length; i++) {
    const chunkInputWords = countWords(chunkBoundaries[i].text);
    const targetOutputWords = Math.min(chunkInputWords, MAX_CHUNK_OUTPUT_WORDS);
    
    const { outputText, delta } = await reconstructChunkConstrained(
      chunkBoundaries[i].text,
      i,
      chunkBoundaries.length,
      skeleton,
      contentAnalysis,
      targetOutputWords
    );
    processedChunks.push({ text: outputText, delta });
    
    if (i < chunkBoundaries.length - 1) {
      console.log(`[CC] Waiting ${CHUNK_DELAY_MS}ms before next chunk...`);
      await delay(CHUNK_DELAY_MS);
    }
  }
  
  console.log("[CC] Pass 3: Global consistency stitch...");
  const { finalOutput, stitchResult } = await stitchAndValidate(skeleton, processedChunks);
  
  const totalTime = Date.now() - totalStartTime;
  console.log(`[CC] Complete 3-pass reconstruction finished in ${totalTime}ms`);
  
  const changesDescription = [
    `Processed ${chunkBoundaries.length} chunks through 3-pass CC system.`,
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
    originalLimitationsIdentified: `Original document (${wordCount} words) divided into ${chunkBoundaries.length} chunks for coherent reconstruction`,
    skeleton,
    stitchResult,
    chunksProcessed: chunkBoundaries.length
  };
}
