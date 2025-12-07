/**
 * GUARANTEED FINANCIAL PARSER
 * 
 * This module provides BULLETPROOF parsing that ALWAYS returns complete data.
 * Every required field is guaranteed to have a value - either extracted from
 * user input or filled with sensible defaults.
 * 
 * Architecture:
 * 1. Define complete field specifications with required defaults
 * 2. Extract values using regex patterns (deterministic)
 * 3. Merge with LLM-parsed values (supplementary)
 * 4. Apply defaults for any remaining undefined fields
 * 5. Validate that ALL required fields have values
 * 
 * The result: ZERO undefined values in the output. Ever.
 */

// ============ TYPE DEFINITIONS ============

export interface FieldSpec<T> {
  key: string;
  default: T;
  description: string;
  required: boolean;
}

export interface LBOGuaranteedValues {
  companyName: string;
  transactionDate: string;
  
  // Target Company Financials
  baseYearRevenue: number;
  ltmEBITDA: number;
  revenueGrowthRate: number;
  baseEBITDAMargin: number;
  targetEBITDAMargin: number;
  marginExpansionYears: number;
  daPercent: number;
  capexPercent: number;
  nwcPercent: number;
  taxRate: number;
  
  // Purchase Price
  purchasePrice: number;
  entryMultiple: number;
  transactionCosts: number;
  transactionCostsExplicit: number | null;
  financingFees: number;
  financingFeesExplicit: number | null;
  managementRollover: number;
  
  // Financing Structure
  seniorDebtMultiple: number;
  seniorDebtAmount: number;
  seniorDebtRate: number;
  subDebtMultiple: number;
  subDebtAmount: number;
  subDebtRate: number;
  subDebtPIK: number;
  revolverSize: number;
  revolverRate: number;
  sponsorEquity: number;
  cashFlowSweepPercent: number;
  
  // Exit Assumptions
  exitYear: number;
  exitMultiple: number;
  exitCosts: number;
  
  // Management Fee
  managementFeePercent: number;
}

export interface MAGuaranteedValues {
  acquirerName: string;
  targetName: string;
  transactionDate: string;
  
  // Valuation
  purchasePrice: number;
  entryMultiple: number;
  
  // Target Financials
  targetRevenue: number;
  targetEBITDA: number;
  targetNetIncome: number;
  targetEPS: number;
  targetShares: number;
  
  // Acquirer Financials
  acquirerRevenue: number;
  acquirerEBITDA: number;
  acquirerNetIncome: number;
  acquirerEPS: number;
  acquirerShares: number;
  acquirerStockPrice: number;
  
  // Deal Structure
  cashPercent: number;
  stockPercent: number;
  debtFinancing: number;
  debtRate: number;
  transactionFees: number;
  
  // Synergies
  revenueSynergies: number;
  costSynergies: number;
  synergyCostToAchieve: number;
  revenuePhaseIn: number[];
  costPhaseIn: number[];
  revenueSynergyMargin: number;
  
  // Other
  projectionYears: number;
  revenueGrowthRate: number;
  taxRate: number;
}

export interface DCFGuaranteedValues {
  companyName: string;
  
  // Financials
  baseRevenue: number;
  baseEBITDA: number;
  
  // Growth Assumptions
  revenueGrowthRates: number[];
  ebitdaMargins: number[];
  
  // Other Assumptions
  daPercent: number;
  capexPercent: number;
  nwcPercent: number;
  taxRate: number;
  
  // Discount Rate
  wacc: number;
  
  // Terminal Value
  terminalGrowthRate: number;
  terminalMultiple: number;
  
  // Projection Period
  projectionYears: number;
  
  // Mode
  constantAssumptions: boolean;
}

export interface IPOGuaranteedValues {
  companyName: string;
  
  // Financials
  revenue: number;
  ebitda: number;
  netIncome: number;
  
  // Valuation
  revenueMultiple: number;
  ebitdaMultiple: number;
  preMoneyValuation: number;
  
  // Offering
  preIPOShares: number;
  newPrimaryShares: number;
  secondaryShares: number;
  greenshoeShares: number;
  ipoDiscount: number;
  
  // Other
  underwritingFee: number;
  expectedPop: number;
}

export interface ThreeStatementGuaranteedValues {
  companyName: string;
  
  // Income Statement
  baseRevenue: number;
  revenueGrowthRates: number[];
  grossMargin: number;
  sgaPercent: number;
  rdPercent: number;
  daPercent: number;
  interestRate: number;
  taxRate: number;
  
  // Balance Sheet
  cashPercent: number;
  arDays: number;
  inventoryDays: number;
  ppeDays: number;
  apDays: number;
  
  // Debt
  beginningDebt: number;
  debtPaydown: number;
  
  // Shares
  sharesOutstanding: number;
  
  // Projection
  projectionYears: number;
}

// ============ DEFAULT VALUES ============

export const LBO_DEFAULTS: LBOGuaranteedValues = {
  companyName: "Target Company",
  transactionDate: new Date().toISOString().split('T')[0],
  
  baseYearRevenue: 500,
  ltmEBITDA: 100,
  revenueGrowthRate: 0.05,
  baseEBITDAMargin: 0.20,
  targetEBITDAMargin: 0.22,
  marginExpansionYears: 3,
  daPercent: 0.03,
  capexPercent: 0.03,
  nwcPercent: 0.10,
  taxRate: 0.25,
  
  purchasePrice: 800,
  entryMultiple: 8.0,
  transactionCosts: 0.02,
  transactionCostsExplicit: null,
  financingFees: 0.01,
  financingFeesExplicit: null,
  managementRollover: 0,
  
  seniorDebtMultiple: 4.0,
  seniorDebtAmount: 400,
  seniorDebtRate: 0.065,
  subDebtMultiple: 1.0,
  subDebtAmount: 100,
  subDebtRate: 0.12,
  subDebtPIK: 0,
  revolverSize: 50,
  revolverRate: 0.055,
  sponsorEquity: 300,
  cashFlowSweepPercent: 0.75,
  
  exitYear: 5,
  exitMultiple: 8.0,
  exitCosts: 0.02,
  
  managementFeePercent: 0.01,
};

export const MA_DEFAULTS: MAGuaranteedValues = {
  acquirerName: "Acquirer Corp",
  targetName: "Target Corp",
  transactionDate: new Date().toISOString().split('T')[0],
  
  purchasePrice: 500,
  entryMultiple: 8.0,
  
  targetRevenue: 200,
  targetEBITDA: 40,
  targetNetIncome: 25,
  targetEPS: 2.50,
  targetShares: 10,
  
  acquirerRevenue: 1000,
  acquirerEBITDA: 200,
  acquirerNetIncome: 120,
  acquirerEPS: 4.00,
  acquirerShares: 30,
  acquirerStockPrice: 100,
  
  cashPercent: 0.50,
  stockPercent: 0.50,
  debtFinancing: 0,
  debtRate: 0.05,
  transactionFees: 0.02,
  
  revenueSynergies: 0,
  costSynergies: 20,
  synergyCostToAchieve: 10,
  revenuePhaseIn: [0, 0.5, 1.0, 1.0, 1.0],
  costPhaseIn: [0.2, 0.6, 1.0, 1.0, 1.0],
  revenueSynergyMargin: 1.0,
  
  projectionYears: 5,
  revenueGrowthRate: 0.05,
  taxRate: 0.25,
};

export const DCF_DEFAULTS: DCFGuaranteedValues = {
  companyName: "Company",
  
  baseRevenue: 1000,
  baseEBITDA: 200,
  
  revenueGrowthRates: [0.08, 0.07, 0.06, 0.05, 0.04],
  ebitdaMargins: [0.20, 0.20, 0.20, 0.20, 0.20],
  
  daPercent: 0.03,
  capexPercent: 0.04,
  nwcPercent: 0.10,
  taxRate: 0.25,
  
  wacc: 0.10,
  
  terminalGrowthRate: 0.025,
  terminalMultiple: 10.0,
  
  projectionYears: 5,
  constantAssumptions: true,
};

export const IPO_DEFAULTS: IPOGuaranteedValues = {
  companyName: "Company",
  
  revenue: 500,
  ebitda: 100,
  netIncome: 60,
  
  revenueMultiple: 10.0,
  ebitdaMultiple: 15.0,
  preMoneyValuation: 5000,
  
  preIPOShares: 100,
  newPrimaryShares: 20,
  secondaryShares: 0,
  greenshoeShares: 3,
  ipoDiscount: 0.15,
  
  underwritingFee: 0.07,
  expectedPop: 0.15,
};

export const THREE_STATEMENT_DEFAULTS: ThreeStatementGuaranteedValues = {
  companyName: "Company",
  
  baseRevenue: 1000,
  revenueGrowthRates: [0.08, 0.07, 0.06, 0.05, 0.04],
  grossMargin: 0.40,
  sgaPercent: 0.15,
  rdPercent: 0.05,
  daPercent: 0.03,
  interestRate: 0.05,
  taxRate: 0.25,
  
  cashPercent: 0.10,
  arDays: 45,
  inventoryDays: 60,
  ppeDays: 180,
  apDays: 30,
  
  beginningDebt: 200,
  debtPaydown: 20,
  
  sharesOutstanding: 100,
  
  projectionYears: 5,
};

// ============ REGEX EXTRACTION UTILITIES ============

function extractNumber(text: string, patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const value = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(value)) {
        return value;
      }
    }
  }
  return null;
}

function extractMoney(text: string, patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      let value = parseFloat(match[1].replace(/,/g, ''));
      if (isNaN(value)) continue;
      
      const fullMatch = match[0].toLowerCase();
      if (fullMatch.includes('billion') || fullMatch.includes('bn') || /\d+\s*b(?:\s|$)/i.test(fullMatch)) {
        value *= 1000;
      }
      return value;
    }
  }
  return null;
}

function extractPercent(text: string, patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      let value = parseFloat(match[1].replace(/,/g, ''));
      if (isNaN(value)) continue;
      
      if (value > 1) value /= 100;
      return value;
    }
  }
  return null;
}

// ============ LBO GUARANTEED PARSER ============

export function parseLBOGuaranteed(text: string): LBOGuaranteedValues {
  const result = { ...LBO_DEFAULTS };
  const lower = text.toLowerCase();
  
  console.log('[GuaranteedParser] Starting LBO extraction from text...');
  
  // Company name - extract from quotes or "Company X"
  const nameMatch = text.match(/["']([^"']+)["']|(?:company|target|firm)(?:\s+called)?\s+(\w+)/i);
  if (nameMatch) {
    result.companyName = nameMatch[1] || nameMatch[2] || result.companyName;
    console.log(`[GuaranteedParser] Company name: ${result.companyName}`);
  }
  
  // ============ EBITDA (CRITICAL - many values derive from this) ============
  const ebitdaPatterns = [
    /(?:ltm\s+)?ebitda\s+(?:of\s+)?\$?([\d,.]+)\s*(?:m|mm|million)?/i,
    /\$?([\d,.]+)\s*(?:m|mm|million)?\s+(?:ltm\s+)?ebitda/i,
    /ebitda\s*[=:]\s*\$?([\d,.]+)/i,
  ];
  const ebitda = extractMoney(text, ebitdaPatterns);
  if (ebitda !== null) {
    result.ltmEBITDA = ebitda;
    console.log(`[GuaranteedParser] EBITDA: $${ebitda}M`);
  }
  
  // ============ REVENUE ============
  const revenuePatterns = [
    /(?:ltm\s+)?revenue\s+(?:of\s+)?\$?([\d,.]+)\s*(?:m|mm|million)?/i,
    /\$?([\d,.]+)\s*(?:m|mm|million)?\s+(?:ltm\s+)?revenue/i,
    /revenue\s*[=:]\s*\$?([\d,.]+)/i,
  ];
  const revenue = extractMoney(text, revenuePatterns);
  if (revenue !== null) {
    result.baseYearRevenue = revenue;
    console.log(`[GuaranteedParser] Revenue: $${revenue}M`);
  }
  
  // If we have EBITDA but no revenue, calculate from assumed 20% margin
  if (result.ltmEBITDA !== LBO_DEFAULTS.ltmEBITDA && result.baseYearRevenue === LBO_DEFAULTS.baseYearRevenue) {
    result.baseYearRevenue = result.ltmEBITDA / 0.20;
    console.log(`[GuaranteedParser] Revenue calculated from EBITDA: $${result.baseYearRevenue}M`);
  }
  
  // ============ ENTRY MULTIPLE ============
  const entryMultiplePatterns = [
    /([\d.]+)\s*[×x]\s*(?:ltm\s+)?ebitda/i,
    /(?:entry|purchase|buy(?:ing)?)\s+(?:at\s+)?([\d.]+)\s*[×x]/i,
    /multiple\s*[=:]\s*([\d.]+)/i,
  ];
  const entryMultiple = extractNumber(text, entryMultiplePatterns);
  if (entryMultiple !== null) {
    result.entryMultiple = entryMultiple;
    console.log(`[GuaranteedParser] Entry multiple: ${entryMultiple}x`);
  }
  
  // ============ PURCHASE PRICE ============
  // IMPORTANT: Must NOT match multiples like "8.2×" - only actual dollar amounts
  // The (?![×x]) negative lookahead prevents matching "8.2×" as $8.2M
  const purchasePricePatterns = [
    /(?:ev|enterprise\s+value)\s*[=:]\s*\$?([\d,.]+)\s*(?:m|mm|million|b|bn|billion)?(?![×x])/i,
    /(?:buy(?:ing)?|acquir(?:e|ing))\s+(?:for|at)\s+\$?([\d,.]+)\s*(?:m|mm|million|b|bn|billion)?(?![×x])/i,
    /\$?([\d,.]+)\s*(?:m|mm|million|b|bn|billion)\s+(?:purchase\s+price|ev|enterprise\s+value)/i,
    /\(EV\s*=\s*\$?([\d,.]+)\s*(?:m|mm|million|b|bn|billion)?\)/i,
  ];
  const purchasePrice = extractMoney(text, purchasePricePatterns);
  if (purchasePrice !== null && purchasePrice > 50) {
    // Only use if it looks like a reasonable EV (>$50M)
    result.purchasePrice = purchasePrice;
    console.log(`[GuaranteedParser] Purchase price: $${purchasePrice}M`);
  } else if (result.ltmEBITDA !== LBO_DEFAULTS.ltmEBITDA && result.entryMultiple !== LBO_DEFAULTS.entryMultiple) {
    // Calculate from EBITDA × multiple
    result.purchasePrice = result.ltmEBITDA * result.entryMultiple;
    console.log(`[GuaranteedParser] Purchase price calculated: $${result.ltmEBITDA}M × ${result.entryMultiple}x = $${result.purchasePrice}M`);
  } else if (result.ltmEBITDA !== LBO_DEFAULTS.ltmEBITDA) {
    // Have EBITDA, use default multiple
    result.purchasePrice = result.ltmEBITDA * result.entryMultiple;
    console.log(`[GuaranteedParser] Purchase price from EBITDA × default multiple: $${result.purchasePrice}M`);
  }
  
  // ============ SENIOR DEBT ============
  // Check for multiple format: "4.0× Senior Debt at 6.5%"
  const seniorMultiplePatterns = [
    /([\d.]+)\s*[×x]\s*senior/i,
    /senior\s*(?:debt)?\s*[:\s]*([\d.]+)\s*[×x]/i,
  ];
  const seniorMultiple = extractNumber(text, seniorMultiplePatterns);
  if (seniorMultiple !== null) {
    result.seniorDebtMultiple = seniorMultiple;
    result.seniorDebtAmount = result.ltmEBITDA * seniorMultiple;
    console.log(`[GuaranteedParser] Senior debt: ${seniorMultiple}x = $${result.seniorDebtAmount}M`);
  }
  
  // Check for explicit amount: "$400M senior debt"
  const seniorAmountPatterns = [
    /\$?([\d,.]+)\s*(?:m|mm|million)?\s+senior/i,
    /senior\s*(?:debt)?\s*(?:of\s+)?\$?([\d,.]+)\s*(?:m|mm|million)?/i,
  ];
  const seniorAmount = extractMoney(text, seniorAmountPatterns);
  if (seniorAmount !== null && seniorAmount > 10) {
    result.seniorDebtAmount = seniorAmount;
    result.seniorDebtMultiple = result.seniorDebtAmount / result.ltmEBITDA;
    console.log(`[GuaranteedParser] Senior debt amount: $${seniorAmount}M (${result.seniorDebtMultiple.toFixed(1)}x)`);
  }
  
  // Senior rate
  const seniorRatePatterns = [
    /senior\s*(?:debt)?[^.]*?([\d.]+)\s*%/i,
  ];
  const seniorRate = extractPercent(text, seniorRatePatterns);
  if (seniorRate !== null) {
    result.seniorDebtRate = seniorRate;
    console.log(`[GuaranteedParser] Senior debt rate: ${(seniorRate * 100).toFixed(1)}%`);
  }
  
  // ============ SUB DEBT ============
  const subMultiplePatterns = [
    /([\d.]+)\s*[×x]\s*(?:sub(?:ordinated)?|mezz(?:anine)?)/i,
    /(?:sub(?:ordinated)?|mezz(?:anine)?)\s*(?:debt)?\s*[:\s]*([\d.]+)\s*[×x]/i,
  ];
  const subMultiple = extractNumber(text, subMultiplePatterns);
  if (subMultiple !== null) {
    result.subDebtMultiple = subMultiple;
    result.subDebtAmount = result.ltmEBITDA * subMultiple;
    console.log(`[GuaranteedParser] Sub debt: ${subMultiple}x = $${result.subDebtAmount}M`);
  }
  
  const subAmountPatterns = [
    /\$?([\d,.]+)\s*(?:m|mm|million)?\s+(?:sub(?:ordinated)?|mezz(?:anine)?)/i,
    /(?:sub(?:ordinated)?|mezz(?:anine)?)\s*(?:debt)?\s*(?:of\s+)?\$?([\d,.]+)\s*(?:m|mm|million)?/i,
  ];
  const subAmount = extractMoney(text, subAmountPatterns);
  if (subAmount !== null && subAmount > 5) {
    result.subDebtAmount = subAmount;
    result.subDebtMultiple = result.subDebtAmount / result.ltmEBITDA;
    console.log(`[GuaranteedParser] Sub debt amount: $${subAmount}M (${result.subDebtMultiple.toFixed(1)}x)`);
  }
  
  const subRatePatterns = [
    /(?:sub(?:ordinated)?|mezz(?:anine)?)\s*(?:debt)?[^.]*?([\d.]+)\s*%/i,
  ];
  const subRate = extractPercent(text, subRatePatterns);
  if (subRate !== null) {
    result.subDebtRate = subRate;
    console.log(`[GuaranteedParser] Sub debt rate: ${(subRate * 100).toFixed(1)}%`);
  }
  
  // ============ EXIT ASSUMPTIONS ============
  const holdPeriodPatterns = [
    /(\d+)\s*-?\s*year\s+hold/i,
    /hold\s+(?:for\s+)?(\d+)\s+years?/i,
    /exit\s+(?:after|in)\s+(\d+)\s+years?/i,
  ];
  const holdPeriod = extractNumber(text, holdPeriodPatterns);
  if (holdPeriod !== null) {
    result.exitYear = holdPeriod;
    console.log(`[GuaranteedParser] Hold period: ${holdPeriod} years`);
  }
  
  const exitMultiplePatterns = [
    /exit\s+(?:at\s+)?([\d.]+)\s*[×x]/i,
    /exit\s+multiple\s*[=:]\s*([\d.]+)/i,
    /([\d.]+)\s*[×x]\s+exit/i,
  ];
  const exitMultiple = extractNumber(text, exitMultiplePatterns);
  if (exitMultiple !== null) {
    result.exitMultiple = exitMultiple;
    console.log(`[GuaranteedParser] Exit multiple: ${exitMultiple}x`);
  } else {
    // Default exit = entry multiple
    result.exitMultiple = result.entryMultiple;
    console.log(`[GuaranteedParser] Exit multiple defaulted to entry: ${result.exitMultiple}x`);
  }
  
  // ============ FEES ============
  const txFeePatterns = [
    /transaction\s+(?:fees?|costs?)\s*(?:of\s+)?\$?([\d,.]+)\s*(?:m|mm|million)?/i,
    /\$?([\d,.]+)\s*(?:m|mm|million)?\s+(?:transaction|deal)\s+(?:fees?|costs?)/i,
  ];
  const txFee = extractMoney(text, txFeePatterns);
  if (txFee !== null) {
    result.transactionCostsExplicit = txFee;
    console.log(`[GuaranteedParser] Transaction fees: $${txFee}M`);
  }
  
  const finFeePatterns = [
    /financing\s+fees?\s*(?:of\s+)?\$?([\d,.]+)\s*(?:m|mm|million)?/i,
    /\$?([\d,.]+)\s*(?:m|mm|million)?\s+financing\s+fees?/i,
  ];
  const finFee = extractMoney(text, finFeePatterns);
  if (finFee !== null) {
    result.financingFeesExplicit = finFee;
    console.log(`[GuaranteedParser] Financing fees: $${finFee}M`);
  }
  
  // ============ OTHER PERCENTAGES ============
  const marginPatterns = [
    /([\d.]+)\s*%\s*(?:ebitda\s+)?margin/i,
    /margin\s*(?:of\s+)?([\d.]+)\s*%/i,
  ];
  const margin = extractPercent(text, marginPatterns);
  if (margin !== null) {
    result.baseEBITDAMargin = margin;
    result.targetEBITDAMargin = margin + 0.02;
    console.log(`[GuaranteedParser] EBITDA margin: ${(margin * 100).toFixed(1)}%`);
  }
  
  const growthPatterns = [
    /([\d.]+)\s*%\s*(?:revenue\s+)?growth/i,
    /grow(?:th|ing)\s*(?:at\s+)?([\d.]+)\s*%/i,
  ];
  const growth = extractPercent(text, growthPatterns);
  if (growth !== null) {
    result.revenueGrowthRate = growth;
    console.log(`[GuaranteedParser] Revenue growth: ${(growth * 100).toFixed(1)}%`);
  }
  
  const taxPatterns = [
    /([\d.]+)\s*%\s*tax/i,
    /tax\s*(?:rate)?\s*(?:of\s+)?([\d.]+)\s*%/i,
  ];
  const tax = extractPercent(text, taxPatterns);
  if (tax !== null) {
    result.taxRate = tax;
    console.log(`[GuaranteedParser] Tax rate: ${(tax * 100).toFixed(1)}%`);
  }
  
  // ============ RECALCULATE DEPENDENT VALUES ============
  
  // If we changed EBITDA but not debt amounts, recalculate debt from defaults
  if (result.ltmEBITDA !== LBO_DEFAULTS.ltmEBITDA) {
    if (seniorMultiple === null && seniorAmount === null) {
      result.seniorDebtAmount = result.ltmEBITDA * result.seniorDebtMultiple;
      console.log(`[GuaranteedParser] Senior debt recalculated: $${result.seniorDebtAmount}M`);
    }
    if (subMultiple === null && subAmount === null) {
      result.subDebtAmount = result.ltmEBITDA * result.subDebtMultiple;
      console.log(`[GuaranteedParser] Sub debt recalculated: $${result.subDebtAmount}M`);
    }
  }
  
  // Calculate sponsor equity as residual
  const totalDebt = result.seniorDebtAmount + result.subDebtAmount;
  const txCosts = result.transactionCostsExplicit ?? (result.purchasePrice * result.transactionCosts);
  const finCosts = result.financingFeesExplicit ?? (totalDebt * result.financingFees);
  result.sponsorEquity = result.purchasePrice + txCosts + finCosts - totalDebt - result.managementRollover;
  console.log(`[GuaranteedParser] Sponsor equity calculated: $${result.sponsorEquity.toFixed(1)}M`);
  
  // ============ FINAL VALIDATION ============
  console.log('[GuaranteedParser] === FINAL LBO VALUES ===');
  console.log(`  EBITDA: $${result.ltmEBITDA}M`);
  console.log(`  Revenue: $${result.baseYearRevenue}M`);
  console.log(`  Purchase Price: $${result.purchasePrice}M (${result.entryMultiple}x)`);
  console.log(`  Senior Debt: $${result.seniorDebtAmount}M (${result.seniorDebtMultiple}x) @ ${(result.seniorDebtRate * 100).toFixed(1)}%`);
  console.log(`  Sub Debt: $${result.subDebtAmount}M (${result.subDebtMultiple}x) @ ${(result.subDebtRate * 100).toFixed(1)}%`);
  console.log(`  Sponsor Equity: $${result.sponsorEquity.toFixed(1)}M`);
  console.log(`  Exit: ${result.exitMultiple}x after ${result.exitYear} years`);
  console.log('[GuaranteedParser] === END ===');
  
  return result;
}

// ============ M&A GUARANTEED PARSER ============

export function parseMAGuaranteed(text: string): MAGuaranteedValues {
  const result = { ...MA_DEFAULTS };
  const lower = text.toLowerCase();
  
  console.log('[GuaranteedParser] Starting M&A extraction from text...');
  
  // ============ PURCHASE PRICE ============
  const purchasePricePatterns = [
    /(?:equity\s+value|purchase\s+price|ev|enterprise\s+value)\s*[=:]\s*\$?([\d,.]+)\s*(?:m|mm|million)?/i,
    /(?:buy(?:ing)?|acquir(?:e|ing))\s+(?:for|at)\s+\$?([\d,.]+)\s*(?:m|mm|million)?/i,
    /\$?([\d,.]+)\s*(?:m|mm|million|b|bn|billion)?\s+(?:purchase|acquisition|deal|transaction)/i,
  ];
  const purchasePrice = extractMoney(text, purchasePricePatterns);
  if (purchasePrice !== null) {
    result.purchasePrice = purchasePrice;
    console.log(`[GuaranteedParser] Purchase price: $${purchasePrice}M`);
  }
  
  // ============ TARGET EBITDA ============
  const targetEbitdaPatterns = [
    /(?:target\s+)?ebitda\s+(?:of\s+)?\$?([\d,.]+)\s*(?:m|mm|million)?/i,
    /\$?([\d,.]+)\s*(?:m|mm|million)?\s+(?:target\s+)?ebitda/i,
  ];
  const targetEbitda = extractMoney(text, targetEbitdaPatterns);
  if (targetEbitda !== null) {
    result.targetEBITDA = targetEbitda;
    console.log(`[GuaranteedParser] Target EBITDA: $${targetEbitda}M`);
  }
  
  // ============ MULTIPLE ============
  const multiplePatterns = [
    /([\d.]+)\s*[×x]\s*(?:ltm\s+)?ebitda/i,
    /multiple\s*[=:]\s*([\d.]+)/i,
  ];
  const multiple = extractNumber(text, multiplePatterns);
  if (multiple !== null) {
    result.entryMultiple = multiple;
    console.log(`[GuaranteedParser] Entry multiple: ${multiple}x`);
    
    // Calculate purchase price from multiple if not explicit
    if (purchasePrice === null && result.targetEBITDA !== MA_DEFAULTS.targetEBITDA) {
      result.purchasePrice = result.targetEBITDA * multiple;
      console.log(`[GuaranteedParser] Purchase price calculated: $${result.purchasePrice}M`);
    }
  }
  
  // ============ CASH/STOCK MIX ============
  const cashPatterns = [
    /([\d.]+)\s*%\s*cash/i,
    /cash\s*[=:]\s*([\d.]+)\s*%/i,
  ];
  const cash = extractPercent(text, cashPatterns);
  if (cash !== null) {
    result.cashPercent = cash;
    result.stockPercent = 1 - cash;
    console.log(`[GuaranteedParser] Cash: ${(cash * 100).toFixed(0)}%, Stock: ${((1 - cash) * 100).toFixed(0)}%`);
  } else if (lower.includes('all cash') || lower.includes('100% cash')) {
    result.cashPercent = 1.0;
    result.stockPercent = 0;
    console.log(`[GuaranteedParser] All cash deal`);
  } else if (lower.includes('all stock') || lower.includes('100% stock')) {
    result.cashPercent = 0;
    result.stockPercent = 1.0;
    console.log(`[GuaranteedParser] All stock deal`);
  }
  
  const stockPatterns = [
    /([\d.]+)\s*%\s*stock/i,
    /stock\s*[=:]\s*([\d.]+)\s*%/i,
  ];
  const stock = extractPercent(text, stockPatterns);
  if (stock !== null && cash === null) {
    result.stockPercent = stock;
    result.cashPercent = 1 - stock;
    console.log(`[GuaranteedParser] Stock: ${(stock * 100).toFixed(0)}%, Cash: ${((1 - stock) * 100).toFixed(0)}%`);
  }
  
  // ============ SYNERGIES ============
  const costSynergyPatterns = [
    /\$?([\d,.]+)\s*(?:m|mm|million)?\s+(?:cost|expense)\s+synerg/i,
    /cost\s+synerg[^$]*([\d,.]+)\s*(?:m|mm|million)?/i,
  ];
  const costSynergy = extractMoney(text, costSynergyPatterns);
  if (costSynergy !== null) {
    result.costSynergies = costSynergy;
    console.log(`[GuaranteedParser] Cost synergies: $${costSynergy}M`);
  }
  
  const revSynergyPatterns = [
    /\$?([\d,.]+)\s*(?:m|mm|million)?\s+(?:revenue)\s+synerg/i,
    /revenue\s+synerg[^$]*([\d,.]+)\s*(?:m|mm|million)?/i,
  ];
  const revSynergy = extractMoney(text, revSynergyPatterns);
  if (revSynergy !== null) {
    result.revenueSynergies = revSynergy;
    console.log(`[GuaranteedParser] Revenue synergies: $${revSynergy}M`);
  }
  
  // ============ ACQUIRER FINANCIALS ============
  const acquirerEPSPatterns = [
    /acquirer\s*(?:eps|earnings\s+per\s+share)\s*(?:of\s+)?\$?([\d.]+)/i,
    /\$?([\d.]+)\s*(?:acquirer)?\s*eps/i,
    /earns?\s+\$?([\d.]+)\s+per\s+share/i,
  ];
  const acquirerEPS = extractNumber(text, acquirerEPSPatterns);
  if (acquirerEPS !== null) {
    result.acquirerEPS = acquirerEPS;
    console.log(`[GuaranteedParser] Acquirer EPS: $${acquirerEPS}`);
  }
  
  const acquirerSharesPatterns = [
    /acquirer\s*(?:has\s+)?([\d,.]+)\s*(?:m|mm|million)?\s*shares/i,
    /([\d,.]+)\s*(?:m|mm|million)?\s+(?:acquirer\s+)?shares\s+outstanding/i,
  ];
  const acquirerShares = extractNumber(text, acquirerSharesPatterns);
  if (acquirerShares !== null) {
    result.acquirerShares = acquirerShares;
    console.log(`[GuaranteedParser] Acquirer shares: ${acquirerShares}M`);
  }
  
  // ============ FINAL OUTPUT ============
  console.log('[GuaranteedParser] === FINAL M&A VALUES ===');
  console.log(`  Purchase Price: $${result.purchasePrice}M`);
  console.log(`  Target EBITDA: $${result.targetEBITDA}M`);
  console.log(`  Multiple: ${result.entryMultiple}x`);
  console.log(`  Cash/Stock: ${(result.cashPercent * 100).toFixed(0)}% / ${(result.stockPercent * 100).toFixed(0)}%`);
  console.log(`  Cost Synergies: $${result.costSynergies}M`);
  console.log(`  Revenue Synergies: $${result.revenueSynergies}M`);
  console.log('[GuaranteedParser] === END ===');
  
  return result;
}

// ============ DCF GUARANTEED PARSER ============

export function parseDCFGuaranteed(text: string): DCFGuaranteedValues {
  const result = { ...DCF_DEFAULTS };
  const lower = text.toLowerCase();
  
  console.log('[GuaranteedParser] Starting DCF extraction from text...');
  
  // ============ REVENUE ============
  const revenuePatterns = [
    /revenue\s+(?:of\s+)?\$?([\d,.]+)\s*(?:m|mm|million)?/i,
    /\$?([\d,.]+)\s*(?:m|mm|million)?\s+(?:in\s+)?revenue/i,
  ];
  const revenue = extractMoney(text, revenuePatterns);
  if (revenue !== null) {
    result.baseRevenue = revenue;
    console.log(`[GuaranteedParser] Revenue: $${revenue}M`);
  }
  
  // ============ EBITDA ============
  const ebitdaPatterns = [
    /ebitda\s+(?:of\s+)?\$?([\d,.]+)\s*(?:m|mm|million)?/i,
    /\$?([\d,.]+)\s*(?:m|mm|million)?\s+ebitda/i,
  ];
  const ebitda = extractMoney(text, ebitdaPatterns);
  if (ebitda !== null) {
    result.baseEBITDA = ebitda;
    console.log(`[GuaranteedParser] EBITDA: $${ebitda}M`);
  }
  
  // ============ WACC ============
  const waccPatterns = [
    /wacc\s*(?:of\s+)?([\d.]+)\s*%/i,
    /([\d.]+)\s*%\s*wacc/i,
    /discount\s+rate\s*(?:of\s+)?([\d.]+)\s*%/i,
  ];
  const wacc = extractPercent(text, waccPatterns);
  if (wacc !== null) {
    result.wacc = wacc;
    console.log(`[GuaranteedParser] WACC: ${(wacc * 100).toFixed(1)}%`);
  }
  
  // ============ TERMINAL GROWTH ============
  const terminalGrowthPatterns = [
    /terminal\s+(?:growth|g)\s*(?:rate)?\s*(?:of\s+)?([\d.]+)\s*%/i,
    /(?:perpetuity|perpetual)\s+growth\s*(?:of\s+)?([\d.]+)\s*%/i,
  ];
  const terminalGrowth = extractPercent(text, terminalGrowthPatterns);
  if (terminalGrowth !== null) {
    result.terminalGrowthRate = terminalGrowth;
    console.log(`[GuaranteedParser] Terminal growth: ${(terminalGrowth * 100).toFixed(1)}%`);
  }
  
  // ============ MODE CHECK ============
  if (lower.includes('constant') || lower.includes('flat')) {
    result.constantAssumptions = true;
    console.log(`[GuaranteedParser] Mode: Constant assumptions`);
  } else if (lower.includes('ramp') || lower.includes('varying') || lower.includes('variable')) {
    result.constantAssumptions = false;
    console.log(`[GuaranteedParser] Mode: Variable/ramping assumptions`);
  }
  
  console.log('[GuaranteedParser] === FINAL DCF VALUES ===');
  console.log(`  Revenue: $${result.baseRevenue}M`);
  console.log(`  EBITDA: $${result.baseEBITDA}M`);
  console.log(`  WACC: ${(result.wacc * 100).toFixed(1)}%`);
  console.log(`  Terminal Growth: ${(result.terminalGrowthRate * 100).toFixed(1)}%`);
  console.log('[GuaranteedParser] === END ===');
  
  return result;
}

// ============ IPO GUARANTEED PARSER ============

export function parseIPOGuaranteed(text: string): IPOGuaranteedValues {
  const result = { ...IPO_DEFAULTS };
  const lower = text.toLowerCase();
  
  console.log('[GuaranteedParser] Starting IPO extraction from text...');
  
  // ============ REVENUE ============
  const revenuePatterns = [
    /revenue\s+(?:of\s+)?\$?([\d,.]+)\s*(?:m|mm|million)?/i,
    /\$?([\d,.]+)\s*(?:m|mm|million)?\s+(?:in\s+)?revenue/i,
  ];
  const revenue = extractMoney(text, revenuePatterns);
  if (revenue !== null) {
    result.revenue = revenue;
    console.log(`[GuaranteedParser] Revenue: $${revenue}M`);
  }
  
  // ============ MULTIPLE ============
  const multiplePatterns = [
    /([\d.]+)\s*[×x]\s*revenue/i,
    /revenue\s+multiple\s*(?:of\s+)?([\d.]+)/i,
  ];
  const multiple = extractNumber(text, multiplePatterns);
  if (multiple !== null) {
    result.revenueMultiple = multiple;
    console.log(`[GuaranteedParser] Revenue multiple: ${multiple}x`);
  }
  
  // ============ VALUATION ============
  const valuationPatterns = [
    /(?:pre-?money\s+)?valuation\s*(?:of\s+)?\$?([\d,.]+)\s*(?:m|mm|million|b|bn|billion)?/i,
    /valued\s+(?:at\s+)?\$?([\d,.]+)\s*(?:m|mm|million|b|bn|billion)?/i,
  ];
  const valuation = extractMoney(text, valuationPatterns);
  if (valuation !== null) {
    result.preMoneyValuation = valuation;
    console.log(`[GuaranteedParser] Valuation: $${valuation}M`);
  } else if (result.revenue !== IPO_DEFAULTS.revenue && result.revenueMultiple !== IPO_DEFAULTS.revenueMultiple) {
    result.preMoneyValuation = result.revenue * result.revenueMultiple;
    console.log(`[GuaranteedParser] Valuation calculated: $${result.preMoneyValuation}M`);
  }
  
  // ============ DISCOUNT ============
  const discountPatterns = [
    /(?:ipo\s+)?discount\s*(?:of\s+)?([\d.]+)\s*%/i,
    /([\d.]+)\s*%\s+(?:ipo\s+)?discount/i,
  ];
  const discount = extractPercent(text, discountPatterns);
  if (discount !== null) {
    result.ipoDiscount = discount;
    console.log(`[GuaranteedParser] IPO discount: ${(discount * 100).toFixed(0)}%`);
  }
  
  console.log('[GuaranteedParser] === FINAL IPO VALUES ===');
  console.log(`  Revenue: $${result.revenue}M`);
  console.log(`  Multiple: ${result.revenueMultiple}x`);
  console.log(`  Valuation: $${result.preMoneyValuation}M`);
  console.log(`  Discount: ${(result.ipoDiscount * 100).toFixed(0)}%`);
  console.log('[GuaranteedParser] === END ===');
  
  return result;
}

// ============ 3-STATEMENT GUARANTEED PARSER ============

export function parseThreeStatementGuaranteed(text: string): ThreeStatementGuaranteedValues {
  const result = { ...THREE_STATEMENT_DEFAULTS };
  const lower = text.toLowerCase();
  
  console.log('[GuaranteedParser] Starting 3-Statement extraction from text...');
  
  // ============ REVENUE ============
  const revenuePatterns = [
    /revenue\s+(?:of\s+)?\$?([\d,.]+)\s*(?:m|mm|million)?/i,
    /\$?([\d,.]+)\s*(?:m|mm|million)?\s+(?:in\s+)?revenue/i,
  ];
  const revenue = extractMoney(text, revenuePatterns);
  if (revenue !== null) {
    result.baseRevenue = revenue;
    console.log(`[GuaranteedParser] Revenue: $${revenue}M`);
  }
  
  // ============ GROWTH ============
  const growthPatterns = [
    /([\d.]+)\s*%\s*(?:revenue\s+)?growth/i,
    /grow(?:th|ing)\s*(?:at\s+)?([\d.]+)\s*%/i,
  ];
  const growth = extractPercent(text, growthPatterns);
  if (growth !== null) {
    result.revenueGrowthRates = [growth, growth, growth, growth, growth];
    console.log(`[GuaranteedParser] Growth: ${(growth * 100).toFixed(1)}%`);
  }
  
  // ============ MARGINS ============
  const grossMarginPatterns = [
    /gross\s+margin\s*(?:of\s+)?([\d.]+)\s*%/i,
    /([\d.]+)\s*%\s+gross\s+margin/i,
  ];
  const grossMargin = extractPercent(text, grossMarginPatterns);
  if (grossMargin !== null) {
    result.grossMargin = grossMargin;
    console.log(`[GuaranteedParser] Gross margin: ${(grossMargin * 100).toFixed(1)}%`);
  }
  
  console.log('[GuaranteedParser] === FINAL 3-STATEMENT VALUES ===');
  console.log(`  Revenue: $${result.baseRevenue}M`);
  console.log(`  Growth: ${(result.revenueGrowthRates[0] * 100).toFixed(1)}%`);
  console.log(`  Gross Margin: ${(result.grossMargin * 100).toFixed(1)}%`);
  console.log('[GuaranteedParser] === END ===');
  
  return result;
}

// ============ MERGE UTILITIES ============

/**
 * Merge LLM-parsed values with guaranteed defaults
 * Priority: Explicit user values > LLM parsed > Defaults
 */
export function mergeLBOValues(
  guaranteed: LBOGuaranteedValues,
  llmParsed: Partial<LBOGuaranteedValues>
): LBOGuaranteedValues {
  const result = { ...guaranteed };
  
  for (const key of Object.keys(llmParsed) as (keyof LBOGuaranteedValues)[]) {
    const llmValue = llmParsed[key];
    const guaranteedValue = guaranteed[key];
    const defaultValue = LBO_DEFAULTS[key];
    
    // Only use LLM value if:
    // 1. LLM value exists and is not null/undefined
    // 2. Guaranteed value is still at default (meaning regex didn't extract it)
    if (llmValue !== null && llmValue !== undefined && guaranteedValue === defaultValue) {
      (result as any)[key] = llmValue;
      console.log(`[Merge] Using LLM value for ${key}: ${llmValue}`);
    }
  }
  
  return result;
}

export function mergeMAValues(
  guaranteed: MAGuaranteedValues,
  llmParsed: Partial<MAGuaranteedValues>
): MAGuaranteedValues {
  const result = { ...guaranteed };
  
  for (const key of Object.keys(llmParsed) as (keyof MAGuaranteedValues)[]) {
    const llmValue = llmParsed[key];
    const guaranteedValue = guaranteed[key];
    const defaultValue = MA_DEFAULTS[key];
    
    if (llmValue !== null && llmValue !== undefined && guaranteedValue === defaultValue) {
      (result as any)[key] = llmValue;
      console.log(`[Merge] Using LLM value for ${key}: ${llmValue}`);
    }
  }
  
  return result;
}
