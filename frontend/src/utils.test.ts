import { describe, it, expect } from "vitest";
import { streakMultiplier, TIER_META } from "./utils";

describe("streakMultiplier", () => {
  it("is 1 below the first threshold", () => {
    expect(streakMultiplier(0)).toBe(1);
    expect(streakMultiplier(6)).toBe(1);
  });
  it("applies streak bonuses at thresholds", () => {
    expect(streakMultiplier(7)).toBe(1.1);
    expect(streakMultiplier(14)).toBe(1.2);
    expect(streakMultiplier(30)).toBe(1.35);
    expect(streakMultiplier(60)).toBe(1.5);
    expect(streakMultiplier(100)).toBe(1.75);
    expect(streakMultiplier(250)).toBe(1.75);
  });
});

describe("TIER_META", () => {
  it("covers every tier", () => {
    expect(Object.keys(TIER_META).sort()).toEqual(["common", "epic", "legendary", "rare"]);
  });
});
