"""
Integration tests for epea.io — CSV loading and end-to-end MCDA pipeline.
"""

from __future__ import annotations

import textwrap
from pathlib import Path

import pytest

from epea.io import dataframe_from_tier_table, run_mcda_from_tier_table


@pytest.fixture()
def valid_csv(tmp_path: Path) -> Path:
    csv = tmp_path / "chemicals.csv"
    csv.write_text(
        textwrap.dedent("""\
        # comment line is ignored
        name,logOH,logKoc,HLN,logBCF,logBAF,DT50,LBE,USD_per_kg
        compound_A,safe,mild,safe,mild,safe,mild,-8.1,12.0
        compound_B,mild,mild,danger,safe,mild,safe,-7.0,45.0
        compound_C,danger,mild,mild,mild,mild,safe,-6.5,8.0
        """)
    )
    return csv


@pytest.fixture()
def invalid_tier_csv(tmp_path: Path) -> Path:
    csv = tmp_path / "bad_tiers.csv"
    csv.write_text(
        textwrap.dedent("""\
        name,logOH,logKoc,HLN,logBCF,logBAF,DT50,LBE,USD_per_kg
        compound_X,safe,mild,safe,mild,safe,unknown,-7.0,10.0
        """)
    )
    return csv


@pytest.fixture()
def missing_column_csv(tmp_path: Path) -> Path:
    csv = tmp_path / "missing_col.csv"
    csv.write_text(
        textwrap.dedent("""\
        name,logOH,logKoc,HLN,logBCF,logBAF,DT50
        compound_X,safe,mild,safe,mild,safe,safe
        """)
    )
    return csv


# ---------------------------------------------------------------------------
# dataframe_from_tier_table
# ---------------------------------------------------------------------------


def test_load_valid_csv_shape(valid_csv: Path) -> None:
    df = dataframe_from_tier_table(str(valid_csv))
    assert len(df) == 3
    assert "EI_percent" in df.columns
    assert "EI_class" in df.columns


def test_load_valid_csv_ei_range(valid_csv: Path) -> None:
    df = dataframe_from_tier_table(str(valid_csv))
    assert df["EI_percent"].between(0.0, 100.0).all()


def test_load_valid_csv_ei_class_values(valid_csv: Path) -> None:
    df = dataframe_from_tier_table(str(valid_csv))
    assert set(df["EI_class"]).issubset({"safe", "mild", "danger"})


def test_invalid_tier_raises(invalid_tier_csv: Path) -> None:
    with pytest.raises(ValueError, match="Invalid tier"):
        dataframe_from_tier_table(str(invalid_tier_csv))


def test_missing_column_raises(missing_column_csv: Path) -> None:
    with pytest.raises(ValueError, match="Missing columns"):
        dataframe_from_tier_table(str(missing_column_csv))


# ---------------------------------------------------------------------------
# run_mcda_from_tier_table — end-to-end
# ---------------------------------------------------------------------------


def test_run_mcda_returns_sorted(valid_csv: Path) -> None:
    df = run_mcda_from_tier_table(str(valid_csv))
    assert list(df["O_percent"]) == sorted(df["O_percent"], reverse=True)


def test_run_mcda_columns(valid_csv: Path) -> None:
    df = run_mcda_from_tier_table(str(valid_csv))
    for col in ("name", "LBE", "EI_percent", "cost_per_kg", "Enorm", "Snorm", "Cnorm", "O_percent"):
        assert col in df.columns


def test_run_mcda_o_percent_range(valid_csv: Path) -> None:
    df = run_mcda_from_tier_table(str(valid_csv))
    assert df["O_percent"].between(0.0, 100.0).all()
