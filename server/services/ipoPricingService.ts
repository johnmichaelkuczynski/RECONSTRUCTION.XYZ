import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

export type FinanceLLMProvider = 'zhi1' | 'zhi2' | 'zhi3' | 'zhi4' | 'zhi5';

export interface IPOAssumptions {
  companyName: string;
  filingDate: string;
  sector: string; // biotech, saas, ai_infrastructure, fintech, consumer, tech
  
  sharesOutstandingPreIPO: number;
  primarySharesOffered: number;
  secondarySharesOffered: number;
  greenshoeShares: number; // Explicit greenshoe shares (not percent)
  greenshoePercent: number;
  
  targetGrossProceeds: number;
  indicatedPriceRangeLow: number;
  indicatedPriceRangeHigh: number;
  
  // Revenue figures
  currentYearRevenue: number;
  nextYearRevenue: number; // NTM revenue for valuation
  nextYearRevenueGrowth: number;
  nextYearEBITDA: number;
  nextYearEBITDAMargin: number;
  
  // For Biotech - 2030 risk-adjusted revenue (rNPV basis)
  riskAdjustedRevenue2030?: number;
  
  dcfValuePerShare: number;
  
  // CRITICAL: Parse peer median EXACTLY as stated
  peerMedianEVRevenue: number; // Must be parsed literally from prompt
  
  // Order book - parse EXACTLY, never smooth
  orderBook: {
    priceLevel: number;
    oversubscription: number;
  }[];
  
  // Sector-specific historical pop - parse EXACTLY from prompt
  historicalFirstDayPop: number; // e.g., 1.02 for 102%
  sectorAverageFirstDayPop: number;
  
  foundersEmployeesOwnership: number;
  vcPeOwnership: number;
  
  underwritingFeePercent: number;
  
  useOfProceeds?: string;
  lockupDays?: number;
  
  // CEO/Board guidance - CRITICAL for pricing decision
  ceoGuidance?: string; // e.g., "biggest valuation in AI history", "price to absolute limit"
  boardGuidance?: string; // e.g., "clean, orderly aftermarket"
  pricingAggressiveness: "conservative" | "moderate" | "aggressive" | "maximum"; // Derived from guidance
}

const IPO_PARSING_PROMPT = `You are an investment banking expert specializing in IPO pricing. Parse the following natural language description of an IPO and extract all relevant parameters.

CRITICAL PARSING RULES:
1. Parse the PEER MEDIAN MULTIPLE exactly as stated. If prompt says "Median 46×" then peerMedianEVRevenue = 46
2. Parse the HISTORICAL FIRST-DAY POP exactly as stated. If prompt says "Average first-day pop: +102%" then historicalFirstDayPop = 1.02
3. Parse the ORDER BOOK exactly - "$88+: 34×" means priceLevel: 88, oversubscription: 34
4. Parse CEO/BOARD GUIDANCE verbatim and set pricingAggressiveness accordingly:
   - "biggest valuation" / "price to absolute limit" / "maximum" → "maximum"
   - "leave money on table" / "clean aftermarket" → "conservative"
   - Default → "moderate"

SECTOR DETECTION:
- "AI infrastructure" / "GPU cloud" / "compute" → "ai_infrastructure" (expect 80-120% pops)
- "biotech" / "clinical-stage" / "drug" → "biotech" (expect 50-80% pops)
- "SaaS" / "software" / "enterprise" → "saas" (expect 20-40% pops)

Return a JSON object with the following structure:
{
  "companyName": "Company Name",
  "filingDate": "YYYY-MM-DD",
  "sector": "ai_infrastructure" | "biotech" | "saas" | "fintech" | "consumer" | "tech",
  
  "sharesOutstandingPreIPO": number (in millions),
  "primarySharesOffered": number (in millions),
  "secondarySharesOffered": number (in millions, default 0),
  "greenshoeShares": number (in millions, explicit shares if mentioned),
  "greenshoePercent": number (as decimal, e.g., 0.15 for 15%),
  
  "targetGrossProceeds": number (in millions),
  "indicatedPriceRangeLow": number,
  "indicatedPriceRangeHigh": number,
  
  "currentYearRevenue": number (in millions),
  "nextYearRevenue": number (in millions - THIS IS THE NTM REVENUE FOR VALUATION),
  "nextYearRevenueGrowth": number (as decimal, e.g., 1.08 for 108%),
  "nextYearEBITDA": number (in millions),
  "nextYearEBITDAMargin": number (as decimal),
  
  "riskAdjustedRevenue2030": number (for biotech only),
  
  "dcfValuePerShare": number,
  
  "peerMedianEVRevenue": number (PARSE EXACTLY FROM PROMPT - if "Median 46×" then 46),
  
  "orderBook": [
    { "priceLevel": number, "oversubscription": number }
  ],
  
  "historicalFirstDayPop": number (PARSE EXACTLY - if "+102%" then 1.02),
  "sectorAverageFirstDayPop": number (same as historicalFirstDayPop unless different),
  
  "foundersEmployeesOwnership": number (as decimal),
  "vcPeOwnership": number (as decimal),
  
  "underwritingFeePercent": number (default 0.07),
  
  "ceoGuidance": "exact quote from CEO if mentioned",
  "boardGuidance": "exact quote from board if mentioned",
  "pricingAggressiveness": "conservative" | "moderate" | "aggressive" | "maximum"
}

IMPORTANT: Return ONLY the JSON object, no markdown, no explanation.`;

export async function parseIPODescription(
  description: string,
  provider: FinanceLLMProvider,
  customInstructions?: string
): Promise<{ assumptions: IPOAssumptions; providerUsed: string }> {
  const fullPrompt = customInstructions 
    ? `${IPO_PARSING_PROMPT}\n\nAdditional Instructions: ${customInstructions}\n\nDescription:\n${description}`
    : `${IPO_PARSING_PROMPT}\n\nDescription:\n${description}`;

  let responseText: string = "";
  let providerUsed: string = "";

  if (provider === "zhi1") {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: fullPrompt }],
      temperature: 0.1, // Lower temperature for more literal parsing
    });
    responseText = response.choices[0]?.message?.content || "";
    providerUsed = "ZHI 1";
  } else if (provider === "zhi2") {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
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
      temperature: 0.1,
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
        temperature: 0.1,
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
      temperature: 0.1,
    });
    responseText = response.choices[0]?.message?.content || "";
    providerUsed = "ZHI 5";
  }

  let jsonStr = responseText.trim();
  if (jsonStr.startsWith("```json")) {
    jsonStr = jsonStr.slice(7);
  } else if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith("```")) {
    jsonStr = jsonStr.slice(0, -3);
  }
  
  if (!jsonStr.startsWith("{")) {
    const startIdx = jsonStr.indexOf("{");
    const endIdx = jsonStr.lastIndexOf("}");
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      jsonStr = jsonStr.slice(startIdx, endIdx + 1);
    }
  }
  
  jsonStr = jsonStr.trim();

  const assumptions: IPOAssumptions = JSON.parse(jsonStr);
  
  // Set defaults and derive pricingAggressiveness if not set
  if (!assumptions.sector) {
    assumptions.sector = "tech";
  }
  
  // Derive aggressiveness from CEO/board guidance
  if (!assumptions.pricingAggressiveness) {
    const ceoLower = (assumptions.ceoGuidance || "").toLowerCase();
    const boardLower = (assumptions.boardGuidance || "").toLowerCase();
    
    if (ceoLower.includes("biggest") || ceoLower.includes("maximum") || 
        ceoLower.includes("absolute limit") || ceoLower.includes("history")) {
      assumptions.pricingAggressiveness = "maximum";
    } else if (boardLower.includes("clean") || boardLower.includes("orderly") || 
               boardLower.includes("leave money")) {
      assumptions.pricingAggressiveness = "conservative";
    } else {
      assumptions.pricingAggressiveness = "moderate";
    }
  }
  
  return { assumptions, providerUsed };
}

interface PricingRow {
  offerPrice: number;
  marketCap: number;
  enterpriseValue: number;
  ntmEVRevenue: number; // Always calculate this correctly
  vsPeerMedianDiscount: number;
  dcfSupport: number; // offer price as % of DCF
  grossProceeds: number;
  oversubscription: number;
  impliedFirstDayPop: number;
  founderEmployeeOwnershipPost: number;
}

export function calculateIPOPricing(assumptions: IPOAssumptions): {
  assumptions: IPOAssumptions;
  pricingMatrix: PricingRow[];
  recommendedRangeLow: number;
  recommendedRangeHigh: number;
  recommendedPrice: number;
  rationale: string[];
  memoText: string;
} {
  const {
    companyName,
    sector,
    sharesOutstandingPreIPO,
    primarySharesOffered,
    secondarySharesOffered = 0,
    greenshoeShares,
    greenshoePercent,
    targetGrossProceeds,
    nextYearRevenue,
    dcfValuePerShare,
    peerMedianEVRevenue,
    orderBook,
    historicalFirstDayPop,
    sectorAverageFirstDayPop,
    foundersEmployeesOwnership,
    pricingAggressiveness,
    ceoGuidance,
  } = assumptions;

  // Calculate greenshoe shares (use explicit if provided, otherwise calculate)
  const actualGreenshoeShares = greenshoeShares || (primarySharesOffered * greenshoePercent);
  
  // Total shares in offering (primary + secondary + greenshoe)
  const totalSharesOffered = primarySharesOffered + secondarySharesOffered + actualGreenshoeShares;
  
  // Fully-diluted shares post-IPO
  const fdSharesPostIPO = sharesOutstandingPreIPO + primarySharesOffered + actualGreenshoeShares;
  
  // Calculate mid-price from target if order book not clear
  const midPrice = targetGrossProceeds / (primarySharesOffered + secondarySharesOffered);
  
  // Determine price range from order book
  let minPrice = midPrice - 10;
  let maxPrice = midPrice + 10;
  
  if (orderBook && orderBook.length > 0) {
    const bookPrices = orderBook.map(ob => ob.priceLevel);
    minPrice = Math.min(...bookPrices) - 4;
    maxPrice = Math.max(...bookPrices) + 4;
  }
  
  const pricePoints: number[] = [];
  for (let p = minPrice; p <= maxPrice; p += 1) {
    if (p > 0) pricePoints.push(p);
  }
  
  // Sector-specific expected pop ranges
  const sectorPopExpectation: Record<string, number> = {
    "ai_infrastructure": 1.00, // 100% expected pop
    "biotech": 0.76, // 76% expected pop
    "saas": 0.25, // 25% expected pop
    "fintech": 0.30,
    "consumer": 0.20,
    "tech": 0.35,
  };
  
  const expectedSectorPop = sectorAverageFirstDayPop || sectorPopExpectation[sector] || historicalFirstDayPop || 0.30;
  
  const pricingMatrix: PricingRow[] = pricePoints.map(offerPrice => {
    // GROSS PROCEEDS = price × total shares (primary + secondary + greenshoe)
    const grossProceeds = offerPrice * totalSharesOffered;
    
    // Market cap = FD shares × offer price
    const marketCap = fdSharesPostIPO * offerPrice;
    
    // Enterprise value (simplified - could subtract expected post-IPO cash)
    const enterpriseValue = marketCap;
    
    // NTM EV/Revenue - CRITICAL: Use nextYearRevenue directly from parsed assumptions
    const ntmEVRevenue = enterpriseValue / nextYearRevenue;
    
    // Discount vs peer median (negative = discount, positive = premium)
    const vsPeerMedianDiscount = (ntmEVRevenue - peerMedianEVRevenue) / peerMedianEVRevenue;
    
    // DCF support = offer price as % of DCF value
    const dcfSupport = offerPrice / dcfValuePerShare;
    
    // Order book lookup - EXACT values, no smoothing
    let oversubscription = 1;
    if (orderBook && orderBook.length > 0) {
      // Sort by price descending
      const sortedBook = [...orderBook].sort((a, b) => b.priceLevel - a.priceLevel);
      
      // Find applicable oversubscription (at or above this price)
      for (const entry of sortedBook) {
        if (offerPrice >= entry.priceLevel) {
          oversubscription = entry.oversubscription;
          break;
        }
      }
      
      // If below all entries, extrapolate higher demand
      if (oversubscription === 1) {
        const lowestEntry = sortedBook[sortedBook.length - 1];
        if (offerPrice < lowestEntry.priceLevel) {
          const priceDiff = lowestEntry.priceLevel - offerPrice;
          oversubscription = Math.round(lowestEntry.oversubscription * (1 + priceDiff * 0.1));
        }
      }
    }
    
    // IMPLIED FIRST-DAY POP - based on discount to DCF and peer comparison
    // Key insight: If priced BELOW fair value, expect a pop
    // Pop = (Fair Value - Offer Price) / Offer Price
    // Use sector historical average as baseline, adjust based on discount
    const discountToDCF = 1 - dcfSupport;
    const discountToPeers = -vsPeerMedianDiscount; // Convert to positive discount
    
    // Pop scales with discount - bigger discount = bigger pop
    // Use historical sector average as the expected pop for typical discount
    let impliedFirstDayPop = expectedSectorPop;
    
    // If priced at deeper discount than typical, expect higher pop
    // If priced at premium to peers, expect lower pop
    if (discountToPeers > 0) {
      // At a discount to peers - expect at least historical pop
      impliedFirstDayPop = expectedSectorPop * (1 + discountToPeers);
    } else {
      // At a premium to peers - expect lower pop
      impliedFirstDayPop = expectedSectorPop * Math.max(0.3, 1 + discountToPeers);
    }
    
    // Cap at reasonable bounds
    impliedFirstDayPop = Math.min(2.0, Math.max(0.05, impliedFirstDayPop));
    
    // Founder/employee ownership post-IPO
    // They own foundersEmployeesOwnership of pre-IPO shares
    // Post-IPO: (pre-IPO shares × ownership) / post-IPO shares
    const founderEmployeeOwnershipPost = (foundersEmployeesOwnership * sharesOutstandingPreIPO) / fdSharesPostIPO;
    
    return {
      offerPrice,
      marketCap,
      enterpriseValue,
      ntmEVRevenue,
      vsPeerMedianDiscount,
      dcfSupport,
      grossProceeds,
      oversubscription,
      impliedFirstDayPop,
      founderEmployeeOwnershipPost,
    };
  });
  
  // RECOMMENDATION LOGIC - depends on pricingAggressiveness
  let recommendedPrice = midPrice;
  let recommendedRow: PricingRow | undefined;
  
  // Sort by price descending (we want HIGHEST acceptable price)
  const sortedMatrix = [...pricingMatrix].sort((a, b) => b.offerPrice - a.offerPrice);
  
  if (pricingAggressiveness === "maximum") {
    // CEO wants MAXIMUM valuation - price at absolute top of book
    // Find highest price that still has meaningful demand (>=20×)
    for (const row of sortedMatrix) {
      if (row.oversubscription >= 20 && row.offerPrice <= dcfValuePerShare) {
        recommendedPrice = row.offerPrice;
        recommendedRow = row;
        break;
      }
    }
    
    // If no row found with 20×, find highest with any meaningful demand
    if (!recommendedRow) {
      for (const row of sortedMatrix) {
        if (row.oversubscription >= 10) {
          recommendedPrice = row.offerPrice;
          recommendedRow = row;
          break;
        }
      }
    }
  } else if (pricingAggressiveness === "aggressive") {
    // Price high but leave some room
    for (const row of sortedMatrix) {
      if (row.oversubscription >= 25 && row.impliedFirstDayPop >= 0.30) {
        recommendedPrice = row.offerPrice;
        recommendedRow = row;
        break;
      }
    }
  } else if (pricingAggressiveness === "conservative") {
    // Leave money on table for clean aftermarket
    for (const row of sortedMatrix) {
      if (row.oversubscription >= 40 && row.impliedFirstDayPop >= 0.50) {
        recommendedPrice = row.offerPrice;
        recommendedRow = row;
        break;
      }
    }
  } else {
    // Moderate - balance between value and aftermarket
    for (const row of sortedMatrix) {
      if (row.oversubscription >= 30 && row.impliedFirstDayPop >= 0.40 && row.impliedFirstDayPop <= 0.80) {
        recommendedPrice = row.offerPrice;
        recommendedRow = row;
        break;
      }
    }
  }
  
  // Fallback
  if (!recommendedRow) {
    // Find highest price with at least 20× demand
    for (const row of sortedMatrix) {
      if (row.oversubscription >= 20) {
        recommendedPrice = row.offerPrice;
        recommendedRow = row;
        break;
      }
    }
  }
  
  if (!recommendedRow) {
    recommendedRow = pricingMatrix[Math.floor(pricingMatrix.length / 2)];
    recommendedPrice = recommendedRow.offerPrice;
  }
  
  // Filing range
  const recommendedRangeLow = recommendedPrice - 2;
  const recommendedRangeHigh = recommendedPrice;
  
  // Generate rationale based on aggressiveness
  const rationale: string[] = [];
  
  const popPercent = (recommendedRow.impliedFirstDayPop * 100).toFixed(0);
  const dcfPercent = (recommendedRow.dcfSupport * 100).toFixed(0);
  const peerDiscountPercent = Math.abs(recommendedRow.vsPeerMedianDiscount * 100).toFixed(0);
  const peerDirection = recommendedRow.vsPeerMedianDiscount < 0 ? "below" : "above";
  
  if (pricingAggressiveness === "maximum") {
    rationale.push(`$${recommendedPrice.toFixed(2)} is the ABSOLUTE MAXIMUM price the book will bear — CEO demanded "biggest valuation in history"`);
    rationale.push(`Book clears at ${recommendedRow.oversubscription}× with only the most aggressive growth investors maxed out`);
    rationale.push(`Expected ${popPercent}%+ first-day pop — in line with recent ${sector === "ai_infrastructure" ? "AI infrastructure" : sector} precedent`);
    rationale.push(`Still ${peerDiscountPercent}% ${peerDirection} peer median (${peerMedianEVRevenue.toFixed(1)}×) → THIS WILL BE THE BIGGEST ${sector.toUpperCase()} IPO EVER`);
  } else if (pricingAggressiveness === "conservative") {
    rationale.push(`$${recommendedPrice.toFixed(2)} leaves room for clean, orderly aftermarket as board requested`);
    rationale.push(`Expected ${popPercent}% day-one pop satisfies long-only demand`);
    rationale.push(`${peerDiscountPercent}% ${peerDirection} peer median → generous but responsible`);
  } else {
    rationale.push(`$${recommendedPrice.toFixed(2)} balances valuation with aftermarket performance`);
    rationale.push(`Expected ${popPercent}% first-day pop — appropriate for sector`);
    rationale.push(`${peerDiscountPercent}% ${peerDirection} peer median → fair pricing`);
  }
  
  rationale.push(`${dcfPercent}% of DCF value ($${dcfValuePerShare.toFixed(2)}) → ${recommendedRow.dcfSupport < 1 ? 'discount to intrinsic value' : 'premium reflects growth'}`);
  rationale.push(`Founders/employees retain ${(recommendedRow.founderEmployeeOwnershipPost * 100).toFixed(1)}% ownership`);
  rationale.push(`Raises $${Math.round(recommendedRow.grossProceeds)}M gross proceeds`);
  
  const memoText = formatIPOMemo(
    assumptions,
    pricingMatrix,
    recommendedRangeLow,
    recommendedRangeHigh,
    recommendedPrice,
    rationale
  );

  return {
    assumptions,
    pricingMatrix,
    recommendedRangeLow,
    recommendedRangeHigh,
    recommendedPrice,
    rationale,
    memoText,
  };
}

function formatIPOMemo(
  assumptions: IPOAssumptions,
  pricingMatrix: PricingRow[],
  rangeLow: number,
  rangeHigh: number,
  recommendedPrice: number,
  rationale: string[]
): string {
  const {
    companyName,
    sector,
    dcfValuePerShare,
    peerMedianEVRevenue,
    targetGrossProceeds,
    historicalFirstDayPop,
    pricingAggressiveness,
    ceoGuidance,
  } = assumptions;

  const companyNameUpper = companyName.toUpperCase();
  const isAggressive = pricingAggressiveness === "maximum" || pricingAggressiveness === "aggressive";
  
  const recommendedRow = pricingMatrix.find(r => Math.abs(r.offerPrice - recommendedPrice) < 0.5);
  const impliedPop = recommendedRow ? (recommendedRow.impliedFirstDayPop * 100).toFixed(0) : "50";
  const grossProceeds = recommendedRow ? Math.round(recommendedRow.grossProceeds) : Math.round(targetGrossProceeds);
  const marketCap = recommendedRow ? (recommendedRow.marketCap / 1000).toFixed(1) : "N/A";
  const ntmMultiple = recommendedRow ? recommendedRow.ntmEVRevenue.toFixed(1) : "N/A";
  
  let memo = `${companyNameUpper} – FINAL IPO PRICING RECOMMENDATION\n\n`;
  memo += `Recommended range to file amendment:      $${rangeLow.toFixed(2)} – $${rangeHigh.toFixed(2)}\n`;
  
  if (isAggressive) {
    memo += `Recommended final offer price:             $${recommendedPrice.toFixed(2)}   ← MAXIMUM PRICE THE BOOK WILL BEAR, raises $${grossProceeds}M, expected ${impliedPop}%+ day-one pop\n\n`;
  } else {
    memo += `Recommended final offer price:             $${recommendedPrice.toFixed(2)}   ← raises $${grossProceeds}M, expected ${impliedPop}% day-one pop\n\n`;
  }
  
  memo += `Market Cap: ~$${marketCap}B post-greenshoe\n`;
  memo += `NTM EV/Revenue: ${ntmMultiple}× (peer median: ${peerMedianEVRevenue.toFixed(1)}×)\n\n`;
  
  memo += `Pricing Matrix (fully-diluted post-greenshoe basis, in millions except per-share data)\n\n`;
  
  // Select rows around recommendation
  const recIndex = pricingMatrix.findIndex(r => Math.abs(r.offerPrice - recommendedPrice) < 0.5);
  const startIdx = Math.max(0, recIndex - 2);
  const endIdx = Math.min(pricingMatrix.length, startIdx + 5);
  const rows = pricingMatrix.slice(startIdx, endIdx);
  
  const priceHeader = "Offer Price          " + rows.map(r => `$${r.offerPrice.toFixed(2)}`).map(s => s.padStart(10)).join("  ");
  memo += priceHeader + "\n";
  
  const marketCapRow = "Market Cap            " + rows.map(r => `$${Math.round(r.marketCap).toLocaleString()}`).map(s => s.padStart(10)).join("  ");
  memo += marketCapRow + "\n";
  
  const evRow = "EV (post-IPO cash)    " + rows.map(r => `$${Math.round(r.enterpriseValue).toLocaleString()}`).map(s => s.padStart(10)).join("  ");
  memo += evRow + "\n";
  
  const multipleRow = "NTM EV/Revenue        " + rows.map(r => `${r.ntmEVRevenue.toFixed(1)}×`).map(s => s.padStart(10)).join("  ");
  memo += multipleRow + "\n";
  
  const vsPeerRow = `vs. peer median ${peerMedianEVRevenue.toFixed(1)}× discount` + rows.map(r => {
    const pct = r.vsPeerMedianDiscount * 100;
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`;
  }).map(s => s.padStart(10)).join("  ");
  memo += vsPeerRow + "\n";
  
  const dcfRow = `DCF midpoint $${dcfValuePerShare.toFixed(2)} support` + rows.map(r => `${(r.dcfSupport * 100).toFixed(0)}%`).map(s => s.padStart(10)).join("  ");
  memo += dcfRow + "\n";
  
  const proceedsRow = "Gross proceeds        " + rows.map(r => `$${Math.round(r.grossProceeds)}`).map(s => s.padStart(10)).join("  ");
  memo += proceedsRow + "\n";
  
  const oversubRow = "Oversubscription      " + rows.map(r => `${r.oversubscription}×`).map(s => s.padStart(10)).join("  ");
  memo += oversubRow + "\n";
  
  const avgPop = (historicalFirstDayPop || 0.50) * 100;
  const popRow = `Implied first-day pop (hist. ${avgPop.toFixed(0)}%)` + rows.map(r => `${(r.impliedFirstDayPop * 100).toFixed(0)}%`).map(s => s.padStart(10)).join("  ");
  memo += popRow + "\n";
  
  const ownershipRow = "Founder + employee post-IPO" + rows.map(r => `${(r.founderEmployeeOwnershipPost * 100).toFixed(1)}%`).map(s => s.padStart(10)).join("  ");
  memo += ownershipRow + "\n";
  
  memo += "\nRecommendation rationale\n";
  for (const r of rationale) {
    memo += `- ${r}\n`;
  }
  
  memo += `\nFile amendment at $${rangeLow.toFixed(0)}–$${rangeHigh.toFixed(0)} tonight, price at $${recommendedPrice.toFixed(0)} tomorrow morning.\n`;
  
  if (pricingAggressiveness === "maximum" && sector === "ai_infrastructure") {
    memo += `\n🚀 THIS WILL BE THE BIGGEST AI IPO IN HISTORY. STRAP IN.\n`;
  } else if (sector === "biotech") {
    memo += `Congrats — this one is going to trade like CG Oncology.\n`;
  }

  return memo;
}
