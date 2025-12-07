/**
 * Test script to verify the guaranteed parser works on real user inputs
 * Run with: npx tsx server/test-guaranteed-parser.ts
 */

import { parseLBOGuaranteed, parseMAGuaranteed, LBO_DEFAULTS, MA_DEFAULTS } from './services/guaranteedParser';

// Test inputs from user's 50 stress tests
const LBO_TEST_INPUTS = [
  "Build an LBO for Apex Systems. Purchase price 7× EBITDA of $120M (EV = $840M). Debt: 4× senior at 7%, 1× sub at 12%. Hold 5 years. Exit at 8×. Fees: $10M transaction, $4M financing.",
  "Build an LBO for IronGate Manufacturing. EV = $600M. Debt: $350M senior at 6.5%, $100M sub at 11%. Exit at 7.5×. Hold 5 years.",
  "LBO model for Glacier Foods. Purchase price = 8.2× EBITDA of $75M. Senior 4.5×, Sub 0.7×. Exit 9×. Fees $8M.",
  "LBO for Keystone Plastics. Buy for $500M EV. Finance with 60% debt at blended 8%. Exit at same multiple after 4 years.",
  "LBO of RedPeak Telecom. Price 6.5× $140M EBITDA. Senior 3.5×, Sub 1.5×. Exit 7.2×.",
  "LBO: Matrix Robotics. EV $1.1B. Debt 5× EBITDA at 7%. Sub 1× at 12%. Exit at 8×. 6-year hold.",
  "Build LBO for Noble Apparel. Pay 7× EBITDA of $50M. Fees $5M. Exit 7.8×. Senior 3×, Sub 2×.",
  "LBO for Horizon Tools. Buy for $900M EV. Debt 70% of EV. Exit 8×. Hold 5 years.",
  "LBO: Summit Aerospace. $1.4B EV. Senior 4×, Sub 1×. Exit at 9× after 5 years.",
  "LBO: Titan Freight. Purchase 5.5× EBITDA of $200M. Exit 6.5×. Senior 2.5×, Sub 1×."
];

const MA_TEST_INPUTS = [
  "Acquirer Orion buys Helix Labs for $1.2B (80% cash, 20% stock). Buyer share price $40. Synergies: $50M cost, $20M revenue.",
  "Delta Corp acquires Vector LLC for 10× EBITDA of $90M. 100% cash. Integration cost $30M.",
  "RivoTech buys NanoPulse for $650M EV. Stock-for-stock: exchange ratio based on $55 buyer price.",
  "Meridian Media acquires StoryHouse for $300M. Synergies $25M cost. Deal 70/30 cash/stock.",
  "Nova Energy buys PetroCore for $2B EV using 60% debt, 40% equity.",
  "Atlas Industries buys CopperWorks for 9× EBITDA of $110M. Revenue synergies $40M, 50% flow-through.",
  "Gamma Systems buys ByteForge for $480M. All cash. Integration cost $20M.",
  "SilverBridge buys Haven Health for $900M. Buyer price $25/share. Pay 30% stock.",
  "ApexBank buys MetroFinance for 12× earnings of $70M. Synergies: $60M cost over 3 years.",
  "SkyTech buys Lumos Devices for $1B EV. Financing: $600M new debt at 7%. Rest stock."
];

// Fields that are intentionally nullable (override fields)
const INTENTIONALLY_NULLABLE = [
  'transactionCostsExplicit',
  'financingFeesExplicit'
];

function checkForUndefined(obj: any, path: string = ''): string[] {
  const issues: string[] = [];
  for (const key in obj) {
    const fullPath = path ? `${path}.${key}` : key;
    const value = obj[key];
    
    // Skip intentionally nullable fields
    if (INTENTIONALLY_NULLABLE.includes(key) && value === null) {
      continue;
    }
    
    if (value === undefined) {
      issues.push(`UNDEFINED: ${fullPath}`);
    } else if (value === null) {
      issues.push(`NULL: ${fullPath}`);
    } else if (typeof value === 'number' && isNaN(value)) {
      issues.push(`NaN: ${fullPath}`);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      issues.push(...checkForUndefined(value, fullPath));
    }
  }
  return issues;
}

function testLBOParser() {
  console.log('\n' + '='.repeat(80));
  console.log('TESTING LBO GUARANTEED PARSER');
  console.log('='.repeat(80));
  
  let passed = 0;
  let failed = 0;
  
  for (let i = 0; i < LBO_TEST_INPUTS.length; i++) {
    const input = LBO_TEST_INPUTS[i];
    console.log(`\n--- TEST ${i + 1}: ${input.substring(0, 60)}...`);
    
    try {
      const result = parseLBOGuaranteed(input);
      const issues = checkForUndefined(result);
      
      // Check critical fields
      const criticalFields = [
        'entryMultiple', 'exitMultiple', 'exitYear', 'seniorDebtMultiple',
        'subDebtMultiple', 'seniorDebtRate', 'subDebtRate', 'ltmEBITDA'
      ];
      
      const missingCritical = criticalFields.filter(f => {
        const val = (result as any)[f];
        return val === undefined || val === null || (typeof val === 'number' && isNaN(val));
      });
      
      if (issues.length === 0 && missingCritical.length === 0) {
        console.log(`  ✅ PASS - All fields populated`);
        console.log(`     Entry: ${result.entryMultiple}x, Exit: ${result.exitMultiple}x, Hold: ${result.exitYear}yr`);
        console.log(`     EBITDA: $${result.ltmEBITDA}M, Senior: ${result.seniorDebtMultiple}x @ ${(result.seniorDebtRate * 100).toFixed(1)}%`);
        console.log(`     Sub: ${result.subDebtMultiple}x @ ${(result.subDebtRate * 100).toFixed(1)}%`);
        passed++;
      } else {
        console.log(`  ❌ FAIL`);
        if (issues.length > 0) console.log(`     Issues: ${issues.join(', ')}`);
        if (missingCritical.length > 0) console.log(`     Missing critical: ${missingCritical.join(', ')}`);
        failed++;
      }
    } catch (error) {
      console.log(`  ❌ ERROR: ${error}`);
      failed++;
    }
  }
  
  console.log(`\n${'='.repeat(40)}`);
  console.log(`LBO RESULTS: ${passed}/${LBO_TEST_INPUTS.length} passed, ${failed} failed`);
  return { passed, failed };
}

function testMAParser() {
  console.log('\n' + '='.repeat(80));
  console.log('TESTING M&A GUARANTEED PARSER');
  console.log('='.repeat(80));
  
  let passed = 0;
  let failed = 0;
  
  for (let i = 0; i < MA_TEST_INPUTS.length; i++) {
    const input = MA_TEST_INPUTS[i];
    console.log(`\n--- TEST ${i + 1}: ${input.substring(0, 60)}...`);
    
    try {
      const result = parseMAGuaranteed(input);
      const issues = checkForUndefined(result);
      
      // Check critical fields
      const criticalFields = [
        'entryMultiple', 'cashPercent', 'stockPercent', 'costSynergies',
        'revenueSynergies', 'projectionYears'
      ];
      
      const missingCritical = criticalFields.filter(f => {
        const val = (result as any)[f];
        return val === undefined || val === null || (typeof val === 'number' && isNaN(val));
      });
      
      if (issues.length === 0 && missingCritical.length === 0) {
        console.log(`  ✅ PASS - All fields populated`);
        console.log(`     Multiple: ${result.entryMultiple}x, Cash: ${result.cashPercent}%, Stock: ${result.stockPercent}%`);
        console.log(`     Cost Synergies: $${result.costSynergies}M, Revenue Synergies: $${result.revenueSynergies}M`);
        passed++;
      } else {
        console.log(`  ❌ FAIL`);
        if (issues.length > 0) console.log(`     Issues: ${issues.join(', ')}`);
        if (missingCritical.length > 0) console.log(`     Missing critical: ${missingCritical.join(', ')}`);
        failed++;
      }
    } catch (error) {
      console.log(`  ❌ ERROR: ${error}`);
      failed++;
    }
  }
  
  console.log(`\n${'='.repeat(40)}`);
  console.log(`M&A RESULTS: ${passed}/${MA_TEST_INPUTS.length} passed, ${failed} failed`);
  return { passed, failed };
}

// Run all tests
console.log('\n🔬 GUARANTEED PARSER STRESS TEST');
console.log('Testing regex extraction + defaults on 20 real user inputs');

const lboResults = testLBOParser();
const maResults = testMAParser();

console.log('\n' + '='.repeat(80));
console.log('FINAL SUMMARY');
console.log('='.repeat(80));
console.log(`LBO Parser: ${lboResults.passed}/${LBO_TEST_INPUTS.length} passed`);
console.log(`M&A Parser: ${maResults.passed}/${MA_TEST_INPUTS.length} passed`);
console.log(`TOTAL: ${lboResults.passed + maResults.passed}/${LBO_TEST_INPUTS.length + MA_TEST_INPUTS.length} passed`);

if (lboResults.failed === 0 && maResults.failed === 0) {
  console.log('\n✅ ALL TESTS PASSED - Parser is bulletproof!');
} else {
  console.log('\n❌ SOME TESTS FAILED - Parser needs work');
  process.exit(1);
}
