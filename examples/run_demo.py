"""
Example run: synthetic disinfectant-like rows (replace with your EPI tiers, LBE, and prices).

Methodology from: Zure, D.; Sung, M.-H.; Rahim, A.; Kuo, H.-W. Int. J. Mol. Sci. 2024, 25, 6009.
https://doi.org/10.3390/ijms25116009 · https://www.mdpi.com/1422-0067/25/11/6009

Data in this file are illustrative only and do not reproduce published table values.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Allow running without install: python examples/run_demo.py
_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_ROOT / "src"))

from epea.core import (  # noqa: E402
    classify_environmental_impact_pct,
    environmental_impact_fraction,
    mcda_overall_scores,
    profile_score_from_tiers,
)


def main() -> None:
    # Illustrative tiers per compound (safe/mild/danger) for six profiles
    compounds = {
        "Example_A": dict(
            tiers=("safe", "mild", "safe", "mild", "safe", "mild"),
            lbe=-7.2,
            price_usd_kg=12.0,
        ),
        "Example_B": dict(
            tiers=("mild", "mild", "mild", "safe", "mild", "safe"),
            lbe=-8.1,
            price_usd_kg=45.0,
        ),
        "Example_C": dict(
            tiers=("danger", "mild", "mild", "mild", "mild", "safe"),
            lbe=-6.5,
            price_usd_kg=8.0,
        ),
    }

    names: list[str] = []
    ei_pcts: list[float] = []
    lbes: list[float] = []
    costs: list[float] = []

    for name, row in compounds.items():
        tot = profile_score_from_tiers(row["tiers"])
        frac = environmental_impact_fraction(tot)
        ei_pct = frac * 100.0
        cls = classify_environmental_impact_pct(ei_pct)
        print(f"{name}: total tier score={tot}, EI%={ei_pct:.2f} ({cls})")

        names.append(name)
        ei_pcts.append(ei_pct)
        lbes.append(row["lbe"])
        costs.append(row["price_usd_kg"])

    df = mcda_overall_scores(lbes, ei_pcts, costs, names=names)
    df = df.sort_values("O_percent", ascending=False)
    print("\nMCDA ranking (higher O_percent = better overall):")
    print(df.to_string(index=False))


if __name__ == "__main__":
    main()
