"""The browser sheet must stay on the same scores as the Python module."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

from epea.core import (
    classify_environmental_impact_pct,
    classify_environmental_impact_total_score,
    cnorm_from_cost,
    enorm_from_lbe,
    environmental_impact_fraction,
    mcda_overall_scores,
    profile_score_from_tiers,
    snorm_from_impact_pct,
    tier_to_score,
)

ROOT = Path(__file__).resolve().parents[1]


def test_field_sheet_js_matches_python() -> None:
    node = shutil.which("node")
    if node is None:
        if os.environ.get("CI") == "true" and os.environ.get("FIELD_SHEET_JS") == "1":
            pytest.fail("node is missing in CI")
        pytest.skip("node is required to compare the field sheet")

    script = """
import * as epea from "./field-sheet/calc.mjs";
import { workedExample } from "./field-sheet/examples.mjs";

const tiers = ["safe", "mild", "safe", "mild", "safe", "mild"];
const total = epea.profileScoreFromTiers(tiers);
const ei = epea.environmentalImpactFraction(total) * 100;
const sheet = epea.computeSheet(workedExample().input);
const custom = epea.mcdaOverallScores(
  [-10, -6],
  [50, 50],
  [50, 50],
  [0.8, 0.1, 0.1],
  ["best_efficacy", "worst_efficacy"],
);
console.log(JSON.stringify({
  mild: epea.tierToScore("mild"),
  total,
  ei,
  cls: [
    epea.classifyEnvironmentalImpactTotalScore(6),
    epea.classifyEnvironmentalImpactTotalScore(7),
    epea.classifyEnvironmentalImpactTotalScore(11),
    epea.classifyEnvironmentalImpactTotalScore(12),
  ],
  clsPct: epea.classifyEnvironmentalImpactPct(ei),
  enorm: epea.enormFromLbe([-10, -8, -6]),
  snorm: epea.snormFromImpactPct([0, 50, 100]),
  cnorm: epea.cnormFromCost([0, 50, 100]),
  tied: epea.enormFromLbe([-7, -7, -7]),
  custom: custom.map((row) => [row.name, row.oPercent]),
  ranked: sheet.ranked.map((row) => [row.name, row.oPercent, row.enorm, row.snorm, row.cnorm, row.eiPercent]),
}));
"""
    completed = subprocess.run(
        [node, "--input-type=module", "-e", script],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    got = json.loads(completed.stdout)

    assert got["mild"] == tier_to_score("mild")
    expected_total = profile_score_from_tiers(("safe", "mild", "safe", "mild", "safe", "mild"))
    assert got["total"] == expected_total
    assert got["ei"] == pytest.approx(environmental_impact_fraction(expected_total) * 100)
    assert got["cls"] == [
        classify_environmental_impact_total_score(6),
        classify_environmental_impact_total_score(7),
        classify_environmental_impact_total_score(11),
        classify_environmental_impact_total_score(12),
    ]
    assert got["clsPct"] == classify_environmental_impact_pct(got["ei"])
    assert got["enorm"] == pytest.approx(enorm_from_lbe([-10.0, -8.0, -6.0]).tolist())
    assert got["snorm"] == pytest.approx(snorm_from_impact_pct([0.0, 50.0, 100.0]).tolist())
    assert got["cnorm"] == pytest.approx(cnorm_from_cost([0.0, 50.0, 100.0]).tolist())
    assert got["tied"] == pytest.approx(enorm_from_lbe([-7.0, -7.0, -7.0]).tolist())

    custom = mcda_overall_scores(
        [-10.0, -6.0],
        [50.0, 50.0],
        [50.0, 50.0],
        weights=(0.8, 0.1, 0.1),
        names=["best_efficacy", "worst_efficacy"],
    )
    assert [row[0] for row in got["custom"]] == ["best_efficacy", "worst_efficacy"]
    for name, score in got["custom"]:
        expected = custom.loc[custom["name"] == name, "O_percent"].iloc[0]
        assert score == pytest.approx(expected)

    names = ["Example_A", "Example_B", "Example_C"]
    tier_rows = [
        ("safe", "mild", "safe", "mild", "safe", "mild"),
        ("mild", "mild", "mild", "safe", "mild", "safe"),
        ("danger", "mild", "mild", "mild", "mild", "safe"),
    ]
    ei = [environmental_impact_fraction(profile_score_from_tiers(row)) * 100 for row in tier_rows]
    frame = mcda_overall_scores([-7.2, -8.1, -6.5], ei, [12.0, 45.0, 8.0], names=names)
    by_name = {row[0]: row for row in got["ranked"]}
    for name in names:
        py = frame.loc[frame["name"] == name].iloc[0]
        js_name, o_percent, enorm, snorm, cnorm, ei_percent = by_name[name]
        assert js_name == name
        assert o_percent == pytest.approx(py["O_percent"])
        assert enorm == pytest.approx(py["Enorm"])
        assert snorm == pytest.approx(py["Snorm"])
        assert cnorm == pytest.approx(py["Cnorm"])
        assert ei_percent == pytest.approx(py["EI_percent"])
