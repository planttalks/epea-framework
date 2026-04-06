"""
Optional CSV helpers for batch EPEA runs.

Source study: Zure, D.; Sung, M.-H.; Rahim, A.; Kuo, H.-W. Int. J. Mol. Sci. 2024, 25, 6009.
https://doi.org/10.3390/ijms25116009
"""

from __future__ import annotations

import pandas as pd

from epea.core import (
    classify_environmental_impact_pct,
    environmental_impact_fraction,
    mcda_overall_scores,
    profile_score_from_tiers,
)

PROFILE_COLS = ("logOH", "logKoc", "HLN", "logBCF", "logBAF", "DT50")


def dataframe_from_tier_table(path: str) -> pd.DataFrame:
    """
    Load a CSV with columns: name, six profile tier columns, LBE, USD_per_kg.

    Tier cells must be safe, mild, or danger (case-insensitive).
    """
    df = pd.read_csv(path, comment="#")
    df.columns = [c.strip() for c in df.columns]
    missing = [c for c in ("name", *PROFILE_COLS, "LBE", "USD_per_kg") if c not in df.columns]
    if missing:
        raise ValueError(f"Missing columns: {missing}")

    ei_list: list[float] = []
    ei_class: list[str] = []
    for _, row in df.iterrows():
        tiers = tuple(str(row[c]).strip().lower() for c in PROFILE_COLS)  # type: ignore[misc]
        for t in tiers:
            if t not in ("safe", "mild", "danger"):
                raise ValueError(f"Invalid tier {t!r} in row {row['name']!r}")
        tot = profile_score_from_tiers(tiers)  # type: ignore[arg-type]
        pct = environmental_impact_fraction(tot) * 100.0
        ei_list.append(pct)
        ei_class.append(classify_environmental_impact_pct(pct))

    out = df.copy()
    out["EI_percent"] = ei_list
    out["EI_class"] = ei_class
    return out


def run_mcda_from_tier_table(path: str) -> pd.DataFrame:
    """Load tier table and return MCDA scores merged with inputs."""
    base = dataframe_from_tier_table(path)
    m = mcda_overall_scores(
        base["LBE"].astype(float),
        base["EI_percent"].astype(float),
        base["USD_per_kg"].astype(float),
        names=base["name"].astype(str),
    )
    return m.sort_values("O_percent", ascending=False)
