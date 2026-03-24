/**
 * Tests for company name validation (Layer 1 — local rules only).
 * Run with: npx tsx tests/company-name-validation.test.ts
 */

import { localCleanCompanyName } from "../src/lib/company-name-validation";

interface TestCase {
  input: string;
  expectValid: boolean;
  expectClean?: string;
  expectReview?: boolean;
  description: string;
}

const testCases: TestCase[] = [
  // ── Valid names that should pass cleanly ──
  {
    input: "Société Immobilière Bélanger",
    expectValid: true,
    expectClean: "Société Immobilière Bélanger",
    description: "Clean company name should pass as-is",
  },
  {
    input: "Immeubles Laforest",
    expectValid: true,
    expectClean: "Immeubles Laforest",
    description: "Simple valid company name",
  },
  {
    input: "Gestion Immobilière Cogir",
    expectValid: true,
    expectClean: "Gestion Immobilière Cogir",
    description: "Normal property management company",
  },
  {
    input: "Les Habitations XYZ",
    expectValid: true,
    expectClean: "Les Habitations XYZ",
    description: "Company name with article",
  },

  // ── Names with SEO suffixes that should be cleaned ──
  {
    input: "Société Immobilière Bélanger, appartement à louer à Québec",
    expectValid: true,
    expectClean: "Société Immobilière Bélanger",
    description: "Remove rental SEO suffix with city",
  },
  {
    input: "Immeubles Laforest | appartements et condos",
    expectValid: true,
    expectClean: "Immeubles Laforest",
    description: "Remove category suffix after pipe",
  },
  {
    input: "Groupe Robin — Montréal",
    expectValid: true,
    expectClean: "Groupe Robin",
    description: "Remove city name after em dash",
  },
  {
    input: "Gestion ABC, condos à louer",
    expectValid: true,
    expectClean: "Gestion ABC",
    description: "Remove rental suffix after comma",
  },
  {
    input: "Location Tremblay - logements à louer à Sherbrooke",
    expectValid: true,
    expectClean: "Location Tremblay",
    description: "Remove full rental + city SEO tail",
  },

  // ── Invalid / generic names that should be rejected ──
  {
    input: "Accueil",
    expectValid: false,
    description: "Generic page label 'Accueil'",
  },
  {
    input: "Home",
    expectValid: false,
    description: "Generic page label 'Home'",
  },
  {
    input: "Homepage",
    expectValid: false,
    description: "Generic page label 'Homepage'",
  },
  {
    input: "À propos",
    expectValid: false,
    description: "Navigation label 'À propos'",
  },
  {
    input: "Contact",
    expectValid: false,
    description: "Navigation label 'Contact'",
  },
  {
    input: "Voir plus",
    expectValid: false,
    description: "Navigation label 'Voir plus'",
  },
  {
    input: "Learn more",
    expectValid: false,
    description: "Navigation label 'Learn more'",
  },
  {
    input: "Property details",
    expectValid: false,
    description: "Generic listing label",
  },
  {
    input: "Listing",
    expectValid: false,
    description: "Generic listing label",
  },
  {
    input: "",
    expectValid: false,
    description: "Empty string",
  },
  {
    input: "A",
    expectValid: false,
    description: "Single character — too short",
  },

  // ── Edge cases ──
  {
    input: "  Gestion  Lavoie   ",
    expectValid: true,
    expectClean: "Gestion Lavoie",
    description: "Extra whitespace should be collapsed",
  },
  {
    input: "«Immeubles Dupont»",
    expectValid: true,
    expectClean: "Immeubles Dupont",
    description: "Surrounding quotes should be removed",
  },
  {
    input: "Résidences ABC | accueil",
    expectValid: true,
    expectClean: "Résidences ABC",
    description: "Remove '| accueil' suffix",
  },
];

// ── Runner ──

let passed = 0;
let failed = 0;

for (const tc of testCases) {
  const result = localCleanCompanyName(tc.input);

  const errors: string[] = [];

  if (result.isValid !== tc.expectValid) {
    errors.push(`  isValid: expected ${tc.expectValid}, got ${result.isValid}`);
  }
  if (tc.expectClean !== undefined && result.cleanName !== tc.expectClean) {
    errors.push(`  cleanName: expected "${tc.expectClean}", got "${result.cleanName}"`);
  }
  if (tc.expectReview !== undefined && result.needsReview !== tc.expectReview) {
    errors.push(`  needsReview: expected ${tc.expectReview}, got ${result.needsReview}`);
  }

  if (errors.length > 0) {
    failed++;
    console.log(`❌ FAIL: ${tc.description}`);
    console.log(`  Input: "${tc.input}"`);
    for (const e of errors) console.log(e);
    console.log(`  Full result:`, JSON.stringify(result));
    console.log();
  } else {
    passed++;
    console.log(`✅ PASS: ${tc.description}`);
  }
}

console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${testCases.length} total`);
if (failed > 0) process.exit(1);
