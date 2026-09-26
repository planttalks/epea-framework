# EPEA: eco-pharmaco-economic analysis

[![CI](https://github.com/planttalks/epea-framework/actions/workflows/ci.yml/badge.svg)](https://github.com/planttalks/epea-framework/actions/workflows/ci.yml)
[![Python 3.10+](https://img.shields.io/badge/python-3.10%2B-blue.svg)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![DOI](https://img.shields.io/badge/DOI-10.3390%2Fijms25116009-blue)](https://doi.org/10.3390/ijms25116009)

Python reference implementation and browser field sheet for the **weighted score (WSM) environmental impact** and **multicriteria decision analysis (MCDA)** workflow in *International Journal of Molecular Sciences* (2024). Compare disinfectant (or similar) candidates on efficacy, environmental profiles and cost.

**Field sheet:** [http://127.0.0.1:43119](http://127.0.0.1:43119)

Start the sheet from this repository, then open that address in a browser:

```bash
python field-sheet/serve.py
```

`npm run dev` and `npm start` start the same server. The worked example loads the three illustrative rows from `examples/run_demo.py`. Records stay in the browser. No data are uploaded. A blank candidate row is left out of the score. Import a CSV that uses the columns in `examples/sample_chemicals.template.csv`, or export one and pass it to `run_mcda_from_tier_table`.

This sheet scores candidates. It does not close a pre-harvest mass balance. That calculation lives in [antiviral-mass-balance](https://github.com/planttalks/antiviral-mass-balance).

**Paper:** Zure, D.; Sung, M.-H.; Rahim, A.; Kuo, H.-W. “In Silico Assessment of Chemical Disinfectants on Surface Proteins Unveiled Dissimilarity in Antiviral Efficacy and Suitability towards Pathogenic Viruses.” *Int. J. Mol. Sci.* **2024**, *25*, 6009. [https://doi.org/10.3390/ijms25116009](https://doi.org/10.3390/ijms25116009) · [MDPI article page](https://www.mdpi.com/1422-0067/25/11/6009)

**Code:** [github.com/planttalks/epea-framework](https://github.com/planttalks/epea-framework)

This repository is meant for teaching, replication, and extension. Example numbers are **illustrative** unless you substitute your own EPI Suite tiers, binding energies, and prices.

## Method (short)

1. **Six EPI Suite–style profiles** (atmospheric hydroxylation rate, soil adsorption, fish biotransformation half-life, BCF, BAF, biodegradation half-life) are binned into **safe / mild / danger** with scores **1 / 2 / 3**.
2. **Environmental impact (EI, %):**  
   `(sum of profile scores) / (3 × 6) × 100`  
   For **classification**, the code uses discrete **total scores 6–18** in thirds (**6** = safe, **7–11** = mild, **12–18** = danger) so the all-safe case is not mis-labeled by float cutoffs at 33.33%.
3. **Overall MCDA score O (%):**  
   `O = wE·Enorm + wS·Snorm + wC·Cnorm` with default **equal weights** (1/3 each).  
   **Enorm** uses docking **LBE** (more negative = better efficacy → higher Enorm).  
   **Snorm** inverts **EI %** so lower impact scores higher.  
   **Cnorm** inverts **cost per kg** so lower price scores higher.

**Note on Eq. (3) in the paper:** With LBE, “most negative = best” conflicts with the literal `(E − min)/(max − min)×100` if `min` is the most negative value. This code follows the **stated intent** (best LBE → Enorm 100) via `(max − E)/(max − min)×100`. **Eq. (5)** in the supplementary text uses `S` where **cost `C`** belongs; the implementation uses `C`.

## Install

```bash
cd epea-framework
python -m venv .venv
.venv\Scripts\activate   # Windows
# source .venv/bin/activate  # Linux / macOS
pip install -e ".[dev]"
```

## Quick use

```python
from epea import mcda_overall_scores, profile_score_from_tiers, environmental_impact_fraction

tiers = ("safe", "mild", "safe", "mild", "safe", "mild")
tot = profile_score_from_tiers(tiers)
ei_pct = environmental_impact_fraction(tot) * 100

df = mcda_overall_scores(
    E_lbe=[-8.0, -7.0],
    S_ei_percent=[ei_pct, 55.0],
    C_cost_per_kg=[20.0, 5.0],
    names=["compound_X", "compound_Y"],
)
print(df.sort_values("O_percent", ascending=False))
```

### CSV batch run

Fill `examples/sample_chemicals.template.csv` with your compounds (tiers as words `safe`/`mild`/`danger`, plus `LBE` and `USD_per_kg`). Then:

```python
from epea import run_mcda_from_tier_table
print(run_mcda_from_tier_table("examples/sample_chemicals.template.csv"))
```

Or run the demo script:

```bash
python examples/run_demo.py
```

## Tests

```bash
pytest
node --test field-sheet/calc.test.mjs
```

## Citation

If you use this code, cite the original study (and your GitHub fork if you publish one):

Zure, D.; Sung, M.-H.; Rahim, A.; Kuo, H.-W. In Silico Assessment of Chemical Disinfectants on Surface Proteins Unveiled Dissimilarity in Antiviral Efficacy and Suitability towards Pathogenic Viruses. *Int. J. Mol. Sci.* **2024**, *25*, 6009. [https://doi.org/10.3390/ijms25116009](https://doi.org/10.3390/ijms25116009)

## License

MIT — see `LICENSE`.
