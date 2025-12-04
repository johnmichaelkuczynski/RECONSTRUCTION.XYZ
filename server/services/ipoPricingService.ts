import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

export type FinanceLLMProvider = 'zhi1' | 'zhi2' | 'zhi3' | 'zhi4' | 'zhi5';

export interface IPOAssumptions {
  companyName: string;
  filingDate: string;
  sector: string;
  
  sharesOutstandingPreIPO: number; // in millions
  primarySharesOffered: number; // in millions
  secondarySharesOffered: number; // in millions
  greenshoeShares: number; // in millions (explicit)
  greenshoePercent: number;
  
  targetGrossProceeds: number; // in millions
  indicatedPriceRangeLow: number;
  indicatedPriceRangeHigh: number;
  
  // Revenue in millions - CRITICAL: Parse the correct NTM year
  currentYearRevenue: number;
  ntmRevenue: number; // THIS IS THE NTM REVENUE FOR VALUATION - next twelve months
  ntmRevenueGrowth: number;
  ntmEBITDA: number;
  ntmEBITDAMargin: number;
  
  dcfValuePerShare: number;
  
  // CRITICAL: Parse peer median EXACTLY as stated in prompt
  peerMedianEVRevenue: number;
  
  // Order book - parse EXACTLY with all thresholds
  orderBook: {
    priceLevel: number;
    oversubscription: number;
  }[];
  
  historicalFirstDayPop: number;
  sectorAverageFirstDayPop: number;
  
  foundersEmployeesOwnership: number;
  vcPeOwnership: number;
  
  underwritingFeePercent: number;
  
  useOfProceeds?: string;
  lockupDays?: number;
  
  ceoGuidance?: string;
  boardGuidance?: string;
  pricingAggressiveness: "conservative" | "moderate" | "aggressive" | "maximum";
}

const IPO_PARSING_PROMPT = `You are an investment banking expert. Parse the IPO description and extract parameters.

CRITICAL PARSING RULES - READ CAREFULLY:

1. PEER MEDIAN: If prompt says "Median 58×" or "median 46×", set peerMedianEVRevenue = 58 or 46 EXACTLY. Never calculate or estimate.

2. NTM REVENUE: This is the NEXT TWELVE MONTHS revenue for valuation. If filing in Dec 2025, NTM = 2026 revenue. Parse the 2026 revenue number.

3. ORDER BOOK: Parse EVERY threshold exactly:
   - "$105+: 42×" means { priceLevel: 105, oversubscription: 42 }
   - "$100+: 68×" means { priceLevel: 100, oversubscription: 68 }
   - "$95+: 91×" means { priceLevel: 95, oversubscription: 91 }
   Include ALL thresholds mentioned, not just one.

4. GREENSHOE: If "15% = 6.75M shares", set greenshoeShares = 6.75, greenshoePercent = 0.15

5. CEO/BOARD GUIDANCE: Parse exact quotes:
   - "biggest valuation ever" / "price to limit" → pricingAggressiveness = "maximum"
   - "clean aftermarket" → pricingAggressiveness = "conservative"

6. HISTORICAL POP: Parse exactly. "+176% average" means historicalFirstDayPop = 1.76

7. SECTOR: 
   - "defense-tech" / "national security" → "defense_tech"
   - "AI infrastructure" / "GPU cloud" → "ai_infrastructure"
   - "biotech" / "clinical" → "biotech"
   - "SaaS" / "enterprise software" → "saas"

Return JSON:
{
  "companyName": "string",
  "filingDate": "YYYY-MM-DD",
  "sector": "defense_tech" | "ai_infrastructure" | "biotech" | "saas" | "tech",
  
  "sharesOutstandingPreIPO": number (millions),
  "primarySharesOffered": number (millions),
  "secondarySharesOffered": number (millions, default 0),
  "greenshoeShares": number (millions, explicit if given),
  "greenshoePercent": number (decimal),
  
  "targetGrossProceeds": number (millions),
  "indicatedPriceRangeLow": number,
  "indicatedPriceRangeHigh": number,
  
  "currentYearRevenue": number (millions - current/filing year),
  "ntmRevenue": number (millions - NEXT year, for NTM valuation),
  "ntmRevenueGrowth": number (decimal),
  "ntmEBITDA": number (millions),
  "ntmEBITDAMargin": number (decimal),
  
  "dcfValuePerShare": number,
  
  "peerMedianEVRevenue": number (PARSE EXACTLY FROM PROMPT),
  
  "orderBook": [
    { "priceLevel": number, "oversubscription": number }
  ],
  
  "historicalFirstDayPop": number (decimal, 1.76 for 176%),
  "sectorAverageFirstDayPop": number,
  
  "foundersEmployeesOwnership": number (decimal),
  "vcPeOwnership": number (decimal),
  
  "underwritingFeePercent": number (default 0.07),
  
  "ceoGuidance": "exact quote",
  "boardGuidance": "exact quote",
  "pricingAggressiveness": "conservative" | "moderate" | "aggressive" | "maximum"
}

Return ONLY JSON, no markdown.`;

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
      temperature: 0.05,
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
      temperature: 0.05,
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
        temperature: 0.05,
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
      temperature: 0.05,
    });
    responseText = response.choices[0]?.message?.content || "";
    providerUsed = "ZHI 5";
  }

  let jsonStr = responseText.trim();
  if (jsonStr.startsWith("```json")) jsonStr = jsonStr.slice(7);
  else if (jsonStr.startsWith("```")) jsonStr = jsonStr.slice(3);
  if (jsonStr.endsWith("```")) jsonStr = jsonStr.slice(0, -3);
  
  if (!jsonStr.startsWith("{")) {
    const startIdx = jsonStr.indexOf("{");
    const endIdx = jsonStr.lastIndexOf("}");
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      jsonStr = jsonStr.slice(startIdx, endIdx + 1);
    }
  }
  
  jsonStr = jsonStr.trim();
  const assumptions: IPOAssumptions = JSON.parse(jsonStr);
  
  // Derive aggressiveness from guidance if not set
  if (!assumptions.pricingAggressiveness) {
    const ceoLower = (assumptions.ceoGuidance || "").toLowerCase();
    if (ceoLower.includes("biggest") || ceoLower.includes("maximum") || 
        ceoLower.includes("absolute limit") || ceoLower.includes("history")) {
      assumptions.pricingAggressiveness = "maximum";
    } else {
      assumptions.pricingAggressiveness = "moderate";
    }
  }
  
  return { assumptions, providerUsed };
}

interface PricingRow {
  offerPrice: number;
  fdSharesPostIPO: number;
  marketCapM: number; // in millions
  enterpriseValueM: number; // in millions
  ntmEVRevenue: number;
  vsPeerMedian: number; // percentage vs peer (negative = discount)
  dcfSupport: number;
  grossProceedsM: number; // in millions
  oversubscription: number;
  impliedFirstDayPop: number;
  founderOwnershipPost: number;
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
    ntmRevenue, // THIS is the revenue for NTM EV/Revenue calculation
    dcfValuePerShare,
    peerMedianEVRevenue, // MUST use this exactly
    orderBook,
    historicalFirstDayPop,
    foundersEmployeesOwnership,
    pricingAggressiveness,
    ceoGuidance,
  } = assumptions;

  // Calculate greenshoe (use explicit if provided)
  const actualGreenshoeShares = greenshoeShares || (primarySharesOffered * greenshoePercent);
  
  // Total shares for gross proceeds = primary + secondary + greenshoe
  const totalSharesForProceeds = primarySharesOffered + secondarySharesOffered + actualGreenshoeShares;
  
  // Fully-diluted shares post-IPO = pre-IPO + primary + greenshoe (secondary doesn't add new shares)
  const fdSharesPostIPO = sharesOutstandingPreIPO + primarySharesOffered + actualGreenshoeShares;
  
  // Determine price range from order book
  let minPrice = 80;
  let maxPrice = 120;
  
  if (orderBook && orderBook.length > 0) {
    const bookPrices = orderBook.map(ob => ob.priceLevel);
    minPrice = Math.min(...bookPrices) - 5;
    maxPrice = Math.max(...bookPrices) + 5;
  }
  
  const pricePoints: number[] = [];
  for (let p = minPrice; p <= maxPrice; p += 1) {
    if (p > 0) pricePoints.push(p);
  }
  
  // Sort order book by price DESCENDING for proper lookup
  const sortedOrderBook = orderBook ? [...orderBook].sort((a, b) => b.priceLevel - a.priceLevel) : [];
  
  const pricingMatrix: PricingRow[] = pricePoints.map(offerPrice => {
    // GROSS PROCEEDS = price × total shares (primary + secondary + greenshoe)
    const grossProceedsM = offerPrice * totalSharesForProceeds;
    
    // MARKET CAP = FD shares × offer price (in millions)
    const marketCapM = fdSharesPostIPO * offerPrice;
    
    // ENTERPRISE VALUE = Market cap (simplified - could adjust for cash)
    const enterpriseValueM = marketCapM;
    
    // NTM EV/REVENUE = Enterprise Value / NTM Revenue
    // This MUST match peer median when correctly priced
    const ntmEVRevenue = enterpriseValueM / ntmRevenue;
    
    // VS PEER MEDIAN = (our multiple - peer median) / peer median
    const vsPeerMedian = (ntmEVRevenue - peerMedianEVRevenue) / peerMedianEVRevenue;
    
    // DCF SUPPORT = offer price / DCF value
    const dcfSupport = offerPrice / dcfValuePerShare;
    
    // ORDER BOOK LOOKUP - use exact thresholds
    let oversubscription = 1;
    if (sortedOrderBook.length > 0) {
      // Find the FIRST entry where offerPrice >= priceLevel
      for (const entry of sortedOrderBook) {
        if (offerPrice >= entry.priceLevel) {
          oversubscription = entry.oversubscription;
          break;
        }
      }
      // If below all thresholds, use highest oversubscription + extrapolation
      if (oversubscription === 1) {
        const lowestEntry = sortedOrderBook[sortedOrderBook.length - 1];
        const priceDiff = lowestEntry.priceLevel - offerPrice;
        oversubscription = Math.round(lowestEntry.oversubscription * (1 + priceDiff * 0.05));
      }
    }
    
    // IMPLIED FIRST-DAY POP
    // Based on discount to peer median and historical sector average
    // If priced at discount to peers, expect pop to close that gap + historical premium
    const discountToPeers = -vsPeerMedian; // positive = we're cheap vs peers
    const historicalPop = historicalFirstDayPop || 0.50;
    
    // If we're trading at peer median, expect historical pop
    // If we're at 10% discount, expect more pop
    // If we're at premium, expect less pop
    let impliedFirstDayPop = historicalPop;
    if (discountToPeers > 0) {
      // We're cheap - expect historical pop + some of the discount gap to close
      impliedFirstDayPop = historicalPop + (discountToPeers * 0.5);
    } else {
      // We're expensive - expect less pop
      impliedFirstDayPop = Math.max(0.10, historicalPop * (1 + discountToPeers));
    }
    
    // FOUNDER OWNERSHIP POST-IPO
    // Pre-IPO ownership × (pre-IPO shares / post-IPO shares)
    const founderOwnershipPost = foundersEmployeesOwnership * (sharesOutstandingPreIPO / fdSharesPostIPO);
    
    return {
      offerPrice,
      fdSharesPostIPO,
      marketCapM,
      enterpriseValueM,
      ntmEVRevenue,
      vsPeerMedian,
      dcfSupport,
      grossProceedsM,
      oversubscription,
      impliedFirstDayPop,
      founderOwnershipPost,
    };
  });
  
  // RECOMMENDATION LOGIC
  let recommendedPrice = pricingMatrix[Math.floor(pricingMatrix.length / 2)].offerPrice;
  let recommendedRow: PricingRow | undefined;
  
  // Sort by price descending (want HIGHEST acceptable price)
  const sortedMatrix = [...pricingMatrix].sort((a, b) => b.offerPrice - a.offerPrice);
  
  if (pricingAggressiveness === "maximum") {
    // CEO wants MAXIMUM - price at or near peer median, highest price with good demand
    for (const row of sortedMatrix) {
      // Must have strong demand (>=30×) and be at or below DCF
      if (row.oversubscription >= 30 && row.offerPrice <= dcfValuePerShare * 1.05) {
        // Prefer price where we're close to peer median (within 10%)
        if (Math.abs(row.vsPeerMedian) <= 0.15) {
          recommendedPrice = row.offerPrice;
          recommendedRow = row;
          break;
        }
      }
    }
    // Fallback: highest price with 30×+ demand
    if (!recommendedRow) {
      for (const row of sortedMatrix) {
        if (row.oversubscription >= 30) {
          recommendedPrice = row.offerPrice;
          recommendedRow = row;
          break;
        }
      }
    }
  } else if (pricingAggressiveness === "conservative") {
    // Leave money on table
    for (const row of sortedMatrix) {
      if (row.oversubscription >= 50 && row.impliedFirstDayPop >= 0.60) {
        recommendedPrice = row.offerPrice;
        recommendedRow = row;
        break;
      }
    }
  } else {
    // Moderate
    for (const row of sortedMatrix) {
      if (row.oversubscription >= 35 && row.impliedFirstDayPop >= 0.40) {
        recommendedPrice = row.offerPrice;
        recommendedRow = row;
        break;
      }
    }
  }
  
  if (!recommendedRow) {
    recommendedRow = pricingMatrix.find(r => r.offerPrice === recommendedPrice) || pricingMatrix[Math.floor(pricingMatrix.length / 2)];
    recommendedPrice = recommendedRow.offerPrice;
  }
  
  const recommendedRangeLow = recommendedPrice - 2;
  const recommendedRangeHigh = recommendedPrice;
  
  // RATIONALE
  const rationale: string[] = [];
  const popPercent = (recommendedRow.impliedFirstDayPop * 100).toFixed(0);
  const dcfPercent = (recommendedRow.dcfSupport * 100).toFixed(0);
  const peerDiffPercent = Math.abs(recommendedRow.vsPeerMedian * 100).toFixed(0);
  const peerDirection = recommendedRow.vsPeerMedian < 0 ? "below" : "above";
  const evMultiple = recommendedRow.ntmEVRevenue.toFixed(1);
  
  if (pricingAggressiveness === "maximum") {
    rationale.push(`$${recommendedPrice} is the MAXIMUM price the book will bear at ${recommendedRow.oversubscription}× oversubscribed`);
    rationale.push(`NTM EV/Revenue of ${evMultiple}× is ${peerDiffPercent}% ${peerDirection} peer median (${peerMedianEVRevenue.toFixed(1)}×)`);
    rationale.push(`Expected ${popPercent}%+ first-day pop based on sector precedent`);
    if (ceoGuidance) {
      rationale.push(`CEO demanded: "${ceoGuidance}" — delivering maximum valuation`);
    }
    rationale.push(`THIS WILL BE THE BIGGEST ${sector.toUpperCase().replace("_", " ")} IPO EVER`);
  } else {
    rationale.push(`$${recommendedPrice} at ${evMultiple}× NTM EV/Revenue (${peerDiffPercent}% ${peerDirection} peer median)`);
    rationale.push(`Expected ${popPercent}% first-day pop`);
  }
  
  rationale.push(`${dcfPercent}% of DCF value ($${dcfValuePerShare.toFixed(2)})`);
  rationale.push(`Founders retain ${(recommendedRow.founderOwnershipPost * 100).toFixed(1)}% post-IPO`);
  rationale.push(`Gross proceeds: $${Math.round(recommendedRow.grossProceedsM)}M`);
  
  const memoText = formatIPOMemo(assumptions, pricingMatrix, recommendedRangeLow, recommendedRangeHigh, recommendedPrice, rationale);

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
    ntmRevenue,
    historicalFirstDayPop,
    pricingAggressiveness,
  } = assumptions;

  const companyNameUpper = companyName.toUpperCase();
  const isAggressive = pricingAggressiveness === "maximum";
  
  const recommendedRow = pricingMatrix.find(r => Math.abs(r.offerPrice - recommendedPrice) < 0.5);
  if (!recommendedRow) return "Error: Could not find recommended row";
  
  const popPercent = (recommendedRow.impliedFirstDayPop * 100).toFixed(0);
  const grossProceeds = Math.round(recommendedRow.grossProceedsM);
  const marketCapB = (recommendedRow.marketCapM / 1000).toFixed(1);
  const ntmMultiple = recommendedRow.ntmEVRevenue.toFixed(1);
  
  let memo = `${companyNameUpper} – FINAL IPO PRICING RECOMMENDATION\n\n`;
  memo += `Recommended range to file amendment:      $${rangeLow.toFixed(2)} – $${rangeHigh.toFixed(2)}\n`;
  
  if (isAggressive) {
    memo += `Recommended final offer price:             $${recommendedPrice.toFixed(2)}   ← MAXIMUM PRICE, raises $${grossProceeds}M, expected ${popPercent}%+ day-one pop\n\n`;
  } else {
    memo += `Recommended final offer price:             $${recommendedPrice.toFixed(2)}   ← raises $${grossProceeds}M, expected ${popPercent}% day-one pop\n\n`;
  }
  
  memo += `Market Cap: ~$${marketCapB}B post-greenshoe\n`;
  memo += `NTM EV/Revenue: ${ntmMultiple}× (NTM Revenue: $${ntmRevenue.toFixed(0)}M, Peer Median: ${peerMedianEVRevenue.toFixed(1)}×)\n\n`;
  
  memo += `Pricing Matrix (in millions except per-share)\n\n`;
  
  // Select rows around recommendation
  const recIndex = pricingMatrix.findIndex(r => Math.abs(r.offerPrice - recommendedPrice) < 0.5);
  const startIdx = Math.max(0, recIndex - 3);
  const endIdx = Math.min(pricingMatrix.length, startIdx + 7);
  const rows = pricingMatrix.slice(startIdx, endIdx);
  
  const pad = (s: string, n: number) => s.padStart(n);
  
  memo += "Offer Price            " + rows.map(r => pad(`$${r.offerPrice}`, 10)).join("") + "\n";
  memo += "Market Cap             " + rows.map(r => pad(`$${Math.round(r.marketCapM).toLocaleString()}`, 10)).join("") + "\n";
  memo += "NTM EV/Revenue         " + rows.map(r => pad(`${r.ntmEVRevenue.toFixed(1)}×`, 10)).join("") + "\n";
  memo += `vs peer median ${peerMedianEVRevenue.toFixed(1)}×   ` + rows.map(r => {
    const pct = r.vsPeerMedian * 100;
    return pad(`${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`, 10);
  }).join("") + "\n";
  memo += `DCF $${dcfValuePerShare.toFixed(2)} support     ` + rows.map(r => pad(`${(r.dcfSupport * 100).toFixed(0)}%`, 10)).join("") + "\n";
  memo += "Gross proceeds         " + rows.map(r => pad(`$${Math.round(r.grossProceedsM)}`, 10)).join("") + "\n";
  memo += "Oversubscription       " + rows.map(r => pad(`${r.oversubscription}×`, 10)).join("") + "\n";
  memo += `Implied pop (hist ${(historicalFirstDayPop * 100).toFixed(0)}%)` + rows.map(r => pad(`${(r.impliedFirstDayPop * 100).toFixed(0)}%`, 10)).join("") + "\n";
  memo += "Founder ownership      " + rows.map(r => pad(`${(r.founderOwnershipPost * 100).toFixed(1)}%`, 10)).join("") + "\n";
  
  memo += "\nRecommendation Rationale:\n";
  for (const r of rationale) {
    memo += `• ${r}\n`;
  }
  
  memo += `\nFile amendment at $${rangeLow.toFixed(0)}–$${rangeHigh.toFixed(0)} tonight, price at $${recommendedPrice.toFixed(0)} tomorrow morning.\n`;
  
  if (isAggressive) {
    memo += `\n🚀 STRAP IN — THIS IS THE ${sector.toUpperCase().replace("_", "-")} IPO OF THE DECADE.\n`;
  }

  return memo;
}
