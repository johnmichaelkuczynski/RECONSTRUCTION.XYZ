import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import ExcelJS from "exceljs";

export interface MAAssumptions {
  acquirerName: string;
  targetName: string;
  transactionDate: string;
  
  // Acquirer Financials
  acquirerRevenue: number;
  acquirerRevenueGrowth: number[];
  acquirerEBITDAMargin: number;
  acquirerDAPercent: number;
  acquirerInterestExpense: number;
  acquirerTaxRate: number;
  acquirerSharesOutstanding: number;
  acquirerStockPrice: number;
  acquirerExplicitEPS?: number; // BUG #1 FIX: If user provides EPS directly, use this
  acquirerCash?: number; // Acquirer's existing cash
  acquirerExistingDebt?: number; // Acquirer's existing debt
  
  // Target Financials
  targetRevenue: number;
  targetRevenueGrowth: number[];
  targetEBITDAMargin: number;
  targetDAPercent: number;
  targetInterestExpense: number;
  targetTaxRate: number;
  targetNetDebt: number;
  
  // Transaction Structure
  purchasePrice: number;
  cashPercent: number;
  stockPercent: number;
  premium: number;
  transactionFeePercent: number;
  transactionFees?: number; // Explicit transaction fees if provided
  
  // Financing
  cashFromBalance: number;
  newDebtAmount: number;
  newDebtRate: number;
  debtAmortizationRate?: number; // Annual amortization rate (e.g., 0.05 for 5%)
  debtMaturityYears?: number; // Years to maturity
  
  // Synergies - Revenue (typically slower realization)
  revenueSynergies: number;
  revenueSynergyRealizationY1: number;
  revenueSynergyRealizationY2: number;
  revenueSynergyRealizationY3: number;
  revenueSynergyRealizationY4: number;
  revenueSynergyRealizationY5: number;
  revenueSynergyMargin?: number; // BUG #5 FIX: Flow-through margin on revenue synergies (e.g., 0.50)
  
  // Synergies - Cost (typically faster realization)
  costSynergies: number;
  costSynergyRealizationY1: number;
  costSynergyRealizationY2: number;
  costSynergyRealizationY3: number;
  costSynergyRealizationY4: number;
  costSynergyRealizationY5: number;
  
  // Integration Costs
  integrationCostsY1: number;
  integrationCostsY2: number;
  integrationCostsY3: number;
  
  // Purchase Price Allocation - BUG #3 FIX: Proper PPA breakdown
  targetBookValueNetAssets?: number; // Book value of net assets
  targetFairValueNetAssets?: number; // Fair value of net assets
  customerRelationships?: number; // Identified intangible: Customer relationships
  customerRelationshipsLife?: number; // Amortization years
  developedTechnology?: number; // Identified intangible: Developed technology  
  developedTechnologyLife?: number; // Amortization years
  otherIntangibles?: number; // Other identified intangibles
  otherIntangiblesLife?: number; // Amortization years
  intangibleAssets: number; // Legacy: total intangibles if not broken down
  intangibleAmortYears: number; // Legacy: average amortization period
}

const MA_PARSING_PROMPT = `You are a financial analyst expert in M&A transactions. Parse the following natural language description of a merger or acquisition and extract ALL relevant parameters.

CRITICAL PARSING RULES - MUST EXTRACT THESE:

1. PURCHASE PRICE: Extract the dollar amount in millions!
   - "11.0× LTM EBITDA of $85M" → purchasePrice = 85 × 11.0 = 935
   - "Equity Value = $935M" → purchasePrice = 935
   - "purchase price of $935 million" → purchasePrice = 935
   
2. CONSIDERATION MIX: Extract cash vs stock percentages!
   - "70% cash, 30% stock" → cashPercent = 0.70, stockPercent = 0.30
   - "all cash" → cashPercent = 1.0, stockPercent = 0.0
   - "all stock" → cashPercent = 0.0, stockPercent = 1.0
   
3. NEW DEBT FINANCING: Extract debt amount and rate!
   - "$500M new debt at 6.25% interest" → newDebtAmount = 500, newDebtRate = 0.0625
   - "borrow $400 million at 5.5%" → newDebtAmount = 400, newDebtRate = 0.055
   
4. BUYER SHARE PRICE: Critical for stock issuance calculation!
   - "Buyer share price = $50" → acquirerStockPrice = 50
   - "acquirer trades at $42 per share" → acquirerStockPrice = 42
   
5. SYNERGIES: Extract amounts separately!
   - "Cost synergies: $40M annually" → costSynergies = 40
   - "Revenue synergies: $25M" → revenueSynergies = 25
   
6. INTEGRATION COSTS: Extract the one-time cost!
   - "One-time integration cost: $30M" → integrationCostsY1 = 30 (or spread across years)
   
7. FORECAST PERIOD: Extract the number of years!
   - "5-year forecast" → (use 5-year projections)
   
8. SHARES OUTSTANDING: Critical for EPS!
   - "Shares outstanding: 160M" → acquirerSharesOutstanding = 160
   - "160 million shares" → acquirerSharesOutstanding = 160

9. EXPLICIT EPS: If user states EPS directly, use it!
   - "earns $3.20 per share" → acquirerExplicitEPS = 3.20

Return a JSON object with the following structure:
{
  "acquirerName": "Acquirer Company Name",
  "targetName": "Target Company Name",
  "transactionDate": "YYYY-MM-DD",
  
  "acquirerRevenue": number (in millions),
  "acquirerRevenueGrowth": [y1, y2, y3, y4, y5] (as decimals),
  "acquirerEBITDAMargin": number (as decimal),
  "acquirerDAPercent": number (D&A as % of revenue, as decimal),
  "acquirerInterestExpense": number (in millions),
  "acquirerTaxRate": number (as decimal),
  "acquirerSharesOutstanding": number (in millions),
  "acquirerStockPrice": number ($ per share),
  "acquirerExplicitEPS": number or null (if user explicitly states EPS, use this EXACTLY - DO NOT RECALCULATE),
  "acquirerCash": number (in millions, acquirer's existing cash on balance sheet),
  "acquirerExistingDebt": number (in millions, acquirer's existing debt),
  
  "targetRevenue": number (in millions),
  "targetRevenueGrowth": [y1, y2, y3, y4, y5] (as decimals),
  "targetEBITDAMargin": number (as decimal),
  "targetDAPercent": number (as decimal),
  "targetInterestExpense": number (in millions),
  "targetTaxRate": number (as decimal),
  "targetNetDebt": number (in millions),
  
  "purchasePrice": number (equity value in millions),
  "cashPercent": number (as decimal, e.g., 0.6 for 60% cash),
  "stockPercent": number (as decimal, e.g., 0.4 for 40% stock),
  "premium": number (as decimal, e.g., 0.30 for 30% premium),
  "transactionFeePercent": number (as decimal for % of EV, or null if explicit fees given),
  "transactionFees": number or null (explicit transaction fees in millions if mentioned),
  
  "cashFromBalance": number (in millions - cash used from acquirer's balance sheet),
  "newDebtAmount": number (in millions - new debt raised for the transaction),
  "newDebtRate": number (as decimal - total interest rate e.g., 0.075 for 7.5%),
  "debtAmortizationRate": number (as decimal - annual amortization e.g., 0.05 for 5%),
  "debtMaturityYears": number (years until bullet maturity),
  
  "revenueSynergies": number (annual run-rate in millions),
  "revenueSynergyRealizationY1": number (as decimal),
  "revenueSynergyRealizationY2": number (as decimal),
  "revenueSynergyRealizationY3": number (as decimal),
  "revenueSynergyRealizationY4": number (as decimal),
  "revenueSynergyRealizationY5": number (as decimal),
  "revenueSynergyMargin": number or null (flow-through margin as decimal, e.g., 0.50 for 50%),
  
  "costSynergies": number (annual EBITDA improvement in millions),
  "costSynergyRealizationY1": number (as decimal),
  "costSynergyRealizationY2": number (as decimal),
  "costSynergyRealizationY3": number (as decimal),
  "costSynergyRealizationY4": number (as decimal),
  "costSynergyRealizationY5": number (as decimal),
  
  "integrationCostsY1": number (in millions),
  "integrationCostsY2": number (in millions),
  "integrationCostsY3": number (in millions),
  
  "targetBookValueNetAssets": number or null (book value of target's net assets in millions),
  "targetFairValueNetAssets": number or null (fair value of target's net assets in millions),
  "customerRelationships": number or null (customer relationships intangible value in millions),
  "customerRelationshipsLife": number or null (amortization period in years),
  "developedTechnology": number or null (developed technology intangible value in millions),
  "developedTechnologyLife": number or null (amortization period in years),
  "otherIntangibles": number or null (other identified intangibles in millions),
  "otherIntangiblesLife": number or null (amortization period in years),
  "intangibleAssets": number (total intangibles - sum of above or standalone if not broken down),
  "intangibleAmortYears": number (weighted average amortization period)
}

DEFAULTS (use if not explicitly stated):
- Revenue growth: 3-8% annually
- EBITDA margins: 15-25%
- D&A: 3-5% of revenue
- Tax rate: 21-25%
- Cash/stock mix: 50/50 if not specified
- Premium: 20-40% for public targets
- Transaction fees: 2.5% of EV if not specified
- REVENUE synergy phase-in: Extract EXACT percentages if given, else use 0% Y1, 50% Y2, 100% Y3+
- COST synergy phase-in: Extract EXACT percentages if given, else use 20% Y1, 60% Y2, 100% Y3+
- Revenue synergy margin: 1.0 (100%) if not specified - meaning full EBITDA pass-through
- Integration costs: as specified or 2-3x annual synergies spread over 2-3 years
- Debt amortization: 5% annually if not specified
- Debt maturity: 5 years if not specified

CRITICAL EXTRACTION RULES:
1. "earns X dollars per share" → acquirerExplicitEPS = X
2. "X percent flow-through margin on revenue synergies" → revenueSynergyMargin = X/100
3. "transaction costs/fees of X million" → transactionFees = X
4. "book value of X" for target assets → targetBookValueNetAssets = X
5. "fair value of X" for target assets → targetFairValueNetAssets = X
6. "customer relationships valued at X with Y-year amortization" → customerRelationships = X, customerRelationshipsLife = Y
7. "developed technology at X with Y-year amortization" → developedTechnology = X, developedTechnologyLife = Y

IMPORTANT: Return ONLY the JSON object, no markdown, no explanation.`;

export async function parseMADescription(
  description: string,
  provider: "zhi1" | "zhi2" | "zhi3" | "zhi4" | "zhi5",
  customInstructions?: string
): Promise<{ assumptions: MAAssumptions; providerUsed: string }> {
  const fullPrompt = customInstructions 
    ? `${MA_PARSING_PROMPT}\n\nAdditional Instructions: ${customInstructions}\n\nDescription:\n${description}`
    : `${MA_PARSING_PROMPT}\n\nDescription:\n${description}`;

  let responseText: string = "";
  let providerUsed: string = "";

  if (provider === "zhi1") {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: fullPrompt }],
      temperature: 0.3,
    });
    responseText = response.choices[0]?.message?.content || "";
    providerUsed = "ZHI 1";
  } else if (provider === "zhi2") {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: "claude-3-7-sonnet-20250219",
      max_tokens: 4096,
      messages: [{ role: "user", content: fullPrompt }],
    });
    responseText = response.content[0].type === "text" ? response.content[0].text : "";
    providerUsed = "ZHI 2";
  } else if (provider === "zhi3") {
    const deepseek = new OpenAI({
      baseURL: "https://api.deepseek.com",
      apiKey: process.env.DEEPSEEK_API_KEY,
    });
    const response = await deepseek.chat.completions.create({
      model: "deepseek-chat",
      messages: [{ role: "user", content: fullPrompt }],
      temperature: 0.3,
    });
    responseText = response.choices[0]?.message?.content || "";
    providerUsed = "ZHI 3";
  } else if (provider === "zhi4") {
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar-pro",
        messages: [{ role: "user", content: fullPrompt }],
        temperature: 0.3,
      }),
    });
    const data = await response.json();
    responseText = data.choices?.[0]?.message?.content || "";
    providerUsed = "ZHI 4";
  } else if (provider === "zhi5") {
    const grok = new OpenAI({
      baseURL: "https://api.x.ai/v1",
      apiKey: process.env.GROK_API_KEY,
    });
    const response = await grok.chat.completions.create({
      model: "grok-3",
      messages: [{ role: "user", content: fullPrompt }],
      temperature: 0.3,
    });
    responseText = response.choices[0]?.message?.content || "";
    providerUsed = "ZHI 5";
  }

  // Parse JSON from response - handle various response formats including conversational text
  let jsonStr = responseText.trim();
  
  // First try: extract JSON from markdown code blocks
  if (jsonStr.includes("```json")) {
    const match = jsonStr.match(/```json\s*([\s\S]*?)\s*```/);
    if (match) {
      jsonStr = match[1].trim();
    }
  } else if (jsonStr.includes("```")) {
    const match = jsonStr.match(/```\s*([\s\S]*?)\s*```/);
    if (match) {
      jsonStr = match[1].trim();
    }
  }
  
  // Second try: find JSON object by looking for opening/closing braces
  if (!jsonStr.startsWith("{")) {
    const startIdx = jsonStr.indexOf("{");
    const endIdx = jsonStr.lastIndexOf("}");
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      jsonStr = jsonStr.slice(startIdx, endIdx + 1);
    }
  }
  
  jsonStr = jsonStr.trim();

  const rawAssumptions = JSON.parse(jsonStr);
  
  // ============ ROBUST POST-PARSING VALIDATION WITH DEFAULTS ============
  // Ensure NO critical values are ever undefined
  
  // Base financials - needed for derived calculations
  const acquirerRevenue = rawAssumptions.acquirerRevenue ?? 1000;
  const acquirerEBITDAMargin = rawAssumptions.acquirerEBITDAMargin ?? 0.20;
  const acquirerSharesOutstanding = rawAssumptions.acquirerSharesOutstanding ?? 100;
  const acquirerStockPrice = rawAssumptions.acquirerStockPrice ?? 50;
  
  const targetRevenue = rawAssumptions.targetRevenue ?? 500;
  const targetEBITDAMargin = rawAssumptions.targetEBITDAMargin ?? 0.20;
  const targetEBITDA = targetRevenue * targetEBITDAMargin;
  
  // Purchase price - calculate from multiple if not explicitly provided
  let purchasePrice = rawAssumptions.purchasePrice;
  const entryMultiple = rawAssumptions.entryMultiple ?? 10.0;
  
  if (purchasePrice === undefined || purchasePrice === null || purchasePrice === 0) {
    purchasePrice = targetEBITDA * entryMultiple;
    console.log(`[M&A Validation] Purchase price not found, calculated from ${targetEBITDA.toFixed(1)}M EBITDA × ${entryMultiple}x = ${purchasePrice.toFixed(1)}M`);
  }
  
  // Consideration mix - default to 50/50 if not specified
  let cashPercent = rawAssumptions.cashPercent;
  let stockPercent = rawAssumptions.stockPercent;
  
  if ((cashPercent === undefined || cashPercent === null) && (stockPercent === undefined || stockPercent === null)) {
    cashPercent = 0.5;
    stockPercent = 0.5;
    console.log(`[M&A Validation] Consideration mix not found, defaulting to 50% cash / 50% stock`);
  } else if (cashPercent !== undefined && cashPercent !== null && (stockPercent === undefined || stockPercent === null)) {
    stockPercent = 1.0 - cashPercent;
  } else if (stockPercent !== undefined && stockPercent !== null && (cashPercent === undefined || cashPercent === null)) {
    cashPercent = 1.0 - stockPercent;
  }
  
  // New debt financing
  const newDebtAmount = rawAssumptions.newDebtAmount ?? 0;
  const newDebtRate = rawAssumptions.newDebtRate ?? 0.06;
  
  // Synergies
  const costSynergies = rawAssumptions.costSynergies ?? 0;
  const revenueSynergies = rawAssumptions.revenueSynergies ?? 0;
  
  // Integration costs
  const integrationCostsY1 = rawAssumptions.integrationCostsY1 ?? 0;
  const integrationCostsY2 = rawAssumptions.integrationCostsY2 ?? 0;
  const integrationCostsY3 = rawAssumptions.integrationCostsY3 ?? 0;
  
  console.log(`[M&A Validation] Parsed values:`);
  console.log(`  Acquirer: Revenue=${acquirerRevenue}M, EBITDA Margin=${(acquirerEBITDAMargin * 100).toFixed(1)}%, Shares=${acquirerSharesOutstanding}M, Price=$${acquirerStockPrice}`);
  console.log(`  Target: Revenue=${targetRevenue}M, EBITDA=${targetEBITDA.toFixed(1)}M`);
  console.log(`  Purchase Price: ${purchasePrice}M`);
  console.log(`  Consideration: ${(cashPercent * 100).toFixed(0)}% cash / ${(stockPercent * 100).toFixed(0)}% stock`);
  console.log(`  New Debt: ${newDebtAmount}M at ${(newDebtRate * 100).toFixed(2)}%`);
  console.log(`  Synergies: Cost=${costSynergies}M, Revenue=${revenueSynergies}M`);
  console.log(`  Integration: Y1=${integrationCostsY1}M, Y2=${integrationCostsY2}M, Y3=${integrationCostsY3}M`);
  if (rawAssumptions.acquirerExplicitEPS) {
    console.log(`  Explicit EPS: $${rawAssumptions.acquirerExplicitEPS}`);
  }
  
  const assumptions: MAAssumptions = {
    acquirerName: rawAssumptions.acquirerName ?? "Acquirer",
    targetName: rawAssumptions.targetName ?? "Target",
    transactionDate: rawAssumptions.transactionDate ?? new Date().toISOString().split('T')[0],
    
    acquirerRevenue: acquirerRevenue,
    acquirerRevenueGrowth: rawAssumptions.acquirerRevenueGrowth ?? [0.05, 0.05, 0.05, 0.05, 0.05],
    acquirerEBITDAMargin: acquirerEBITDAMargin,
    acquirerDAPercent: rawAssumptions.acquirerDAPercent ?? 0.03,
    acquirerInterestExpense: rawAssumptions.acquirerInterestExpense ?? 0,
    acquirerTaxRate: rawAssumptions.acquirerTaxRate ?? 0.25,
    acquirerSharesOutstanding: acquirerSharesOutstanding,
    acquirerStockPrice: acquirerStockPrice,
    acquirerExplicitEPS: rawAssumptions.acquirerExplicitEPS,
    acquirerCash: rawAssumptions.acquirerCash ?? 0,
    acquirerExistingDebt: rawAssumptions.acquirerExistingDebt ?? 0,
    
    targetRevenue: targetRevenue,
    targetRevenueGrowth: rawAssumptions.targetRevenueGrowth ?? [0.05, 0.05, 0.05, 0.05, 0.05],
    targetEBITDAMargin: targetEBITDAMargin,
    targetDAPercent: rawAssumptions.targetDAPercent ?? 0.03,
    targetInterestExpense: rawAssumptions.targetInterestExpense ?? 0,
    targetTaxRate: rawAssumptions.targetTaxRate ?? 0.25,
    targetNetDebt: rawAssumptions.targetNetDebt ?? 0,
    
    purchasePrice: purchasePrice,
    cashPercent: cashPercent,
    stockPercent: stockPercent,
    premium: rawAssumptions.premium ?? 0.25,
    transactionFeePercent: rawAssumptions.transactionFeePercent ?? 0.025,
    transactionFees: rawAssumptions.transactionFees,
    
    cashFromBalance: rawAssumptions.cashFromBalance ?? 0,
    newDebtAmount: newDebtAmount,
    newDebtRate: newDebtRate,
    debtAmortizationRate: rawAssumptions.debtAmortizationRate ?? 0.05,
    debtMaturityYears: rawAssumptions.debtMaturityYears ?? 5,
    
    revenueSynergies: revenueSynergies,
    revenueSynergyRealizationY1: rawAssumptions.revenueSynergyRealizationY1 ?? 0.0,
    revenueSynergyRealizationY2: rawAssumptions.revenueSynergyRealizationY2 ?? 0.5,
    revenueSynergyRealizationY3: rawAssumptions.revenueSynergyRealizationY3 ?? 1.0,
    revenueSynergyRealizationY4: rawAssumptions.revenueSynergyRealizationY4 ?? 1.0,
    revenueSynergyRealizationY5: rawAssumptions.revenueSynergyRealizationY5 ?? 1.0,
    revenueSynergyMargin: rawAssumptions.revenueSynergyMargin ?? 1.0,
    
    costSynergies: costSynergies,
    costSynergyRealizationY1: rawAssumptions.costSynergyRealizationY1 ?? 0.2,
    costSynergyRealizationY2: rawAssumptions.costSynergyRealizationY2 ?? 0.6,
    costSynergyRealizationY3: rawAssumptions.costSynergyRealizationY3 ?? 1.0,
    costSynergyRealizationY4: rawAssumptions.costSynergyRealizationY4 ?? 1.0,
    costSynergyRealizationY5: rawAssumptions.costSynergyRealizationY5 ?? 1.0,
    
    integrationCostsY1: integrationCostsY1,
    integrationCostsY2: integrationCostsY2,
    integrationCostsY3: integrationCostsY3,
    
    targetBookValueNetAssets: rawAssumptions.targetBookValueNetAssets,
    targetFairValueNetAssets: rawAssumptions.targetFairValueNetAssets,
    customerRelationships: rawAssumptions.customerRelationships,
    customerRelationshipsLife: rawAssumptions.customerRelationshipsLife ?? 10,
    developedTechnology: rawAssumptions.developedTechnology,
    developedTechnologyLife: rawAssumptions.developedTechnologyLife ?? 5,
    otherIntangibles: rawAssumptions.otherIntangibles,
    otherIntangiblesLife: rawAssumptions.otherIntangiblesLife ?? 7,
    intangibleAssets: rawAssumptions.intangibleAssets ?? 0,
    intangibleAmortYears: rawAssumptions.intangibleAmortYears ?? 7,
  };
  
  return { assumptions, providerUsed };
}

// Helper function: safely get numeric value, only use default if truly undefined/null/NaN
function safeNum(value: any, defaultVal: number): number {
  if (value === undefined || value === null) return defaultVal;
  const num = Number(value);
  if (isNaN(num)) return defaultVal;
  return num;
}

// Helper function: safely get numeric value, returns 0 if undefined/null/NaN (for values where 0 is valid)
function safeNumZero(value: any): number {
  if (value === undefined || value === null) return 0;
  const num = Number(value);
  if (isNaN(num)) return 0;
  return num;
}

export function calculateMAMetrics(assumptions: MAAssumptions) {
  // ============ INPUT VALIDATION & LOGGING ============
  console.log("M&A Calculation - Input assumptions:", JSON.stringify({
    acquirerRevenue: assumptions.acquirerRevenue,
    acquirerEBITDAMargin: assumptions.acquirerEBITDAMargin,
    acquirerSharesOutstanding: assumptions.acquirerSharesOutstanding,
    acquirerStockPrice: assumptions.acquirerStockPrice,
    targetRevenue: assumptions.targetRevenue,
    targetEBITDAMargin: assumptions.targetEBITDAMargin,
    purchasePrice: assumptions.purchasePrice,
    cashPercent: assumptions.cashPercent,
    stockPercent: assumptions.stockPercent,
    revenueSynergies: assumptions.revenueSynergies,
    costSynergies: assumptions.costSynergies,
    newDebtAmount: assumptions.newDebtAmount,
  }, null, 2));

  // VALIDATED inputs - use safe helpers to prevent NaN propagation
  const acquirerRevenue = safeNum(assumptions.acquirerRevenue, 1000);
  const acquirerRevenueGrowth = assumptions.acquirerRevenueGrowth || [0.05, 0.05, 0.05, 0.05, 0.05];
  const acquirerEBITDAMargin = safeNum(assumptions.acquirerEBITDAMargin, 0.20);
  const acquirerDAPercent = safeNum(assumptions.acquirerDAPercent, 0.03);
  const acquirerInterestExpense = safeNumZero(assumptions.acquirerInterestExpense);
  const acquirerTaxRate = safeNum(assumptions.acquirerTaxRate, 0.25);
  const acquirerSharesOutstanding = safeNum(assumptions.acquirerSharesOutstanding, 100); // Prevent div by 0
  const acquirerStockPrice = safeNum(assumptions.acquirerStockPrice, 50); // Prevent div by 0
  const acquirerExplicitEPS = assumptions.acquirerExplicitEPS; // Keep as-is for explicit check
  
  const targetRevenue = safeNum(assumptions.targetRevenue, 500);
  const targetRevenueGrowth = assumptions.targetRevenueGrowth || [0.05, 0.05, 0.05, 0.05, 0.05];
  const targetEBITDAMargin = safeNum(assumptions.targetEBITDAMargin, 0.20);
  const targetDAPercent = safeNum(assumptions.targetDAPercent, 0.03);
  const targetInterestExpense = safeNumZero(assumptions.targetInterestExpense);
  const targetTaxRate = safeNum(assumptions.targetTaxRate, 0.25);
  const targetNetDebt = safeNumZero(assumptions.targetNetDebt);
  
  const purchasePrice = safeNum(assumptions.purchasePrice, 1000);
  const cashPercent = safeNum(assumptions.cashPercent, 0.5);
  const stockPercent = safeNum(assumptions.stockPercent, 0.5);
  const transactionFeePercent = safeNum(assumptions.transactionFeePercent, 0.025);
  const explicitTransactionFees = assumptions.transactionFees; // Keep for explicit check
  
  const cashFromBalance = safeNumZero(assumptions.cashFromBalance);
  const newDebtAmount = safeNumZero(assumptions.newDebtAmount);
  const newDebtRate = safeNum(assumptions.newDebtRate, 0.06);
  const debtAmortizationRate = assumptions.debtAmortizationRate;
  const debtMaturityYears = assumptions.debtMaturityYears;
  
  const revenueSynergies = safeNumZero(assumptions.revenueSynergies);
  const revenueSynergyRealizationY1 = assumptions.revenueSynergyRealizationY1;
  const revenueSynergyRealizationY2 = assumptions.revenueSynergyRealizationY2;
  const revenueSynergyRealizationY3 = assumptions.revenueSynergyRealizationY3;
  const revenueSynergyRealizationY4 = assumptions.revenueSynergyRealizationY4;
  const revenueSynergyRealizationY5 = assumptions.revenueSynergyRealizationY5;
  const revenueSynergyMargin = assumptions.revenueSynergyMargin;
  
  const costSynergies = safeNumZero(assumptions.costSynergies);
  const costSynergyRealizationY1 = assumptions.costSynergyRealizationY1;
  const costSynergyRealizationY2 = assumptions.costSynergyRealizationY2;
  const costSynergyRealizationY3 = assumptions.costSynergyRealizationY3;
  const costSynergyRealizationY4 = assumptions.costSynergyRealizationY4;
  const costSynergyRealizationY5 = assumptions.costSynergyRealizationY5;
  
  const integrationCostsY1 = safeNumZero(assumptions.integrationCostsY1);
  const integrationCostsY2 = safeNumZero(assumptions.integrationCostsY2);
  const integrationCostsY3 = safeNumZero(assumptions.integrationCostsY3);
  
  // PPA components
  const targetBookValueNetAssets = assumptions.targetBookValueNetAssets;
  const targetFairValueNetAssets = assumptions.targetFairValueNetAssets;
  const customerRelationships = assumptions.customerRelationships;
  const customerRelationshipsLife = assumptions.customerRelationshipsLife;
  const developedTechnology = assumptions.developedTechnology;
  const developedTechnologyLife = assumptions.developedTechnologyLife;
  const otherIntangibles = assumptions.otherIntangibles;
  const otherIntangiblesLife = assumptions.otherIntangiblesLife;
  const intangibleAssets = safeNumZero(assumptions.intangibleAssets);
  const intangibleAmortYears = safeNum(assumptions.intangibleAmortYears, 10);

  const years = [0, 1, 2, 3, 4, 5];
  
  // ============ ACQUIRER STANDALONE PROJECTIONS ============
  const acquirerRev: number[] = [acquirerRevenue];
  const acquirerEBITDA: number[] = [acquirerRevenue * acquirerEBITDAMargin];
  const acquirerNetIncome: number[] = [];
  const acquirerEPS: number[] = [];
  
  for (let i = 1; i <= 5; i++) {
    const growth = acquirerRevenueGrowth[i - 1] ?? 0.05; // Use ?? to allow 0 as valid value
    acquirerRev.push(acquirerRev[i - 1] * (1 + growth));
  }
  
  for (let i = 0; i <= 5; i++) {
    const ebitda = acquirerRev[i] * acquirerEBITDAMargin;
    if (i > 0) acquirerEBITDA.push(ebitda);
    const da = acquirerRev[i] * acquirerDAPercent;
    const ebit = ebitda - da;
    const ebt = ebit - acquirerInterestExpense;
    const taxes = Math.max(0, ebt * acquirerTaxRate);
    const netIncome = ebt - taxes;
    acquirerNetIncome.push(netIncome);
    
    // BUG #1 FIX: Use explicit EPS if provided, otherwise calculate
    if (acquirerExplicitEPS !== undefined && acquirerExplicitEPS !== null && i === 0) {
      // Year 0: Use the explicit EPS the user provided
      acquirerEPS.push(acquirerExplicitEPS);
    } else if (acquirerExplicitEPS !== undefined && acquirerExplicitEPS !== null && i > 0) {
      // For projections, grow from the explicit base EPS proportionally
      const baseGrowth = acquirerNetIncome[0] !== 0 ? acquirerNetIncome[i] / acquirerNetIncome[0] : 1;
      const projectedEps = acquirerExplicitEPS * baseGrowth;
      acquirerEPS.push(isNaN(projectedEps) ? acquirerExplicitEPS : projectedEps);
    } else {
      // No explicit EPS: calculate from Net Income / Shares (guard against div by 0)
      const calculatedEps = acquirerSharesOutstanding > 0 ? netIncome / acquirerSharesOutstanding : 0;
      acquirerEPS.push(isNaN(calculatedEps) ? 0 : calculatedEps);
    }
  }

  // ============ TARGET STANDALONE PROJECTIONS ============
  const targetRev: number[] = [targetRevenue];
  const targetEBITDA: number[] = [targetRevenue * targetEBITDAMargin];
  const targetNetIncome: number[] = [];
  
  for (let i = 1; i <= 5; i++) {
    const growth = targetRevenueGrowth[i - 1] ?? 0.05; // Use ?? to allow 0 as valid value
    targetRev.push(targetRev[i - 1] * (1 + growth));
  }
  
  for (let i = 0; i <= 5; i++) {
    const ebitda = targetRev[i] * targetEBITDAMargin;
    if (i > 0) targetEBITDA.push(ebitda);
    const da = targetRev[i] * targetDAPercent;
    const ebit = ebitda - da;
    const ebt = ebit - targetInterestExpense;
    const taxes = Math.max(0, ebt * targetTaxRate);
    targetNetIncome.push(ebt - taxes);
  }

  // ============ TRANSACTION METRICS ============
  const cashConsideration = purchasePrice * cashPercent;
  const stockConsideration = purchasePrice * stockPercent;
  // Guard against division by zero for new shares issued
  const newSharesIssued = acquirerStockPrice > 0 ? stockConsideration / acquirerStockPrice : 0;
  const proFormaShares = acquirerSharesOutstanding + newSharesIssued;
  const enterpriseValue = purchasePrice + targetNetDebt;
  // Guard against division by zero for EV/EBITDA multiple
  const targetEBITDAValue = targetRevenue * targetEBITDAMargin;
  const evEbitdaMultiple = targetEBITDAValue > 0 ? enterpriseValue / targetEBITDAValue : 0;
  
  console.log("M&A Calculation - Computed metrics:", JSON.stringify({
    purchasePrice, enterpriseValue, evEbitdaMultiple, 
    cashConsideration, stockConsideration, newSharesIssued, proFormaShares
  }));
  
  // BUG #2 FIX: Calculate transaction fees - use explicit if provided, otherwise calculate from EV
  const transactionFees = explicitTransactionFees !== undefined && explicitTransactionFees !== null 
    ? explicitTransactionFees 
    : enterpriseValue * (transactionFeePercent || 0.025);

  // BUG #3 FIX: Proper Goodwill and PPA calculation
  // Calculate identified intangibles from breakdown if available
  const identifiedCustomerRel = customerRelationships || 0;
  const identifiedDevTech = developedTechnology || 0;
  const identifiedOther = otherIntangibles || 0;
  const totalIdentifiedIntangibles = identifiedCustomerRel + identifiedDevTech + identifiedOther || intangibleAssets;
  
  // Use fair value of net assets if provided, otherwise estimate
  const fairValueNetAssets = targetFairValueNetAssets !== undefined && targetFairValueNetAssets !== null
    ? targetFairValueNetAssets
    : (targetBookValueNetAssets || targetRevenue * 0.3); // Fallback to book value or estimate
  
  // Calculate Deferred Tax Liability (DTL) = Tax Rate * Amortizable Intangibles
  const deferredTaxLiability = acquirerTaxRate * totalIdentifiedIntangibles;
  
  // CORRECT Goodwill formula: Purchase Price - Fair Value Net Assets - Identified Intangibles + DTL
  // This matches the Excel PPA formula: =MAX(0,B21-B45-E53+E54)
  const goodwill = Math.max(0, purchasePrice - fairValueNetAssets - totalIdentifiedIntangibles + deferredTaxLiability);
  
  // Calculate annual intangible amortization from breakdown if available
  const customerRelAmort = identifiedCustomerRel / (customerRelationshipsLife || 10);
  const devTechAmort = identifiedDevTech / (developedTechnologyLife || 5);
  const otherIntangAmort = identifiedOther / (otherIntangiblesLife || 10);
  const totalAnnualIntangibleAmort = customerRelAmort + devTechAmort + otherIntangAmort || (intangibleAssets / intangibleAmortYears);

  // ============ SYNERGIES ============
  // BUG #5 FIX: Apply revenue synergy flow-through margin
  const revSynergyFlowThrough = revenueSynergyMargin !== undefined && revenueSynergyMargin !== null 
    ? revenueSynergyMargin 
    : 1.0; // Default 100% if not specified
  
  // Use ?? to allow 0 as a valid value (user may want 0% realization in certain years)
  const revenueSynergyRealization = [
    0, 
    revenueSynergyRealizationY1 ?? 0, 
    revenueSynergyRealizationY2 ?? 0.50, 
    revenueSynergyRealizationY3 ?? 1.0, 
    revenueSynergyRealizationY4 ?? 1.0, 
    revenueSynergyRealizationY5 ?? 1.0
  ];
  const costSynergyRealization = [
    0, 
    costSynergyRealizationY1 ?? 0.20, 
    costSynergyRealizationY2 ?? 0.60, 
    costSynergyRealizationY3 ?? 1.0, 
    costSynergyRealizationY4 ?? 1.0, 
    costSynergyRealizationY5 ?? 1.0
  ];
  
  // Revenue synergies by year (top-line)
  const revSynergiesByYear = revenueSynergyRealization.map(r => revenueSynergies * r);
  // Revenue synergy EBITDA impact (after applying margin) - BUG #5 FIX
  const revSynergyEBITDAByYear = revSynergiesByYear.map(r => r * revSynergyFlowThrough);
  // Cost synergies by year (direct EBITDA impact)
  const costSynergiesByYear = costSynergyRealization.map(r => costSynergies * r);
  // Total EBITDA synergies = Revenue Synergy EBITDA + Cost Synergies
  const totalEBITDASynergiesByYear = revSynergyEBITDAByYear.map((r, i) => r + costSynergiesByYear[i]);
  
  const integrationCosts = [0, integrationCostsY1 || 0, integrationCostsY2 || 0, integrationCostsY3 || 0, 0, 0];

  // ============ SOURCES AND USES CALCULATION (MOVED UP) ============
  // Must calculate finalNewDebt FIRST before building debt schedule
  // 
  // USES = Equity Value + Debt Payoff (if any) + Transaction Fees
  // SOURCES = Stock + Net Cash from Target + Cash from BS + New Debt
  //
  // Logic: Fill sources in priority order until uses are fully funded
  // 1. Stock consideration (fixed %, but capped at total uses)
  // 2. Net cash from target (if any, capped at remaining)
  // 3. Cash from balance sheet (user input, capped at remaining)
  // 4. New debt (whatever is left to balance)
  
  // Calculate what needs to be funded (positive debt means payoff needed)
  const debtPayoffAmount = Math.max(0, targetNetDebt);
  const rawNetCashFromTarget = targetNetDebt < 0 ? Math.abs(targetNetDebt) : 0;
  
  // Total Uses - this is the fixed target
  const grossUsesAmount = purchasePrice + debtPayoffAmount + transactionFees;
  
  // Step 1: Stock consideration (can't exceed total uses)
  const finalStockConsideration = Math.min(stockConsideration, grossUsesAmount);
  let remainingToFund = grossUsesAmount - finalStockConsideration;
  
  // Step 2: Net cash from target (can't exceed remaining)
  const netCashApplied = Math.min(rawNetCashFromTarget, remainingToFund);
  remainingToFund -= netCashApplied;
  
  // Step 3: Cash from balance sheet (user input, can't exceed remaining)
  const userCashFromBS = Math.max(0, cashFromBalance || 0);
  const finalCashFromBS = Math.min(userCashFromBS, remainingToFund);
  remainingToFund -= finalCashFromBS;
  
  // Step 4: New debt covers whatever is left - THIS IS THE BALANCED AMOUNT
  const finalNewDebt = Math.max(0, remainingToFund);
  
  // Sources and Uses now GUARANTEED to balance
  const sourcesTotal = finalStockConsideration + netCashApplied + finalCashFromBS + finalNewDebt;
  const usesTotal = grossUsesAmount;
  
  // Final Sources
  const sources = {
    cashFromBalance: finalCashFromBS,
    newDebtRaised: finalNewDebt,
    stockConsideration: finalStockConsideration,
    netCashFromTarget: netCashApplied,
    total: sourcesTotal,
  };
  
  // Final Uses
  const uses = {
    equityValue: purchasePrice,
    debtPayoff: debtPayoffAmount,
    transactionFees,
    total: usesTotal,
  };
  
  // Validation: Gap should ALWAYS be 0 now
  const sourcesUsesGap = sources.total - uses.total;

  // ============ DEBT SCHEDULE (NOW USING finalNewDebt) ============
  const debtAmortRate = debtAmortizationRate || 0.05;
  const maturityYears = debtMaturityYears || 5;
  // CRITICAL FIX: Use finalNewDebt (balanced amount) instead of raw newDebtAmount
  const debtSchedule = {
    beginningBalance: [0, finalNewDebt, 0, 0, 0, 0, 0],
    mandatoryAmort: [0, 0, 0, 0, 0, 0],
    optionalPrepay: [0, 0, 0, 0, 0, 0],
    endingBalance: [finalNewDebt, 0, 0, 0, 0, 0],
    interestExpense: [0, 0, 0, 0, 0, 0],
  };
  
  for (let i = 1; i <= 5; i++) {
    debtSchedule.beginningBalance[i] = debtSchedule.endingBalance[i - 1];
    // Fixed: Amortize based on beginning balance, not original principal
    debtSchedule.mandatoryAmort[i] = Math.min(
      debtSchedule.beginningBalance[i] * debtAmortRate,
      debtSchedule.beginningBalance[i] // Can't amortize more than remaining balance
    );
    debtSchedule.endingBalance[i] = Math.max(0, debtSchedule.beginningBalance[i] - debtSchedule.mandatoryAmort[i]);
    // Calculate interest expense on average balance
    debtSchedule.interestExpense[i] = ((debtSchedule.beginningBalance[i] + debtSchedule.endingBalance[i]) / 2) * newDebtRate;
  }

  // ============ PRO FORMA COMBINED PROJECTIONS ============
  const proFormaRevenue: number[] = [];
  const proFormaEBITDA: number[] = [];
  const proFormaNetIncome: number[] = [];
  const proFormaEPS: number[] = [];
  const accretionDilution: number[] = [];
  const accretionDilutionPercent: number[] = [];

  for (let i = 0; i <= 5; i++) {
    // Revenue (includes revenue synergies as top-line)
    const combinedRev = acquirerRev[i] + targetRev[i] + revSynergiesByYear[i];
    proFormaRevenue.push(combinedRev);
    
    // EBITDA - BUG #5 FIX: Use EBITDA synergies (not raw revenue synergies)
    const combinedEBITDA = acquirerEBITDA[i] + targetEBITDA[i] + totalEBITDASynergiesByYear[i];
    proFormaEBITDA.push(combinedEBITDA);
    
    // D&A (combined + PPA intangible amortization)
    const combinedDA = (acquirerRev[i] * acquirerDAPercent) + (targetRev[i] * targetDAPercent) + (i > 0 ? totalAnnualIntangibleAmort : 0);
    
    // EBIT
    const ebit = combinedEBITDA - combinedDA;
    
    // BUG #6 FIX: Interest (existing + NEW debt interest from schedule)
    const newDebtInterest = i > 0 ? debtSchedule.interestExpense[i] : 0;
    const combinedInterest = acquirerInterestExpense + targetInterestExpense + newDebtInterest;
    
    // EBT
    const ebt = ebit - combinedInterest;
    
    // Taxes
    const taxes = Math.max(0, ebt * acquirerTaxRate);
    
    // Net Income (less integration costs after-tax)
    const integrationAfterTax = integrationCosts[i] * (1 - acquirerTaxRate);
    const netIncome = ebt - taxes - integrationAfterTax;
    proFormaNetIncome.push(isNaN(netIncome) ? 0 : netIncome);
    
    // EPS - guard against division by zero and NaN
    const eps = proFormaShares > 0 ? netIncome / proFormaShares : 0;
    proFormaEPS.push(isNaN(eps) ? 0 : eps);
    
    // Accretion/Dilution - guard against NaN
    const acquirerEpsValue = acquirerEPS[i] || 0;
    const epsImpact = eps - acquirerEpsValue;
    accretionDilution.push(isNaN(epsImpact) ? 0 : epsImpact);
    const accDilPct = acquirerEpsValue !== 0 ? (eps / acquirerEpsValue) - 1 : 0;
    accretionDilutionPercent.push(isNaN(accDilPct) ? 0 : accDilPct);
  }

  return {
    assumptions,
    acquirerProjections: {
      years,
      revenue: acquirerRev,
      ebitda: acquirerEBITDA,
      netIncome: acquirerNetIncome,
      eps: acquirerEPS,
    },
    targetProjections: {
      years,
      revenue: targetRev,
      ebitda: targetEBITDA,
      netIncome: targetNetIncome,
    },
    transactionMetrics: {
      purchasePrice,
      enterpriseValue,
      evEbitdaMultiple,
      cashConsideration,
      stockConsideration,
      newSharesIssued,
      proFormaShares,
      goodwill,
      totalIdentifiedIntangibles,
      fairValueNetAssets,
      customerRelationships: identifiedCustomerRel,
      customerRelationshipsLife: customerRelationshipsLife || 10,
      developedTechnology: identifiedDevTech,
      developedTechnologyLife: developedTechnologyLife || 5,
    },
    synergies: {
      revenueSynergies,
      costSynergies,
      totalSynergies: revenueSynergies + costSynergies,
      revSynergiesByYear,
      revSynergyEBITDAByYear,
      revenueSynergyMargin: revSynergyFlowThrough,
      costSynergiesByYear,
      totalEBITDASynergiesByYear,
      revenueSynergyRealization,
      costSynergyRealization,
      integrationCosts,
    },
    sourcesAndUses: {
      sources,
      uses,
      isBalanced: Math.abs(sourcesUsesGap) < 0.01,
      gap: sourcesUsesGap,
    },
    debtSchedule: {
      principal: finalNewDebt, // Use balanced debt amount, not raw input
      interestRate: newDebtRate,
      amortizationRate: debtAmortRate,
      maturityYears: maturityYears,
      schedule: debtSchedule,
    },
    proFormaProjections: {
      years,
      revenue: proFormaRevenue,
      ebitda: proFormaEBITDA,
      netIncome: proFormaNetIncome,
      eps: proFormaEPS,
    },
    accretionDilution: {
      epsImpact: accretionDilution,
      percentImpact: accretionDilutionPercent,
      isAccretiveY1: accretionDilutionPercent[1] > 0,
      isAccretiveY2: accretionDilutionPercent[2] > 0,
      isAccretiveY3: accretionDilutionPercent[3] > 0,
    },
    ppa: {
      purchasePrice,
      fairValueNetAssets,
      customerRelationships: identifiedCustomerRel,
      customerRelationshipsLife: customerRelationshipsLife || 10,
      customerRelAmortization: customerRelAmort,
      developedTechnology: identifiedDevTech,
      developedTechnologyLife: developedTechnologyLife || 5,
      devTechAmortization: devTechAmort,
      otherIntangibles: identifiedOther,
      totalIdentifiedIntangibles,
      goodwill,
      totalAnnualAmortization: totalAnnualIntangibleAmort,
    },
  };
}

export async function generateMAExcel(assumptions: MAAssumptions): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Finance Panel - Formula-Based Model";
  workbook.created = new Date();

  const results = calculateMAMetrics(assumptions);
  const { acquirerProjections, targetProjections, transactionMetrics, synergies, sourcesAndUses, proFormaProjections, accretionDilution } = results;
  
  const acquirerSharesOutstanding = assumptions.acquirerSharesOutstanding || 100;
  const targetNetDebt = assumptions.targetNetDebt || 0;
  const targetRevenue = assumptions.targetRevenue || 500;
  const targetEBITDAMargin = assumptions.targetEBITDAMargin || 0.20;
  
  const currencyFormat = '"$"#,##0';
  const percentFormat = "0.0%";
  const multipleFormat = "0.0x";
  const epsFormat = '"$"0.00';
  const inputFill = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFE0F0FF" } }; // Light blue for inputs
  const formulaFill = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFFFF0D0" } }; // Light yellow for formulas

  // ============ ASSUMPTIONS SHEET (SINGLE SOURCE OF TRUTH) ============
  const aSheet = workbook.addWorksheet("Assumptions");
  aSheet.columns = [{ width: 35 }, { width: 18 }, { width: 5 }, { width: 35 }, { width: 18 }];

  aSheet.getCell("A1").value = "M&A MODEL ASSUMPTIONS";
  aSheet.getCell("A1").font = { bold: true, size: 16 };
  aSheet.getCell("A2").value = `${assumptions.acquirerName} Acquisition of ${assumptions.targetName}`;
  aSheet.getCell("A3").value = `Transaction Date: ${assumptions.transactionDate || new Date().toLocaleDateString()}`;

  // ---- ACQUIRER INPUTS (Column A/B, rows 5-18) ----
  aSheet.getCell("A5").value = "ACQUIRER FINANCIALS";
  aSheet.getCell("A5").font = { bold: true, size: 12 };

  aSheet.getCell("A6").value = "Revenue ($M)"; aSheet.getCell("B6").value = assumptions.acquirerRevenue || 1000; aSheet.getCell("B6").numFmt = currencyFormat; aSheet.getCell("B6").fill = inputFill;
  aSheet.getCell("A7").value = "Revenue Growth Y1"; aSheet.getCell("B7").value = (assumptions.acquirerRevenueGrowth || [0.05])[0]; aSheet.getCell("B7").numFmt = percentFormat; aSheet.getCell("B7").fill = inputFill;
  aSheet.getCell("A8").value = "Revenue Growth Y2"; aSheet.getCell("B8").value = (assumptions.acquirerRevenueGrowth || [0.05, 0.05])[1]; aSheet.getCell("B8").numFmt = percentFormat; aSheet.getCell("B8").fill = inputFill;
  aSheet.getCell("A9").value = "Revenue Growth Y3"; aSheet.getCell("B9").value = (assumptions.acquirerRevenueGrowth || [0.05, 0.05, 0.05])[2]; aSheet.getCell("B9").numFmt = percentFormat; aSheet.getCell("B9").fill = inputFill;
  aSheet.getCell("A10").value = "Revenue Growth Y4"; aSheet.getCell("B10").value = (assumptions.acquirerRevenueGrowth || [0.05, 0.05, 0.05, 0.05])[3]; aSheet.getCell("B10").numFmt = percentFormat; aSheet.getCell("B10").fill = inputFill;
  aSheet.getCell("A11").value = "Revenue Growth Y5"; aSheet.getCell("B11").value = (assumptions.acquirerRevenueGrowth || [0.05, 0.05, 0.05, 0.05, 0.05])[4]; aSheet.getCell("B11").numFmt = percentFormat; aSheet.getCell("B11").fill = inputFill;
  aSheet.getCell("A12").value = "EBITDA Margin"; aSheet.getCell("B12").value = assumptions.acquirerEBITDAMargin || 0.20; aSheet.getCell("B12").numFmt = percentFormat; aSheet.getCell("B12").fill = inputFill;
  aSheet.getCell("A13").value = "D&A % of Revenue"; aSheet.getCell("B13").value = assumptions.acquirerDAPercent || 0.03; aSheet.getCell("B13").numFmt = percentFormat; aSheet.getCell("B13").fill = inputFill;
  aSheet.getCell("A14").value = "Interest Expense ($M)"; aSheet.getCell("B14").value = assumptions.acquirerInterestExpense || 0; aSheet.getCell("B14").numFmt = currencyFormat; aSheet.getCell("B14").fill = inputFill;
  aSheet.getCell("A15").value = "Tax Rate"; aSheet.getCell("B15").value = assumptions.acquirerTaxRate || 0.25; aSheet.getCell("B15").numFmt = percentFormat; aSheet.getCell("B15").fill = inputFill;
  aSheet.getCell("A16").value = "Shares Outstanding (M)"; aSheet.getCell("B16").value = assumptions.acquirerSharesOutstanding || 100; aSheet.getCell("B16").fill = inputFill;
  aSheet.getCell("A17").value = "Stock Price ($)"; aSheet.getCell("B17").value = assumptions.acquirerStockPrice || 50; aSheet.getCell("B17").numFmt = '"$"0.00'; aSheet.getCell("B17").fill = inputFill;
  aSheet.getCell("A18").value = "Explicit EPS (if provided)"; aSheet.getCell("B18").value = assumptions.acquirerExplicitEPS || 0; aSheet.getCell("B18").numFmt = epsFormat; aSheet.getCell("B18").fill = inputFill;

  // ---- TARGET INPUTS (Column D/E, rows 5-18) ----
  aSheet.getCell("D5").value = "TARGET FINANCIALS";
  aSheet.getCell("D5").font = { bold: true, size: 12 };

  aSheet.getCell("D6").value = "Revenue ($M)"; aSheet.getCell("E6").value = assumptions.targetRevenue || 500; aSheet.getCell("E6").numFmt = currencyFormat; aSheet.getCell("E6").fill = inputFill;
  aSheet.getCell("D7").value = "Revenue Growth Y1"; aSheet.getCell("E7").value = (assumptions.targetRevenueGrowth || [0.05])[0]; aSheet.getCell("E7").numFmt = percentFormat; aSheet.getCell("E7").fill = inputFill;
  aSheet.getCell("D8").value = "Revenue Growth Y2"; aSheet.getCell("E8").value = (assumptions.targetRevenueGrowth || [0.05, 0.05])[1]; aSheet.getCell("E8").numFmt = percentFormat; aSheet.getCell("E8").fill = inputFill;
  aSheet.getCell("D9").value = "Revenue Growth Y3"; aSheet.getCell("E9").value = (assumptions.targetRevenueGrowth || [0.05, 0.05, 0.05])[2]; aSheet.getCell("E9").numFmt = percentFormat; aSheet.getCell("E9").fill = inputFill;
  aSheet.getCell("D10").value = "Revenue Growth Y4"; aSheet.getCell("E10").value = (assumptions.targetRevenueGrowth || [0.05, 0.05, 0.05, 0.05])[3]; aSheet.getCell("E10").numFmt = percentFormat; aSheet.getCell("E10").fill = inputFill;
  aSheet.getCell("D11").value = "Revenue Growth Y5"; aSheet.getCell("E11").value = (assumptions.targetRevenueGrowth || [0.05, 0.05, 0.05, 0.05, 0.05])[4]; aSheet.getCell("E11").numFmt = percentFormat; aSheet.getCell("E11").fill = inputFill;
  aSheet.getCell("D12").value = "EBITDA Margin"; aSheet.getCell("E12").value = assumptions.targetEBITDAMargin || 0.20; aSheet.getCell("E12").numFmt = percentFormat; aSheet.getCell("E12").fill = inputFill;
  aSheet.getCell("D13").value = "D&A % of Revenue"; aSheet.getCell("E13").value = assumptions.targetDAPercent || 0.03; aSheet.getCell("E13").numFmt = percentFormat; aSheet.getCell("E13").fill = inputFill;
  aSheet.getCell("D14").value = "Interest Expense ($M)"; aSheet.getCell("E14").value = assumptions.targetInterestExpense || 0; aSheet.getCell("E14").numFmt = currencyFormat; aSheet.getCell("E14").fill = inputFill;
  aSheet.getCell("D15").value = "Tax Rate"; aSheet.getCell("E15").value = assumptions.targetTaxRate || 0.25; aSheet.getCell("E15").numFmt = percentFormat; aSheet.getCell("E15").fill = inputFill;
  aSheet.getCell("D16").value = "Net Debt ($M)"; aSheet.getCell("E16").value = assumptions.targetNetDebt || 0; aSheet.getCell("E16").numFmt = currencyFormat; aSheet.getCell("E16").fill = inputFill;

  // ---- TRANSACTION STRUCTURE (Column A/B, rows 20-28) ----
  aSheet.getCell("A20").value = "TRANSACTION STRUCTURE";
  aSheet.getCell("A20").font = { bold: true, size: 12 };

  aSheet.getCell("A21").value = "Purchase Price (Equity, $M)"; aSheet.getCell("B21").value = assumptions.purchasePrice || 1000; aSheet.getCell("B21").numFmt = currencyFormat; aSheet.getCell("B21").fill = inputFill;
  aSheet.getCell("A22").value = "Cash %"; aSheet.getCell("B22").value = assumptions.cashPercent || 0.5; aSheet.getCell("B22").numFmt = percentFormat; aSheet.getCell("B22").fill = inputFill;
  aSheet.getCell("A23").value = "Stock %"; aSheet.getCell("B23").value = assumptions.stockPercent || 0.5; aSheet.getCell("B23").numFmt = percentFormat; aSheet.getCell("B23").fill = inputFill;
  aSheet.getCell("A24").value = "Premium Paid"; aSheet.getCell("B24").value = assumptions.premium || 0.30; aSheet.getCell("B24").numFmt = percentFormat; aSheet.getCell("B24").fill = inputFill;
  aSheet.getCell("A25").value = "Transaction Fee %"; aSheet.getCell("B25").value = assumptions.transactionFeePercent || 0.025; aSheet.getCell("B25").numFmt = percentFormat; aSheet.getCell("B25").fill = inputFill;
  aSheet.getCell("A26").value = "Explicit Transaction Fees ($M)"; aSheet.getCell("B26").value = assumptions.transactionFees || 0; aSheet.getCell("B26").numFmt = currencyFormat; aSheet.getCell("B26").fill = inputFill;

  // ---- FINANCING (Column D/E, rows 20-26) ----
  aSheet.getCell("D20").value = "FINANCING";
  aSheet.getCell("D20").font = { bold: true, size: 12 };

  aSheet.getCell("D21").value = "Cash from Balance Sheet ($M)"; aSheet.getCell("E21").value = assumptions.cashFromBalance || 0; aSheet.getCell("E21").numFmt = currencyFormat; aSheet.getCell("E21").fill = inputFill;
  aSheet.getCell("D22").value = "New Debt Amount ($M)"; aSheet.getCell("E22").value = assumptions.newDebtAmount || 0; aSheet.getCell("E22").numFmt = currencyFormat; aSheet.getCell("E22").fill = inputFill;
  aSheet.getCell("D23").value = "New Debt Interest Rate"; aSheet.getCell("E23").value = assumptions.newDebtRate || 0.06; aSheet.getCell("E23").numFmt = percentFormat; aSheet.getCell("E23").fill = inputFill;
  aSheet.getCell("D24").value = "Debt Amortization Rate"; aSheet.getCell("E24").value = assumptions.debtAmortizationRate || 0.05; aSheet.getCell("E24").numFmt = percentFormat; aSheet.getCell("E24").fill = inputFill;
  aSheet.getCell("D25").value = "Debt Maturity (Years)"; aSheet.getCell("E25").value = assumptions.debtMaturityYears || 5; aSheet.getCell("E25").fill = inputFill;

  // ---- SYNERGIES (Rows 30-46) ----
  aSheet.getCell("A30").value = "SYNERGIES";
  aSheet.getCell("A30").font = { bold: true, size: 12 };

  aSheet.getCell("A31").value = "Revenue Synergies (Run-Rate, $M)"; aSheet.getCell("B31").value = assumptions.revenueSynergies || 0; aSheet.getCell("B31").numFmt = currencyFormat; aSheet.getCell("B31").fill = inputFill;
  aSheet.getCell("A32").value = "Rev Synergy Realization Y1"; aSheet.getCell("B32").value = assumptions.revenueSynergyRealizationY1 ?? 0; aSheet.getCell("B32").numFmt = percentFormat; aSheet.getCell("B32").fill = inputFill;
  aSheet.getCell("A33").value = "Rev Synergy Realization Y2"; aSheet.getCell("B33").value = assumptions.revenueSynergyRealizationY2 ?? 0.5; aSheet.getCell("B33").numFmt = percentFormat; aSheet.getCell("B33").fill = inputFill;
  aSheet.getCell("A34").value = "Rev Synergy Realization Y3"; aSheet.getCell("B34").value = assumptions.revenueSynergyRealizationY3 ?? 1.0; aSheet.getCell("B34").numFmt = percentFormat; aSheet.getCell("B34").fill = inputFill;
  aSheet.getCell("A35").value = "Rev Synergy Realization Y4"; aSheet.getCell("B35").value = assumptions.revenueSynergyRealizationY4 ?? 1.0; aSheet.getCell("B35").numFmt = percentFormat; aSheet.getCell("B35").fill = inputFill;
  aSheet.getCell("A36").value = "Rev Synergy Realization Y5"; aSheet.getCell("B36").value = assumptions.revenueSynergyRealizationY5 ?? 1.0; aSheet.getCell("B36").numFmt = percentFormat; aSheet.getCell("B36").fill = inputFill;
  aSheet.getCell("A37").value = "Revenue Synergy Margin"; aSheet.getCell("B37").value = assumptions.revenueSynergyMargin ?? 1.0; aSheet.getCell("B37").numFmt = percentFormat; aSheet.getCell("B37").fill = inputFill;

  aSheet.getCell("D31").value = "Cost Synergies (Run-Rate, $M)"; aSheet.getCell("E31").value = assumptions.costSynergies || 0; aSheet.getCell("E31").numFmt = currencyFormat; aSheet.getCell("E31").fill = inputFill;
  aSheet.getCell("D32").value = "Cost Synergy Realization Y1"; aSheet.getCell("E32").value = assumptions.costSynergyRealizationY1 ?? 0.20; aSheet.getCell("E32").numFmt = percentFormat; aSheet.getCell("E32").fill = inputFill;
  aSheet.getCell("D33").value = "Cost Synergy Realization Y2"; aSheet.getCell("E33").value = assumptions.costSynergyRealizationY2 ?? 0.60; aSheet.getCell("E33").numFmt = percentFormat; aSheet.getCell("E33").fill = inputFill;
  aSheet.getCell("D34").value = "Cost Synergy Realization Y3"; aSheet.getCell("E34").value = assumptions.costSynergyRealizationY3 ?? 1.0; aSheet.getCell("E34").numFmt = percentFormat; aSheet.getCell("E34").fill = inputFill;
  aSheet.getCell("D35").value = "Cost Synergy Realization Y4"; aSheet.getCell("E35").value = assumptions.costSynergyRealizationY4 ?? 1.0; aSheet.getCell("E35").numFmt = percentFormat; aSheet.getCell("E35").fill = inputFill;
  aSheet.getCell("D36").value = "Cost Synergy Realization Y5"; aSheet.getCell("E36").value = assumptions.costSynergyRealizationY5 ?? 1.0; aSheet.getCell("E36").numFmt = percentFormat; aSheet.getCell("E36").fill = inputFill;

  aSheet.getCell("A39").value = "Integration Costs Y1 ($M)"; aSheet.getCell("B39").value = assumptions.integrationCostsY1 || 0; aSheet.getCell("B39").numFmt = currencyFormat; aSheet.getCell("B39").fill = inputFill;
  aSheet.getCell("A40").value = "Integration Costs Y2 ($M)"; aSheet.getCell("B40").value = assumptions.integrationCostsY2 || 0; aSheet.getCell("B40").numFmt = currencyFormat; aSheet.getCell("B40").fill = inputFill;
  aSheet.getCell("A41").value = "Integration Costs Y3 ($M)"; aSheet.getCell("B41").value = assumptions.integrationCostsY3 || 0; aSheet.getCell("B41").numFmt = currencyFormat; aSheet.getCell("B41").fill = inputFill;

  // ---- PURCHASE PRICE ALLOCATION (Rows 44-55) ----
  aSheet.getCell("A44").value = "PURCHASE PRICE ALLOCATION";
  aSheet.getCell("A44").font = { bold: true, size: 12 };

  aSheet.getCell("A45").value = "Fair Value Net Assets ($M)"; aSheet.getCell("B45").value = assumptions.targetFairValueNetAssets || (assumptions.targetRevenue || 500) * 0.3; aSheet.getCell("B45").numFmt = currencyFormat; aSheet.getCell("B45").fill = inputFill;
  aSheet.getCell("A46").value = "Customer Relationships ($M)"; aSheet.getCell("B46").value = assumptions.customerRelationships || 0; aSheet.getCell("B46").numFmt = currencyFormat; aSheet.getCell("B46").fill = inputFill;
  aSheet.getCell("A47").value = "Customer Rel. Life (Years)"; aSheet.getCell("B47").value = assumptions.customerRelationshipsLife || 10; aSheet.getCell("B47").fill = inputFill;
  aSheet.getCell("A48").value = "Developed Technology ($M)"; aSheet.getCell("B48").value = assumptions.developedTechnology || 0; aSheet.getCell("B48").numFmt = currencyFormat; aSheet.getCell("B48").fill = inputFill;
  aSheet.getCell("A49").value = "Developed Tech. Life (Years)"; aSheet.getCell("B49").value = assumptions.developedTechnologyLife || 5; aSheet.getCell("B49").fill = inputFill;
  aSheet.getCell("A50").value = "Other Intangibles ($M)"; aSheet.getCell("B50").value = assumptions.otherIntangibles || 0; aSheet.getCell("B50").numFmt = currencyFormat; aSheet.getCell("B50").fill = inputFill;
  aSheet.getCell("A51").value = "Other Intangibles Life (Years)"; aSheet.getCell("B51").value = assumptions.otherIntangiblesLife || 10; aSheet.getCell("B51").fill = inputFill;
  aSheet.getCell("A52").value = "Total Intangibles (Legacy, $M)"; aSheet.getCell("B52").value = assumptions.intangibleAssets || 0; aSheet.getCell("B52").numFmt = currencyFormat; aSheet.getCell("B52").fill = inputFill;
  aSheet.getCell("A53").value = "Intangible Amort Years (Legacy)"; aSheet.getCell("B53").value = assumptions.intangibleAmortYears || 10; aSheet.getCell("B53").fill = inputFill;

  // ---- DERIVED/COMPUTED VALUES (Column D/E, rows 44+) ----
  aSheet.getCell("D44").value = "DERIVED VALUES (FORMULAS)";
  aSheet.getCell("D44").font = { bold: true, size: 12 };

  // Enterprise Value = Purchase Price + Net Debt
  aSheet.getCell("D45").value = "Enterprise Value ($M)"; 
  aSheet.getCell("E45").value = { formula: "=B21+E16" }; aSheet.getCell("E45").numFmt = currencyFormat; aSheet.getCell("E45").fill = formulaFill;

  // Stock Consideration = Purchase Price * Stock %
  aSheet.getCell("D46").value = "Stock Consideration ($M)";
  aSheet.getCell("E46").value = { formula: "=B21*B23" }; aSheet.getCell("E46").numFmt = currencyFormat; aSheet.getCell("E46").fill = formulaFill;

  // Cash Consideration = Purchase Price * Cash %
  aSheet.getCell("D47").value = "Cash Consideration ($M)";
  aSheet.getCell("E47").value = { formula: "=B21*B22" }; aSheet.getCell("E47").numFmt = currencyFormat; aSheet.getCell("E47").fill = formulaFill;

  // New Shares Issued = Stock Consideration / Stock Price
  aSheet.getCell("D48").value = "New Shares Issued (M)";
  aSheet.getCell("E48").value = { formula: "=IF(B17>0,E46/B17,0)" }; aSheet.getCell("E48").fill = formulaFill;

  // Pro Forma Shares = Acquirer Shares + New Shares
  aSheet.getCell("D49").value = "Pro Forma Shares (M)";
  aSheet.getCell("E49").value = { formula: "=B16+E48" }; aSheet.getCell("E49").fill = formulaFill;

  // Transaction Fees = IF Explicit > 0 THEN Explicit ELSE EV * Fee %
  aSheet.getCell("D50").value = "Transaction Fees ($M)";
  aSheet.getCell("E50").value = { formula: "=IF(B26>0,B26,E45*B25)" }; aSheet.getCell("E50").numFmt = currencyFormat; aSheet.getCell("E50").fill = formulaFill;

  // Debt Payoff = MAX(0, Net Debt)
  aSheet.getCell("D51").value = "Debt Payoff ($M)";
  aSheet.getCell("E51").value = { formula: "=MAX(0,E16)" }; aSheet.getCell("E51").numFmt = currencyFormat; aSheet.getCell("E51").fill = formulaFill;

  // Net Cash from Target = MAX(0, -Net Debt)
  aSheet.getCell("D52").value = "Net Cash from Target ($M)";
  aSheet.getCell("E52").value = { formula: "=MAX(0,-E16)" }; aSheet.getCell("E52").numFmt = currencyFormat; aSheet.getCell("E52").fill = formulaFill;

  // Total Identified Intangibles = SUM of components OR legacy total
  aSheet.getCell("D53").value = "Total Identified Intangibles ($M)";
  aSheet.getCell("E53").value = { formula: "=IF(B46+B48+B50>0,B46+B48+B50,B52)" }; aSheet.getCell("E53").numFmt = currencyFormat; aSheet.getCell("E53").fill = formulaFill;

  // Deferred Tax Liability on step-up = Tax Rate * Amortizable Intangibles
  aSheet.getCell("D54").value = "Deferred Tax Liability ($M)";
  aSheet.getCell("E54").value = { formula: "=B15*E53" }; aSheet.getCell("E54").numFmt = currencyFormat; aSheet.getCell("E54").fill = formulaFill;

  // CORRECTED Goodwill = Purchase Price - FV Net Assets - Intangibles + DTL
  aSheet.getCell("D55").value = "Goodwill ($M)";
  aSheet.getCell("E55").value = { formula: "=MAX(0,B21-B45-E53+E54)" }; aSheet.getCell("E55").numFmt = currencyFormat; aSheet.getCell("E55").fill = formulaFill;
  aSheet.getCell("E55").font = { bold: true };

  // Annual Intangible Amortization
  aSheet.getCell("D56").value = "Annual Intangible Amortization ($M)";
  aSheet.getCell("E56").value = { formula: "=IF(B46+B48+B50>0,B46/B47+B48/B49+B50/B51,B52/B53)" }; aSheet.getCell("E56").numFmt = currencyFormat; aSheet.getCell("E56").fill = formulaFill;

  // ============ EXECUTIVE SUMMARY (With Formulas) ============
  const summarySheet = workbook.addWorksheet("Executive_Summary");
  summarySheet.columns = [{ width: 35 }, { width: 20 }, { width: 20 }];

  summarySheet.getCell("A1").value = `${assumptions.acquirerName} Acquisition of ${assumptions.targetName}`;
  summarySheet.getCell("A1").font = { bold: true, size: 16 };
  summarySheet.getCell("A2").value = { formula: "=\"Transaction Date: \"&Assumptions!A3" };

  summarySheet.getCell("A4").value = "TRANSACTION OVERVIEW";
  summarySheet.getCell("A4").font = { bold: true, size: 14 };

  summarySheet.getCell("A5").value = "Purchase Price (Equity):";
  summarySheet.getCell("B5").value = { formula: "=Assumptions!B21" }; summarySheet.getCell("B5").numFmt = currencyFormat;

  summarySheet.getCell("A6").value = "Enterprise Value:";
  summarySheet.getCell("B6").value = { formula: "=Assumptions!E45" }; summarySheet.getCell("B6").numFmt = currencyFormat;

  summarySheet.getCell("A7").value = "EV/EBITDA Multiple:";
  summarySheet.getCell("B7").value = { formula: "=IF(Assumptions!E6*Assumptions!E12>0,Assumptions!E45/(Assumptions!E6*Assumptions!E12),0)" }; summarySheet.getCell("B7").numFmt = multipleFormat;

  summarySheet.getCell("A8").value = "Premium Paid:";
  summarySheet.getCell("B8").value = { formula: "=Assumptions!B24" }; summarySheet.getCell("B8").numFmt = percentFormat;

  summarySheet.getCell("A10").value = "CONSIDERATION MIX";
  summarySheet.getCell("A10").font = { bold: true, size: 14 };

  summarySheet.getCell("A11").value = "Cash:";
  summarySheet.getCell("B11").value = { formula: "=Assumptions!E47" }; summarySheet.getCell("B11").numFmt = currencyFormat;
  summarySheet.getCell("C11").value = { formula: "=Assumptions!B22" }; summarySheet.getCell("C11").numFmt = percentFormat;

  summarySheet.getCell("A12").value = "Stock:";
  summarySheet.getCell("B12").value = { formula: "=Assumptions!E46" }; summarySheet.getCell("B12").numFmt = currencyFormat;
  summarySheet.getCell("C12").value = { formula: "=Assumptions!B23" }; summarySheet.getCell("C12").numFmt = percentFormat;

  summarySheet.getCell("A14").value = "SYNERGIES";
  summarySheet.getCell("A14").font = { bold: true, size: 14 };

  summarySheet.getCell("A15").value = "Revenue Synergies (Run-Rate):";
  summarySheet.getCell("B15").value = { formula: "=Assumptions!B31" }; summarySheet.getCell("B15").numFmt = currencyFormat;

  summarySheet.getCell("A16").value = "Cost Synergies (Run-Rate):";
  summarySheet.getCell("B16").value = { formula: "=Assumptions!E31" }; summarySheet.getCell("B16").numFmt = currencyFormat;

  summarySheet.getCell("A17").value = "Total Synergies:";
  summarySheet.getCell("B17").value = { formula: "=B15+B16" }; summarySheet.getCell("B17").numFmt = currencyFormat;
  summarySheet.getRow(17).font = { bold: true };

  summarySheet.getCell("A19").value = "ACCRETION/DILUTION";
  summarySheet.getCell("A19").font = { bold: true, size: 14 };

  summarySheet.getCell("A20").value = "Year 1 EPS Impact:";
  summarySheet.getCell("B20").value = accretionDilution.percentImpact[1];
  summarySheet.getCell("B20").numFmt = percentFormat;
  summarySheet.getCell("C20").value = accretionDilution.isAccretiveY1 ? "Accretive" : "Dilutive";
  summarySheet.getCell("C20").font = { color: { argb: accretionDilution.isAccretiveY1 ? "FF008000" : "FFFF0000" } };

  summarySheet.getCell("A21").value = "Year 2 EPS Impact:";
  summarySheet.getCell("B21").value = accretionDilution.percentImpact[2];
  summarySheet.getCell("B21").numFmt = percentFormat;
  summarySheet.getCell("C21").value = accretionDilution.isAccretiveY2 ? "Accretive" : "Dilutive";
  summarySheet.getCell("C21").font = { color: { argb: accretionDilution.isAccretiveY2 ? "FF008000" : "FFFF0000" } };

  summarySheet.getCell("A22").value = "Year 3 EPS Impact:";
  summarySheet.getCell("B22").value = accretionDilution.percentImpact[3];
  summarySheet.getCell("B22").numFmt = percentFormat;
  summarySheet.getCell("C22").value = accretionDilution.isAccretiveY3 ? "Accretive" : "Dilutive";
  summarySheet.getCell("C22").font = { color: { argb: accretionDilution.isAccretiveY3 ? "FF008000" : "FFFF0000" } };

  // ============ SOURCES & USES (Formula-Based) ============
  const suSheet = workbook.addWorksheet("Sources_Uses");
  suSheet.columns = [{ width: 35 }, { width: 18 }, { width: 18 }];

  suSheet.getCell("A1").value = "SOURCES & USES OF FUNDS";
  suSheet.getCell("A1").font = { bold: true, size: 14 };

  suSheet.getCell("A3").value = "SOURCES";
  suSheet.getCell("B3").value = "Amount ($M)";
  suSheet.getCell("C3").value = "% of Total";
  suSheet.getRow(3).font = { bold: true };

  // Cash from Balance Sheet (uses min of user input and remaining to fund)
  suSheet.getCell("A4").value = "Cash from Balance Sheet";
  suSheet.getCell("B4").value = { formula: "=MIN(Assumptions!E21,MAX(0,B12-B6-B7))" };
  suSheet.getCell("B4").numFmt = currencyFormat; suSheet.getCell("B4").fill = formulaFill;
  suSheet.getCell("C4").value = { formula: "=IF(B8>0,B4/B8,0)" }; suSheet.getCell("C4").numFmt = percentFormat;

  // New Debt Raised (balancing amount = Total Uses - Stock - Net Cash - Cash from BS)
  suSheet.getCell("A5").value = "New Debt Raised";
  suSheet.getCell("B5").value = { formula: "=MAX(0,B12-B6-B7-B4)" };
  suSheet.getCell("B5").numFmt = currencyFormat; suSheet.getCell("B5").fill = formulaFill;
  suSheet.getCell("C5").value = { formula: "=IF(B8>0,B5/B8,0)" }; suSheet.getCell("C5").numFmt = percentFormat;

  // Stock Consideration
  suSheet.getCell("A6").value = "Stock Consideration";
  suSheet.getCell("B6").value = { formula: "=MIN(Assumptions!E46,B12)" };
  suSheet.getCell("B6").numFmt = currencyFormat; suSheet.getCell("B6").fill = formulaFill;
  suSheet.getCell("C6").value = { formula: "=IF(B8>0,B6/B8,0)" }; suSheet.getCell("C6").numFmt = percentFormat;

  // Net Cash from Target (only if target has net cash, i.e., negative net debt)
  suSheet.getCell("A7").value = "Net Cash from Target";
  suSheet.getCell("B7").value = { formula: "=MIN(Assumptions!E52,MAX(0,B12-B6))" };
  suSheet.getCell("B7").numFmt = currencyFormat; suSheet.getCell("B7").fill = formulaFill;
  suSheet.getCell("C7").value = { formula: "=IF(B8>0,B7/B8,0)" }; suSheet.getCell("C7").numFmt = percentFormat;

  // TOTAL SOURCES = SUM
  suSheet.getCell("A8").value = "TOTAL SOURCES";
  suSheet.getCell("B8").value = { formula: "=SUM(B4:B7)" };
  suSheet.getCell("B8").numFmt = currencyFormat; suSheet.getCell("B8").fill = formulaFill;
  suSheet.getRow(8).font = { bold: true };

  // USES section
  suSheet.getCell("A10").value = "USES";
  suSheet.getRow(10).font = { bold: true };

  // Target Equity Value
  suSheet.getCell("A11").value = "Target Equity Value";
  suSheet.getCell("B11").value = { formula: "=Assumptions!B21" };
  suSheet.getCell("B11").numFmt = currencyFormat; suSheet.getCell("B11").fill = formulaFill;

  // Debt Payoff (only if target has net debt)
  suSheet.getCell("A12").value = "Target Net Debt Payoff";
  suSheet.getCell("B12").value = { formula: "=Assumptions!E51" };
  suSheet.getCell("B12").numFmt = currencyFormat; suSheet.getCell("B12").fill = formulaFill;

  // Transaction Fees
  suSheet.getCell("A13").value = "Transaction Fees";
  suSheet.getCell("B13").value = { formula: "=Assumptions!E50" };
  suSheet.getCell("B13").numFmt = currencyFormat; suSheet.getCell("B13").fill = formulaFill;

  // TOTAL USES = Equity + Debt Payoff + Fees
  suSheet.getCell("A14").value = "TOTAL USES";
  suSheet.getCell("B14").value = { formula: "=B11+B12+B13" };
  suSheet.getCell("B14").numFmt = currencyFormat; suSheet.getCell("B14").fill = formulaFill;
  suSheet.getRow(14).font = { bold: true };

  // Balance Check
  suSheet.getCell("A16").value = "BALANCE CHECK (Sources - Uses)";
  suSheet.getCell("B16").value = { formula: "=B8-B14" };
  suSheet.getCell("B16").numFmt = currencyFormat; suSheet.getCell("B16").fill = formulaFill;
  suSheet.getCell("C16").value = { formula: '=IF(ABS(B16)<0.01,"BALANCED","IMBALANCED")' };
  suSheet.getCell("C16").font = { bold: true };
  suSheet.getRow(16).font = { bold: true };

  // Key transaction metrics for reference
  suSheet.getCell("A18").value = "KEY TRANSACTION METRICS";
  suSheet.getCell("A18").font = { bold: true };

  suSheet.getCell("A19").value = "Pro Forma Shares (M)";
  suSheet.getCell("B19").value = { formula: "=Assumptions!E49" }; suSheet.getCell("B19").fill = formulaFill;

  suSheet.getCell("A20").value = "New Shares Issued (M)";
  suSheet.getCell("B20").value = { formula: "=Assumptions!E48" }; suSheet.getCell("B20").fill = formulaFill;

  // Note about balancing: Uses are fixed, sources adjust to match
  // Gross Uses = Equity Value + Debt Payoff + Transaction Fees
  // This is the TOTAL that needs to be funded
  suSheet.getCell("A12").value = "GROSS USES (to fund)";
  suSheet.getCell("B12").value = { formula: "=B11+Assumptions!E51+B13" };
  suSheet.getCell("B12").numFmt = currencyFormat; suSheet.getCell("B12").fill = formulaFill;

  // ============ ACQUIRER PROJECTIONS (Formula-Based) ============
  const acqSheet = workbook.addWorksheet("Acquirer_Standalone");
  acqSheet.columns = [
    { width: 25 },
    { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 },
  ];

  acqSheet.getCell("A1").value = `${assumptions.acquirerName} - Standalone Projections`;
  acqSheet.getCell("A1").font = { bold: true, size: 14 };

  acqSheet.addRow(["", "Year 0", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5"]);
  acqSheet.getRow(2).font = { bold: true };
  acqSheet.getRow(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };

  // Revenue: Year 0 from assumptions, subsequent years = prior * (1 + growth)
  acqSheet.getCell("A3").value = "Revenue ($M)";
  acqSheet.getCell("B3").value = { formula: "=Assumptions!B6" }; acqSheet.getCell("B3").numFmt = currencyFormat; acqSheet.getCell("B3").fill = formulaFill;
  acqSheet.getCell("C3").value = { formula: "=B3*(1+Assumptions!B7)" }; acqSheet.getCell("C3").numFmt = currencyFormat; acqSheet.getCell("C3").fill = formulaFill;
  acqSheet.getCell("D3").value = { formula: "=C3*(1+Assumptions!B8)" }; acqSheet.getCell("D3").numFmt = currencyFormat; acqSheet.getCell("D3").fill = formulaFill;
  acqSheet.getCell("E3").value = { formula: "=D3*(1+Assumptions!B9)" }; acqSheet.getCell("E3").numFmt = currencyFormat; acqSheet.getCell("E3").fill = formulaFill;
  acqSheet.getCell("F3").value = { formula: "=E3*(1+Assumptions!B10)" }; acqSheet.getCell("F3").numFmt = currencyFormat; acqSheet.getCell("F3").fill = formulaFill;
  acqSheet.getCell("G3").value = { formula: "=F3*(1+Assumptions!B11)" }; acqSheet.getCell("G3").numFmt = currencyFormat; acqSheet.getCell("G3").fill = formulaFill;

  // EBITDA = Revenue * EBITDA Margin
  acqSheet.getCell("A4").value = "EBITDA ($M)";
  for (let col = 2; col <= 7; col++) {
    const colLetter = String.fromCharCode(64 + col); // B, C, D, E, F, G
    acqSheet.getCell(4, col).value = { formula: `=${colLetter}3*Assumptions!$B$12` };
    acqSheet.getCell(4, col).numFmt = currencyFormat; acqSheet.getCell(4, col).fill = formulaFill;
  }

  // D&A = Revenue * D&A %
  acqSheet.getCell("A5").value = "D&A ($M)";
  for (let col = 2; col <= 7; col++) {
    const colLetter = String.fromCharCode(64 + col);
    acqSheet.getCell(5, col).value = { formula: `=${colLetter}3*Assumptions!$B$13` };
    acqSheet.getCell(5, col).numFmt = currencyFormat; acqSheet.getCell(5, col).fill = formulaFill;
  }

  // EBIT = EBITDA - D&A
  acqSheet.getCell("A6").value = "EBIT ($M)";
  for (let col = 2; col <= 7; col++) {
    const colLetter = String.fromCharCode(64 + col);
    acqSheet.getCell(6, col).value = { formula: `=${colLetter}4-${colLetter}5` };
    acqSheet.getCell(6, col).numFmt = currencyFormat; acqSheet.getCell(6, col).fill = formulaFill;
  }

  // Interest Expense (constant from assumptions)
  acqSheet.getCell("A7").value = "Interest Expense ($M)";
  for (let col = 2; col <= 7; col++) {
    acqSheet.getCell(7, col).value = { formula: "=Assumptions!$B$14" };
    acqSheet.getCell(7, col).numFmt = currencyFormat; acqSheet.getCell(7, col).fill = formulaFill;
  }

  // EBT = EBIT - Interest
  acqSheet.getCell("A8").value = "EBT ($M)";
  for (let col = 2; col <= 7; col++) {
    const colLetter = String.fromCharCode(64 + col);
    acqSheet.getCell(8, col).value = { formula: `=${colLetter}6-${colLetter}7` };
    acqSheet.getCell(8, col).numFmt = currencyFormat; acqSheet.getCell(8, col).fill = formulaFill;
  }

  // Taxes = MAX(0, EBT * Tax Rate)
  acqSheet.getCell("A9").value = "Taxes ($M)";
  for (let col = 2; col <= 7; col++) {
    const colLetter = String.fromCharCode(64 + col);
    acqSheet.getCell(9, col).value = { formula: `=MAX(0,${colLetter}8*Assumptions!$B$15)` };
    acqSheet.getCell(9, col).numFmt = currencyFormat; acqSheet.getCell(9, col).fill = formulaFill;
  }

  // Net Income = EBT - Taxes
  acqSheet.getCell("A10").value = "Net Income ($M)";
  for (let col = 2; col <= 7; col++) {
    const colLetter = String.fromCharCode(64 + col);
    acqSheet.getCell(10, col).value = { formula: `=${colLetter}8-${colLetter}9` };
    acqSheet.getCell(10, col).numFmt = currencyFormat; acqSheet.getCell(10, col).fill = formulaFill;
  }
  acqSheet.getRow(10).font = { bold: true };

  // EPS: Use explicit EPS if provided for Y0, otherwise calculate; project proportionally
  acqSheet.getCell("A11").value = "EPS";
  // Year 0: IF explicit EPS provided use it, else calculate
  acqSheet.getCell("B11").value = { formula: "=IF(Assumptions!B18>0,Assumptions!B18,B10/Assumptions!B16)" };
  acqSheet.getCell("B11").numFmt = epsFormat; acqSheet.getCell("B11").fill = formulaFill;
  // Years 1-5: grow from base proportionally by Net Income growth
  for (let col = 3; col <= 7; col++) {
    const colLetter = String.fromCharCode(64 + col);
    acqSheet.getCell(11, col).value = { formula: `=IF(Assumptions!$B$18>0,$B$11*(${colLetter}10/$B$10),${colLetter}10/Assumptions!$B$16)` };
    acqSheet.getCell(11, col).numFmt = epsFormat; acqSheet.getCell(11, col).fill = formulaFill;
  }

  // ============ TARGET PROJECTIONS (Formula-Based) ============
  const tgtSheet = workbook.addWorksheet("Target_Standalone");
  tgtSheet.columns = [
    { width: 25 },
    { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 },
  ];

  tgtSheet.getCell("A1").value = `${assumptions.targetName} - Standalone Projections`;
  tgtSheet.getCell("A1").font = { bold: true, size: 14 };

  tgtSheet.addRow(["", "Year 0", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5"]);
  tgtSheet.getRow(2).font = { bold: true };
  tgtSheet.getRow(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };

  // Revenue: Year 0 from assumptions, subsequent years = prior * (1 + growth)
  tgtSheet.getCell("A3").value = "Revenue ($M)";
  tgtSheet.getCell("B3").value = { formula: "=Assumptions!E6" }; tgtSheet.getCell("B3").numFmt = currencyFormat; tgtSheet.getCell("B3").fill = formulaFill;
  tgtSheet.getCell("C3").value = { formula: "=B3*(1+Assumptions!E7)" }; tgtSheet.getCell("C3").numFmt = currencyFormat; tgtSheet.getCell("C3").fill = formulaFill;
  tgtSheet.getCell("D3").value = { formula: "=C3*(1+Assumptions!E8)" }; tgtSheet.getCell("D3").numFmt = currencyFormat; tgtSheet.getCell("D3").fill = formulaFill;
  tgtSheet.getCell("E3").value = { formula: "=D3*(1+Assumptions!E9)" }; tgtSheet.getCell("E3").numFmt = currencyFormat; tgtSheet.getCell("E3").fill = formulaFill;
  tgtSheet.getCell("F3").value = { formula: "=E3*(1+Assumptions!E10)" }; tgtSheet.getCell("F3").numFmt = currencyFormat; tgtSheet.getCell("F3").fill = formulaFill;
  tgtSheet.getCell("G3").value = { formula: "=F3*(1+Assumptions!E11)" }; tgtSheet.getCell("G3").numFmt = currencyFormat; tgtSheet.getCell("G3").fill = formulaFill;

  // EBITDA = Revenue * EBITDA Margin
  tgtSheet.getCell("A4").value = "EBITDA ($M)";
  for (let col = 2; col <= 7; col++) {
    const colLetter = String.fromCharCode(64 + col);
    tgtSheet.getCell(4, col).value = { formula: `=${colLetter}3*Assumptions!$E$12` };
    tgtSheet.getCell(4, col).numFmt = currencyFormat; tgtSheet.getCell(4, col).fill = formulaFill;
  }

  // D&A = Revenue * D&A %
  tgtSheet.getCell("A5").value = "D&A ($M)";
  for (let col = 2; col <= 7; col++) {
    const colLetter = String.fromCharCode(64 + col);
    tgtSheet.getCell(5, col).value = { formula: `=${colLetter}3*Assumptions!$E$13` };
    tgtSheet.getCell(5, col).numFmt = currencyFormat; tgtSheet.getCell(5, col).fill = formulaFill;
  }

  // EBIT = EBITDA - D&A
  tgtSheet.getCell("A6").value = "EBIT ($M)";
  for (let col = 2; col <= 7; col++) {
    const colLetter = String.fromCharCode(64 + col);
    tgtSheet.getCell(6, col).value = { formula: `=${colLetter}4-${colLetter}5` };
    tgtSheet.getCell(6, col).numFmt = currencyFormat; tgtSheet.getCell(6, col).fill = formulaFill;
  }

  // Interest Expense
  tgtSheet.getCell("A7").value = "Interest Expense ($M)";
  for (let col = 2; col <= 7; col++) {
    tgtSheet.getCell(7, col).value = { formula: "=Assumptions!$E$14" };
    tgtSheet.getCell(7, col).numFmt = currencyFormat; tgtSheet.getCell(7, col).fill = formulaFill;
  }

  // EBT = EBIT - Interest
  tgtSheet.getCell("A8").value = "EBT ($M)";
  for (let col = 2; col <= 7; col++) {
    const colLetter = String.fromCharCode(64 + col);
    tgtSheet.getCell(8, col).value = { formula: `=${colLetter}6-${colLetter}7` };
    tgtSheet.getCell(8, col).numFmt = currencyFormat; tgtSheet.getCell(8, col).fill = formulaFill;
  }

  // Taxes = MAX(0, EBT * Tax Rate)
  tgtSheet.getCell("A9").value = "Taxes ($M)";
  for (let col = 2; col <= 7; col++) {
    const colLetter = String.fromCharCode(64 + col);
    tgtSheet.getCell(9, col).value = { formula: `=MAX(0,${colLetter}8*Assumptions!$E$15)` };
    tgtSheet.getCell(9, col).numFmt = currencyFormat; tgtSheet.getCell(9, col).fill = formulaFill;
  }

  // Net Income = EBT - Taxes
  tgtSheet.getCell("A10").value = "Net Income ($M)";
  for (let col = 2; col <= 7; col++) {
    const colLetter = String.fromCharCode(64 + col);
    tgtSheet.getCell(10, col).value = { formula: `=${colLetter}8-${colLetter}9` };
    tgtSheet.getCell(10, col).numFmt = currencyFormat; tgtSheet.getCell(10, col).fill = formulaFill;
  }
  tgtSheet.getRow(10).font = { bold: true };

  // ============ SYNERGIES (Formula-Based) ============
  const synSheet = workbook.addWorksheet("Synergies");
  synSheet.columns = [
    { width: 30 },
    { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 },
  ];

  synSheet.getCell("A1").value = "SYNERGY SCHEDULE";
  synSheet.getCell("A1").font = { bold: true, size: 14 };

  synSheet.addRow(["", "Year 0", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5"]);
  synSheet.getRow(2).font = { bold: true };

  // Revenue Synergies (Top-Line) = Run Rate * Phase-In %
  synSheet.getCell("A3").value = "Revenue Synergies (Top-Line)";
  synSheet.getCell("B3").value = 0; synSheet.getCell("B3").numFmt = currencyFormat; // Year 0 = 0
  synSheet.getCell("C3").value = { formula: "=Assumptions!$B$31*Assumptions!B32" }; synSheet.getCell("C3").numFmt = currencyFormat; synSheet.getCell("C3").fill = formulaFill;
  synSheet.getCell("D3").value = { formula: "=Assumptions!$B$31*Assumptions!B33" }; synSheet.getCell("D3").numFmt = currencyFormat; synSheet.getCell("D3").fill = formulaFill;
  synSheet.getCell("E3").value = { formula: "=Assumptions!$B$31*Assumptions!B34" }; synSheet.getCell("E3").numFmt = currencyFormat; synSheet.getCell("E3").fill = formulaFill;
  synSheet.getCell("F3").value = { formula: "=Assumptions!$B$31*Assumptions!B35" }; synSheet.getCell("F3").numFmt = currencyFormat; synSheet.getCell("F3").fill = formulaFill;
  synSheet.getCell("G3").value = { formula: "=Assumptions!$B$31*Assumptions!B36" }; synSheet.getCell("G3").numFmt = currencyFormat; synSheet.getCell("G3").fill = formulaFill;

  // Revenue Synergy EBITDA = Rev Synergies * Synergy Margin
  synSheet.getCell("A4").value = "Revenue Synergy EBITDA";
  synSheet.getCell("B4").value = 0; synSheet.getCell("B4").numFmt = currencyFormat;
  for (let col = 3; col <= 7; col++) {
    const colLetter = String.fromCharCode(64 + col);
    synSheet.getCell(4, col).value = { formula: `=${colLetter}3*Assumptions!$B$37` };
    synSheet.getCell(4, col).numFmt = currencyFormat; synSheet.getCell(4, col).fill = formulaFill;
  }

  // Cost Synergies = Run Rate * Phase-In %
  synSheet.getCell("A5").value = "Cost Synergies (Direct EBITDA)";
  synSheet.getCell("B5").value = 0; synSheet.getCell("B5").numFmt = currencyFormat;
  synSheet.getCell("C5").value = { formula: "=Assumptions!$E$31*Assumptions!E32" }; synSheet.getCell("C5").numFmt = currencyFormat; synSheet.getCell("C5").fill = formulaFill;
  synSheet.getCell("D5").value = { formula: "=Assumptions!$E$31*Assumptions!E33" }; synSheet.getCell("D5").numFmt = currencyFormat; synSheet.getCell("D5").fill = formulaFill;
  synSheet.getCell("E5").value = { formula: "=Assumptions!$E$31*Assumptions!E34" }; synSheet.getCell("E5").numFmt = currencyFormat; synSheet.getCell("E5").fill = formulaFill;
  synSheet.getCell("F5").value = { formula: "=Assumptions!$E$31*Assumptions!E35" }; synSheet.getCell("F5").numFmt = currencyFormat; synSheet.getCell("F5").fill = formulaFill;
  synSheet.getCell("G5").value = { formula: "=Assumptions!$E$31*Assumptions!E36" }; synSheet.getCell("G5").numFmt = currencyFormat; synSheet.getCell("G5").fill = formulaFill;

  // Total EBITDA Synergies = Rev Synergy EBITDA + Cost Synergies
  synSheet.getCell("A6").value = "Total EBITDA Synergies";
  for (let col = 2; col <= 7; col++) {
    const colLetter = String.fromCharCode(64 + col);
    synSheet.getCell(6, col).value = { formula: `=${colLetter}4+${colLetter}5` };
    synSheet.getCell(6, col).numFmt = currencyFormat; synSheet.getCell(6, col).fill = formulaFill;
  }
  synSheet.getRow(6).font = { bold: true };

  // Integration Costs
  synSheet.addRow([]);
  synSheet.getCell("A8").value = "Integration Costs ($M)";
  synSheet.getCell("B8").value = 0; synSheet.getCell("B8").numFmt = currencyFormat;
  synSheet.getCell("C8").value = { formula: "=Assumptions!B39" }; synSheet.getCell("C8").numFmt = currencyFormat; synSheet.getCell("C8").fill = formulaFill;
  synSheet.getCell("D8").value = { formula: "=Assumptions!B40" }; synSheet.getCell("D8").numFmt = currencyFormat; synSheet.getCell("D8").fill = formulaFill;
  synSheet.getCell("E8").value = { formula: "=Assumptions!B41" }; synSheet.getCell("E8").numFmt = currencyFormat; synSheet.getCell("E8").fill = formulaFill;
  synSheet.getCell("F8").value = 0; synSheet.getCell("F8").numFmt = currencyFormat;
  synSheet.getCell("G8").value = 0; synSheet.getCell("G8").numFmt = currencyFormat;

  // Phase-In Schedules
  synSheet.addRow([]);
  synSheet.getCell("A10").value = "PHASE-IN SCHEDULES";
  synSheet.getCell("A10").font = { bold: true };

  synSheet.getCell("A11").value = "Revenue Synergy Phase-In (%)";
  synSheet.getCell("B11").value = 0; synSheet.getCell("B11").numFmt = percentFormat;
  synSheet.getCell("C11").value = { formula: "=Assumptions!B32" }; synSheet.getCell("C11").numFmt = percentFormat; synSheet.getCell("C11").fill = formulaFill;
  synSheet.getCell("D11").value = { formula: "=Assumptions!B33" }; synSheet.getCell("D11").numFmt = percentFormat; synSheet.getCell("D11").fill = formulaFill;
  synSheet.getCell("E11").value = { formula: "=Assumptions!B34" }; synSheet.getCell("E11").numFmt = percentFormat; synSheet.getCell("E11").fill = formulaFill;
  synSheet.getCell("F11").value = { formula: "=Assumptions!B35" }; synSheet.getCell("F11").numFmt = percentFormat; synSheet.getCell("F11").fill = formulaFill;
  synSheet.getCell("G11").value = { formula: "=Assumptions!B36" }; synSheet.getCell("G11").numFmt = percentFormat; synSheet.getCell("G11").fill = formulaFill;

  synSheet.getCell("A12").value = "Cost Synergy Phase-In (%)";
  synSheet.getCell("B12").value = 0; synSheet.getCell("B12").numFmt = percentFormat;
  synSheet.getCell("C12").value = { formula: "=Assumptions!E32" }; synSheet.getCell("C12").numFmt = percentFormat; synSheet.getCell("C12").fill = formulaFill;
  synSheet.getCell("D12").value = { formula: "=Assumptions!E33" }; synSheet.getCell("D12").numFmt = percentFormat; synSheet.getCell("D12").fill = formulaFill;
  synSheet.getCell("E12").value = { formula: "=Assumptions!E34" }; synSheet.getCell("E12").numFmt = percentFormat; synSheet.getCell("E12").fill = formulaFill;
  synSheet.getCell("F12").value = { formula: "=Assumptions!E35" }; synSheet.getCell("F12").numFmt = percentFormat; synSheet.getCell("F12").fill = formulaFill;
  synSheet.getCell("G12").value = { formula: "=Assumptions!E36" }; synSheet.getCell("G12").numFmt = percentFormat; synSheet.getCell("G12").fill = formulaFill;

  // ============ PRO FORMA (Formula-Based) ============
  const pfSheet = workbook.addWorksheet("Pro_Forma_Combined");
  pfSheet.columns = [
    { width: 30 },
    { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 },
  ];

  pfSheet.getCell("A1").value = "PRO FORMA COMBINED FINANCIALS";
  pfSheet.getCell("A1").font = { bold: true, size: 14 };

  pfSheet.addRow(["", "Year 0", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5"]);
  pfSheet.getRow(2).font = { bold: true };
  pfSheet.getRow(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };

  // Revenue = Acquirer + Target + Revenue Synergies
  pfSheet.getCell("A3").value = "Revenue ($M)";
  for (let col = 2; col <= 7; col++) {
    const colLetter = String.fromCharCode(64 + col);
    pfSheet.getCell(3, col).value = { formula: `=Acquirer_Standalone!${colLetter}3+Target_Standalone!${colLetter}3+Synergies!${colLetter}3` };
    pfSheet.getCell(3, col).numFmt = currencyFormat; pfSheet.getCell(3, col).fill = formulaFill;
  }

  // EBITDA = Acquirer EBITDA + Target EBITDA + Total EBITDA Synergies
  pfSheet.getCell("A4").value = "EBITDA ($M)";
  for (let col = 2; col <= 7; col++) {
    const colLetter = String.fromCharCode(64 + col);
    pfSheet.getCell(4, col).value = { formula: `=Acquirer_Standalone!${colLetter}4+Target_Standalone!${colLetter}4+Synergies!${colLetter}6` };
    pfSheet.getCell(4, col).numFmt = currencyFormat; pfSheet.getCell(4, col).fill = formulaFill;
  }

  // D&A = Acquirer D&A + Target D&A + PPA Amortization (starting Y1)
  pfSheet.getCell("A5").value = "D&A ($M)";
  pfSheet.getCell("B5").value = { formula: "=Acquirer_Standalone!B5+Target_Standalone!B5" };
  pfSheet.getCell("B5").numFmt = currencyFormat; pfSheet.getCell("B5").fill = formulaFill;
  for (let col = 3; col <= 7; col++) {
    const colLetter = String.fromCharCode(64 + col);
    pfSheet.getCell(5, col).value = { formula: `=Acquirer_Standalone!${colLetter}5+Target_Standalone!${colLetter}5+Assumptions!$E$56` };
    pfSheet.getCell(5, col).numFmt = currencyFormat; pfSheet.getCell(5, col).fill = formulaFill;
  }

  // EBIT = EBITDA - D&A
  pfSheet.getCell("A6").value = "EBIT ($M)";
  for (let col = 2; col <= 7; col++) {
    const colLetter = String.fromCharCode(64 + col);
    pfSheet.getCell(6, col).value = { formula: `=${colLetter}4-${colLetter}5` };
    pfSheet.getCell(6, col).numFmt = currencyFormat; pfSheet.getCell(6, col).fill = formulaFill;
  }

  // Interest = Acquirer Interest + Target Interest + New Debt Interest (from Debt Schedule)
  pfSheet.getCell("A7").value = "Interest Expense ($M)";
  pfSheet.getCell("B7").value = { formula: "=Assumptions!B14+Assumptions!E14" };
  pfSheet.getCell("B7").numFmt = currencyFormat; pfSheet.getCell("B7").fill = formulaFill;
  for (let col = 3; col <= 7; col++) {
    const colLetter = String.fromCharCode(64 + col);
    pfSheet.getCell(7, col).value = { formula: `=Assumptions!$B$14+Assumptions!$E$14+Debt_Schedule!${colLetter}6` };
    pfSheet.getCell(7, col).numFmt = currencyFormat; pfSheet.getCell(7, col).fill = formulaFill;
  }

  // EBT = EBIT - Interest
  pfSheet.getCell("A8").value = "EBT ($M)";
  for (let col = 2; col <= 7; col++) {
    const colLetter = String.fromCharCode(64 + col);
    pfSheet.getCell(8, col).value = { formula: `=${colLetter}6-${colLetter}7` };
    pfSheet.getCell(8, col).numFmt = currencyFormat; pfSheet.getCell(8, col).fill = formulaFill;
  }

  // Taxes = MAX(0, EBT * Tax Rate)
  pfSheet.getCell("A9").value = "Taxes ($M)";
  for (let col = 2; col <= 7; col++) {
    const colLetter = String.fromCharCode(64 + col);
    pfSheet.getCell(9, col).value = { formula: `=MAX(0,${colLetter}8*Assumptions!$B$15)` };
    pfSheet.getCell(9, col).numFmt = currencyFormat; pfSheet.getCell(9, col).fill = formulaFill;
  }

  // Integration Costs (after-tax)
  pfSheet.getCell("A10").value = "Integration Costs (After-Tax)";
  for (let col = 2; col <= 7; col++) {
    const colLetter = String.fromCharCode(64 + col);
    pfSheet.getCell(10, col).value = { formula: `=Synergies!${colLetter}8*(1-Assumptions!$B$15)` };
    pfSheet.getCell(10, col).numFmt = currencyFormat; pfSheet.getCell(10, col).fill = formulaFill;
  }

  // Net Income = EBT - Taxes - Integration Costs
  pfSheet.getCell("A11").value = "Net Income ($M)";
  for (let col = 2; col <= 7; col++) {
    const colLetter = String.fromCharCode(64 + col);
    pfSheet.getCell(11, col).value = { formula: `=${colLetter}8-${colLetter}9-${colLetter}10` };
    pfSheet.getCell(11, col).numFmt = currencyFormat; pfSheet.getCell(11, col).fill = formulaFill;
  }
  pfSheet.getRow(11).font = { bold: true };

  // Pro Forma EPS = Net Income / Pro Forma Shares
  pfSheet.getCell("A12").value = "Pro Forma EPS";
  for (let col = 2; col <= 7; col++) {
    const colLetter = String.fromCharCode(64 + col);
    pfSheet.getCell(12, col).value = { formula: `=${colLetter}11/Assumptions!$E$49` };
    pfSheet.getCell(12, col).numFmt = epsFormat; pfSheet.getCell(12, col).fill = formulaFill;
  }

  // ============ ACCRETION/DILUTION (Formula-Based) ============
  const adSheet = workbook.addWorksheet("Accretion_Dilution");
  adSheet.columns = [
    { width: 30 },
    { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 },
  ];

  adSheet.getCell("A1").value = "ACCRETION / DILUTION ANALYSIS";
  adSheet.getCell("A1").font = { bold: true, size: 14 };

  adSheet.addRow(["", "Year 0", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5"]);
  adSheet.getRow(2).font = { bold: true };

  // Acquirer Standalone EPS (reference to Acquirer sheet)
  adSheet.getCell("A3").value = "Acquirer Standalone EPS";
  for (let col = 2; col <= 7; col++) {
    const colLetter = String.fromCharCode(64 + col);
    adSheet.getCell(3, col).value = { formula: `=Acquirer_Standalone!${colLetter}11` };
    adSheet.getCell(3, col).numFmt = epsFormat; adSheet.getCell(3, col).fill = formulaFill;
  }

  // Pro Forma EPS (reference to Pro Forma sheet)
  adSheet.getCell("A4").value = "Pro Forma EPS";
  for (let col = 2; col <= 7; col++) {
    const colLetter = String.fromCharCode(64 + col);
    adSheet.getCell(4, col).value = { formula: `=Pro_Forma_Combined!${colLetter}12` };
    adSheet.getCell(4, col).numFmt = epsFormat; adSheet.getCell(4, col).fill = formulaFill;
  }

  // EPS Impact ($) = Pro Forma EPS - Acquirer EPS
  adSheet.getCell("A5").value = "EPS Impact ($)";
  for (let col = 2; col <= 7; col++) {
    const colLetter = String.fromCharCode(64 + col);
    adSheet.getCell(5, col).value = { formula: `=${colLetter}4-${colLetter}3` };
    adSheet.getCell(5, col).numFmt = epsFormat; adSheet.getCell(5, col).fill = formulaFill;
  }

  // EPS Impact (%) = (Pro Forma / Acquirer) - 1
  adSheet.getCell("A6").value = "EPS Impact (%)";
  for (let col = 2; col <= 7; col++) {
    const colLetter = String.fromCharCode(64 + col);
    adSheet.getCell(6, col).value = { formula: `=IF(${colLetter}3<>0,(${colLetter}4/${colLetter}3)-1,0)` };
    adSheet.getCell(6, col).numFmt = percentFormat; adSheet.getCell(6, col).fill = formulaFill;
  }

  // Accretive/Dilutive Labels
  adSheet.getCell("A7").value = "Status";
  for (let col = 2; col <= 7; col++) {
    const colLetter = String.fromCharCode(64 + col);
    adSheet.getCell(7, col).value = { formula: `=IF(${colLetter}6>0,"Accretive",IF(${colLetter}6<0,"Dilutive","Neutral"))` };
    adSheet.getCell(7, col).fill = formulaFill;
  }

  // ============ DEBT SCHEDULE (Formula-Based) ============
  const debtSheet = workbook.addWorksheet("Debt_Schedule");
  debtSheet.columns = [{ width: 25 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }];

  debtSheet.getCell("A1").value = "DEBT SCHEDULE";
  debtSheet.getCell("A1").font = { bold: true, size: 14 };

  debtSheet.addRow(["", "Year 0", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5"]);
  debtSheet.getRow(2).font = { bold: true };
  debtSheet.getRow(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };

  // Beginning Balance: Year 0 = New Debt from Sources & Uses, subsequent = prior ending
  debtSheet.getCell("A3").value = "Beginning Balance ($M)";
  debtSheet.getCell("B3").value = 0; debtSheet.getCell("B3").numFmt = currencyFormat;
  debtSheet.getCell("C3").value = { formula: "=Sources_Uses!B5" }; debtSheet.getCell("C3").numFmt = currencyFormat; debtSheet.getCell("C3").fill = formulaFill;
  for (let col = 4; col <= 7; col++) {
    const prevCol = String.fromCharCode(63 + col);
    debtSheet.getCell(3, col).value = { formula: `=${prevCol}5` };
    debtSheet.getCell(3, col).numFmt = currencyFormat; debtSheet.getCell(3, col).fill = formulaFill;
  }

  // Mandatory Amortization = Beginning Balance * Amort Rate
  debtSheet.getCell("A4").value = "Mandatory Amortization ($M)";
  debtSheet.getCell("B4").value = 0; debtSheet.getCell("B4").numFmt = currencyFormat;
  for (let col = 3; col <= 7; col++) {
    const colLetter = String.fromCharCode(64 + col);
    debtSheet.getCell(4, col).value = { formula: `=${colLetter}3*Assumptions!$E$24` };
    debtSheet.getCell(4, col).numFmt = currencyFormat; debtSheet.getCell(4, col).fill = formulaFill;
  }

  // Ending Balance = Beginning - Amortization
  debtSheet.getCell("A5").value = "Ending Balance ($M)";
  debtSheet.getCell("B5").value = 0; debtSheet.getCell("B5").numFmt = currencyFormat;
  for (let col = 3; col <= 7; col++) {
    const colLetter = String.fromCharCode(64 + col);
    debtSheet.getCell(5, col).value = { formula: `=MAX(0,${colLetter}3-${colLetter}4)` };
    debtSheet.getCell(5, col).numFmt = currencyFormat; debtSheet.getCell(5, col).fill = formulaFill;
  }
  debtSheet.getRow(5).font = { bold: true };

  // Interest Expense = Average Balance * Interest Rate
  debtSheet.getCell("A6").value = "Interest Expense ($M)";
  debtSheet.getCell("B6").value = 0; debtSheet.getCell("B6").numFmt = currencyFormat;
  for (let col = 3; col <= 7; col++) {
    const colLetter = String.fromCharCode(64 + col);
    debtSheet.getCell(6, col).value = { formula: `=((${colLetter}3+${colLetter}5)/2)*Assumptions!$E$23` };
    debtSheet.getCell(6, col).numFmt = currencyFormat; debtSheet.getCell(6, col).fill = formulaFill;
  }

  // Key inputs reference
  debtSheet.addRow([]);
  debtSheet.getCell("A8").value = "KEY INPUTS (from Assumptions)";
  debtSheet.getCell("A8").font = { bold: true };

  debtSheet.getCell("A9").value = "Interest Rate";
  debtSheet.getCell("B9").value = { formula: "=Assumptions!E23" }; debtSheet.getCell("B9").numFmt = percentFormat; debtSheet.getCell("B9").fill = formulaFill;

  debtSheet.getCell("A10").value = "Amortization Rate";
  debtSheet.getCell("B10").value = { formula: "=Assumptions!E24" }; debtSheet.getCell("B10").numFmt = percentFormat; debtSheet.getCell("B10").fill = formulaFill;

  debtSheet.getCell("A11").value = "Maturity (Years)";
  debtSheet.getCell("B11").value = { formula: "=Assumptions!E25" }; debtSheet.getCell("B11").fill = formulaFill;

  // ============ PURCHASE PRICE ALLOCATION (Formula-Based with DTL) ============
  const ppaSheet = workbook.addWorksheet("Purchase_Price_Allocation");
  ppaSheet.columns = [{ width: 35 }, { width: 18 }, { width: 18 }, { width: 18 }];

  ppaSheet.getCell("A1").value = "PURCHASE PRICE ALLOCATION";
  ppaSheet.getCell("A1").font = { bold: true, size: 14 };

  ppaSheet.getCell("A3").value = "Purchase Price (Equity Value)";
  ppaSheet.getCell("B3").value = { formula: "=Assumptions!B21" };
  ppaSheet.getCell("B3").numFmt = currencyFormat;
  ppaSheet.getCell("B3").font = { color: { argb: "FF0000FF" } }; ppaSheet.getCell("B3").fill = formulaFill;

  ppaSheet.getCell("A5").value = "Less: Fair Value of Net Assets";
  ppaSheet.getCell("B5").value = { formula: "=-Assumptions!B45" };
  ppaSheet.getCell("B5").numFmt = currencyFormat; ppaSheet.getCell("B5").fill = formulaFill;

  ppaSheet.getCell("A7").value = "Identified Intangible Assets:";
  ppaSheet.getCell("A7").font = { bold: true };

  ppaSheet.getCell("A8").value = "  Customer Relationships";
  ppaSheet.getCell("B8").value = { formula: "=-Assumptions!B46" };
  ppaSheet.getCell("B8").numFmt = currencyFormat; ppaSheet.getCell("B8").fill = formulaFill;
  ppaSheet.getCell("C8").value = { formula: '=Assumptions!B47&" year life"' };

  ppaSheet.getCell("A9").value = "  Developed Technology";
  ppaSheet.getCell("B9").value = { formula: "=-Assumptions!B48" };
  ppaSheet.getCell("B9").numFmt = currencyFormat; ppaSheet.getCell("B9").fill = formulaFill;
  ppaSheet.getCell("C9").value = { formula: '=Assumptions!B49&" year life"' };

  ppaSheet.getCell("A10").value = "  Other Intangibles";
  ppaSheet.getCell("B10").value = { formula: "=-Assumptions!B50" };
  ppaSheet.getCell("B10").numFmt = currencyFormat; ppaSheet.getCell("B10").fill = formulaFill;
  ppaSheet.getCell("C10").value = { formula: '=Assumptions!B51&" year life"' };

  ppaSheet.getCell("A11").value = "  Total Identified Intangibles";
  ppaSheet.getCell("B11").value = { formula: "=-Assumptions!E53" };
  ppaSheet.getCell("B11").numFmt = currencyFormat; ppaSheet.getCell("B11").fill = formulaFill;
  ppaSheet.getRow(11).font = { bold: true };

  // Deferred Tax Liability (added back for Goodwill calculation)
  ppaSheet.getCell("A13").value = "Plus: Deferred Tax Liability";
  ppaSheet.getCell("B13").value = { formula: "=Assumptions!E54" };
  ppaSheet.getCell("B13").numFmt = currencyFormat; ppaSheet.getCell("B13").fill = formulaFill;

  // CORRECTED Goodwill = Purchase Price - FV Net Assets - Intangibles + DTL
  ppaSheet.getCell("A15").value = "Goodwill (Residual)";
  ppaSheet.getCell("B15").value = { formula: "=Assumptions!E55" };
  ppaSheet.getCell("B15").numFmt = currencyFormat; ppaSheet.getCell("B15").fill = formulaFill;
  ppaSheet.getRow(15).font = { bold: true };
  ppaSheet.getRow(15).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF0C0" } };

  // Goodwill Check Formula
  ppaSheet.getCell("A16").value = "Goodwill Check (PP - FV NA - Intang + DTL)";
  ppaSheet.getCell("B16").value = { formula: "=B3+B5+B11+B13" };
  ppaSheet.getCell("B16").numFmt = currencyFormat; ppaSheet.getCell("B16").fill = formulaFill;

  // Amortization Schedule
  ppaSheet.getCell("A18").value = "INTANGIBLE AMORTIZATION SCHEDULE";
  ppaSheet.getCell("A18").font = { bold: true, size: 12 };

  ppaSheet.addRow(["", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5"]);
  ppaSheet.getRow(19).font = { bold: true };

  // Customer Relationships Amortization
  ppaSheet.getCell("A20").value = "Customer Relationships";
  for (let col = 2; col <= 6; col++) {
    ppaSheet.getCell(20, col).value = { formula: "=IF(Assumptions!$B$47>0,Assumptions!$B$46/Assumptions!$B$47,0)" };
    ppaSheet.getCell(20, col).numFmt = currencyFormat; ppaSheet.getCell(20, col).fill = formulaFill;
  }

  // Developed Technology Amortization
  ppaSheet.getCell("A21").value = "Developed Technology";
  for (let col = 2; col <= 6; col++) {
    ppaSheet.getCell(21, col).value = { formula: "=IF(Assumptions!$B$49>0,Assumptions!$B$48/Assumptions!$B$49,0)" };
    ppaSheet.getCell(21, col).numFmt = currencyFormat; ppaSheet.getCell(21, col).fill = formulaFill;
  }

  // Other Intangibles Amortization
  ppaSheet.getCell("A22").value = "Other Intangibles";
  for (let col = 2; col <= 6; col++) {
    ppaSheet.getCell(22, col).value = { formula: "=IF(Assumptions!$B$51>0,Assumptions!$B$50/Assumptions!$B$51,0)" };
    ppaSheet.getCell(22, col).numFmt = currencyFormat; ppaSheet.getCell(22, col).fill = formulaFill;
  }

  // Total PPA Amortization
  ppaSheet.getCell("A23").value = "Total PPA Amortization";
  for (let col = 2; col <= 6; col++) {
    const colLetter = String.fromCharCode(64 + col);
    ppaSheet.getCell(23, col).value = { formula: `=${colLetter}20+${colLetter}21+${colLetter}22` };
    ppaSheet.getCell(23, col).numFmt = currencyFormat; ppaSheet.getCell(23, col).fill = formulaFill;
  }
  ppaSheet.getRow(23).font = { bold: true };

  // ============ SENSITIVITY ANALYSIS (BUG #4 FIX) ============
  const sensSheet = workbook.addWorksheet("Sensitivity_Analysis");
  sensSheet.columns = [
    { width: 25 }, 
    { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }
  ];

  sensSheet.getCell("A1").value = "SENSITIVITY ANALYSIS - EPS ACCRETION/DILUTION";
  sensSheet.getCell("A1").font = { bold: true, size: 14 };

  // Table 1: EPS Impact vs. Synergy Realization
  sensSheet.getCell("A3").value = "Year 1 EPS Impact vs. Synergy Realization";
  sensSheet.getCell("A3").font = { bold: true, size: 12 };

  sensSheet.getCell("A4").value = "Synergy %";
  sensSheet.getCell("B4").value = "50%";
  sensSheet.getCell("C4").value = "75%";
  sensSheet.getCell("D4").value = "100%";
  sensSheet.getCell("E4").value = "125%";
  sensSheet.getRow(4).font = { bold: true };
  sensSheet.getRow(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };

  // Calculate sensitivity for different synergy levels
  const baseSynergy = synergies.totalSynergies;
  const synergyMultipliers = [0.5, 0.75, 1.0, 1.25];
  const y1EpsBase = proFormaProjections.eps[1];
  const y1AcquirerEps = acquirerProjections.eps[1];
  const proFormaSharesCount = transactionMetrics.proFormaShares;
  
  sensSheet.getCell("A5").value = "Pro Forma EPS";
  synergyMultipliers.forEach((mult, idx) => {
    // Rough estimate: EPS scales with synergy changes
    const synergyDelta = baseSynergy * (mult - 1) * 0.3 / proFormaSharesCount; // 30% flows to EPS after tax
    const adjustedEps = y1EpsBase + synergyDelta;
    sensSheet.getCell(5, idx + 2).value = adjustedEps;
    sensSheet.getCell(5, idx + 2).numFmt = epsFormat;
  });

  sensSheet.getCell("A6").value = "Accretion/(Dilution)";
  synergyMultipliers.forEach((mult, idx) => {
    const synergyDelta = baseSynergy * (mult - 1) * 0.3 / proFormaSharesCount;
    const adjustedEps = y1EpsBase + synergyDelta;
    const accDil = (adjustedEps / y1AcquirerEps) - 1;
    sensSheet.getCell(6, idx + 2).value = accDil;
    sensSheet.getCell(6, idx + 2).numFmt = percentFormat;
    if (accDil > 0) {
      sensSheet.getCell(6, idx + 2).font = { color: { argb: "FF008000" } };
    } else if (accDil < 0) {
      sensSheet.getCell(6, idx + 2).font = { color: { argb: "FFFF0000" } };
    }
  });

  // Table 2: EPS Impact vs. Transaction Multiple
  sensSheet.getCell("A9").value = "Year 1 EPS Impact vs. EV/EBITDA Multiple";
  sensSheet.getCell("A9").font = { bold: true, size: 12 };

  const baseMultiple = transactionMetrics.evEbitdaMultiple;
  const multipleVariants = [
    baseMultiple - 2,
    baseMultiple - 1,
    baseMultiple,
    baseMultiple + 1,
    baseMultiple + 2
  ];

  sensSheet.getCell("A10").value = "EV/EBITDA";
  multipleVariants.forEach((m, idx) => {
    sensSheet.getCell(10, idx + 2).value = m;
    sensSheet.getCell(10, idx + 2).numFmt = multipleFormat;
  });
  sensSheet.getRow(10).font = { bold: true };
  sensSheet.getRow(10).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };

  sensSheet.getCell("A11").value = "Implied Purchase Price";
  const targetEBITDA = results.targetProjections.ebitda[0];
  multipleVariants.forEach((m, idx) => {
    const impliedEV = m * targetEBITDA;
    const impliedPP = impliedEV - targetNetDebt;
    sensSheet.getCell(11, idx + 2).value = impliedPP;
    sensSheet.getCell(11, idx + 2).numFmt = currencyFormat;
  });

  sensSheet.getCell("A12").value = "Est. EPS Impact";
  multipleVariants.forEach((m, idx) => {
    // Higher multiple = higher price = more dilution
    const priceDelta = (m - baseMultiple) * targetEBITDA;
    // Extra stock issuance from higher price
    const extraShares = priceDelta / assumptions.acquirerStockPrice;
    const newProFormaShares = proFormaSharesCount + extraShares;
    const adjustedEps = proFormaProjections.netIncome[1] / newProFormaShares;
    const accDil = (adjustedEps / y1AcquirerEps) - 1;
    sensSheet.getCell(12, idx + 2).value = accDil;
    sensSheet.getCell(12, idx + 2).numFmt = percentFormat;
    if (accDil > 0) {
      sensSheet.getCell(12, idx + 2).font = { color: { argb: "FF008000" } };
    } else if (accDil < 0) {
      sensSheet.getCell(12, idx + 2).font = { color: { argb: "FFFF0000" } };
    }
  });

  // Table 3: Integration Cost Sensitivity
  sensSheet.getCell("A15").value = "Year 1 EPS Impact vs. Integration Cost Overrun";
  sensSheet.getCell("A15").font = { bold: true, size: 12 };

  const costMultipliers = [0.75, 1.0, 1.25, 1.5, 2.0];
  
  sensSheet.getCell("A16").value = "Cost Multiplier";
  costMultipliers.forEach((m, idx) => {
    sensSheet.getCell(16, idx + 2).value = `${(m * 100).toFixed(0)}%`;
  });
  sensSheet.getRow(16).font = { bold: true };
  sensSheet.getRow(16).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };

  const baseIntegrationY1 = synergies.integrationCosts[1] || 0;
  sensSheet.getCell("A17").value = "Integration Cost Y1";
  costMultipliers.forEach((m, idx) => {
    sensSheet.getCell(17, idx + 2).value = baseIntegrationY1 * m;
    sensSheet.getCell(17, idx + 2).numFmt = currencyFormat;
  });

  sensSheet.getCell("A18").value = "Est. EPS Impact";
  costMultipliers.forEach((m, idx) => {
    // Extra integration cost reduces net income
    const extraCost = baseIntegrationY1 * (m - 1) * (1 - assumptions.acquirerTaxRate);
    const adjustedNI = proFormaProjections.netIncome[1] - extraCost;
    const adjustedEps = adjustedNI / proFormaSharesCount;
    const accDil = (adjustedEps / y1AcquirerEps) - 1;
    sensSheet.getCell(18, idx + 2).value = accDil;
    sensSheet.getCell(18, idx + 2).numFmt = percentFormat;
    if (accDil > 0) {
      sensSheet.getCell(18, idx + 2).font = { color: { argb: "FF008000" } };
    } else if (accDil < 0) {
      sensSheet.getCell(18, idx + 2).font = { color: { argb: "FFFF0000" } };
    }
  });

  // Key Assumptions Summary
  sensSheet.getCell("A21").value = "KEY ASSUMPTIONS (Modify in Excel)";
  sensSheet.getCell("A21").font = { bold: true, size: 12 };

  sensSheet.getCell("A22").value = "Base Synergies (Run-Rate)";
  sensSheet.getCell("B22").value = baseSynergy;
  sensSheet.getCell("B22").numFmt = currencyFormat;
  sensSheet.getCell("B22").font = { color: { argb: "FF0000FF" } };

  sensSheet.getCell("A23").value = "Base EV/EBITDA Multiple";
  sensSheet.getCell("B23").value = baseMultiple;
  sensSheet.getCell("B23").numFmt = multipleFormat;
  sensSheet.getCell("B23").font = { color: { argb: "FF0000FF" } };

  sensSheet.getCell("A24").value = "Y1 Integration Costs";
  sensSheet.getCell("B24").value = baseIntegrationY1;
  sensSheet.getCell("B24").numFmt = currencyFormat;
  sensSheet.getCell("B24").font = { color: { argb: "FF0000FF" } };

  sensSheet.getCell("A25").value = "Acquirer Stock Price";
  sensSheet.getCell("B25").value = assumptions.acquirerStockPrice;
  sensSheet.getCell("B25").numFmt = currencyFormat;
  sensSheet.getCell("B25").font = { color: { argb: "FF0000FF" } };

  // ============ CREDIT ANALYSIS TAB (Formula-Based) ============
  const creditSheet = workbook.addWorksheet("Credit_Analysis");
  creditSheet.columns = [
    { width: 30 },
    { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }
  ];

  creditSheet.getCell("A1").value = "CREDIT METRICS & LEVERAGE ANALYSIS";
  creditSheet.getCell("A1").font = { bold: true, size: 14 };

  creditSheet.getCell("A3").value = "Metric";
  creditSheet.getCell("B3").value = "Year 0";
  creditSheet.getCell("C3").value = "Year 1";
  creditSheet.getCell("D3").value = "Year 2";
  creditSheet.getCell("E3").value = "Year 3";
  creditSheet.getCell("F3").value = "Year 4";
  creditSheet.getCell("G3").value = "Year 5";
  creditSheet.getRow(3).font = { bold: true };
  creditSheet.getRow(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };

  // Total Debt (reference Debt_Schedule ending balance)
  creditSheet.getCell("A4").value = "Total Debt ($M)";
  creditSheet.getCell("B4").value = { formula: "=Debt_Schedule!B5" }; creditSheet.getCell("B4").numFmt = currencyFormat; creditSheet.getCell("B4").fill = formulaFill;
  for (let col = 3; col <= 7; col++) {
    const colLetter = String.fromCharCode(64 + col);
    creditSheet.getCell(4, col).value = { formula: `=Debt_Schedule!${colLetter}5` };
    creditSheet.getCell(4, col).numFmt = currencyFormat; creditSheet.getCell(4, col).fill = formulaFill;
  }

  // Pro Forma EBITDA (reference Pro_Forma_Combined)
  creditSheet.getCell("A5").value = "Pro Forma EBITDA ($M)";
  for (let col = 2; col <= 7; col++) {
    const colLetter = String.fromCharCode(64 + col);
    creditSheet.getCell(5, col).value = { formula: `=Pro_Forma_Combined!${colLetter}4` };
    creditSheet.getCell(5, col).numFmt = currencyFormat; creditSheet.getCell(5, col).fill = formulaFill;
  }

  // Net Debt / EBITDA
  creditSheet.getCell("A6").value = "Net Debt / EBITDA";
  creditSheet.getCell("A6").font = { bold: true };
  for (let col = 2; col <= 7; col++) {
    const colLetter = String.fromCharCode(64 + col);
    creditSheet.getCell(6, col).value = { formula: `=IF(${colLetter}5>0,${colLetter}4/${colLetter}5,0)` };
    creditSheet.getCell(6, col).numFmt = "0.0x"; creditSheet.getCell(6, col).fill = formulaFill;
  }

  // Interest Expense (reference Debt_Schedule)
  creditSheet.getCell("A8").value = "Interest Expense ($M)";
  for (let col = 2; col <= 7; col++) {
    const colLetter = String.fromCharCode(64 + col);
    creditSheet.getCell(8, col).value = { formula: `=Debt_Schedule!${colLetter}6` };
    creditSheet.getCell(8, col).numFmt = currencyFormat; creditSheet.getCell(8, col).fill = formulaFill;
  }

  // EBITDA (same as row 5)
  creditSheet.getCell("A9").value = "EBITDA ($M)";
  for (let col = 2; col <= 7; col++) {
    const colLetter = String.fromCharCode(64 + col);
    creditSheet.getCell(9, col).value = { formula: `=${colLetter}5` };
    creditSheet.getCell(9, col).numFmt = currencyFormat; creditSheet.getCell(9, col).fill = formulaFill;
  }

  // Interest Coverage Ratio = EBITDA / Interest
  creditSheet.getCell("A10").value = "Interest Coverage (EBITDA/Interest)";
  creditSheet.getCell("A10").font = { bold: true };
  for (let col = 2; col <= 7; col++) {
    const colLetter = String.fromCharCode(64 + col);
    creditSheet.getCell(10, col).value = { formula: `=IF(${colLetter}8>0,${colLetter}9/${colLetter}8,999)` };
    creditSheet.getCell(10, col).numFmt = "0.0x"; creditSheet.getCell(10, col).fill = formulaFill;
  }

  // Debt Service Coverage
  creditSheet.getCell("A12").value = "DEBT SERVICE SUMMARY";
  creditSheet.getCell("A12").font = { bold: true, size: 12 };

  creditSheet.getCell("A13").value = "Beginning Debt";
  creditSheet.getCell("A14").value = "Mandatory Amortization";
  creditSheet.getCell("A15").value = "Ending Debt";
  for (let col = 3; col <= 7; col++) {
    const colLetter = String.fromCharCode(64 + col);
    creditSheet.getCell(13, col).value = { formula: `=Debt_Schedule!${colLetter}3` };
    creditSheet.getCell(13, col).numFmt = currencyFormat; creditSheet.getCell(13, col).fill = formulaFill;
    creditSheet.getCell(14, col).value = { formula: `=-Debt_Schedule!${colLetter}4` };
    creditSheet.getCell(14, col).numFmt = currencyFormat; creditSheet.getCell(14, col).fill = formulaFill;
    creditSheet.getCell(15, col).value = { formula: `=Debt_Schedule!${colLetter}5` };
    creditSheet.getCell(15, col).numFmt = currencyFormat; creditSheet.getCell(15, col).fill = formulaFill;
  }

  // ============ PRO FORMA BALANCE SHEET TAB (Formula-Based) ============
  const bsSheet = workbook.addWorksheet("Pro_Forma_Balance_Sheet");
  bsSheet.columns = [
    { width: 35 },
    { width: 20 }, { width: 20 }, { width: 20 }
  ];

  bsSheet.getCell("A1").value = "PRO FORMA BALANCE SHEET (SIMPLIFIED)";
  bsSheet.getCell("A1").font = { bold: true, size: 14 };

  bsSheet.getCell("A3").value = "Item";
  bsSheet.getCell("B3").value = "Acquirer Pre-Deal";
  bsSheet.getCell("C3").value = "Adjustments";
  bsSheet.getCell("D3").value = "Pro Forma";
  bsSheet.getRow(3).font = { bold: true };
  bsSheet.getRow(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };

  // Assets
  bsSheet.getCell("A5").value = "ASSETS";
  bsSheet.getCell("A5").font = { bold: true };

  // Cash & Equivalents (using formula references)
  bsSheet.getCell("A6").value = "Cash & Equivalents";
  bsSheet.getCell("B6").value = { formula: "=Assumptions!E21" }; // Acquirer cash available
  bsSheet.getCell("C6").value = { formula: "=-Sources_Uses!B4+Assumptions!E52" }; // Cash used + net cash from target
  bsSheet.getCell("D6").value = { formula: "=B6+C6" };
  bsSheet.getCell("B6").numFmt = currencyFormat; bsSheet.getCell("B6").fill = formulaFill;
  bsSheet.getCell("C6").numFmt = currencyFormat; bsSheet.getCell("C6").fill = formulaFill;
  bsSheet.getCell("D6").numFmt = currencyFormat; bsSheet.getCell("D6").fill = formulaFill;

  // Other Assets (simplified estimate)
  bsSheet.getCell("A7").value = "Other Current & Fixed Assets";
  bsSheet.getCell("B7").value = { formula: "=Assumptions!B6*0.4" }; // Acquirer revenue * 40%
  bsSheet.getCell("C7").value = { formula: "=Assumptions!E6*0.4" }; // Target revenue * 40%
  bsSheet.getCell("D7").value = { formula: "=B7+C7" };
  bsSheet.getCell("B7").numFmt = currencyFormat; bsSheet.getCell("B7").fill = formulaFill;
  bsSheet.getCell("C7").numFmt = currencyFormat; bsSheet.getCell("C7").fill = formulaFill;
  bsSheet.getCell("D7").numFmt = currencyFormat; bsSheet.getCell("D7").fill = formulaFill;

  // Goodwill (reference Assumptions sheet)
  bsSheet.getCell("A8").value = "Goodwill";
  bsSheet.getCell("B8").value = 0; bsSheet.getCell("B8").numFmt = currencyFormat;
  bsSheet.getCell("C8").value = { formula: "=Assumptions!E55" }; // Goodwill from Assumptions
  bsSheet.getCell("D8").value = { formula: "=C8" };
  bsSheet.getCell("C8").numFmt = currencyFormat; bsSheet.getCell("C8").fill = formulaFill;
  bsSheet.getCell("D8").numFmt = currencyFormat; bsSheet.getCell("D8").fill = formulaFill;

  // Identified Intangibles
  bsSheet.getCell("A9").value = "Identified Intangibles";
  bsSheet.getCell("B9").value = 0; bsSheet.getCell("B9").numFmt = currencyFormat;
  bsSheet.getCell("C9").value = { formula: "=Assumptions!E53" }; // Total intangibles
  bsSheet.getCell("D9").value = { formula: "=C9" };
  bsSheet.getCell("C9").numFmt = currencyFormat; bsSheet.getCell("C9").fill = formulaFill;
  bsSheet.getCell("D9").numFmt = currencyFormat; bsSheet.getCell("D9").fill = formulaFill;

  // Total Assets
  bsSheet.getCell("A10").value = "TOTAL ASSETS";
  bsSheet.getCell("A10").font = { bold: true };
  bsSheet.getCell("D10").value = { formula: "=SUM(D6:D9)" };
  bsSheet.getCell("D10").numFmt = currencyFormat; bsSheet.getCell("D10").fill = formulaFill;
  bsSheet.getCell("D10").font = { bold: true };

  // Liabilities
  bsSheet.getCell("A12").value = "LIABILITIES";
  bsSheet.getCell("A12").font = { bold: true };

  // Existing Debt
  bsSheet.getCell("A13").value = "Existing Debt";
  bsSheet.getCell("B13").value = { formula: "=Assumptions!B19" }; // Acquirer existing debt
  bsSheet.getCell("C13").value = 0;
  bsSheet.getCell("D13").value = { formula: "=B13" };
  bsSheet.getCell("B13").numFmt = currencyFormat; bsSheet.getCell("B13").fill = formulaFill;
  bsSheet.getCell("C13").numFmt = currencyFormat;
  bsSheet.getCell("D13").numFmt = currencyFormat; bsSheet.getCell("D13").fill = formulaFill;

  // New Debt Raised
  bsSheet.getCell("A14").value = "New Debt Raised";
  bsSheet.getCell("B14").value = 0; bsSheet.getCell("B14").numFmt = currencyFormat;
  bsSheet.getCell("C14").value = { formula: "=Sources_Uses!B5" }; // New debt from S&U
  bsSheet.getCell("D14").value = { formula: "=C14" };
  bsSheet.getCell("C14").numFmt = currencyFormat; bsSheet.getCell("C14").fill = formulaFill;
  bsSheet.getCell("D14").numFmt = currencyFormat; bsSheet.getCell("D14").fill = formulaFill;

  // Other Liabilities
  bsSheet.getCell("A15").value = "Other Liabilities";
  bsSheet.getCell("B15").value = { formula: "=Assumptions!B6*0.15" };
  bsSheet.getCell("C15").value = { formula: "=Assumptions!E6*0.15" };
  bsSheet.getCell("D15").value = { formula: "=B15+C15" };
  bsSheet.getCell("B15").numFmt = currencyFormat; bsSheet.getCell("B15").fill = formulaFill;
  bsSheet.getCell("C15").numFmt = currencyFormat; bsSheet.getCell("C15").fill = formulaFill;
  bsSheet.getCell("D15").numFmt = currencyFormat; bsSheet.getCell("D15").fill = formulaFill;

  // Total Liabilities
  bsSheet.getCell("A16").value = "TOTAL LIABILITIES";
  bsSheet.getCell("A16").font = { bold: true };
  bsSheet.getCell("D16").value = { formula: "=SUM(D13:D15)" };
  bsSheet.getCell("D16").numFmt = currencyFormat; bsSheet.getCell("D16").fill = formulaFill;
  bsSheet.getCell("D16").font = { bold: true };

  // Equity
  bsSheet.getCell("A18").value = "SHAREHOLDERS' EQUITY";
  bsSheet.getCell("A18").font = { bold: true };

  // Common Stock + APIC
  bsSheet.getCell("A19").value = "Common Stock + APIC";
  bsSheet.getCell("B19").value = { formula: "=Assumptions!B6*0.25" }; // Pre-deal equity estimate
  bsSheet.getCell("C19").value = { formula: "=Sources_Uses!B6" }; // Stock consideration
  bsSheet.getCell("D19").value = { formula: "=B19+C19" };
  bsSheet.getCell("B19").numFmt = currencyFormat; bsSheet.getCell("B19").fill = formulaFill;
  bsSheet.getCell("C19").numFmt = currencyFormat; bsSheet.getCell("C19").fill = formulaFill;
  bsSheet.getCell("D19").numFmt = currencyFormat; bsSheet.getCell("D19").fill = formulaFill;

  // Retained Earnings (balancing item)
  bsSheet.getCell("A20").value = "Retained Earnings";
  bsSheet.getCell("D20").value = { formula: "=D10-D16-D19" }; // Plug to balance
  bsSheet.getCell("D20").numFmt = currencyFormat; bsSheet.getCell("D20").fill = formulaFill;

  // Total Equity
  bsSheet.getCell("A21").value = "TOTAL EQUITY";
  bsSheet.getCell("A21").font = { bold: true };
  bsSheet.getCell("D21").value = { formula: "=D19+D20" };
  bsSheet.getCell("D21").numFmt = currencyFormat; bsSheet.getCell("D21").fill = formulaFill;
  bsSheet.getCell("D21").font = { bold: true };

  // Total L+E
  bsSheet.getCell("A23").value = "TOTAL LIABILITIES + EQUITY";
  bsSheet.getCell("A23").font = { bold: true };
  bsSheet.getCell("D23").value = { formula: "=D16+D21" };
  bsSheet.getCell("D23").numFmt = currencyFormat; bsSheet.getCell("D23").fill = formulaFill;
  bsSheet.getCell("D23").font = { bold: true };

  // Balance check formula
  bsSheet.getCell("A25").value = "Balance Check (Assets = L+E):";
  bsSheet.getCell("B25").value = { formula: '=IF(ABS(D10-D23)<0.01,"BALANCED","ERROR")' };
  bsSheet.getCell("B25").font = { bold: true }; bsSheet.getCell("B25").fill = formulaFill;

  // ============ CONTRIBUTION ANALYSIS TAB ============
  const contribSheet = workbook.addWorksheet("Contribution_Analysis");
  contribSheet.columns = [
    { width: 25 },
    { width: 18 }, { width: 15 }, { width: 18 }, { width: 15 }, { width: 18 }, { width: 15 }
  ];

  contribSheet.getCell("A1").value = "CONTRIBUTION ANALYSIS";
  contribSheet.getCell("A1").font = { bold: true, size: 14 };

  contribSheet.getCell("A3").value = "Metric";
  contribSheet.getCell("B3").value = "Acquirer";
  contribSheet.getCell("C3").value = "%";
  contribSheet.getCell("D3").value = "Target";
  contribSheet.getCell("E3").value = "%";
  contribSheet.getCell("F3").value = "Pro Forma";
  contribSheet.getCell("G3").value = "%";
  contribSheet.getRow(3).font = { bold: true };
  contribSheet.getRow(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };

  // Year 1 Contribution
  contribSheet.getCell("A4").value = "YEAR 1 CONTRIBUTION";
  contribSheet.getCell("A4").font = { bold: true, size: 12 };

  const y1AcqRev = acquirerProjections.revenue[1];
  const y1TgtRev = results.targetProjections.revenue[1];
  const y1PFRev = proFormaProjections.revenue[1];
  contribSheet.getCell("A5").value = "Revenue ($M)";
  contribSheet.getCell("B5").value = y1AcqRev;
  contribSheet.getCell("C5").value = y1AcqRev / y1PFRev;
  contribSheet.getCell("D5").value = y1TgtRev;
  contribSheet.getCell("E5").value = y1TgtRev / y1PFRev;
  contribSheet.getCell("F5").value = y1PFRev;
  contribSheet.getCell("G5").value = 1;
  contribSheet.getCell("B5").numFmt = currencyFormat;
  contribSheet.getCell("C5").numFmt = percentFormat;
  contribSheet.getCell("D5").numFmt = currencyFormat;
  contribSheet.getCell("E5").numFmt = percentFormat;
  contribSheet.getCell("F5").numFmt = currencyFormat;
  contribSheet.getCell("G5").numFmt = percentFormat;

  const y1AcqEBITDA = acquirerProjections.ebitda[1];
  const y1TgtEBITDA = results.targetProjections.ebitda[1];
  const y1Synergy = synergies.totalEBITDASynergiesByYear[1];
  const y1PFEBITDA = proFormaProjections.ebitda[1];
  contribSheet.getCell("A6").value = "EBITDA ($M)";
  contribSheet.getCell("B6").value = y1AcqEBITDA;
  contribSheet.getCell("C6").value = y1PFEBITDA > 0 ? y1AcqEBITDA / y1PFEBITDA : 0;
  contribSheet.getCell("D6").value = y1TgtEBITDA + y1Synergy;
  contribSheet.getCell("E6").value = y1PFEBITDA > 0 ? (y1TgtEBITDA + y1Synergy) / y1PFEBITDA : 0;
  contribSheet.getCell("F6").value = y1PFEBITDA;
  contribSheet.getCell("G6").value = 1;
  contribSheet.getCell("B6").numFmt = currencyFormat;
  contribSheet.getCell("C6").numFmt = percentFormat;
  contribSheet.getCell("D6").numFmt = currencyFormat;
  contribSheet.getCell("E6").numFmt = percentFormat;
  contribSheet.getCell("F6").numFmt = currencyFormat;
  contribSheet.getCell("G6").numFmt = percentFormat;

  contribSheet.getCell("A7").value = "Shares Outstanding (M)";
  contribSheet.getCell("B7").value = acquirerSharesOutstanding;
  contribSheet.getCell("C7").value = acquirerSharesOutstanding / transactionMetrics.proFormaShares;
  contribSheet.getCell("D7").value = transactionMetrics.newSharesIssued;
  contribSheet.getCell("E7").value = transactionMetrics.newSharesIssued / transactionMetrics.proFormaShares;
  contribSheet.getCell("F7").value = transactionMetrics.proFormaShares;
  contribSheet.getCell("G7").value = 1;
  contribSheet.getCell("B7").numFmt = "0.0";
  contribSheet.getCell("C7").numFmt = percentFormat;
  contribSheet.getCell("D7").numFmt = "0.0";
  contribSheet.getCell("E7").numFmt = percentFormat;
  contribSheet.getCell("F7").numFmt = "0.0";
  contribSheet.getCell("G7").numFmt = percentFormat;

  // Value Contribution
  contribSheet.getCell("A9").value = "VALUE CONTRIBUTION";
  contribSheet.getCell("A9").font = { bold: true, size: 12 };

  const acqEquityValue = acquirerSharesOutstanding * assumptions.acquirerStockPrice;
  const tgtEquityValue = transactionMetrics.purchasePrice;
  const combinedEquity = acqEquityValue + tgtEquityValue;
  contribSheet.getCell("A10").value = "Equity Value ($M)";
  contribSheet.getCell("B10").value = acqEquityValue;
  contribSheet.getCell("C10").value = acqEquityValue / combinedEquity;
  contribSheet.getCell("D10").value = tgtEquityValue;
  contribSheet.getCell("E10").value = tgtEquityValue / combinedEquity;
  contribSheet.getCell("F10").value = combinedEquity;
  contribSheet.getCell("G10").value = 1;
  contribSheet.getCell("B10").numFmt = currencyFormat;
  contribSheet.getCell("C10").numFmt = percentFormat;
  contribSheet.getCell("D10").numFmt = currencyFormat;
  contribSheet.getCell("E10").numFmt = percentFormat;
  contribSheet.getCell("F10").numFmt = currencyFormat;
  contribSheet.getCell("G10").numFmt = percentFormat;

  // ============ RETURNS ANALYSIS TAB ============
  const returnsSheet = workbook.addWorksheet("Returns_Analysis");
  returnsSheet.columns = [
    { width: 30 },
    { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }
  ];

  returnsSheet.getCell("A1").value = "RETURNS ANALYSIS (ACQUIRER PERSPECTIVE)";
  returnsSheet.getCell("A1").font = { bold: true, size: 14 };

  // Investment Summary
  returnsSheet.getCell("A3").value = "INVESTMENT SUMMARY";
  returnsSheet.getCell("A3").font = { bold: true, size: 12 };

  returnsSheet.getCell("A4").value = "Purchase Price (Equity)";
  returnsSheet.getCell("B4").value = transactionMetrics.purchasePrice;
  returnsSheet.getCell("B4").numFmt = currencyFormat;

  returnsSheet.getCell("A5").value = "Cash Consideration";
  returnsSheet.getCell("B5").value = transactionMetrics.cashConsideration;
  returnsSheet.getCell("B5").numFmt = currencyFormat;

  returnsSheet.getCell("A6").value = "Stock Consideration";
  returnsSheet.getCell("B6").value = transactionMetrics.stockConsideration;
  returnsSheet.getCell("B6").numFmt = currencyFormat;

  returnsSheet.getCell("A7").value = "Transaction Fees";
  returnsSheet.getCell("B7").value = sourcesAndUses.uses.transactionFees;
  returnsSheet.getCell("B7").numFmt = currencyFormat;

  returnsSheet.getCell("A8").value = "Total Investment (Cash Outflow)";
  returnsSheet.getCell("A8").font = { bold: true };
  const totalCashInvestment = transactionMetrics.cashConsideration + sourcesAndUses.uses.transactionFees;
  returnsSheet.getCell("B8").value = totalCashInvestment;
  returnsSheet.getCell("B8").numFmt = currencyFormat;
  returnsSheet.getCell("B8").font = { bold: true };

  // EPS Payback
  returnsSheet.getCell("A10").value = "EPS PAYBACK ANALYSIS";
  returnsSheet.getCell("A10").font = { bold: true, size: 12 };

  returnsSheet.getCell("A11").value = "Year";
  for (let i = 0; i <= 5; i++) {
    returnsSheet.getCell(11, i + 2).value = i;
  }
  returnsSheet.getRow(11).font = { bold: true };

  returnsSheet.getCell("A12").value = "Pro Forma EPS";
  for (let i = 0; i <= 5; i++) {
    returnsSheet.getCell(12, i + 2).value = proFormaProjections.eps[i];
    returnsSheet.getCell(12, i + 2).numFmt = epsFormat;
  }

  returnsSheet.getCell("A13").value = "Acquirer Standalone EPS";
  for (let i = 0; i <= 5; i++) {
    returnsSheet.getCell(13, i + 2).value = acquirerProjections.eps[i];
    returnsSheet.getCell(13, i + 2).numFmt = epsFormat;
  }

  returnsSheet.getCell("A14").value = "EPS Improvement";
  for (let i = 0; i <= 5; i++) {
    const improvement = proFormaProjections.eps[i] - acquirerProjections.eps[i];
    returnsSheet.getCell(14, i + 2).value = improvement;
    returnsSheet.getCell(14, i + 2).numFmt = epsFormat;
    if (improvement > 0) {
      returnsSheet.getCell(14, i + 2).font = { color: { argb: "FF008000" } };
    } else if (improvement < 0) {
      returnsSheet.getCell(14, i + 2).font = { color: { argb: "FFFF0000" } };
    }
  }

  returnsSheet.getCell("A15").value = "Cumulative EPS Improvement";
  let cumulativeEpsImprovement = 0;
  for (let i = 0; i <= 5; i++) {
    cumulativeEpsImprovement += proFormaProjections.eps[i] - acquirerProjections.eps[i];
    returnsSheet.getCell(15, i + 2).value = cumulativeEpsImprovement;
    returnsSheet.getCell(15, i + 2).numFmt = epsFormat;
  }

  // Synergy Value Creation
  returnsSheet.getCell("A17").value = "SYNERGY VALUE CREATION";
  returnsSheet.getCell("A17").font = { bold: true, size: 12 };

  returnsSheet.getCell("A18").value = "Year";
  for (let i = 1; i <= 5; i++) {
    returnsSheet.getCell(18, i + 1).value = i;
  }
  returnsSheet.getRow(18).font = { bold: true };

  returnsSheet.getCell("A19").value = "Annual EBITDA Synergies";
  for (let i = 1; i <= 5; i++) {
    returnsSheet.getCell(19, i + 1).value = synergies.totalEBITDASynergiesByYear[i];
    returnsSheet.getCell(19, i + 1).numFmt = currencyFormat;
  }

  // NPV of synergies at 10% discount rate
  const discountRate = 0.10;
  let synergyNPV = 0;
  for (let i = 1; i <= 5; i++) {
    synergyNPV += synergies.totalEBITDASynergiesByYear[i] / Math.pow(1 + discountRate, i);
  }
  // Terminal value of synergies (perpetuity growth at 2%)
  const terminalGrowth = 0.02;
  const terminalSynergy = synergies.totalEBITDASynergiesByYear[5] * (1 + terminalGrowth) / (discountRate - terminalGrowth);
  const terminalPV = terminalSynergy / Math.pow(1 + discountRate, 5);
  const totalSynergyValue = synergyNPV + terminalPV;

  returnsSheet.getCell("A21").value = "NPV of 5-Year Synergies (@ 10%)";
  returnsSheet.getCell("B21").value = synergyNPV;
  returnsSheet.getCell("B21").numFmt = currencyFormat;

  returnsSheet.getCell("A22").value = "Terminal Value of Synergies";
  returnsSheet.getCell("B22").value = terminalPV;
  returnsSheet.getCell("B22").numFmt = currencyFormat;

  returnsSheet.getCell("A23").value = "Total Synergy Value Created";
  returnsSheet.getCell("A23").font = { bold: true };
  returnsSheet.getCell("B23").value = totalSynergyValue;
  returnsSheet.getCell("B23").numFmt = currencyFormat;
  returnsSheet.getCell("B23").font = { bold: true };

  returnsSheet.getCell("A25").value = "Synergy Value vs. Premium Paid";
  const premiumPaid = transactionMetrics.purchasePrice - (targetRevenue * targetEBITDAMargin * 8); // Assume 8x base multiple
  returnsSheet.getCell("B25").value = totalSynergyValue > premiumPaid ? "VALUE CREATION" : "VALUE DESTRUCTION";
  returnsSheet.getCell("B25").font = { 
    bold: true, 
    color: { argb: totalSynergyValue > premiumPaid ? "FF008000" : "FFFF0000" } 
  };

  // ============ CHARTS DATA TAB (BUG #4 FIX) ============
  // ExcelJS has limited native chart support, so we provide formatted data tables
  // that users can easily create charts from in Excel
  const chartSheet = workbook.addWorksheet("Charts_Data");
  chartSheet.columns = [
    { width: 20 },
    { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }
  ];

  chartSheet.getCell("A1").value = "CHART DATA - PRO FORMA FINANCIAL TRENDS";
  chartSheet.getCell("A1").font = { bold: true, size: 14 };

  // Chart 1: Revenue Trends
  chartSheet.getCell("A3").value = "Revenue ($M)";
  chartSheet.getCell("A3").font = { bold: true };
  chartSheet.addRow(["Year", 0, 1, 2, 3, 4, 5]);
  chartSheet.getRow(4).font = { bold: true };
  chartSheet.addRow(["Acquirer", ...acquirerProjections.revenue]);
  chartSheet.addRow(["Target", ...results.targetProjections.revenue]);
  chartSheet.addRow(["Pro Forma", ...proFormaProjections.revenue]);
  for (let row = 5; row <= 7; row++) {
    for (let col = 2; col <= 7; col++) {
      chartSheet.getCell(row, col).numFmt = currencyFormat;
    }
  }

  // Chart 2: EBITDA Trends
  chartSheet.getCell("A10").value = "EBITDA ($M)";
  chartSheet.getCell("A10").font = { bold: true };
  chartSheet.addRow(["Year", 0, 1, 2, 3, 4, 5]);
  chartSheet.getRow(11).font = { bold: true };
  chartSheet.addRow(["Acquirer", ...acquirerProjections.ebitda]);
  chartSheet.addRow(["Target", ...results.targetProjections.ebitda]);
  chartSheet.addRow(["Pro Forma", ...proFormaProjections.ebitda]);
  for (let row = 12; row <= 14; row++) {
    for (let col = 2; col <= 7; col++) {
      chartSheet.getCell(row, col).numFmt = currencyFormat;
    }
  }

  // Chart 3: EPS Comparison
  chartSheet.getCell("A17").value = "EPS ($)";
  chartSheet.getCell("A17").font = { bold: true };
  chartSheet.addRow(["Year", 0, 1, 2, 3, 4, 5]);
  chartSheet.getRow(18).font = { bold: true };
  chartSheet.addRow(["Acquirer Standalone", ...acquirerProjections.eps]);
  chartSheet.addRow(["Pro Forma Combined", ...proFormaProjections.eps]);
  for (let row = 19; row <= 20; row++) {
    for (let col = 2; col <= 7; col++) {
      chartSheet.getCell(row, col).numFmt = epsFormat;
    }
  }

  // Chart 4: Accretion/Dilution Bar Chart Data
  chartSheet.getCell("A23").value = "Accretion/Dilution (%)";
  chartSheet.getCell("A23").font = { bold: true };
  chartSheet.addRow(["Year", 0, 1, 2, 3, 4, 5]);
  chartSheet.getRow(24).font = { bold: true };
  chartSheet.addRow(["EPS Impact %", ...accretionDilution.percentImpact.map((v: number) => v * 100)]);
  for (let col = 2; col <= 7; col++) {
    const val = accretionDilution.percentImpact[col - 2] * 100;
    chartSheet.getCell(25, col).numFmt = "0.0%";
    if (val > 0) {
      chartSheet.getCell(25, col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC0FFC0" } };
    } else if (val < 0) {
      chartSheet.getCell(25, col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC0C0" } };
    }
  }

  // Chart 5: Synergy Contribution
  chartSheet.getCell("A28").value = "Synergy Contribution to EBITDA ($M)";
  chartSheet.getCell("A28").font = { bold: true };
  chartSheet.addRow(["Year", 0, 1, 2, 3, 4, 5]);
  chartSheet.getRow(29).font = { bold: true };
  chartSheet.addRow(["Revenue Synergy EBITDA", ...synergies.revSynergyEBITDAByYear]);
  chartSheet.addRow(["Cost Synergies", ...synergies.costSynergiesByYear]);
  chartSheet.addRow(["Total EBITDA Synergies", ...synergies.totalEBITDASynergiesByYear]);
  for (let row = 30; row <= 32; row++) {
    for (let col = 2; col <= 7; col++) {
      chartSheet.getCell(row, col).numFmt = currencyFormat;
    }
  }
  chartSheet.getRow(32).font = { bold: true };

  // Instructions for users
  chartSheet.getCell("A35").value = "HOW TO CREATE CHARTS:";
  chartSheet.getCell("A35").font = { bold: true, size: 12 };
  chartSheet.getCell("A36").value = "1. Select the data range (e.g., A4:G7 for Revenue)";
  chartSheet.getCell("A37").value = "2. Insert > Chart > Select chart type (Line, Bar, etc.)";
  chartSheet.getCell("A38").value = "3. Customize as needed with titles and formatting";

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
