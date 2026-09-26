/** Illustrative rows. They follow examples/run_demo.py and are not published table values. */

export function workedExample() {
  return {
    note: "Illustrative comparison from the demo script. Replace the tiers, binding energies and prices with your own.",
    input: {
      scenario: "Demo comparison",
      notes:
        "Illustrative rows from examples/run_demo.py. These numbers are not a published table.",
      weightMode: "equal",
      candidates: [
        {
          name: "Example_A",
          logOH: "safe",
          logKoc: "mild",
          HLN: "safe",
          logBCF: "mild",
          logBAF: "safe",
          DT50: "mild",
          lbe: -7.2,
          cost: 12,
        },
        {
          name: "Example_B",
          logOH: "mild",
          logKoc: "mild",
          HLN: "mild",
          logBCF: "safe",
          logBAF: "mild",
          DT50: "safe",
          lbe: -8.1,
          cost: 45,
        },
        {
          name: "Example_C",
          logOH: "danger",
          logKoc: "mild",
          HLN: "mild",
          logBCF: "mild",
          logBAF: "mild",
          DT50: "safe",
          lbe: -6.5,
          cost: 8,
        },
      ],
    },
  };
}

export function clearRanking() {
  return {
    note: "Two candidates at the ends of the scale. The low-impact candidate scores 100. The high-impact candidate scores 0.",
    input: {
      scenario: "Clear ranking",
      notes: "Constructed pair. All-safe and cheap against all-danger and costly.",
      weightMode: "equal",
      candidates: [
        {
          name: "Low_impact",
          logOH: "safe",
          logKoc: "safe",
          HLN: "safe",
          logBCF: "safe",
          logBAF: "safe",
          DT50: "safe",
          lbe: -10,
          cost: 5,
        },
        {
          name: "High_impact",
          logOH: "danger",
          logKoc: "danger",
          HLN: "danger",
          logBCF: "danger",
          logBAF: "danger",
          DT50: "danger",
          lbe: -5,
          cost: 100,
        },
      ],
    },
  };
}
