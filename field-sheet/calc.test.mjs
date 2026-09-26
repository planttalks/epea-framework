import assert from "node:assert/strict";
import test from "node:test";

import * as epea from "./calc.mjs";
import { clearRanking, workedExample } from "./examples.mjs";

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} vs ${expected}`);
}

test("tier scores", () => {
  assert.equal(epea.tierToScore("safe"), 1);
  assert.equal(epea.tierToScore("mild"), 2);
  assert.equal(epea.tierToScore("danger"), 3);
  assert.throws(() => epea.tierToScore("unknown"), /Unknown tier/);
});

test("profile totals", () => {
  assert.equal(epea.profileScoreFromTiers(Array(6).fill("safe")), 6);
  assert.equal(epea.profileScoreFromTiers(Array(6).fill("danger")), 18);
  assert.equal(
    epea.profileScoreFromTiers(["safe", "mild", "safe", "mild", "safe", "mild"]),
    9,
  );
  assert.equal(
    epea.profileScoreFromTiers({
      logOH: "safe",
      logKoc: "mild",
      HLN: "danger",
      logBCF: "safe",
      logBAF: "safe",
      DT50: "mild",
    }),
    10,
  );
  assert.throws(() => epea.profileScoreFromTiers(["safe", "mild"]), /Expected 6/);
});

test("environmental impact bands", () => {
  assert.ok(Math.abs(epea.environmentalImpactFraction(6) - 6 / 18) < 1e-12);
  assert.equal(epea.environmentalImpactFraction(18), 1);
  assert.equal(epea.classifyEnvironmentalImpactTotalScore(6), "safe");
  assert.equal(epea.classifyEnvironmentalImpactTotalScore(7), "mild");
  assert.equal(epea.classifyEnvironmentalImpactTotalScore(11), "mild");
  assert.equal(epea.classifyEnvironmentalImpactTotalScore(12), "danger");
  assert.equal(epea.classifyEnvironmentalImpactTotalScore(18), "danger");
  assert.equal(epea.classifyEnvironmentalImpactPct((6 / 18) * 100), "safe");
  assert.equal(epea.classifyEnvironmentalImpactPct(100), "danger");
  assert.throws(() => epea.classifyEnvironmentalImpactTotalScore(5), /6\.\.18/);
});

test("normalization gives the better value 100", () => {
  const enorm = epea.enormFromLbe([-10, -8, -6]);
  assert.deepEqual(enorm, [100, 50, 0]);
  assert.deepEqual(epea.enormFromLbe([-7, -7, -7]), [50, 50, 50]);
  assert.deepEqual(epea.snormFromImpactPct([0, 50, 100]), [100, 50, 0]);
  assert.deepEqual(epea.cnormFromCost([0, 50, 100]), [100, 50, 0]);
});

test("overall score rejects bad weights and unequal lengths", () => {
  assert.throws(
    () => epea.mcdaOverallScores([-7], [50], [20], [0.5, 0.5, 0.5]),
    /weights must sum to 1/,
  );
  assert.throws(() => epea.mcdaOverallScores([-7, -8], [50], [20]), /same length/);
});

test("custom efficacy weight prefers the more negative binding energy", () => {
  const rows = epea.mcdaOverallScores([-10, -6], [50, 50], [50, 50], [0.8, 0.1, 0.1], [
    "best_efficacy",
    "worst_efficacy",
  ]);
  const best = rows.find((row) => row.name === "best_efficacy");
  const worst = rows.find((row) => row.name === "worst_efficacy");
  assert.ok(best.oPercent > worst.oPercent);
  close(best.oPercent, 90);
  close(worst.oPercent, 10);
});

test("a perfect candidate scores 100 and the opposite scores 0", () => {
  const rows = epea.mcdaOverallScores([-10, -5], [0, 100], [1, 1000], undefined, [
    "perfect",
    "worst",
  ]);
  close(rows[0].oPercent, 100);
  close(rows[1].oPercent, 0);
});

test("worked example ranks Example_A first", () => {
  const sheet = epea.computeSheet(workedExample().input);
  assert.equal(sheet.errors.length, 0);
  assert.equal(sheet.candidates[0].total, 9);
  assert.equal(sheet.candidates[0].eiClass, "mild");
  assert.equal(sheet.candidates[1].total, 10);
  assert.equal(sheet.candidates[2].total, 12);
  assert.equal(sheet.candidates[2].eiClass, "danger");
  assert.equal(sheet.ranked[0].name, "Example_A");
  assert.equal(sheet.ranked[1].name, "Example_B");
  assert.equal(sheet.ranked[2].name, "Example_C");
  close(sheet.ranked[0].enorm, 43.75);
  close(sheet.ranked[1].enorm, 100);
  close(sheet.ranked[2].enorm, 0);
  close(sheet.ranked[0].snorm, 100);
  close(sheet.ranked[2].cnorm, 100);
  assert.ok(sheet.ranked[0].oPercent > sheet.ranked[1].oPercent);
});

test("clear ranking puts the low-impact candidate at 100", () => {
  const sheet = epea.computeSheet(clearRanking().input);
  assert.equal(sheet.errors.length, 0);
  assert.equal(sheet.ranked[0].name, "Low_impact");
  close(sheet.ranked[0].oPercent, 100);
  assert.equal(sheet.ranked[0].eiClass, "safe");
  close(sheet.ranked[1].oPercent, 0);
  assert.equal(sheet.ranked[1].eiClass, "danger");
});

test("one candidate still reports impact and a tied score of 50", () => {
  const sheet = epea.computeSheet({
    weightMode: "equal",
    candidates: [
      {
        name: "Only",
        logOH: "safe",
        logKoc: "safe",
        HLN: "safe",
        logBCF: "safe",
        logBAF: "safe",
        DT50: "safe",
        lbe: -8,
        cost: 10,
      },
    ],
  });
  assert.equal(sheet.errors.length, 0);
  assert.equal(sheet.candidates[0].total, 6);
  assert.equal(sheet.candidates[0].eiClass, "safe");
  close(sheet.ranked[0].enorm, 50);
  close(sheet.ranked[0].snorm, 50);
  close(sheet.ranked[0].cnorm, 50);
  close(sheet.ranked[0].oPercent, 50);
});

test("a blank row is ignored and a half-filled row blocks the ranking", () => {
  const sheet = epea.computeSheet({
    weightMode: "equal",
    candidates: [
      {
        name: "Ready",
        logOH: "safe",
        logKoc: "mild",
        HLN: "safe",
        logBCF: "mild",
        logBAF: "safe",
        DT50: "mild",
        lbe: -8,
        cost: 12,
      },
      { name: "", logOH: "safe", logKoc: "safe", HLN: "safe", logBCF: "safe", logBAF: "safe", DT50: "safe" },
      { name: "Missing cost", lbe: -7 },
    ],
  });
  assert.equal(sheet.scores, null);
  assert.equal(sheet.candidates[0].used, true);
  assert.equal(sheet.candidates[1].used, false);
  assert.ok(sheet.errors.some((error) => error.id === "cand-2-cost"));
  assert.equal(sheet.candidates[0].eiPercent, 50);
});

test("custom weights must sum to 1", () => {
  const sheet = epea.computeSheet({
    weightMode: "custom",
    wE: 0.5,
    wS: 0.5,
    wC: 0.5,
    candidates: [{ name: "A", lbe: -8, cost: 10 }],
  });
  assert.equal(sheet.scores, null);
  assert.ok(sheet.errors.some((error) => error.id === "wE"));
});

test("tier csv round trip keeps the worked example", () => {
  const sheet = epea.computeSheet(workedExample().input);
  const csv = epea.sheetToCsv(
    sheet.candidates.filter((row) => row.used),
    sheet.ranked,
  );
  const parsed = epea.candidatesFromTierCsv(csv);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.candidates.length, 3);
  assert.equal(parsed.candidates[0].name, "Example_A");
  assert.equal(parsed.candidates[0].logOH, "safe");
  assert.equal(Number(parsed.candidates[1].lbe), -8.1);
  assert.equal(Number(parsed.candidates[2].cost), 8);
});

test("tier csv reports a bad tier and a missing column", () => {
  const bad = epea.candidatesFromTierCsv(
    "name,logOH,logKoc,HLN,logBCF,logBAF,DT50,LBE,USD_per_kg\nX,safe,mild,safe,mild,safe,unknown,-7,10\n",
  );
  assert.equal(bad.candidates.length, 0);
  assert.match(bad.errors[0], /Invalid tier/);
  const missing = epea.candidatesFromTierCsv("name,logOH\nX,safe\n");
  assert.match(missing.errors[0], /Missing columns/);
});

test("comment lines and quoted names are accepted", () => {
  const parsed = epea.candidatesFromTierCsv(
    '# note\nname,logOH,logKoc,HLN,logBCF,logBAF,DT50,LBE,USD_per_kg\n"Compound, A",safe,safe,safe,safe,safe,safe,-8,12\n',
  );
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.candidates[0].name, "Compound, A");
});
