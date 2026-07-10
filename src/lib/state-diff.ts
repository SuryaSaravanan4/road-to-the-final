import type { Fixture, Standing } from "@/types/domain";
import type { CompetitionTeam } from "@/providers/screenshot-bracket/state";
import type { ProposedState } from "./draft-to-state";

/**
 * Pure diff + merge between a competition's confirmed state and a proposed
 * re-ingestion. Re-ingestion is diff-to-approve, never silent overwrite:
 * the diff is what the user approves in the preview (contradictions
 * explicitly flagged), and the exact same computation is stored as the
 * ingestion's appliedDiff for auditing.
 */

export interface ExistingState {
  name: string;
  format: string;
  teams: CompetitionTeam[];
  fixtures: Fixture[];
  standings: Standing[];
  stageOrder: string[];
}

export interface FixtureChange {
  before: Fixture;
  after: Fixture;
  /** The contradicted fields — previously confirmed values being replaced. */
  changedFields: string[];
}

export interface StateDiff {
  nameChanged: boolean;
  formatChanged: boolean;
  addedStages: string[];
  addedTeams: CompetitionTeam[];
  addedFixtures: Fixture[];
  /** Contradictions: these fixtures were confirmed before and now differ. */
  changedFixtures: FixtureChange[];
  unchangedFixtureCount: number;
  standingsChanged: boolean;
}

const COMPARED_FIXTURE_FIELDS = [
  "homeTeamId",
  "homeTeamName",
  "awayTeamId",
  "awayTeamName",
  "utcDate",
  "status",
  "homeScore",
  "awayScore",
  "winnerTeamId",
] as const;

function pairKey(f: Fixture): string | null {
  if (!f.homeTeamId || !f.awayTeamId) return null;
  return [f.homeTeamId, f.awayTeamId].sort().join("|");
}

interface FixtureMatch {
  existing: Fixture;
  proposed: Fixture;
}

/**
 * Matches proposed fixtures to existing ones within each stage: first by
 * unordered team pair (robust to re-ordering and home/away flips), then by
 * position for slots that were TBD on either side.
 */
function matchFixtures(existingFixtures: Fixture[], proposedFixtures: Fixture[]) {
  const matches: FixtureMatch[] = [];
  const added: Fixture[] = [];

  const stages = new Set(proposedFixtures.map((f) => f.stage));
  for (const stage of stages) {
    const existingInStage = existingFixtures.filter((f) => f.stage === stage);
    const proposedInStage = proposedFixtures.filter((f) => f.stage === stage);
    const claimed = new Set<Fixture>();

    // Pass 1: team-pair identity.
    const positional: { proposed: Fixture; index: number }[] = [];
    proposedInStage.forEach((proposed, index) => {
      const key = pairKey(proposed);
      const match = key
        ? existingInStage.find((e) => !claimed.has(e) && pairKey(e) === key)
        : undefined;
      if (match) {
        claimed.add(match);
        matches.push({ existing: match, proposed });
      } else {
        positional.push({ proposed, index });
      }
    });

    // Pass 2: same slot position within the stage.
    for (const { proposed, index } of positional) {
      const candidate = existingInStage[index];
      if (candidate && !claimed.has(candidate)) {
        claimed.add(candidate);
        matches.push({ existing: candidate, proposed });
      } else {
        added.push(proposed);
      }
    }
  }

  return { matches, added };
}

function changedFields(existing: Fixture, proposed: Fixture): string[] {
  return COMPARED_FIXTURE_FIELDS.filter((field) => existing[field] !== proposed[field]);
}

function standingsEqual(a: Standing[], b: Standing[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function diffStates(existing: ExistingState, proposed: ProposedState): StateDiff {
  const { matches, added } = matchFixtures(existing.fixtures, proposed.fixtures);

  const changed: FixtureChange[] = [];
  let unchanged = 0;
  for (const { existing: before, proposed: after } of matches) {
    const fields = changedFields(before, after);
    if (fields.length > 0) changed.push({ before, after, changedFields: fields });
    else unchanged++;
  }

  const existingTeamIds = new Set(existing.teams.map((t) => t.id));
  const existingStages = new Set(existing.stageOrder);

  return {
    nameChanged: existing.name !== proposed.name,
    formatChanged: existing.format !== proposed.format,
    addedStages: proposed.stageOrder.filter((s) => !existingStages.has(s)),
    addedTeams: proposed.teams.filter((t) => !existingTeamIds.has(t.id)),
    addedFixtures: added,
    changedFixtures: changed,
    unchangedFixtureCount: unchanged,
    standingsChanged:
      proposed.standings.length > 0 && !standingsEqual(existing.standings, proposed.standings),
  };
}

/**
 * Merges both sequences preserving each one's relative order, using stages
 * they share as anchors — a screenshot of just the quarter-finals onward
 * slots its new stages into the right place in the existing order.
 */
export function mergeStageOrder(existing: string[], proposed: string[]): string[] {
  const result = [...existing];
  let cursor = result.length;

  // Walk proposed order backwards so each unknown stage is inserted before
  // the anchor that follows it.
  for (let i = proposed.length - 1; i >= 0; i--) {
    const stage = proposed[i];
    const at = result.indexOf(stage);
    if (at !== -1) {
      cursor = at;
    } else {
      result.splice(cursor, 0, stage);
    }
  }

  return result;
}

/**
 * Applies an approved re-ingestion: matched fixtures take the proposed
 * (user-approved) values but keep their existing ids, fixtures the new
 * screenshot doesn't show are kept untouched, and teams are unioned.
 */
export function mergeStates(existing: ExistingState, proposed: ProposedState): ExistingState {
  const { matches, added } = matchFixtures(existing.fixtures, proposed.fixtures);
  const replacementByExistingId = new Map(
    matches.map(({ existing: e, proposed: p }) => [e.id, { ...p, id: e.id }])
  );

  const fixtures = [
    ...existing.fixtures.map((f) => replacementByExistingId.get(f.id) ?? f),
    ...added,
  ];

  const teamsById = new Map(existing.teams.map((t) => [t.id, t]));
  for (const team of proposed.teams) {
    if (!teamsById.has(team.id)) teamsById.set(team.id, team);
  }

  return {
    name: proposed.name,
    format: proposed.format,
    teams: Array.from(teamsById.values()),
    fixtures,
    standings: proposed.standings.length > 0 ? proposed.standings : existing.standings,
    stageOrder: mergeStageOrder(existing.stageOrder, proposed.stageOrder),
  };
}
