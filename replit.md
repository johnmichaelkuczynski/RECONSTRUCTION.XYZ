# TEXT MD

## Overview
TEXT MD is designed to analyze written text to assess the intelligence and cognitive fingerprint of authors using multi-model AI evaluation. Its primary purpose is to offer deep insights into cognitive abilities and thought processes from written content. Key capabilities include document analysis, AI detection, multi-language translation, comprehensive cognitive profiling, and intelligent text rewriting with advanced features for maximizing intelligence scores.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application employs a monorepo structure, separating client and server components.

**UI/UX Decisions:**
- Frontend uses React with TypeScript, TailwindCSS, and shadcn/ui for a modern and responsive user interface.
- Data visualization is handled by Chart.js.
- Detailed card-based layouts are used for analysis reports.
- Supports PDF/text downloads, document upload, and output downloads.

**Technical Implementations & Feature Specifications:**
- **Frontend**: React, TypeScript, TailwindCSS, shadcn/ui, wouter, React Query, Chart.js.
- **Backend**: Express.js with TypeScript, integrating multiple LLMs, document processing (Mathpix OCR), speech-to-text (AssemblyAI), and email services (SendGrid).
- **Database**: PostgreSQL with Drizzle ORM for user, document, analysis, and cognitive profile data.
- **Core Services**:
    - **Multi-Model Intelligence Evaluation**: A 4-phase system assessing 17 cognitive dimensions, supporting genre-aware analysis.
    - **Intelligent Rewrite Function (MAXINTEL)**: Recursively optimizes text for intelligence scores, with custom instructions and external knowledge integration.
    - **GPT Bypass Humanizer**: Transforms AI-generated text to bypass AI detection.
    - **Coherence Meter**: Supports up to 5000-word inputs with Global Coherence Preservation Protocol for long texts (>1000 words). Includes specialized modes:
      - **Mathematical Proof System** (Four distinct modes):
        1. **COHERENCE** - Evaluates structural coherence ONLY (logical flow, notation consistency, step justification, structural clarity). Does NOT evaluate whether the theorem is true. A well-structured proof of a false theorem can score high.
        2. **COGENCY** - Evaluates whether the theorem is TRUE and whether the proof is mathematically valid. Includes claim truth analysis, inference validity, boundary conditions, and soundness subscores. Shows counterexamples and flaws.
        3. **MAX COHERENCE** (Rewrite) - Improves structural coherence without changing mathematical content. Preserves all claims (even incorrect ones) while improving flow, notation, and organization.
        4. **MAXIMIZE TRUTH** (Rewrite) - Corrects defective proofs using Claude with extended thinking. If theorem is TRUE, fixes the proof. If FALSE, finds a similar true theorem and proves that instead. Returns theorem status, corrected proof, and key corrections.
      - **Scientific-Explanatory Coherence Type**: Performs dual assessment evaluating both logical consistency (internal contradictions, structural coherence) AND scientific accuracy (factual correctness, alignment with established science), displaying separate scores for each dimension. The REWRITE function specifically corrects pseudoscientific claims, replacing them with accurate scientific explanations.
    - **Text Model Validator**: Focused exclusively on the RECONSTRUCTION function for conservative charitable interpretation of texts.
    - **AI Chat Assistant**: Provides conversation history and context from the Zhi Database.
    - **Conservative Reconstruction**: "Charitable Interpretation" mode for generating coherent essays articulating a text's unified argument.

## Recent Changes (December 2024)
- **Cross-Chunk Coherence (CC) System for Reconstruction**: Implemented 3-pass architecture to prevent "Frankenstein" outputs in long document reconstruction:
  - **Pass 1 - Global Skeleton Extraction**: Fast, lightweight extraction of document structure before any reconstruction:
    - Outline: 8-20 numbered claims/sections identifying document structure
    - Thesis: Central argument or purpose
    - Key Terms: Important terms with their meanings as used in the document
    - Commitment Ledger: Explicit commitments (asserts X, rejects Y, assumes Z)
    - Entities: People, organizations, variables that must be referenced consistently
  - **Pass 2 - Constrained Chunk Reconstruction**: Divides input into ~800-word chunks (respecting paragraph boundaries) and reconstructs each with:
    - Full global skeleton injected as constraints
    - Strict instruction: must not contradict commitment ledger, must use key terms as defined
    - Delta report: new claims introduced, terms used, conflicts detected
  - **Pass 3 - Global Consistency Stitch**: Final validation pass that:
    - Detects cross-chunk contradictions and terminology drift
    - Identifies missing premises and redundancies
    - Generates repair plan and executes micro-repairs
    - Assembles final coherent output
  - **Parameters**: Max 5000 words input, 800-word chunks at paragraph boundaries
  - **Database Schema**: Added reconstruction_documents, reconstruction_chunks, reconstruction_runs tables for persistence/debugging
  - **Integration**: Automatically activates for documents >= 1200 words; shorter documents use standard synthesis
- **Coherence Meter Refine Feature**: Added ability to refine coherence rewrite output with target word count and custom instructions
- **Exemplar-Driven GCS Semantic Fixes**: Fixed critical state mutation semantics:
  - **Scientific-Explanatory**: Resolved feedback loops are now REMOVED from active list (not just status flip), allowing later reactivation
  - **Instructional**: Satisfied prerequisites are now REMOVED from prereqs list (not added), properly clearing completed requirements
  - **Philosophical**: Equivocation violations logged to history but NOT added to trusted vocabulary; new objections now populate replies_pending for proper dialectic tracking
- **Global Coherence State (GCS) System**: Complete architectural overhaul of coherence tracking:
  - **Core Principle**: Coherence is NOT agreement or non-contradiction. Coherence is CONTINUITY OF STATE UNDER TRANSFORMATION.
  - **Problem Solved**: Previously, chunking caused silent coherence degradation because coherence was evaluated locally. Now, every coherence function tracks evolving state across chunks.
  - **Mode-Specific State Tracking**: Each of 8 coherence modes has its own state dimensions:
    - **Logical Consistency**: Propositions asserted, negations ruled out, terms with definitions
    - **Logical Cohesiveness**: Argument position (premise/development/conclusion), claims requiring support, established premises
    - **Scientific/Explanatory**: Active causal variables, causal level (mechanism/system/policy/behavior), feedback loops, active mechanisms, open threads
    - **Thematic/Psychological**: Dominant affect, emotional trajectory, active themes, tone register
    - **Instructional**: Steps already given, preconditions satisfied, goal state, current phase
    - **Motivational**: Motivation direction (encourage/warn/pressure/reassure), intensity trend, active claims
    - **Mathematical**: Assumptions in force, proof strategy, lemmas established, current position
    - **Philosophical**: Core concepts with roles, distinctions drawn, dialectical position, active threads
  - **State Transitions**: Each chunk is processed as GCS_n → GCS_n+1, not evaluated in isolation
  - **Failure Detection**: Flags degradation when state is re-asserted instead of advanced, level silently changes, concepts reused with altered roles, or progress stalls via repetition
  - **State History**: Logs all state transitions for debugging and transparency
- **Global Coherence Preservation Protocol**: Implemented for Coherence Meter to handle long texts (>1000 words, up to 5000 words):
  - Extracts Global Context Object (GCO) capturing: core topics, central framework, key concepts, argument direction, emotional trajectory, instructional goal, mathematical assumptions
  - Injects GCO + live state into each chunk analysis/rewrite for cross-chunk coherence
  - Mode-specific rules for 8 coherence types
  - Chunk status tracking: preserved, weakened, or shifted relative to state
  - New `/api/coherence-global` endpoint for long-text processing
- **Refine Output Feature**: Added ability to refine both Reconstruction output and Final Objection-Proof version with target word count and/or custom instructions (e.g., "Add a Plato quote", "Reduce to 400 words").
- **Aggressive Mode Default**: Changed "Aggressive" to be the default mode for Reconstruction (and other functions with that toggle). Toggle is always visible directly under the RECONSTRUCTION button.
- **Full Suite Pipeline Improvements**: Pipeline now outputs ONLY the clean final version (no change log or commentary) for the Objection-Proof output.

### Previous Changes
- **Full Suite Pipeline (Complete)**: One-click execution of the complete 3-stage pipeline:
  1. **Reconstruction** - Conservative charitable interpretation of the input text
  2. **Objections** - Generates 25 likely objections with compelling counter-arguments
  3. **Objection-Proof Final Version** - Rewrites the text to preemptively address all identified objections
  - Shows real-time progress through each stage with visual indicators
  - Displays all 3 outputs in expandable sections with individual copy buttons
  - Supports optional custom instructions that apply across all stages
- **Generate Objection-Proof Version**: Rewrites text to be invulnerable to objections identified by the Objections Function. For devastating objections (fundamental flaws), substantially revises content. For forceful objections (appear strong but aren't), adds language to remove even apparent force. For minor objections, adds subtle preemptive framing. Produces a change log showing how each objection was addressed.
- **Text Model Validator Simplification**: Removed 6 validation modes (isomorphism, mathmodel, autodecide, truth-isomorphism, math-truth-select, axiomatic-transform). App now focuses exclusively on the RECONSTRUCTION function for conservative charitable interpretation of texts. Simplified UI and removed batch processing for this section.
- **BOTTOMLINE Removal**: Completely removed the BOTTOMLINE function from the application.
- **Objections Function**: Standalone function that generates 25 likely objections with compelling counter-arguments for any input text.

## External Dependencies
- **AI Service Providers**: OpenAI API (GPT-4), Anthropic API (Claude), DeepSeek API, Perplexity AI, Grok API (xAI).
- **Supporting Services**: Mathpix OCR, AssemblyAI, SendGrid, Google Custom Search, Stripe (for credit purchases), AnalyticPhilosophy.net Zhi API.
- **Database & Infrastructure**: Neon/PostgreSQL, Drizzle ORM, Replit.