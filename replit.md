# Cognitive Analysis Platform

## Overview
This platform analyzes written text to assess the intelligence and cognitive fingerprint of authors using multi-model AI evaluation. It provides document analysis, AI detection, translation, comprehensive cognitive profiling, and intelligent text rewriting capabilities. The project's vision is to offer deep insights into cognitive abilities and thought processes from written content, with advanced features for maximizing intelligence scores through iterative rewriting.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application uses a monorepo structure, separating client and server.
- **Frontend**: React with TypeScript, TailwindCSS, shadcn/ui, wouter for routing, React Query for server state, and Chart.js for data visualization.
- **Backend**: Express.js with TypeScript, integrating multiple LLMs, document processing via Mathpix OCR, speech-to-text with AssemblyAI, and email services via SendGrid.
- **Database**: PostgreSQL with Drizzle ORM, storing user, document, analysis, and cognitive profile data.
- **Core Services**: Includes multi-model intelligence evaluation, document comparison, multi-language translation, OCR for mathematical notation, and intelligent text rewriting with custom instructions support. Key features include:
    - **4-Phase Intelligence Evaluation System**: Initial Assessment, Deep analytical questioning across 17 cognitive dimensions, Revision and reconciliation, and Final pushback for scores under 95/100.
    - **Seven Core Cognitive Dimensions**: Conceptual Depth, Inferential Control, Semantic Compression, Novel Abstraction, Cognitive Risk, Authenticity, Symbolic Manipulation.
    - **Genre-Aware Assessment**: Supports various document types (philosophical, empirical, technical, fiction).
    - **Intelligent Rewrite Function (MAXINTEL)**: Recursively optimizes text to maximize intelligence scores, supporting custom instructions and optional external knowledge integration from AnalyticPhilosophy.net Zhi database.
    - **GPT Bypass Humanizer**: Achieves 100% AI to 0% AI transformation through surgical precision style replication.
    - **Coherence Meter**: Offers two processing strategies (simple chunking, outline-guided) with adjustable aggressiveness levels (Conservative, Moderate, Aggressive).
    - **Text Model Validator**: Includes "Truth Select" for truth-value isomorphism and "Math Truth Select" for mathematical formalization with truth-value control, both supporting literal truth verification.
- **UI/UX**: Utilizes shadcn/ui and TailwindCSS for styling, offering detailed card-based layouts for analysis reports and supporting PDF/text downloads. The platform also supports document upload and output download for various file types.

## External Dependencies
- **AI Service Providers**: OpenAI API (GPT-4) as ZHI 1, Anthropic API (Claude) as ZHI 2, DeepSeek API as ZHI 3, Perplexity AI as ZHI 4, Grok API (xAI) as ZHI 5.
- **Supporting Services**: Mathpix OCR, AssemblyAI, SendGrid, Google Custom Search, Stripe (for credit purchases), AnalyticPhilosophy.net Zhi API (for external knowledge queries).
- **Database & Infrastructure**: Neon/PostgreSQL, Drizzle ORM, Replit.

## Recent Updates
- **November 19, 2025** (Morning): 
  - Added "Use External Knowledge" toggle to MAXINTEL feature. When enabled, the system queries AnalyticPhilosophy.net's Zhi knowledge base (authenticated via ZHI_PRIVATE_KEY) and incorporates retrieved passages and citations into the model-building process. When disabled, MAXINTEL operates entirely on its internal pipeline without making any external network calls.
  - Added Grok (xAI) as "ZHI 4" provider. Integrated throughout the platform including intelligence analysis, case assessment, MAXINTEL rewriting, GPT Bypass Humanizer, and all evaluation protocols. Uses grok-beta model via xAI API (https://api.x.ai/v1/chat/completions).
  
- **November 19, 2025** (Afternoon):
  - **Coherence Meter Complete Overhaul**: Created new `coherenceMeter.ts` service that evaluates ONLY internal logical consistency, clarity, and structural unity. Removed all conflation with truth/verification/accessibility. System now correctly awards high scores (9+) to internally coherent texts regardless of factual accuracy, and properly detects faux-placeholder coherence (buzzwords without grounding).
  
  - **Intelligence Assessment Refinement**: Based on Grok's detailed analysis report, added new "Genuine Depth vs. Faux Posturing" dimension to 4-phase protocol. System now:
    - Detects faux-intellectual markers: sequential listing disguised as argument, buzzwords shuffled without grounding, author-driven "dialogue" replacing idea-driven logic, social posturing
    - Penalizes heavily (≤20/100) for faux-intellectual content with undefined placeholders
    - Rewards highly (90+) for genuine intelligence: hierarchical argumentation, terms with determinate meanings, idea-driven logic
    - Fixed accessibility scoring: assuming prior knowledge now BOOSTS score (expert discourse = higher intelligence)
    - Hard-coded three calibration examples: Kuczynski perception paragraph (98/100), McDowell transcendental empiricism abstract (14/100), Furstenberg topological proof (97/100)

- **November 19, 2025** (Evening):
  - **AI Chat Assistant Conversation Memory**: Implemented full conversation history tracking. Chat now maintains the last 10 messages and includes them in each LLM request, enabling multi-turn contextual conversations.
  - **AI Chat Assistant Zhi Database Integration**: Added "Zhi Database" toggle to chat interface. When enabled, queries AnalyticPhilosophy.net's knowledge base for relevant passages and includes them in the AI's context, providing access to Kuczynski quotes and philosophical content.
  - **New API Endpoint**: Created `/api/chat-with-memory` endpoint that handles conversation history, Zhi database queries, and supports all four LLM providers (ZHI 1-4).
  
- **November 20, 2025** (Early Morning):
  - **Zhi API Authentication Simplified**: Removed complex HMAC signature authentication (timestamps, nonces, crypto hashing) and replaced with simple Bearer token authentication. The `server/services/zhiApi.ts` now sends only `Authorization: Bearer ${ZHI_PRIVATE_KEY}` header to AnalyticPhilosophy.net's `/zhi/query` endpoint.
  - **Fixed Fake Quote Generation**: Updated chat system prompt to explicitly instruct LLMs that Zhi database returns AI-generated excerpts/summaries, NOT verbatim quotes. The chat now honestly presents content as summaries ("According to Kuczynski's work on...") instead of formatting them as fake quotations with [1], [2], [3] markers. This prevents the generation of phony quotes that sound like Kuczynski but aren't actual verbatim text.
  
- **November 20, 2025** (Morning):
  - **✅ VERBATIM KUCZYNSKI QUOTES NOW WORKING**: Fixed Zhi API integration by adding the critical `includeQuotes: true` parameter to all requests. The system now receives actual verbatim Kuczynski text from AnalyticPhilosophy.net's database instead of AI-generated summaries.
  - **Dynamic Quote/Excerpt Detection**: Updated `zhiApi.ts` to intelligently detect whether the API returns verbatim quotes or summaries, and instructs the LLM accordingly. System prioritizes `quotes[]` array (verbatim text) over `results[]` array (summaries).
  - **Full Integration Confirmed**: Both AI Chat Assistant (with "Zhi Database" toggle) and MAXINTEL (with "Use External Knowledge" toggle) now successfully retrieve and present real Kuczynski quotes with proper citations from works like "The Pianist's Hand", "Essay 11", "Essay 21", etc.
  - **Testing Results**: Confirmed retrieval of 9-15 verbatim quotes per query on topics including AI, consciousness, epistemology, and other philosophical subjects.
  - **LLM Provider Reorganization**: Added ZHI 5 as Grok (xAI) and moved Perplexity to ZHI 4. Complete provider mapping is now:
    - ZHI 1 = OpenAI (GPT-4)
    - ZHI 2 = Anthropic (Claude)
    - ZHI 3 = DeepSeek
    - ZHI 4 = Perplexity
    - ZHI 5 = Grok (xAI)
  - Updated all provider mappings across: `server/routes.ts`, `server/services/intelligentRewrite.ts`, `server/services/gptBypassHumanizer.ts`, `server/services/humanizer.ts`, `client/src/components/ProviderSelector.tsx`, `client/src/components/ChatDialog.tsx`, `client/src/pages/HomePage.tsx`.

- **November 28, 2025**:
  - **MAJOR: Mathematical Model Function Complete Overhaul**: Replaced the shallow "Mickey Mouse formalization" prompt with a rigorous first-order model theory approach. The new system now:
    1. **SIGNATURE**: Extracts explicit domain description, constants with meanings, predicates with arity and semantics
    2. **TRANSLATION SCHEMA**: Maps 5-15 English claims from the text to first-order formulas
    3. **AXIOMS**: Produces 5-15 pure first-order logic axioms using ∀, ∃, →, ∧, ∨, ¬, ↔
    4. **EXPLICIT MODEL**: Constructs a concrete model M with:
       - Domain D as an explicit set of elements (drawn from the text)
       - Constant interpretations mapping each constant to a domain element
       - Predicate interpretations as explicit extensions (sets of tuples)
       - Function interpretations (if needed)
    5. **SATISFACTION CHECK**: Mechanically verifies each axiom TRUE/FALSE in M with brief justification
    6. **VERDICT**: States whether a satisfying model was found, indicating text consistency
    7. **LOGICAL PROPERTIES**: Optional analysis of consistency, entailment, minimal domain size, non-isomorphic models
  - The new prompt enforces: explicit element listing, mechanical verification, elements drawn from text (not invented), substantive axioms over trivialities.
  - **Math + Truth Function Complete Redesign**: The `math-truth-select` mode now searches for models where axioms are **100% TRUE IN REALITY**, not merely "satisfied in some abstract structure." The new pipeline:
    1. **SIGNATURE**: Extract constants and predicates from text
    2. **AXIOM EXTRACTION**: 5-15 first-order axioms capturing core claims
    3. **TRUTH AUDIT**: Check each axiom TRUE/FALSE in the original domain with evidence
    4. **TRUTH-GROUNDED MODEL**: If original domain fails, search for an ISOMORPHIC DOMAIN (physics, biology, math, history, etc.) where the same logical structure yields ALL TRUE statements
    5. **TRUTH VERIFICATION**: Prove each axiom is TRUE under the new grounding with specific evidence
    6. **FINAL VERDICT**: State whether all axioms are true and explain domain switches
    7. **ISOMORPHISM DEMONSTRATION**: Show the structural mapping that preserves logic while achieving truth
  - Key distinction: "TRUE" means empirically verifiable or logically necessary in reality, not "satisfies axioms in made-up domain."
  
- **December 2, 2025**:
  - **Conservative Reconstruction Complete Overhaul**: Replaced "minimal fixes" mode with "Charitable Interpretation" mode. Now produces a SELF-CONTAINED, COHERENT essay that articulates the text's unified argument. Key features:
    - Assumes text is coherent (charitable interpretation principle)
    - Extracts unified thesis + supporting arguments as flowing prose
    - 3-7 substantive paragraphs in continuous prose (NO bullets, NO fragments)
    - Self-contained: reader unfamiliar with original can understand complete argument
    - Direct presentation of argument, not meta-commentary ("the text says...")
    - Resolves apparent tensions charitably by showing how they cohere
  - **NEW: Mathematical Proof Validity Mode**: Added dedicated `math-proof-validity` mode to Coherence Meter that verifies MATHEMATICAL CORRECTNESS, not just logical flow. Key differences from standard coherence:
    - Tests mathematical claims with SPECIFIC VALUES (computes p!, 2^p, etc.)
    - Actively searches for COUNTEREXAMPLES
    - Verifies boundary conditions and edge cases
    - Checks if each inference step is mathematically (not just logically) valid
    - Returns: Claim Truth Score, Inference Validity Score, Boundary Conditions Score, Overall Soundness Score
    - Verdict: VALID / FLAWED / INVALID (not just PASS/WEAK/FAIL)
    - Lists specific flaws and counterexamples found
    - Example: A flawed proof claiming "p! + 1 < 2^p · p for all p > 2" would now FAIL because testing p=7 shows 5041 > 896