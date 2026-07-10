import { describe, expect, it } from "vitest";
import {
  KNOCKOUT_STAGE_ORDER,
  isLosersBracketStage,
  lossEndsRoad,
  stageRank,
} from "@/lib/stages";

describe("stageRank", () => {
  it("orders known stages by their position in the given order", () => {
    expect(stageRank("QUARTER_FINALS", KNOCKOUT_STAGE_ORDER)).toBeLessThan(
      stageRank("SEMI_FINALS", KNOCKOUT_STAGE_ORDER)
    );
  });

  it("sorts unknown stages after every known stage", () => {
    expect(stageRank("MYSTERY_ROUND", KNOCKOUT_STAGE_ORDER)).toBe(KNOCKOUT_STAGE_ORDER.length);
  });

  it("respects a custom provider-supplied order", () => {
    const order = ["OPENING_ROUND", "CHAMPIONSHIP"];
    expect(stageRank("OPENING_ROUND", order)).toBeLessThan(stageRank("CHAMPIONSHIP", order));
  });
});

describe("isLosersBracketStage", () => {
  it("detects the LB_ prefix", () => {
    expect(isLosersBracketStage("LB_ROUND_1")).toBe(true);
    expect(isLosersBracketStage("WB_ROUND_1")).toBe(false);
    expect(isLosersBracketStage("GRAND_FINAL")).toBe(false);
  });
});

describe("lossEndsRoad", () => {
  it("always ends the road under single-loss", () => {
    expect(lossEndsRoad("QUARTER_FINALS", "single-loss")).toBe(true);
    expect(lossEndsRoad("LB_ROUND_1", "single-loss")).toBe(true);
  });

  it("only ends the road on losers-bracket or grand-final losses under double-loss", () => {
    expect(lossEndsRoad("WB_SEMI_FINALS", "double-loss")).toBe(false);
    expect(lossEndsRoad("LB_ROUND_1", "double-loss")).toBe(true);
    expect(lossEndsRoad("GRAND_FINAL", "double-loss")).toBe(true);
  });
});
