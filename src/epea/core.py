"""
EPEA core computations aligned with:

  Zure, D.; Sung, M.-H.; Rahim, A.; Kuo, H.-W. In Silico Assessment of Chemical
  Disinfectants on Surface Proteins Unveiled Dissimilarity in Antiviral Efficacy
  and Suitability towards Pathogenic Viruses. Int. J. Mol. Sci. 2024, 25, 6009.
  https://doi.org/10.3390/ijms25116009
  https://www.mdpi.com/1422-0067/25/11/6009

Environmental impact (WSM): six EPI Suite-derived profiles, tiers safe=1, mild=2, danger=3.

MCDA overall score O = wE*Enorm + wS*Snorm + wC*Cnorm with default equal weights.
"""

from __future__ import annotations

from typing import Iterable, Literal, Mapping, Sequence

import numpy as np
import pandas as pd

Tier = Literal["safe", "mild", "danger"]
ProfileName = Literal[
    "logOH",
    "logKoc",
    "HLN",
    "logBCF",
    "logBAF",
    "DT50",
]

N_PROFILES = 6
MAX_TIER_SCORE = 3
MAX_TOTAL_PROFILE_SCORE = N_PROFILES * MAX_TIER_SCORE


def tier_to_score(tier: Tier) -> int:
    if tier == "safe":
        return 1
    if tier == "mild":
        return 2
    if tier == "danger":
        return 3
    raise ValueError(f"Unknown tier: {tier!r}")


def profile_score_from_tiers(
    tiers: Mapping[ProfileName, Tier] | Sequence[Tier],
) -> int:
    """
    Sum of tier scores (1/2/3) across the six profiles.
    If a sequence is passed, length must be 6 in the canonical profile order.
    """
    if isinstance(tiers, Mapping):
        keys: Iterable[ProfileName] = (
            "logOH",
            "logKoc",
            "HLN",
            "logBCF",
            "logBAF",
            "DT50",
        )
        return sum(tier_to_score(tiers[k]) for k in keys)
    seq = list(tiers)
    if len(seq) != N_PROFILES:
        raise ValueError(f"Expected {N_PROFILES} tier values, got {len(seq)}")
    return sum(tier_to_score(t) for t in seq)  # type: ignore[arg-type]


def environmental_impact_fraction(total_profile_score: int) -> float:
    """EI as a fraction of the maximum (Eq. 1 without x100)."""
    return float(total_profile_score) / float(MAX_TOTAL_PROFILE_SCORE)


def classify_environmental_impact_total_score(total_profile_score: int) -> str:
    """
    Classify using the discrete total over six 1/2/3 tiers (range 6–18).

    Percent thresholds in the paper (33.33 / 66.67) do not line up exactly with
    integer scores (e.g. all-safe is 6/18 = 33.333...%). Score bands match the
    intended thirds of the 6–18 range: 6 safe, 7–11 mild, 12–18 danger.
    """
    if total_profile_score < 6 or total_profile_score > MAX_TOTAL_PROFILE_SCORE:
        raise ValueError(f"total_profile_score must be in 6..{MAX_TOTAL_PROFILE_SCORE}")
    if total_profile_score <= 6:
        return "safe"
    if total_profile_score <= 11:
        return "mild"
    return "danger"


def classify_environmental_impact_pct(ei_percent: float) -> str:
    """
    Map EI (%) back to the nearest total score on the 6–18 grid, then classify.
    This keeps CSV-only workflows consistent with tier sums.
    """
    total = int(round(ei_percent / 100.0 * MAX_TOTAL_PROFILE_SCORE))
    total = max(6, min(MAX_TOTAL_PROFILE_SCORE, total))
    return classify_environmental_impact_total_score(total)


def _minmax_01(x: np.ndarray) -> np.ndarray:
    x = np.asarray(x, dtype=float)
    lo, hi = np.nanmin(x), np.nanmax(x)
    if not np.isfinite(lo) or not np.isfinite(hi) or hi == lo:
        return np.full_like(x, 0.5, dtype=float)
    return (x - lo) / (hi - lo)


def enorm_from_lbe(E: np.ndarray | Sequence[float]) -> np.ndarray:
    """
    Efficacy normalization for binding energies (LBE): more negative = better = 100.

    Manuscript Eq. (3) is written as (E - min)/(max - min)*100 with min = most negative;
    that form assigns 0 to the best value. This implementation follows the stated intent:
    highest efficacy (most negative LBE) -> 100.
    """
    E = np.asarray(E, dtype=float)
    lo, hi = np.nanmin(E), np.nanmax(E)
    if not np.isfinite(lo) or not np.isfinite(hi) or hi == lo:
        return np.full_like(E, 50.0, dtype=float)
    return (hi - E) / (hi - lo) * 100.0


def snorm_from_impact_pct(S: np.ndarray | Sequence[float]) -> np.ndarray:
    """
    Eq. (4): lower environmental impact % = better -> higher Snorm.
    Snorm = 100 - (S - min(S)) / (max(S) - min(S)) * 100
    """
    S = np.asarray(S, dtype=float)
    m = _minmax_01(S)
    return 100.0 - m * 100.0


def cnorm_from_cost(C: np.ndarray | Sequence[float]) -> np.ndarray:
    """
    Eq. (5) with C (manuscript text uses S by typo): lower cost = better -> higher Cnorm.
    Cnorm = 100 - (C - min(C)) / (max(C) - min(C)) * 100
    """
    C = np.asarray(C, dtype=float)
    m = _minmax_01(C)
    return 100.0 - m * 100.0


def mcda_overall_scores(
    E_lbe: Sequence[float],
    S_ei_percent: Sequence[float],
    C_cost_per_kg: Sequence[float],
    weights: tuple[float, float, float] = (1.0 / 3.0, 1.0 / 3.0, 1.0 / 3.0),
    names: Sequence[str] | None = None,
) -> pd.DataFrame:
    """
    Compute Enorm, Snorm, Cnorm and O (%) for each candidate.

    Parameters
    ----------
    E_lbe :
        Antiviral efficacy proxy (e.g. docking LBE); more negative = better.
    S_ei_percent :
        Environmental impact percentage from Eq. (1) x 100.
    C_cost_per_kg :
        Cost in US$/kg (or any consistent currency unit).
    weights :
        (wE, wS, wC), must sum to 1.
    """
    wE, wS, wC = weights
    s = float(wE + wS + wC)
    if abs(s - 1.0) > 1e-6:
        raise ValueError("weights must sum to 1")

    E = np.asarray(E_lbe, dtype=float)
    S = np.asarray(S_ei_percent, dtype=float)
    C = np.asarray(C_cost_per_kg, dtype=float)
    n = len(E)
    if len(S) != n or len(C) != n:
        raise ValueError("E, S, and C must have the same length")

    en = enorm_from_lbe(E)
    sn = snorm_from_impact_pct(S)
    cn = cnorm_from_cost(C)
    O = wE * en + wS * sn + wC * cn

    idx = names if names is not None else [f"candidate_{i}" for i in range(n)]
    return pd.DataFrame(
        {
            "name": idx,
            "LBE": E,
            "EI_percent": S,
            "cost_per_kg": C,
            "Enorm": en,
            "Snorm": sn,
            "Cnorm": cn,
            "O_percent": O,
        }
    )
