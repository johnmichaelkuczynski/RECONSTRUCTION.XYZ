# Cognitive Analysis Platform

## Overview
The Cognitive Analysis Platform is designed to analyze written text to assess the intelligence and cognitive fingerprint of authors using multi-model AI evaluation. Its primary purpose is to offer deep insights into cognitive abilities and thought processes from written content. Key capabilities include document analysis, AI detection, multi-language translation, comprehensive cognitive profiling, and intelligent text rewriting with advanced features for maximizing intelligence scores. The platform also offers professional financial model generation and data science code generation.

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
    - **Coherence Meter**: Offers simple chunking and outline-guided processing, including a `math-proof-validity` mode.
    - **Text Model Validator**: Includes "Truth Select" and "Math Truth Select" for literal truth verification, configurable with various AI models (ZHI 1-5, default Grok).
    - **AI Chat Assistant**: Provides conversation history and context from the Zhi Database.
    - **Conservative Reconstruction**: "Charitable Interpretation" mode for generating coherent essays articulating a text's unified argument.
    - **Finance Panel**: Generates professional Excel financial models (DCF, LBO, M&A, IPO Pricing, 3-Statement) from natural language. Features include:
        - Comprehensive scenario analysis, sensitivity analysis, and debt scheduling.
        - Accretion/dilution analysis, goodwill calculation, and Purchase Price Allocation (PPA) for M&A.
        - Enhanced Multi-Instrument Engine for IPO models, handling complex convertible instruments, probability-weighted contingencies, and dual-class share structures.
        - Guaranteed Parser Architecture ensures all required fields have values (regex → LLM → hardcoded defaults) for robust model generation.
        - Default LLM: Zhi 5 (Grok).
    - **Data Science Panel**: Generates production-ready Python code for machine learning and statistical analysis (e.g., 7 types of regression models). Output includes data loading, EDA, preprocessing, model training, evaluation, and visualizations.
        - Default LLM: Zhi 5 (Grok).

## External Dependencies
- **AI Service Providers**: OpenAI API (GPT-4), Anthropic API (Claude), DeepSeek API, Perplexity AI, Grok API (xAI).
- **Supporting Services**: Mathpix OCR, AssemblyAI, SendGrid, Google Custom Search, Stripe (for credit purchases), AnalyticPhilosophy.net Zhi API.
- **Database & Infrastructure**: Neon/PostgreSQL, Drizzle ORM, Replit.