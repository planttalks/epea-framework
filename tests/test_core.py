import numpy as np
import pytest

from epea.core import (
    classify_environmental_impact_pct,
    classify_environmental_impact_total_score,
    environmental_impact_fraction,
    enorm_from_lbe,
    mcda_overall_scores,
    profile_score_from_tiers,
    snorm_from_impact_pct,
    tier_to_score,
)


def test_tier_scores() -> None:
    assert tier_to_score("safe") == 1
    assert tier_to_score("mild") == 2
    assert tier_to_score("danger") == 3


def test_all_safe_min_impact() -> None:
    tiers = ("safe",) * 6
    assert profile_score_from_tiers(tiers) == 6
    assert environmental_impact_fraction(6) == pytest.approx(6 / 18)
    assert classify_environmental_impact_total_score(6) == "safe"
    assert classify_environmental_impact_pct(100 * 6 / 18) == "safe"


def test_all_danger_max_impact() -> None:
    tiers = ("danger",) * 6
    assert profile_score_from_tiers(tiers) == 18
    assert classify_environmental_impact_pct(100.0) == "danger"


def test_enorm_best_is_most_negative() -> None:
    E = np.array([-10.0, -8.0, -6.0])
    en = enorm_from_lbe(E)
    assert en[0] > en[2]


def test_mcda_ranking() -> None:
    # Better LBE (more neg), lower EI%, lower cost -> should win
    df = mcda_overall_scores(
        [-9.0, -7.0],
        [20.0, 80.0],
        [10.0, 100.0],
        names=["a", "b"],
    )
    assert df.loc[df["name"] == "a", "O_percent"].iloc[0] > df.loc[df["name"] == "b", "O_percent"].iloc[0]


def test_snorm_monotone() -> None:
    S = np.array([10.0, 50.0, 90.0])
    sn = snorm_from_impact_pct(S)
    assert sn[0] > sn[1] > sn[2]
