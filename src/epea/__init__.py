"""
Eco-pharmaco-economic analysis (EPEA) — WSM environmental impact + MCDA overall score.

Reference: Zure, D.; Sung, M.-H.; Rahim, A.; Kuo, H.-W. Int. J. Mol. Sci. 2024, 25, 6009.
https://doi.org/10.3390/ijms25116009 · https://www.mdpi.com/1422-0067/25/11/6009
"""

from epea.core import (
    classify_environmental_impact_pct,
    classify_environmental_impact_total_score,
    environmental_impact_fraction,
    mcda_overall_scores,
    profile_score_from_tiers,
    tier_to_score,
)
from epea.io import dataframe_from_tier_table, run_mcda_from_tier_table

__all__ = [
    "tier_to_score",
    "profile_score_from_tiers",
    "environmental_impact_fraction",
    "classify_environmental_impact_pct",
    "classify_environmental_impact_total_score",
    "mcda_overall_scores",
    "dataframe_from_tier_table",
    "run_mcda_from_tier_table",
]
__version__ = "1.0.0"
