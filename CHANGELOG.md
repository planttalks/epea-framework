# Changelog

All notable changes to this project will be documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [1.0.0] — 2024-05-30

### Added
- `epea.core`: `tier_to_score`, `profile_score_from_tiers`, `environmental_impact_fraction`,
  `classify_environmental_impact_total_score`, `classify_environmental_impact_pct`,
  `enorm_from_lbe`, `snorm_from_impact_pct`, `cnorm_from_cost`, `mcda_overall_scores`.
- `epea.io`: `dataframe_from_tier_table`, `run_mcda_from_tier_table` for CSV batch runs.
- `examples/run_demo.py`: runnable demo with three illustrative compounds.
- `examples/sample_chemicals.template.csv`: column template for users' own data.
- `tests/test_core.py` and `tests/test_io.py`: pytest test suite.
- `CITATION.cff`: machine-readable citation file for GitHub "Cite this repository".
- `CHANGELOG.md`, `LICENSE` (MIT), `README.md`.
- GitHub Actions CI: test on Python 3.10 / 3.11 / 3.12, Ubuntu + Windows; ruff lint job.

### Notes
- Eq. (3) in the supplementary text assigns 0 to the best (most negative) LBE value.
  `enorm_from_lbe` follows the **stated intent** instead: best LBE → 100.
- Eq. (5) uses `S` where cost `C` belongs (typo in manuscript); `cnorm_from_cost` uses `C`.
- EI % classification uses discrete score bands (6 safe; 7–11 mild; 12–18 danger) to
  avoid float rounding mis-labeling the all-safe case (6/18 = 33.333...%).
