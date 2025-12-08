# Cognitive Analysis Platform

## Overview
The Cognitive Analysis Platform is designed to analyze written text to assess the intelligence and cognitive fingerprint of authors using multi-model AI evaluation. Its primary purpose is to offer deep insights into cognitive abilities and thought processes from written content. Key capabilities include document analysis, AI detection, multi-language translation, comprehensive cognitive profiling, and intelligent text rewriting with advanced features for maximizing intelligence scores.

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
    - **Coherence Meter**: Offers simple chunking and outline-guided processing, including a `math-proof-validity` mode. The `scientific-explanatory` coherence type performs dual assessment evaluating both logical consistency (internal contradictions, structural coherence) AND scientific accuracy (factual correctness, alignment with established science), displaying separate scores for each dimension. The scientific-explanatory REWRITE function specifically corrects pseudoscientific claims, replacing them with accurate scientific explanations - it does NOT simply polish prose while preserving false claims. The math proof rewrite function must either provide a cogent proof of the correct theorem (by fixing the given proof or providing a completely different proof) or, if the theorem is false, find a similar true theorem and prove it.
    - **Text Model Validator**: Includes "Truth Select" and "Math Truth Select" for literal truth verification, configurable with various AI models (ZHI 1-5, default Grok).
    - **AI Chat Assistant**: Provides conversation history and context from the Zhi Database.
    - **Conservative Reconstruction**: "Charitable Interpretation" mode for generating coherent essays articulating a text's unified argument.

## External Dependencies
- **AI Service Providers**: OpenAI API (GPT-4), Anthropic API (Claude), DeepSeek API, Perplexity AI, Grok API (xAI).
- **Supporting Services**: Mathpix OCR, AssemblyAI, SendGrid, Google Custom Search, Stripe (for credit purchases), AnalyticPhilosophy.net Zhi API.
- **Database & Infrastructure**: Neon/PostgreSQL, Drizzle ORM, Replit.