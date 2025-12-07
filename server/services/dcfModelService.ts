import ExcelJS from 'exceljs';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

export type FinanceLLMProvider = 'zhi1' | 'zhi2' | 'zhi3' | 'zhi4' | 'zhi5';

interface DCFAssumptions {
  companyName: string;
  baseYearRevenue: number;
  revenueGrowthRates: number[];
  terminalGrowthRate: number;
  baseEBITDAMargin: number;
  targetEBITDAMargin: number;
  marginExpansionYears: number;
  daPercent: number;
  daPercentTerminal: number;
  taxRate: number;
  capexPercent: number;
  capexPercentTerminal: number;
  nwcPercent: number;
  wacc: number;
  projectionYears: number;
  totalDebt: number;
  cashAndEquivalents: number;
  sharesOutstanding: number;
  // NEW: Constant assumptions mode - when true, no margin expansion or fade-to-mature ramps
  constantAssumptions: boolean;
  // NEW: Track if user provided EBIT margin (vs EBITDA margin) for correct interpretation
  userProvidedEBITMargin: boolean;
}

export async function parseFinancialDescription(
  description: string, 
  customInstructions?: string,
  llmProvider: FinanceLLMProvider = 'zhi2'
): Promise<DCFAssumptions> {
  
  const systemPrompt = `You are a financial analyst expert at extracting DCF model assumptions from natural language descriptions.
Extract ALL the following variables from the user's description. If a value is not explicitly stated, use reasonable defaults based on industry standards.

Return a JSON object with EXACTLY these fields (all numbers, no strings except companyName, booleans for flags):
{
  "companyName": "string - company name or 'Target Company' if not specified",
  "baseYearRevenue": number in millions (e.g., 850 for $850 million),
  "revenueGrowthRates": array of 5 numbers representing Y1-Y5 growth rates as decimals (e.g., [0.35, 0.35, 0.28, 0.20, 0.20]),
  "terminalGrowthRate": number as decimal (e.g., 0.03 for 3%),
  "baseEBITDAMargin": number as decimal (e.g., 0.18 for 18%) - SEE EBIT MARGIN RULE BELOW,
  "targetEBITDAMargin": number as decimal - ONLY set different from baseEBITDAMargin if user explicitly requests margin expansion,
  "marginExpansionYears": number of years to reach target margin (usually 5),
  "daPercent": D&A as decimal of revenue (e.g., 0.06 for 6%),
  "daPercentTerminal": D&A as decimal of revenue at terminal year - ONLY set different from daPercent if user explicitly requests fade-to-mature,
  "taxRate": number as decimal (e.g., 0.21 for 21%),
  "capexPercent": CapEx as decimal of revenue (e.g., 0.08 for 8%),
  "capexPercentTerminal": CapEx as decimal of revenue at terminal year - ONLY set different from capexPercent if user explicitly requests fade-to-mature,
  "nwcPercent": NWC as decimal of revenue (e.g., 0.12 for 12%),
  "wacc": number as decimal (e.g., 0.10 for 10%),
  "projectionYears": number (usually 5),
  "totalDebt": number in millions,
  "cashAndEquivalents": number in millions,
  "sharesOutstanding": number in millions,
  "constantAssumptions": boolean - TRUE by default unless user explicitly requests margin expansion or fade-to-mature model,
  "userProvidedEBITMargin": boolean - TRUE if user said "EBIT margin" (not EBITDA margin)
}

CRITICAL RULES FOR CONSTANT VS EXPANSION MODE:

1. DEFAULT TO CONSTANT ASSUMPTIONS (constantAssumptions: true):
   - When user provides simple inputs like "EBIT margin 20%, D&A 8%, CapEx 10%"
   - Keep ALL percentages CONSTANT across all years INCLUDING terminal year
   - Set daPercentTerminal = daPercent (same value)
   - Set capexPercentTerminal = capexPercent (same value)
   - Set targetEBITDAMargin = baseEBITDAMargin (no expansion)

2. ONLY USE EXPANSION MODE (constantAssumptions: false) when user EXPLICITLY requests:
   - "margin expansion" or "improving margins"
   - "professional model" or "two-stage model"
   - "fade to mature" or "declining capital intensity"
   - Explicit terminal values different from projection values

3. EBIT MARGIN INTERPRETATION (CRITICAL):
   - If user says "EBIT margin X%", this is EBIT margin, NOT EBITDA margin
   - To get EBITDA margin: EBITDA margin = EBIT margin + D&A%
   - Example: "EBIT margin 20%, D&A 8%" → baseEBITDAMargin = 0.28 (20% + 8%)
   - Set userProvidedEBITMargin: true when user says "EBIT margin"
   - If user says "EBITDA margin X%", use that directly, set userProvidedEBITMargin: false

4. CONSTANT MODE EXAMPLE:
   Input: "Revenue $1B, growth 10%, EBIT margin 20%, D&A 8%, CapEx 10%, WACC 10%"
   Output:
   - baseEBITDAMargin: 0.28 (20% EBIT + 8% D&A = 28% EBITDA)
   - targetEBITDAMargin: 0.28 (same - no expansion)
   - daPercent: 0.08
   - daPercentTerminal: 0.08 (same - constant)
   - capexPercent: 0.10
   - capexPercentTerminal: 0.10 (same - constant)
   - constantAssumptions: true
   - userProvidedEBITMargin: true

5. EXPANSION MODE EXAMPLE:
   Input: "Revenue $1B, starting EBITDA margin 18% improving to 25%, CapEx declining from 8% to 4%"
   Output:
   - baseEBITDAMargin: 0.18
   - targetEBITDAMargin: 0.25 (different - expansion)
   - capexPercent: 0.08
   - capexPercentTerminal: 0.04 (different - fade)
   - constantAssumptions: false
   - userProvidedEBITMargin: false

Default values if not specified:
- revenueGrowthRates: [0.10, 0.08, 0.06, 0.05, 0.04] (declining growth)
- terminalGrowthRate: 0.025 (2.5%)
- baseEBITDAMargin: 0.20 (20%)
- targetEBITDAMargin: same as baseEBITDAMargin (constant mode default)
- marginExpansionYears: 5
- daPercent: 0.05 (5%)
- daPercentTerminal: same as daPercent (constant mode default)
- taxRate: 0.25 (25%)
- capexPercent: 0.06 (6%)
- capexPercentTerminal: same as capexPercent (constant mode default)
- nwcPercent: 0.10 (10%)
- wacc: 0.10 (10%)
- projectionYears: 5
- totalDebt: 0
- cashAndEquivalents: 0
- sharesOutstanding: 100
- constantAssumptions: true (default to constant mode)
- userProvidedEBITMargin: false

IMPORTANT: Return ONLY valid JSON, no markdown, no explanations.`;

  let userPrompt = `Extract DCF assumptions from this description:\n\n${description}`;
  
  if (customInstructions) {
    userPrompt += `\n\nAdditional instructions: ${customInstructions}`;
  }

  let responseText: string;

  if (llmProvider === 'zhi1') {
    // OpenAI (GPT-4)
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 2000,
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    });
    responseText = response.choices[0]?.message?.content || '';
    
  } else if (llmProvider === 'zhi2') {
    // Anthropic (Claude)
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: 'claude-3-7-sonnet-20250219',
      max_tokens: 2000,
      temperature: 0,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });
    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Anthropic');
    }
    responseText = content.text;
    
  } else if (llmProvider === 'zhi3') {
    // DeepSeek
    const openaiCompatible = new OpenAI({
      baseURL: 'https://api.deepseek.com/v1',
      apiKey: process.env.DEEPSEEK_API_KEY
    });
    const response = await openaiCompatible.chat.completions.create({
      model: 'deepseek-chat',
      max_tokens: 2000,
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    });
    responseText = response.choices[0]?.message?.content || '';
    
  } else if (llmProvider === 'zhi4') {
    // Perplexity
    const perplexity = new OpenAI({
      baseURL: 'https://api.perplexity.ai',
      apiKey: process.env.PERPLEXITY_API_KEY
    });
    const response = await perplexity.chat.completions.create({
      model: 'llama-3.1-sonar-large-128k-online',
      max_tokens: 2000,
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    });
    responseText = response.choices[0]?.message?.content || '';
    
  } else if (llmProvider === 'zhi5') {
    // Grok (xAI)
    const grok = new OpenAI({
      baseURL: 'https://api.x.ai/v1',
      apiKey: process.env.GROK_API_KEY
    });
    const response = await grok.chat.completions.create({
      model: 'grok-3',
      max_tokens: 2000,
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    });
    responseText = response.choices[0]?.message?.content || '';
    
  } else {
    throw new Error(`Unknown LLM provider: ${llmProvider}`);
  }

  // Clean up potential markdown code blocks and extract JSON from conversational responses
  let cleanedText = responseText.trim();
  
  // First try: extract JSON from markdown code blocks
  if (cleanedText.includes('```json')) {
    const match = cleanedText.match(/```json\s*([\s\S]*?)\s*```/);
    if (match) {
      cleanedText = match[1].trim();
    }
  } else if (cleanedText.includes('```')) {
    const match = cleanedText.match(/```\s*([\s\S]*?)\s*```/);
    if (match) {
      cleanedText = match[1].trim();
    }
  }
  
  // Second try: find JSON object by looking for opening/closing braces
  if (!cleanedText.startsWith('{')) {
    const startIdx = cleanedText.indexOf('{');
    const endIdx = cleanedText.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      cleanedText = cleanedText.slice(startIdx, endIdx + 1);
    }
  }
  
  cleanedText = cleanedText.trim();

  try {
    const assumptions = JSON.parse(cleanedText);
    return assumptions as DCFAssumptions;
  } catch (error) {
    console.error('Failed to parse AI response:', responseText);
    throw new Error('Failed to parse financial assumptions from description');
  }
}

export interface DCFValuationResult {
  assumptions: DCFAssumptions;
  projections: {
    years: number[];
    revenue: number[];
    ebitda: number[];
    ebitdaMargin: number[];
    da: number[];
    daPercent: number[];
    ebit: number[];
    taxes: number[];
    nopat: number[];
    capex: number[];
    capexPercent: number[];
    nwcChange: number[];
    fcf: number[];
  };
  valuation: {
    base: {
      enterpriseValue: number;
      netDebt: number;
      equityValue: number;
      sharePrice: number;
      pvFCF: number;
      pvTerminal: number;
      terminalValue: number;
    };
    bull: {
      enterpriseValue: number;
      netDebt: number;
      equityValue: number;
      sharePrice: number;
    };
    bear: {
      enterpriseValue: number;
      netDebt: number;
      equityValue: number;
      sharePrice: number;
    };
  };
  sensitivityAnalysis: {
    waccValues: number[];
    terminalGrowthValues: number[];
    sharePriceMatrix: number[][];
  };
  providerUsed: string;
}

export function calculateDCFValuation(assumptions: DCFAssumptions, providerUsed: string): DCFValuationResult {
  const {
    companyName,
    baseYearRevenue,
    revenueGrowthRates,
    terminalGrowthRate,
    baseEBITDAMargin,
    targetEBITDAMargin,
    marginExpansionYears,
    daPercent,
    taxRate,
    capexPercent,
    nwcPercent,
    wacc,
    projectionYears,
    totalDebt,
    cashAndEquivalents,
    sharesOutstanding,
    constantAssumptions = true, // Default to constant mode
    userProvidedEBITMargin = false
  } = assumptions;

  // Determine effective terminal values based on constant vs expansion mode
  let effectiveDaPercentTerminal: number;
  let effectiveCapexPercentTerminal: number;
  let effectiveTargetEBITDAMargin: number;

  if (constantAssumptions) {
    // CONSTANT MODE: All assumptions stay the same through terminal year
    effectiveDaPercentTerminal = daPercent;
    effectiveCapexPercentTerminal = capexPercent;
    effectiveTargetEBITDAMargin = baseEBITDAMargin;
    console.log(`[DCF] CONSTANT MODE: EBITDA margin=${(baseEBITDAMargin*100).toFixed(1)}%, D&A=${(daPercent*100).toFixed(1)}%, CapEx=${(capexPercent*100).toFixed(1)}% (all constant)`);
  } else {
    // EXPANSION MODE: Use terminal values from assumptions (with fallbacks)
    effectiveDaPercentTerminal = assumptions.daPercentTerminal ?? daPercent * 0.8;
    effectiveCapexPercentTerminal = assumptions.capexPercentTerminal ?? Math.min(capexPercent * 0.5, effectiveDaPercentTerminal);
    effectiveTargetEBITDAMargin = targetEBITDAMargin;
    console.log(`[DCF] EXPANSION MODE: EBITDA ${(baseEBITDAMargin*100).toFixed(1)}%→${(effectiveTargetEBITDAMargin*100).toFixed(1)}%, D&A ${(daPercent*100).toFixed(1)}%→${(effectiveDaPercentTerminal*100).toFixed(1)}%, CapEx ${(capexPercent*100).toFixed(1)}%→${(effectiveCapexPercentTerminal*100).toFixed(1)}%`);
  }

  // Calculate projections with full FCF buildup
  const years: number[] = [];
  const revenue: number[] = [];
  const ebitda: number[] = [];
  const ebitdaMargin: number[] = [];
  const da: number[] = [];
  const daPercentByYear: number[] = [];
  const ebit: number[] = [];
  const taxes: number[] = [];
  const nopat: number[] = [];
  const capex: number[] = [];
  const capexPercentByYear: number[] = [];
  const nwcChange: number[] = [];
  const fcf: number[] = [];

  let currentRevenue = baseYearRevenue;
  
  for (let i = 0; i < projectionYears; i++) {
    years.push(i + 1);
    
    // Revenue
    const growthRate = revenueGrowthRates[i] || revenueGrowthRates[revenueGrowthRates.length - 1];
    currentRevenue = i === 0 ? baseYearRevenue * (1 + growthRate) : revenue[i - 1] * (1 + growthRate);
    revenue.push(currentRevenue);
    
    // EBITDA Margin - depends on mode
    let margin: number;
    if (constantAssumptions) {
      // CONSTANT: Same margin every year
      margin = baseEBITDAMargin;
    } else {
      // EXPANSION: Linear ramp from base to target
      const marginStep = (effectiveTargetEBITDAMargin - baseEBITDAMargin) / marginExpansionYears;
      margin = Math.min(baseEBITDAMargin + marginStep * (i + 1), effectiveTargetEBITDAMargin);
    }
    ebitdaMargin.push(margin);
    
    // EBITDA
    const ebitdaValue = currentRevenue * margin;
    ebitda.push(ebitdaValue);
    
    // D&A - depends on mode
    let currentDaPercent: number;
    if (constantAssumptions) {
      // CONSTANT: Same D&A% every year
      currentDaPercent = daPercent;
    } else {
      // EXPANSION: Linear decline from daPercent to terminal
      const daStep = projectionYears > 1 ? (effectiveDaPercentTerminal - daPercent) / (projectionYears - 1) : 0;
      currentDaPercent = daPercent + daStep * i;
    }
    const daValue = currentRevenue * currentDaPercent;
    da.push(daValue);
    daPercentByYear.push(currentDaPercent);
    
    // EBIT
    const ebitValue = ebitdaValue - daValue;
    ebit.push(ebitValue);
    
    // Taxes on EBIT
    const taxValue = ebitValue * taxRate;
    taxes.push(taxValue);
    
    // NOPAT
    const nopatValue = ebitValue - taxValue;
    nopat.push(nopatValue);
    
    // CapEx - depends on mode
    let currentCapexPercent: number;
    if (constantAssumptions) {
      // CONSTANT: Same CapEx% every year
      currentCapexPercent = capexPercent;
    } else {
      // EXPANSION: Linear decline from capexPercent to terminal
      const capexStep = projectionYears > 1 ? (effectiveCapexPercentTerminal - capexPercent) / (projectionYears - 1) : 0;
      currentCapexPercent = capexPercent + capexStep * i;
    }
    const capexValue = currentRevenue * currentCapexPercent;
    capex.push(capexValue);
    capexPercentByYear.push(currentCapexPercent);
    
    // Change in NWC
    const nwcChangeValue = i === 0 
      ? currentRevenue * nwcPercent - baseYearRevenue * nwcPercent 
      : currentRevenue * nwcPercent - revenue[i - 1] * nwcPercent;
    nwcChange.push(nwcChangeValue);
    
    // Unlevered Free Cash Flow
    const fcfValue = nopatValue + daValue - capexValue - nwcChangeValue;
    fcf.push(fcfValue);
    
    console.log(`[DCF] Year ${i + 1}: Rev=${currentRevenue.toFixed(1)}M, EBITDA=${ebitdaValue.toFixed(1)}M (${(margin*100).toFixed(1)}%), D&A=${daValue.toFixed(1)}M (${(currentDaPercent*100).toFixed(1)}%), CapEx=${capexValue.toFixed(1)}M (${(currentCapexPercent*100).toFixed(1)}%), FCF=${fcfValue.toFixed(1)}M`);
  }
  
  console.log(`[DCF] Terminal year FCF margin: ${((fcf[fcf.length-1] / revenue[revenue.length-1]) * 100).toFixed(1)}%`);

  // Calculate DCF valuation with full breakdown
  const calculateValuationFull = (waccRate: number, termGrowth: number) => {
    // PV of FCFs
    let pvFCF = 0;
    for (let i = 0; i < fcf.length; i++) {
      pvFCF += fcf[i] / Math.pow(1 + waccRate, i + 1);
    }
    
    // Terminal Value (Gordon Growth)
    const terminalFCF = fcf[fcf.length - 1] * (1 + termGrowth);
    const terminalValue = terminalFCF / (waccRate - termGrowth);
    const pvTerminal = terminalValue / Math.pow(1 + waccRate, projectionYears);
    
    const enterpriseValue = pvFCF + pvTerminal;
    const netDebt = totalDebt - cashAndEquivalents;
    const equityValue = enterpriseValue - netDebt;
    const sharePrice = equityValue / sharesOutstanding;
    
    return { enterpriseValue, netDebt, equityValue, sharePrice, pvFCF, pvTerminal, terminalValue };
  };
  
  const calculateValuationSimple = (waccRate: number, termGrowth: number) => {
    const result = calculateValuationFull(waccRate, termGrowth);
    return { 
      enterpriseValue: result.enterpriseValue, 
      netDebt: result.netDebt, 
      equityValue: result.equityValue, 
      sharePrice: result.sharePrice 
    };
  };

  // Base case with full breakdown
  const base = calculateValuationFull(wacc, terminalGrowthRate);
  
  // Bull case: lower WACC (-1%), higher terminal growth (+0.5%)
  const bull = calculateValuationSimple(wacc - 0.01, terminalGrowthRate + 0.005);
  
  // Bear case: higher WACC (+1%), lower terminal growth (-0.5%)
  const bear = calculateValuationSimple(wacc + 0.01, terminalGrowthRate - 0.005);

  // Generate sensitivity analysis matrix
  const waccValues = [wacc - 0.02, wacc - 0.01, wacc, wacc + 0.01, wacc + 0.02];
  const terminalGrowthValues = [
    terminalGrowthRate - 0.01, 
    terminalGrowthRate - 0.005, 
    terminalGrowthRate, 
    terminalGrowthRate + 0.005, 
    terminalGrowthRate + 0.01
  ];
  
  const sharePriceMatrix: number[][] = [];
  for (const tg of terminalGrowthValues) {
    const row: number[] = [];
    for (const w of waccValues) {
      const result = calculateValuationSimple(w, tg);
      row.push(result.sharePrice);
    }
    sharePriceMatrix.push(row);
  }

  return {
    assumptions,
    projections: {
      years,
      revenue,
      ebitda,
      ebitdaMargin,
      da,
      daPercent: daPercentByYear,
      ebit,
      taxes,
      nopat,
      capex,
      capexPercent: capexPercentByYear,
      nwcChange,
      fcf
    },
    valuation: { base, bull, bear },
    sensitivityAnalysis: {
      waccValues,
      terminalGrowthValues,
      sharePriceMatrix
    },
    providerUsed
  };
}

export async function generateDCFExcel(assumptions: DCFAssumptions): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Finance Panel';
  workbook.created = new Date();

  const {
    companyName,
    baseYearRevenue,
    revenueGrowthRates,
    terminalGrowthRate,
    baseEBITDAMargin,
    targetEBITDAMargin,
    marginExpansionYears,
    daPercent,
    taxRate,
    capexPercent,
    nwcPercent,
    wacc,
    projectionYears,
    totalDebt,
    cashAndEquivalents,
    sharesOutstanding,
    constantAssumptions = true
  } = assumptions;

  // Determine effective terminal values based on constant vs expansion mode
  let effectiveDaPercentTerminal: number;
  let effectiveCapexPercentTerminal: number;
  let effectiveTargetEBITDAMargin: number;

  if (constantAssumptions) {
    effectiveDaPercentTerminal = daPercent;
    effectiveCapexPercentTerminal = capexPercent;
    effectiveTargetEBITDAMargin = baseEBITDAMargin;
  } else {
    effectiveDaPercentTerminal = assumptions.daPercentTerminal ?? daPercent * 0.8;
    effectiveCapexPercentTerminal = assumptions.capexPercentTerminal ?? Math.min(capexPercent * 0.5, effectiveDaPercentTerminal);
    effectiveTargetEBITDAMargin = targetEBITDAMargin;
  }

  // Pre-calculate all values so Excel shows actual numbers
  const revenue: number[] = [baseYearRevenue];
  const ebitdaMargins: number[] = [];
  const ebitda: number[] = [];
  const fcf: number[] = [];
  const daValues: number[] = [];
  const capexValues: number[] = [];
  const daPercentByYear: number[] = [];
  const capexPercentByYear: number[] = [];
  
  for (let i = 0; i < 5; i++) {
    const growthRate = revenueGrowthRates[i] || 0.10;
    const newRevenue = revenue[i] * (1 + growthRate);
    revenue.push(newRevenue);
    
    // EBITDA Margin - depends on mode
    let margin: number;
    if (constantAssumptions) {
      margin = baseEBITDAMargin;
    } else {
      const marginStep = (effectiveTargetEBITDAMargin - baseEBITDAMargin) / marginExpansionYears;
      margin = Math.min(baseEBITDAMargin + marginStep * (i + 1), effectiveTargetEBITDAMargin);
    }
    ebitdaMargins.push(margin);
    
    const ebitdaVal = newRevenue * margin;
    ebitda.push(ebitdaVal);
    
    // D&A - depends on mode
    let currentDaPercent: number;
    if (constantAssumptions) {
      currentDaPercent = daPercent;
    } else {
      const daStep = (effectiveDaPercentTerminal - daPercent) / 4;
      currentDaPercent = daPercent + daStep * i;
    }
    const da = newRevenue * currentDaPercent;
    daValues.push(da);
    daPercentByYear.push(currentDaPercent);
    
    // CapEx - depends on mode
    let currentCapexPercent: number;
    if (constantAssumptions) {
      currentCapexPercent = capexPercent;
    } else {
      const capexStep = (effectiveCapexPercentTerminal - capexPercent) / 4;
      currentCapexPercent = capexPercent + capexStep * i;
    }
    const capex = newRevenue * currentCapexPercent;
    capexValues.push(capex);
    capexPercentByYear.push(currentCapexPercent);
    
    const ebit = ebitdaVal - da;
    const nopat = ebit * (1 - taxRate);
    const prevRev = i === 0 ? baseYearRevenue : revenue[i];
    const nwcChange = newRevenue * nwcPercent - prevRev * nwcPercent;
    const fcfVal = nopat + da - capex - nwcChange;
    fcf.push(fcfVal);
  }

  // Calculate DCF valuation
  let pvFCF = 0;
  for (let i = 0; i < fcf.length; i++) {
    pvFCF += fcf[i] / Math.pow(1 + wacc, i + 1);
  }
  const terminalFCF = fcf[fcf.length - 1] * (1 + terminalGrowthRate);
  const terminalValue = terminalFCF / (wacc - terminalGrowthRate);
  const pvTerminal = terminalValue / Math.pow(1 + wacc, 5);
  const enterpriseValue = pvFCF + pvTerminal;
  const netDebt = totalDebt - cashAndEquivalents;
  const equityValue = enterpriseValue - netDebt;
  const sharePrice = equityValue / sharesOutstanding;

  const blueFont: Partial<ExcelJS.Font> = { color: { argb: 'FF0000FF' }, bold: true };
  const headerStyle: Partial<ExcelJS.Style> = {
    font: { bold: true, size: 12 },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } },
    alignment: { horizontal: 'center' }
  };
  const currencyFormat = '"$"#,##0';
  const percentFormat = '0.0%';
  const perShareFormat = '"$"#,##0.00';

  // ============ EXECUTIVE SUMMARY ============
  const summarySheet = workbook.addWorksheet('Executive Summary');
  summarySheet.columns = [
    { header: '', key: 'label', width: 35 },
    { header: '', key: 'value', width: 20 }
  ];

  summarySheet.getCell('A1').value = `${companyName} - DCF Valuation Model`;
  summarySheet.getCell('A1').font = { bold: true, size: 16 };
  summarySheet.getCell('A2').value = `Valuation Date: ${new Date().toLocaleDateString()}`;
  
  summarySheet.getCell('A4').value = 'VALUATION SUMMARY';
  summarySheet.getCell('A4').font = { bold: true, size: 14 };
  
  summarySheet.getCell('A5').value = 'Enterprise Value:';
  summarySheet.getCell('B5').value = enterpriseValue;
  summarySheet.getCell('B5').numFmt = currencyFormat;
  
  summarySheet.getCell('A6').value = 'Less: Net Debt:';
  summarySheet.getCell('B6').value = netDebt;
  summarySheet.getCell('B6').numFmt = currencyFormat;
  
  summarySheet.getCell('A7').value = 'Equity Value:';
  summarySheet.getCell('B7').value = equityValue;
  summarySheet.getCell('B7').numFmt = currencyFormat;
  summarySheet.getCell('B7').font = { bold: true };
  
  summarySheet.getCell('A8').value = 'Shares Outstanding (M):';
  summarySheet.getCell('B8').value = sharesOutstanding;
  summarySheet.getCell('B8').numFmt = '#,##0.0';
  
  summarySheet.getCell('A9').value = 'Value per Share:';
  summarySheet.getCell('B9').value = sharePrice;
  summarySheet.getCell('B9').numFmt = perShareFormat;
  summarySheet.getCell('B9').font = { bold: true };
  
  summarySheet.getCell('A11').value = 'KEY ASSUMPTIONS';
  summarySheet.getCell('A11').font = { bold: true, size: 14 };
  
  summarySheet.getCell('A12').value = 'Base Year Revenue:';
  summarySheet.getCell('B12').value = baseYearRevenue;
  summarySheet.getCell('B12').numFmt = currencyFormat;
  
  summarySheet.getCell('A13').value = 'WACC:';
  summarySheet.getCell('B13').value = wacc;
  summarySheet.getCell('B13').numFmt = percentFormat;
  
  summarySheet.getCell('A14').value = 'Terminal Growth Rate:';
  summarySheet.getCell('B14').value = terminalGrowthRate;
  summarySheet.getCell('B14').numFmt = percentFormat;
  
  summarySheet.getCell('A15').value = 'Terminal EBITDA Margin:';
  summarySheet.getCell('B15').value = targetEBITDAMargin;
  summarySheet.getCell('B15').numFmt = percentFormat;

  // Add valuation breakdown
  summarySheet.getCell('A17').value = 'VALUATION BREAKDOWN';
  summarySheet.getCell('A17').font = { bold: true, size: 14 };
  
  summarySheet.getCell('A18').value = 'PV of Projected FCFs:';
  summarySheet.getCell('B18').value = pvFCF;
  summarySheet.getCell('B18').numFmt = currencyFormat;
  
  summarySheet.getCell('A19').value = 'Terminal Value:';
  summarySheet.getCell('B19').value = terminalValue;
  summarySheet.getCell('B19').numFmt = currencyFormat;
  
  summarySheet.getCell('A20').value = 'PV of Terminal Value:';
  summarySheet.getCell('B20').value = pvTerminal;
  summarySheet.getCell('B20').numFmt = currencyFormat;

  // ============ ASSUMPTIONS ============
  const assumptionsSheet = workbook.addWorksheet('Assumptions');
  assumptionsSheet.columns = [
    { header: '', key: 'label', width: 40 },
    { header: '', key: 'value', width: 15 }
  ];

  assumptionsSheet.getCell('A1').value = 'REVENUE ASSUMPTIONS';
  assumptionsSheet.getCell('A1').font = { bold: true, size: 14 };
  
  assumptionsSheet.getCell('A5').value = 'Base Year Revenue (Year 0) ($M):';
  assumptionsSheet.getCell('B5').value = baseYearRevenue;
  assumptionsSheet.getCell('B5').font = blueFont;
  assumptionsSheet.getCell('B5').numFmt = currencyFormat;
  
  for (let i = 0; i < 5; i++) {
    assumptionsSheet.getCell(`A${6 + i}`).value = `Year ${i + 1} Growth Rate:`;
    assumptionsSheet.getCell(`B${6 + i}`).value = revenueGrowthRates[i] || 0.10;
    assumptionsSheet.getCell(`B${6 + i}`).font = blueFont;
    assumptionsSheet.getCell(`B${6 + i}`).numFmt = percentFormat;
  }
  
  assumptionsSheet.getCell('A12').value = 'Terminal Growth Rate:';
  assumptionsSheet.getCell('B12').value = terminalGrowthRate;
  assumptionsSheet.getCell('B12').font = blueFont;
  assumptionsSheet.getCell('B12').numFmt = percentFormat;

  assumptionsSheet.getCell('A14').value = 'PROFITABILITY ASSUMPTIONS';
  assumptionsSheet.getCell('A14').font = { bold: true, size: 14 };
  
  assumptionsSheet.getCell('A15').value = 'Base Year EBITDA Margin:';
  assumptionsSheet.getCell('B15').value = baseEBITDAMargin;
  assumptionsSheet.getCell('B15').font = blueFont;
  assumptionsSheet.getCell('B15').numFmt = percentFormat;
  
  assumptionsSheet.getCell('A16').value = 'Target EBITDA Margin:';
  assumptionsSheet.getCell('B16').value = targetEBITDAMargin;
  assumptionsSheet.getCell('B16').font = blueFont;
  assumptionsSheet.getCell('B16').numFmt = percentFormat;
  
  assumptionsSheet.getCell('A17').value = 'Years to Target Margin:';
  assumptionsSheet.getCell('B17').value = marginExpansionYears;
  assumptionsSheet.getCell('B17').font = blueFont;
  
  assumptionsSheet.getCell('A18').value = 'D&A as % of Revenue:';
  assumptionsSheet.getCell('B18').value = daPercent;
  assumptionsSheet.getCell('B18').font = blueFont;
  assumptionsSheet.getCell('B18').numFmt = percentFormat;
  
  assumptionsSheet.getCell('A19').value = 'Tax Rate:';
  assumptionsSheet.getCell('B19').value = taxRate;
  assumptionsSheet.getCell('B19').font = blueFont;
  assumptionsSheet.getCell('B19').numFmt = percentFormat;

  assumptionsSheet.getCell('A21').value = 'OPERATING ASSUMPTIONS';
  assumptionsSheet.getCell('A21').font = { bold: true, size: 14 };
  
  assumptionsSheet.getCell('A22').value = 'CapEx as % of Revenue:';
  assumptionsSheet.getCell('B22').value = capexPercent;
  assumptionsSheet.getCell('B22').font = blueFont;
  assumptionsSheet.getCell('B22').numFmt = percentFormat;
  
  assumptionsSheet.getCell('A23').value = 'NWC as % of Revenue:';
  assumptionsSheet.getCell('B23').value = nwcPercent;
  assumptionsSheet.getCell('B23').font = blueFont;
  assumptionsSheet.getCell('B23').numFmt = percentFormat;

  assumptionsSheet.getCell('A25').value = 'VALUATION PARAMETERS';
  assumptionsSheet.getCell('A25').font = { bold: true, size: 14 };
  
  assumptionsSheet.getCell('A26').value = 'WACC:';
  assumptionsSheet.getCell('B26').value = wacc;
  assumptionsSheet.getCell('B26').font = blueFont;
  assumptionsSheet.getCell('B26').numFmt = percentFormat;
  
  assumptionsSheet.getCell('A27').value = 'Projection Period (Years):';
  assumptionsSheet.getCell('B27').value = projectionYears;
  assumptionsSheet.getCell('B27').font = blueFont;

  assumptionsSheet.getCell('A30').value = 'CAPITAL STRUCTURE';
  assumptionsSheet.getCell('A30').font = { bold: true, size: 14 };
  
  assumptionsSheet.getCell('A32').value = 'Total Debt ($M):';
  assumptionsSheet.getCell('B32').value = totalDebt;
  assumptionsSheet.getCell('B32').font = blueFont;
  assumptionsSheet.getCell('B32').numFmt = currencyFormat;
  
  assumptionsSheet.getCell('A33').value = 'Cash & Equivalents ($M):';
  assumptionsSheet.getCell('B33').value = cashAndEquivalents;
  assumptionsSheet.getCell('B33').font = blueFont;
  assumptionsSheet.getCell('B33').numFmt = currencyFormat;
  
  assumptionsSheet.getCell('A34').value = 'Shares Outstanding (M):';
  assumptionsSheet.getCell('B34').value = sharesOutstanding;
  assumptionsSheet.getCell('B34').font = blueFont;
  assumptionsSheet.getCell('B34').numFmt = '#,##0.0';

  // ============ REVENUE & EBITDA (with computed values) ============
  const revenueSheet = workbook.addWorksheet('Revenue_EBITDA');
  const revHeaders = ['', 'Year 0', 'Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5'];
  revenueSheet.addRow(revHeaders);
  revenueSheet.getRow(1).font = { bold: true };
  revenueSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
  
  revenueSheet.columns = [
    { width: 25 },
    { width: 15 },
    { width: 15 },
    { width: 15 },
    { width: 15 },
    { width: 15 },
    { width: 15 }
  ];

  // Revenue Growth Rate row (with actual values)
  revenueSheet.addRow(['Revenue Growth Rate', '', 
    revenueGrowthRates[0] || 0.10,
    revenueGrowthRates[1] || 0.10,
    revenueGrowthRates[2] || 0.10,
    revenueGrowthRates[3] || 0.10,
    revenueGrowthRates[4] || 0.10
  ]);
  for (let i = 2; i <= 7; i++) {
    revenueSheet.getCell(2, i).numFmt = percentFormat;
  }

  // Revenue row (with actual computed values)
  revenueSheet.addRow(['Revenue ($M)', revenue[0], revenue[1], revenue[2], revenue[3], revenue[4], revenue[5]]);
  for (let i = 2; i <= 7; i++) {
    revenueSheet.getCell(3, i).numFmt = currencyFormat;
  }

  // EBITDA Margin row (with actual values)
  revenueSheet.addRow(['EBITDA Margin', baseEBITDAMargin, 
    ebitdaMargins[0], ebitdaMargins[1], ebitdaMargins[2], ebitdaMargins[3], ebitdaMargins[4]
  ]);
  for (let i = 2; i <= 7; i++) {
    revenueSheet.getCell(4, i).numFmt = percentFormat;
  }

  // EBITDA row (with actual values)
  const baseEbitda = revenue[0] * baseEBITDAMargin;
  revenueSheet.addRow(['EBITDA ($M)', baseEbitda, ebitda[0], ebitda[1], ebitda[2], ebitda[3], ebitda[4]]);
  for (let i = 2; i <= 7; i++) {
    revenueSheet.getCell(5, i).numFmt = currencyFormat;
  }

  // ============ FREE CASH FLOW (with computed values) ============
  const fcfSheet = workbook.addWorksheet('Free_Cash_Flow');
  const fcfHeaders = ['', 'Year 0', 'Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5'];
  fcfSheet.addRow(fcfHeaders);
  fcfSheet.getRow(1).font = { bold: true };
  fcfSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
  
  fcfSheet.columns = [
    { width: 30 },
    { width: 15 },
    { width: 15 },
    { width: 15 },
    { width: 15 },
    { width: 15 },
    { width: 15 }
  ];

  // Calculate detailed FCF components for each year
  const da: number[] = [];
  const ebit: number[] = [];
  const taxes: number[] = [];
  const nopat: number[] = [];
  const capex: number[] = [];
  const nwc: number[] = [];
  const nwcChange: number[] = [];
  
  for (let i = 0; i < 6; i++) {
    const rev = revenue[i];
    const ebitdaVal = i === 0 ? baseEbitda : ebitda[i - 1];
    const daVal = rev * daPercent;
    da.push(daVal);
    const ebitVal = ebitdaVal - daVal;
    ebit.push(ebitVal);
    const taxVal = ebitVal * taxRate;
    taxes.push(taxVal);
    const nopatVal = ebitVal - taxVal;
    nopat.push(nopatVal);
    const capexVal = rev * capexPercent;
    capex.push(capexVal);
    const nwcVal = rev * nwcPercent;
    nwc.push(nwcVal);
    if (i === 0) {
      nwcChange.push(0);
    } else {
      nwcChange.push(nwc[i] - nwc[i - 1]);
    }
  }

  fcfSheet.addRow(['Revenue ($M)', revenue[0], revenue[1], revenue[2], revenue[3], revenue[4], revenue[5]]);
  fcfSheet.addRow(['EBITDA ($M)', baseEbitda, ebitda[0], ebitda[1], ebitda[2], ebitda[3], ebitda[4]]);
  fcfSheet.addRow(['Less: D&A ($M)', -da[0], -da[1], -da[2], -da[3], -da[4], -da[5]]);
  fcfSheet.addRow(['EBIT ($M)', ebit[0], ebit[1], ebit[2], ebit[3], ebit[4], ebit[5]]);
  fcfSheet.addRow(['Less: Taxes ($M)', -taxes[0], -taxes[1], -taxes[2], -taxes[3], -taxes[4], -taxes[5]]);
  fcfSheet.addRow(['NOPAT ($M)', nopat[0], nopat[1], nopat[2], nopat[3], nopat[4], nopat[5]]);
  fcfSheet.addRow(['Add back: D&A ($M)', da[0], da[1], da[2], da[3], da[4], da[5]]);
  fcfSheet.addRow(['Less: CapEx ($M)', -capex[0], -capex[1], -capex[2], -capex[3], -capex[4], -capex[5]]);
  fcfSheet.addRow(['NWC Balance ($M)', nwc[0], nwc[1], nwc[2], nwc[3], nwc[4], nwc[5]]);
  fcfSheet.addRow(['Less: Change in NWC ($M)', '', -nwcChange[1], -nwcChange[2], -nwcChange[3], -nwcChange[4], -nwcChange[5]]);
  
  // Calculate actual unlevered FCF
  const unleveredFcf: (number | string)[] = [];
  for (let i = 0; i < 6; i++) {
    if (i === 0) {
      unleveredFcf.push('');
    } else {
      const fcfCalc = nopat[i] + da[i] - capex[i] - nwcChange[i];
      unleveredFcf.push(fcfCalc);
    }
  }
  fcfSheet.addRow(['Unlevered FCF ($M)', ...unleveredFcf]);
  fcfSheet.getRow(12).font = { bold: true };

  for (let row = 2; row <= 12; row++) {
    for (let col = 2; col <= 7; col++) {
      fcfSheet.getCell(row, col).numFmt = currencyFormat;
    }
  }

  // ============ DCF VALUATION (with computed values) ============
  const dcfSheet = workbook.addWorksheet('DCF_Valuation');
  dcfSheet.columns = [
    { width: 35 },
    { width: 18 },
    { width: 18 },
    { width: 18 }
  ];

  dcfSheet.getCell('A1').value = 'PRESENT VALUE OF EXPLICIT PERIOD CASH FLOWS';
  dcfSheet.getCell('A1').font = { bold: true, size: 14 };
  
  dcfSheet.addRow(['Year', 'FCF ($M)', 'Discount Factor', 'Present Value ($M)']);
  dcfSheet.getRow(2).font = { bold: true };
  dcfSheet.getRow(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

  // Add each year's FCF with computed values
  const pvValues: number[] = [];
  for (let year = 1; year <= 5; year++) {
    const yearFcf = fcf[year - 1];
    const discountFactor = 1 / Math.pow(1 + wacc, year);
    const pv = yearFcf * discountFactor;
    pvValues.push(pv);
    
    const row = dcfSheet.addRow([year, yearFcf, discountFactor, pv]);
    row.getCell(2).numFmt = currencyFormat;
    row.getCell(3).numFmt = '0.0000';
    row.getCell(4).numFmt = currencyFormat;
  }

  const totalPVFCF = pvValues.reduce((a, b) => a + b, 0);
  dcfSheet.addRow(['Total PV of Years 1-5:', '', '', totalPVFCF]);
  dcfSheet.getRow(8).font = { bold: true };
  dcfSheet.getCell('D8').numFmt = currencyFormat;

  dcfSheet.getCell('A10').value = 'TERMINAL VALUE CALCULATION';
  dcfSheet.getCell('A10').font = { bold: true, size: 14 };
  
  const year6Fcf = fcf[4] * (1 + terminalGrowthRate);
  dcfSheet.addRow(['Year 6 FCF ($M):', year6Fcf]);
  dcfSheet.getCell('B11').numFmt = currencyFormat;
  
  const calculatedTerminalValue = year6Fcf / (wacc - terminalGrowthRate);
  dcfSheet.addRow(['Terminal Value ($M):', calculatedTerminalValue]);
  dcfSheet.getCell('B12').numFmt = currencyFormat;
  
  const discountFactor5 = 1 / Math.pow(1 + wacc, 5);
  dcfSheet.addRow(['Discount Factor (Year 5):', discountFactor5]);
  dcfSheet.getCell('B13').numFmt = '0.0000';
  
  const pvTerminalValue = calculatedTerminalValue * discountFactor5;
  dcfSheet.addRow(['PV of Terminal Value ($M):', pvTerminalValue]);
  dcfSheet.getCell('B14').numFmt = currencyFormat;
  dcfSheet.getRow(14).font = { bold: true };

  dcfSheet.getCell('A16').value = 'ENTERPRISE VALUE BRIDGE';
  dcfSheet.getCell('A16').font = { bold: true, size: 14 };
  
  dcfSheet.addRow(['PV of Explicit Period FCFs ($M):', totalPVFCF]);
  dcfSheet.getCell('B17').numFmt = currencyFormat;
  
  dcfSheet.addRow(['Plus: PV of Terminal Value ($M):', pvTerminalValue]);
  dcfSheet.getCell('B18').numFmt = currencyFormat;
  
  dcfSheet.addRow(['']);
  
  const calculatedEV = totalPVFCF + pvTerminalValue;
  dcfSheet.addRow(['Enterprise Value ($M):', calculatedEV]);
  dcfSheet.getCell('B20').numFmt = currencyFormat;
  dcfSheet.getRow(20).font = { bold: true };
  
  dcfSheet.addRow(['Less: Total Debt ($M):', -totalDebt]);
  dcfSheet.getCell('B21').numFmt = currencyFormat;
  
  dcfSheet.addRow(['Plus: Cash ($M):', cashAndEquivalents]);
  dcfSheet.getCell('B22').numFmt = currencyFormat;
  
  dcfSheet.addRow(['']);
  
  const calculatedEquityValue = calculatedEV - totalDebt + cashAndEquivalents;
  dcfSheet.addRow(['Equity Value ($M):', calculatedEquityValue]);
  dcfSheet.getCell('B24').numFmt = currencyFormat;
  dcfSheet.getRow(24).font = { bold: true };
  
  dcfSheet.addRow(['Shares Outstanding (M):', sharesOutstanding]);
  dcfSheet.getCell('B25').numFmt = '#,##0.0';
  
  const calculatedSharePrice = calculatedEquityValue / sharesOutstanding;
  dcfSheet.addRow(['Value per Share:', calculatedSharePrice]);
  dcfSheet.getCell('B26').numFmt = perShareFormat;
  dcfSheet.getRow(26).font = { bold: true, size: 14 };
  dcfSheet.getCell('B26').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };

  const sensSheet = workbook.addWorksheet('Sensitivity_WACC_Growth');
  sensSheet.columns = [
    { width: 15 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 }
  ];

  sensSheet.getCell('A1').value = 'EQUITY VALUE SENSITIVITY ($M)';
  sensSheet.getCell('A1').font = { bold: true, size: 14 };
  sensSheet.getCell('A2').value = 'WACC vs Terminal Growth Rate';
  
  sensSheet.getCell('B3').value = 'Terminal Growth Rate';
  sensSheet.mergeCells('B3:H3');
  sensSheet.getCell('B3').alignment = { horizontal: 'center' };
  sensSheet.getCell('B3').font = { bold: true };

  const baseWacc = wacc;
  const baseTermGrowth = terminalGrowthRate;
  
  const waccValues = [
    baseWacc - 0.02,
    baseWacc - 0.015,
    baseWacc - 0.01,
    baseWacc - 0.005,
    baseWacc,
    baseWacc + 0.005,
    baseWacc + 0.01,
    baseWacc + 0.015,
    baseWacc + 0.02
  ];
  
  const termGrowthValues = [
    baseTermGrowth - 0.01,
    baseTermGrowth - 0.0075,
    baseTermGrowth - 0.005,
    baseTermGrowth - 0.0025,
    baseTermGrowth,
    baseTermGrowth + 0.0025,
    baseTermGrowth + 0.005
  ];

  sensSheet.addRow(['WACC \\ TG', ...termGrowthValues.map(v => v)]);
  sensSheet.getRow(4).font = { bold: true };
  for (let i = 2; i <= 8; i++) {
    sensSheet.getCell(4, i).numFmt = percentFormat;
  }

  for (let wIdx = 0; wIdx < waccValues.length; wIdx++) {
    const waccVal = waccValues[wIdx];
    const row: any[] = [waccVal];
    
    for (let tIdx = 0; tIdx < termGrowthValues.length; tIdx++) {
      const tgVal = termGrowthValues[tIdx];
      
      const year5Fcf = calculateYear5FCF(assumptions);
      const terminalFcf = year5Fcf * (1 + tgVal);
      const terminalValue = terminalFcf / (waccVal - tgVal);
      const pvTerminal = terminalValue / Math.pow(1 + waccVal, 5);
      
      const pvFcfs = calculatePVOfFCFs(assumptions, waccVal);
      const ev = pvFcfs + pvTerminal;
      const equityValue = ev - totalDebt + cashAndEquivalents;
      
      row.push(equityValue);
    }
    
    const excelRow = sensSheet.addRow(row);
    excelRow.getCell(1).numFmt = percentFormat;
    for (let i = 2; i <= 8; i++) {
      excelRow.getCell(i).numFmt = currencyFormat;
      
      if (wIdx === 4 && i === 6) {
        excelRow.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
      }
    }
  }

  const scenarioSheet = workbook.addWorksheet('Scenarios');
  scenarioSheet.columns = [
    { width: 30 },
    { width: 18 },
    { width: 18 },
    { width: 18 }
  ];

  scenarioSheet.getCell('A1').value = 'SCENARIO ANALYSIS';
  scenarioSheet.getCell('A1').font = { bold: true, size: 14 };

  scenarioSheet.addRow(['', 'Bear Case', 'Base Case', 'Bull Case']);
  scenarioSheet.getRow(2).font = { bold: true };
  scenarioSheet.getRow(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

  const bearMultiplier = 0.85;
  const bullMultiplier = 1.15;

  scenarioSheet.addRow(['Revenue Growth (Avg)', 
    (revenueGrowthRates.reduce((a,b) => a+b, 0) / 5) * bearMultiplier,
    revenueGrowthRates.reduce((a,b) => a+b, 0) / 5,
    (revenueGrowthRates.reduce((a,b) => a+b, 0) / 5) * bullMultiplier
  ]);
  for (let i = 2; i <= 4; i++) {
    scenarioSheet.getCell(3, i).numFmt = percentFormat;
  }

  scenarioSheet.addRow(['Terminal EBITDA Margin',
    targetEBITDAMargin * bearMultiplier,
    targetEBITDAMargin,
    Math.min(targetEBITDAMargin * bullMultiplier, 0.45)
  ]);
  for (let i = 2; i <= 4; i++) {
    scenarioSheet.getCell(4, i).numFmt = percentFormat;
  }

  scenarioSheet.addRow(['WACC',
    wacc + 0.015,
    wacc,
    wacc - 0.015
  ]);
  for (let i = 2; i <= 4; i++) {
    scenarioSheet.getCell(5, i).numFmt = percentFormat;
  }

  scenarioSheet.addRow(['Terminal Growth',
    terminalGrowthRate - 0.01,
    terminalGrowthRate,
    terminalGrowthRate + 0.01
  ]);
  for (let i = 2; i <= 4; i++) {
    scenarioSheet.getCell(6, i).numFmt = percentFormat;
  }

  scenarioSheet.addRow(['']);

  const bearEquity = calculateScenarioEquity(assumptions, bearMultiplier, wacc + 0.015, terminalGrowthRate - 0.01);
  const baseEquity = calculateScenarioEquity(assumptions, 1, wacc, terminalGrowthRate);
  const bullEquity = calculateScenarioEquity(assumptions, bullMultiplier, wacc - 0.015, terminalGrowthRate + 0.01);

  scenarioSheet.addRow(['Equity Value ($M)', bearEquity, baseEquity, bullEquity]);
  scenarioSheet.getRow(8).font = { bold: true };
  for (let i = 2; i <= 4; i++) {
    scenarioSheet.getCell(8, i).numFmt = currencyFormat;
  }

  scenarioSheet.addRow(['Value per Share', 
    bearEquity / sharesOutstanding, 
    baseEquity / sharesOutstanding, 
    bullEquity / sharesOutstanding
  ]);
  scenarioSheet.getRow(9).font = { bold: true };
  for (let i = 2; i <= 4; i++) {
    scenarioSheet.getCell(9, i).numFmt = perShareFormat;
  }

  scenarioSheet.getCell('B8').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF9999' } };
  scenarioSheet.getCell('C8').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
  scenarioSheet.getCell('D8').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF99FF99' } };
  
  scenarioSheet.getCell('B9').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF9999' } };
  scenarioSheet.getCell('C9').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
  scenarioSheet.getCell('D9').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF99FF99' } };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function calculateYear5FCF(assumptions: DCFAssumptions): number {
  const { baseYearRevenue, revenueGrowthRates, baseEBITDAMargin, targetEBITDAMargin, 
          daPercent, taxRate, capexPercent, nwcPercent } = assumptions;
  
  let revenue = baseYearRevenue;
  let prevNwc = revenue * nwcPercent;
  
  for (let year = 1; year <= 5; year++) {
    revenue = revenue * (1 + revenueGrowthRates[year - 1]);
  }
  
  const margin = targetEBITDAMargin;
  const ebitda = revenue * margin;
  const da = revenue * daPercent;
  const ebit = ebitda - da;
  const taxes = ebit * taxRate;
  const nopat = ebit - taxes;
  const capex = revenue * capexPercent;
  const currentNwc = revenue * nwcPercent;
  
  let prevRevenue = baseYearRevenue;
  for (let year = 1; year <= 4; year++) {
    prevRevenue = prevRevenue * (1 + revenueGrowthRates[year - 1]);
  }
  prevNwc = prevRevenue * nwcPercent;
  
  const changeNwc = currentNwc - prevNwc;
  const fcf = nopat + da - capex - changeNwc;
  
  return fcf;
}

function calculatePVOfFCFs(assumptions: DCFAssumptions, waccVal: number): number {
  const { baseYearRevenue, revenueGrowthRates, baseEBITDAMargin, targetEBITDAMargin,
          marginExpansionYears, daPercent, taxRate, capexPercent, nwcPercent } = assumptions;
  
  let totalPV = 0;
  let prevRevenue = baseYearRevenue;
  let prevNwc = baseYearRevenue * nwcPercent;
  
  for (let year = 1; year <= 5; year++) {
    const revenue = prevRevenue * (1 + revenueGrowthRates[year - 1]);
    const marginProgress = Math.min(year / marginExpansionYears, 1);
    const margin = baseEBITDAMargin + (targetEBITDAMargin - baseEBITDAMargin) * marginProgress;
    
    const ebitda = revenue * margin;
    const da = revenue * daPercent;
    const ebit = ebitda - da;
    const taxes = ebit * taxRate;
    const nopat = ebit - taxes;
    const capex = revenue * capexPercent;
    const currentNwc = revenue * nwcPercent;
    const changeNwc = currentNwc - prevNwc;
    const fcf = nopat + da - capex - changeNwc;
    
    const discountFactor = 1 / Math.pow(1 + waccVal, year);
    totalPV += fcf * discountFactor;
    
    prevRevenue = revenue;
    prevNwc = currentNwc;
  }
  
  return totalPV;
}

function calculateScenarioEquity(
  assumptions: DCFAssumptions, 
  growthMultiplier: number, 
  waccVal: number, 
  termGrowth: number
): number {
  const modifiedAssumptions = {
    ...assumptions,
    revenueGrowthRates: assumptions.revenueGrowthRates.map(r => r * growthMultiplier),
    targetEBITDAMargin: Math.min(assumptions.targetEBITDAMargin * growthMultiplier, 0.45)
  };
  
  const pvFcfs = calculatePVOfFCFs(modifiedAssumptions, waccVal);
  
  let revenue = modifiedAssumptions.baseYearRevenue;
  for (let year = 1; year <= 5; year++) {
    revenue = revenue * (1 + modifiedAssumptions.revenueGrowthRates[year - 1]);
  }
  
  const margin = modifiedAssumptions.targetEBITDAMargin;
  const ebitda = revenue * margin;
  const da = revenue * modifiedAssumptions.daPercent;
  const ebit = ebitda - da;
  const taxes = ebit * modifiedAssumptions.taxRate;
  const nopat = ebit - taxes;
  
  let prevRevenue = modifiedAssumptions.baseYearRevenue;
  for (let year = 1; year <= 4; year++) {
    prevRevenue = prevRevenue * (1 + modifiedAssumptions.revenueGrowthRates[year - 1]);
  }
  
  const capex = revenue * modifiedAssumptions.capexPercent;
  const currentNwc = revenue * modifiedAssumptions.nwcPercent;
  const prevNwc = prevRevenue * modifiedAssumptions.nwcPercent;
  const changeNwc = currentNwc - prevNwc;
  const year5Fcf = nopat + da - capex - changeNwc;
  
  const terminalFcf = year5Fcf * (1 + termGrowth);
  const terminalValue = terminalFcf / (waccVal - termGrowth);
  const pvTerminal = terminalValue / Math.pow(1 + waccVal, 5);
  
  const ev = pvFcfs + pvTerminal;
  const equityValue = ev - assumptions.totalDebt + assumptions.cashAndEquivalents;
  
  return equityValue;
}
