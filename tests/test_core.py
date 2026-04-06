"""
Tests for epea.core.

Coverage targets:
- tier_to_score: all valid tiers + invalid input
- profile_score_from_tiers: sequence path, mapping (dict) path, wrong length
- environmental_impact_fraction: min/max bounds
- classify_environmental_impact_total_score: all three bands + out-of-range
- classify_environmental_impact_pct: safe/mild/danger + boundary
- enorm_from_lbe: ordering, exact values, degenerate (all equal)
- snorm_from_impact_pct: monotonicity, exact values
- cnorm_from_cost: monotonicity, exact values
- mcda_overall_scores: ranking, weight validation, length mismatch
"""
from __future__ import annotations

import numpy as np
import pytest

from epea.core import (
    MAX_TOTAL_PROFILE_SCORE,
    classify_environmental_impact_pct,
    classify_environmental_impact_total_score,
    cnorm_from_cost,
    environmental_impact_fraction,
    enorm_from_lbe,
    mcda_overall_scores,
    profile_score_from_tiers,
    snorm_from_impact_pct,
    tier_to_score,
)


# ---------------------------------------------------------------------------
# tier_to_score
# ---------------------------------------------------------------------------

def test_tier_scores_all_valid() -> None:
    assert tier_to_score("safe") == 1
    assert tier_to_score("mild") == 2
    assert tier_to_score("danger") == 3


def test_tier_score_invalid_raises() -> None:
    with pytest.raises(ValueError, match="Unknown tier"):
        tier_to_score("unknown")  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# profile_score_from_tiers
# ---------------------------------------------------------------------------

def test_profile_score_sequence_all_safe() -> None:
    assert profile_score_from_tiers(("safe",) * 6) == 6


def test_profile_score_sequence_all_danger() -> None:
    assert profile_score_from_tiers(("danger",) * 6) == 18


def test_profile_score_sequence_mixed() -> None:
    # safe=1, mild=2, safe=1, mild=2, safe=1, mild=2  ->  9
    assert profile_score_from_tiers(("safe", "mild", "safe", "mild", "safe", "mild")) == 9


def test_profile_score_dict_path() -> None:
    tiers_dict = {
        "logOH": "safe",
        "logKoc": "mild",
        "HLN": "danger",
        "logBCF": "safe",
        "logBAF": "safe",
        "DT50": "mild",
    }
    # 1+2+3+1+1+2 = 10
    assert profile_score_from_tiers(tiers_dict) == 10  # type: ignore[arg-type]


def test_profile_score_wrong_length_raises() -> None:
    with pytest.raises(ValueError, match="Expected 6"):
        profile_score_from_tiers(("safe", "mild"))  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# environmental_impact_fraction
# ---------------------------------------------------------------------------

def test_ei_fraction_min() -> None:
    assert environmental_impact_fraction(6) == pytest.approx(6 / 18)


def test_ei_fraction_max() -> None:
    assert environmental_impact_fraction(18) == pytest.approx(1.0)


# ---------------------------------------------------------------------------
# classify_environmental_impact_total_score
# ---------------------------------------------------------------------------

def test_classify_total_safe() -> None:
    assert classify_environmental_impact_total_score(6) == "safe"


def test_classify_total_mild_low() -> None:
    assert classify_environmental_impact_total_score(7) == "mild"


def test_classify_total_mild_high() -> None:
    assert classify_environmental_impact_total_score(11) == "mild"


def test_classify_total_danger_boundary() -> None:
    assert classify_environmental_impact_total_score(12) == "danger"


def test_classify_total_danger_max() -> None:
    assert classify_environmental_impact_total_score(18) == "danger"


def test_classify_total_out_of_range_low() -> None:
    with pytest.raises(ValueError):
        classify_environmental_impact_total_score(5)


def test_classify_total_out_of_range_high() -> None:
    with pytest.raises(ValueError):
        classify_environmental_impact_total_score(19)


# ---------------------------------------------------------------------------
# classify_environmental_impact_pct — round-trip
# ---------------------------------------------------------------------------

def test_classify_pct_all_safe() -> None:
    assert classify_environmental_impact_pct(100 * 6 / 18) == "safe"


def test_classify_pct_all_danger() -> None:
    assert classify_environmental_impact_pct(100.0) == "danger"


def test_classify_pct_mid_mild() -> None:
    ei = environmental_impact_fraction(9) * 100.0  # score=9 -> mild
    assert classify_environmental_impact_pct(ei) == "mild"


# ---------------------------------------------------------------------------
# enorm_from_lbe
# ---------------------------------------------------------------------------

def test_enorm_best_is_most_negative() -> None:
    E = np.array([-10.0, -8.0, -6.0])
    en = enorm_from_lbe(E)
    assert en[0] > en[1] > en[2]


def test_enorm_exact_values() -> None:
    E = np.array([-10.0, -8.0, -6.0])
    en = enorm_from_lbe(E)
    # hi=-6, lo=-10; en = (hi-E)/(hi-lo)*100
    assert en[0] == pytest.approx(100.0)   # most negative -> best
    assert en[2] == pytest.approx(0.0)    # least negative -> worst
    assert en[1] == pytest.approx(50.0)


def test_enorm_degenerate_all_equal() -> None:
    E = np.array([-7.0, -7.0, -7.0])
    en = enorm_from_lbe(E)
    # All tied -> degenerate fallback; values should be uniform
    assert np.all(en == en[0])


# ---------------------------------------------------------------------------
# snorm_from_impact_pct
# ---------------------------------------------------------------------------

def test_snorm_monotone_decreasing() -> None:
    S = np.array([10.0, 50.0, 90.0])
    sn = snorm_from_impact_pct(S)
    assert sn[0] > sn[1] > sn[2]


def test_snorm_exact_values() -> None:
    S = np.array([0.0, 50.0, 100.0])
    sn = snorm_from_impact_pct(S)
    assert sn[0] == pytest.approx(100.0)
    assert sn[2] == pytest.approx(0.0)
    assert sn[1] == pytest.approx(50.0)


# ---------------------------------------------------------------------------
# cnorm_from_cost
# ---------------------------------------------------------------------------

def test_cnorm_monotone_decreasing() -> None:
    C = np.array([5.0, 50.0, 500.0])
    cn = cnorm_from_cost(C)
    assert cn[0] > cn[1] > cn[2]


def test_cnorm_exact_values() -> None:
    C = np.array([0.0, 50.0, 100.0])
    cn = cnorm_from_cost(C)
    assert cn[0] == pytest.approx(100.0)   # cheapest -> best score
    assert cn[2] == pytest.approx(0.0)
    assert cn[1] == pytest.approx(50.0)


# ---------------------------------------------------------------------------
# mcda_overall_scores
# ---------------------------------------------------------------------------

def test_mcda_ranking_clear_winner() -> None:
    # 'a': better LBE, lower EI, lower cost -> should score highest
    df = mcda_overall_scores(
        [-9.0, -7.0],
        [20.0, 80.0],
        [10.0, 100.0],
        names=["a", "b"],
    )
    score_a = df.loc[df["name"] == "a", "O_percent"].iloc[0]
    score_b = df.loc[df["name"] == "b", "O_percent"].iloc[0]
    assert score_a > score_b


def test_mcda_equal_weights_sum() -> None:
    df = mcda_overall_scores(
        [-8.0, -6.0],
        [30.0, 70.0],
        [10.0, 80.0],
    )
    # O = (1/3)*Enorm + (1/3)*Snorm + (1/3)*Cnorm; values in [0,100] so O in [0,100]
    assert df["O_percent"].between(0.0, 100.0).all()


def test_mcda_columns_present() -> None:
    df = mcda_overall_scores([-7.0], [50.0], [20.0])
    expected = {"name", "LBE", "EI_percent", "cost_per_kg", "Enorm", "Snorm", "Cnorm", "O_percent"}
    assert expected.issubset(df.columns)


def test_mcda_weight_validation_raises() -> None:
    with pytest.raises(ValueError, match="weights must sum to 1"):
        mcda_overall_scores([-7.0], [50.0], [20.0], weights=(0.5, 0.5, 0.5))


def test_mcda_length_mismatch_raises() -> None:
    with pytest.raises(ValueError, match="same length"):
        mcda_overall_scores([-7.0, -8.0], [50.0], [20.0])


def test_mcda_auto_names() -> None:
    df = mcda_overall_scores([-7.0, -8.0], [50.0, 40.0], [20.0, 30.0])
    assert list(df["name"]) == ["candidate_0", "candidate_1"]


def test_mcda_custom_weights() -> None:
    # Emphasise efficacy heavily
    df = mcda_overall_scores(
        [-10.0, -6.0],
        [50.0, 50.0],
        [50.0, 50.0],
        weights=(0.8, 0.1, 0.1),
        names=["best_efficacy", "worst_efficacy"],
    )
    e_best = df.loc[df["name"] == "best_efficacy", "O_percent"].iloc[0]
    e_worst = df.loc[df["name"] == "worst_efficacy", "O_percent"].iloc[0]
    assert e_best > e_worst


def test_mcda_boundary_scores() -> None:
    # Perfect candidate: most negative LBE, lowest EI, lowest cost -> O should be 100
    df = mcda_overall_scores(
        [-10.0, -5.0],
        [0.0, 100.0],
        [1.0, 1000.0],
        names=["perfect", "worst"],
    )
    assert df.loc[df["name"] == "perfect", "O_percent"].iloc[0] == pytest.approx(100.0)
    assert df.loc[df["name"] == "worst", "O_percent"].iloc[0] == pytest.approx(0.0)
