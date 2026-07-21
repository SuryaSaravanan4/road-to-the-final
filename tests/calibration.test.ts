import { describe, expect, it } from "vitest";
import {
  calibrationBins,
  counted,
  discrimination,
  observeIngestion,
  summarizeByField,
  thresholdReport,
  type FieldObservation,
} from "@/lib/calibration";
import type { BracketExtraction, ExtractedMatchup } from "@/reasoning/bracketExtractionSchema";
import type { CorrectedExtraction, CorrectedMatchup } from "@/lib/draft-to-state";

function text(value: string | null, confidence = 0.9) {
  return { value, confidence };
}

function count(value: number | null, confidence = 0.9) {
  return { value, confidence };
}

function rawMatchup(overrides: Partial<ExtractedMatchup> = {}): ExtractedMatchup {
  return {
    homeTeamName: text("Team A"),
    awayTeamName: text("Team B"),
    homeScore: count(2),
    awayScore: count(1),
    winnerTeamName: text("Team A"),
    date: text("2026-06-11"),
    ...overrides,
  };
}

function rawExtraction(overrides: Partial<BracketExtraction> = {}): BracketExtraction {
  return {
    competitionName: text("DDN Legends"),
    format: "SINGLE_ELIM",
    formatConfidence: 0.95,
    rounds: [{ name: text("Final"), bracketSide: "MAIN", matchups: [rawMatchup()] }],
    groups: [],
    ambiguities: [],
    ...overrides,
  };
}

function fixedMatchup(overrides: Partial<CorrectedMatchup> = {}): CorrectedMatchup {
  return {
    homeTeamName: "Team A",
    awayTeamName: "Team B",
    homeScore: 2,
    awayScore: 1,
    winnerTeamName: "Team A",
    date: "2026-06-11",
    ...overrides,
  };
}

function fixedExtraction(overrides: Partial<CorrectedExtraction> = {}): CorrectedExtraction {
  return {
    competitionName: "DDN Legends",
    format: "SINGLE_ELIM",
    rounds: [{ name: "Final", bracketSide: "MAIN", matchups: [fixedMatchup()] }],
    groups: [],
    ...overrides,
  };
}

/** The single observation at `path`, for asserting on one field at a time. */
function at(observations: FieldObservation[], path: string): FieldObservation {
  const found = observations.find((o) => o.path === path);
  if (!found) throw new Error(`no observation at ${path}`);
  return found;
}

describe("observeIngestion", () => {
  it("marks nothing edited when the human confirmed the extraction as-is", () => {
    const { observations, structural } = observeIngestion("i1", rawExtraction(), fixedExtraction());

    expect(structural).toEqual([]);
    expect(observations.filter((o) => o.edited)).toEqual([]);
    expect(observations.length).toBeGreaterThan(0);
  });

  it("attaches the field's own confidence to its observation", () => {
    const raw = rawExtraction({
      rounds: [
        {
          name: text("Final"),
          bracketSide: "MAIN",
          matchups: [rawMatchup({ homeScore: count(2, 0.42) })],
        },
      ],
    });

    const { observations } = observeIngestion("i1", raw, fixedExtraction());

    expect(at(observations, "rounds[0].matchups[0].homeScore").confidence).toBe(0.42);
  });

  it("counts a real value correction as an edit", () => {
    const corrected = fixedExtraction({
      rounds: [{ name: "Final", bracketSide: "MAIN", matchups: [fixedMatchup({ homeScore: 3 })] }],
    });

    const { observations } = observeIngestion("i1", rawExtraction(), corrected);

    expect(at(observations, "rounds[0].matchups[0].homeScore").edited).toBe(true);
  });

  // The preview's own normalization must never be booked as human work.
  describe("preview round-trips are not corrections", () => {
    it("ignores the whitespace the preview trims on submit", () => {
      const raw = rawExtraction({
        rounds: [
          {
            name: text("  Final  "),
            bracketSide: "MAIN",
            matchups: [rawMatchup({ homeTeamName: text("  Team A  ") })],
          },
        ],
      });

      const { observations } = observeIngestion("i1", raw, fixedExtraction());

      expect(at(observations, "rounds[0].name").edited).toBe(false);
      expect(at(observations, "rounds[0].matchups[0].homeTeamName").edited).toBe(false);
    });

    it("excludes a round name the preview auto-filled", () => {
      const raw = rawExtraction({
        rounds: [{ name: text(null, 0.2), bracketSide: "MAIN", matchups: [rawMatchup()] }],
      });
      const corrected = fixedExtraction({
        rounds: [{ name: "Round 1", bracketSide: "MAIN", matchups: [fixedMatchup()] }],
      });

      const { observations } = observeIngestion("i1", raw, corrected);
      const observation = at(observations, "rounds[0].name");

      expect(observation.edited).toBe(false);
      expect(observation.excluded).toBe("auto-filled");
      expect(counted(observations)).not.toContain(observation);
    });

    it("excludes a competition name taken from the existing competition", () => {
      const raw = rawExtraction({ competitionName: text(null, 0.1) });

      const { observations } = observeIngestion("i1", raw, fixedExtraction(), "DDN Legends");

      expect(at(observations, "competitionName").excluded).toBe("auto-filled");
    });

    it("excludes a winner the preview dropped because it matched neither team", () => {
      const raw = rawExtraction({
        rounds: [
          {
            name: text("Final"),
            bracketSide: "MAIN",
            matchups: [rawMatchup({ winnerTeamName: text("Team Q", 0.3) })],
          },
        ],
      });
      const corrected = fixedExtraction({
        rounds: [
          { name: "Final", bracketSide: "MAIN", matchups: [fixedMatchup({ winnerTeamName: null })] },
        ],
      });

      const { observations } = observeIngestion("i1", raw, corrected);

      expect(at(observations, "rounds[0].matchups[0].winnerTeamName").excluded).toBe(
        "winner-unmatched"
      );
    });

    it("excludes a winner that only followed its corrected team name", () => {
      const raw = rawExtraction({
        rounds: [
          {
            name: text("Final"),
            bracketSide: "MAIN",
            matchups: [
              rawMatchup({ homeTeamName: text("Team Aa"), winnerTeamName: text("Team Aa") }),
            ],
          },
        ],
      });
      const corrected = fixedExtraction({
        rounds: [
          {
            name: "Final",
            bracketSide: "MAIN",
            matchups: [fixedMatchup({ homeTeamName: "Team A", winnerTeamName: "Team A" })],
          },
        ],
      });

      const { observations } = observeIngestion("i1", raw, corrected);

      expect(at(observations, "rounds[0].matchups[0].homeTeamName").edited).toBe(true);
      expect(at(observations, "rounds[0].matchups[0].winnerTeamName").excluded).toBe(
        "derived-from-team"
      );
    });

    it("still counts a winner the human switched to the other team", () => {
      const corrected = fixedExtraction({
        rounds: [
          {
            name: "Final",
            bracketSide: "MAIN",
            matchups: [fixedMatchup({ winnerTeamName: "Team B" })],
          },
        ],
      });

      const { observations } = observeIngestion("i1", rawExtraction(), corrected);
      const observation = at(observations, "rounds[0].matchups[0].winnerTeamName");

      expect(observation.edited).toBe(true);
      expect(observation.excluded).toBeUndefined();
    });
  });

  describe("groups", () => {
    const groupRow = (name: string, points: number) => ({
      teamName: text(name),
      played: count(3),
      won: count(2),
      draw: count(0),
      lost: count(1),
      points: count(points),
    });

    it("keeps groups aligned when the preview drops an empty one", () => {
      const raw = rawExtraction({
        rounds: [],
        groups: [
          { name: text("Group A"), rows: [] },
          { name: text("Group B"), rows: [groupRow("Team A", 6)] },
        ],
      });
      const corrected = fixedExtraction({
        rounds: [],
        groups: [
          {
            name: "Group B",
            rows: [{ teamName: "Team A", played: 3, won: 2, draw: 0, lost: 1, points: 6 }],
          },
        ],
      });

      const { observations, structural } = observeIngestion("i1", raw, corrected);

      // Paired against groups[1], not groups[0] — otherwise every field here
      // would read as an edit.
      expect(structural).toEqual([]);
      expect(at(observations, "groups[1].name").edited).toBe(false);
      expect(at(observations, "groups[1].rows[0].points").edited).toBe(false);
    });

    it("excludes a group name the preview numbered from its position", () => {
      const raw = rawExtraction({
        rounds: [],
        groups: [
          { name: text(null, 0.3), rows: [groupRow("Team A", 6)] },
          { name: text("Group B"), rows: [groupRow("Team B", 4)] },
        ],
      });
      const corrected = fixedExtraction({
        rounds: [],
        groups: [
          {
            name: "Group 1",
            rows: [{ teamName: "Team A", played: 3, won: 2, draw: 0, lost: 1, points: 6 }],
          },
          {
            name: "Group B",
            rows: [{ teamName: "Team B", played: 3, won: 2, draw: 0, lost: 1, points: 4 }],
          },
        ],
      });

      const { observations } = observeIngestion("i1", raw, corrected);

      expect(at(observations, "groups[0].name").excluded).toBe("auto-filled");
      expect(at(observations, "groups[1].name").edited).toBe(false);
    });
  });

  it("reports a length mismatch instead of pairing shifted entries", () => {
    const corrected = fixedExtraction({
      rounds: [
        { name: "Semifinals", bracketSide: "MAIN", matchups: [fixedMatchup()] },
        { name: "Final", bracketSide: "MAIN", matchups: [fixedMatchup()] },
      ],
    });

    const { observations, structural } = observeIngestion("i1", rawExtraction(), corrected);

    expect(structural).toEqual(["rounds: extracted 1, confirmed 2"]);
    expect(observations.filter((o) => o.path.startsWith("rounds[1]"))).toEqual([]);
  });
});

/** Observations are built directly here — the metrics don't care where from. */
function observation(confidence: number, edited: boolean, index: number): FieldObservation {
  return {
    ingestionId: "i1",
    path: `rounds[0].matchups[${index}].homeScore`,
    field: "homeScore",
    confidence,
    edited,
    extracted: "1",
    corrected: edited ? "2" : "1",
  };
}

describe("metrics", () => {
  it("ranks the most-corrected field first and splits confidence by outcome", () => {
    const observations: FieldObservation[] = [
      { ...observation(0.4, true, 0), field: "date" },
      { ...observation(0.6, true, 1), field: "date" },
      { ...observation(0.9, false, 2), field: "homeScore" },
      { ...observation(0.7, true, 3), field: "homeScore" },
    ];

    const [worst, next] = summarizeByField(observations);

    expect(worst.field).toBe("date");
    expect(worst.editRate).toBe(1);
    expect(worst.meanConfidenceEdited).toBeCloseTo(0.5);
    expect(worst.meanConfidenceClean).toBeNull();
    expect(next.field).toBe("homeScore");
    expect(next.editRate).toBe(0.5);
  });

  it("leaves excluded observations out of every metric", () => {
    const observations: FieldObservation[] = [
      observation(0.9, false, 0),
      { ...observation(0.1, true, 1), excluded: "auto-filled" },
    ];

    expect(summarizeByField(observations)).toHaveLength(1);
    expect(summarizeByField(observations)[0].n).toBe(1);
    expect(thresholdReport(observations, 0.8).flagged).toBe(0);
  });

  it("bins by confidence and compares implied against observed error", () => {
    const observations = [
      observation(0.95, false, 0),
      observation(0.95, false, 1),
      observation(0.6, true, 2),
      observation(0.6, false, 3),
    ];

    const bins = calibrationBins(observations, [0.5, 0.9, 1]);

    expect(bins[0]).toMatchObject({ lower: 0.5, upper: 0.9, n: 2, edits: 1, observedEditRate: 0.5 });
    expect(bins[0].expectedEditRate).toBeCloseTo(0.4);
    expect(bins[1]).toMatchObject({ n: 2, edits: 0, observedEditRate: 0 });
    expect(bins[1].expectedEditRate).toBeCloseTo(0.05);
  });

  it("includes 1.0 in the top bin", () => {
    const bins = calibrationBins([observation(1, false, 0)], [0.9, 1]);

    expect(bins[0].n).toBe(1);
  });

  it("scores perfect separation as AUC 1 and no separation as 0.5", () => {
    const perfect = [observation(0.9, false, 0), observation(0.2, true, 1)];
    const useless = [observation(0.5, false, 0), observation(0.5, true, 1)];

    expect(discrimination(perfect).auc).toBe(1);
    expect(discrimination(useless).auc).toBe(0.5);
  });

  it("has no AUC to report when the human edited nothing", () => {
    expect(discrimination([observation(0.9, false, 0)])).toMatchObject({ auc: null, nEdited: 0 });
  });

  it("scores the review threshold as an error detector", () => {
    const observations = [
      observation(0.5, true, 0), // flagged, worth flagging
      observation(0.7, false, 1), // flagged, wasted attention
      observation(0.9, true, 2), // missed: reached ground truth wrong
      observation(0.95, false, 3),
    ];

    expect(thresholdReport(observations, 0.8)).toMatchObject({
      flagged: 2,
      flaggedEdits: 1,
      precision: 0.5,
      recall: 0.5,
      unflagged: 2,
      unflaggedEdits: 1,
      unflaggedEditRate: 0.5,
    });
  });
});
