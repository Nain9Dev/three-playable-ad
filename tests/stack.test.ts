import { describe, expect, it } from "vitest";
import {
  CONFIG,
  StackGame,
  axisForLevel,
  resolvePlacement,
  speedForLevel,
} from "../src/game/stack.ts";

describe("resolvePlacement", () => {
  const below = { center: 0, size: 3 };

  it("snaps to the block below when the drop is within the tolerance", () => {
    const result = resolvePlacement(below, { center: 0.05, size: 3 });
    expect(result.kind).toBe("perfect");
    expect(result.placed).toEqual({ center: 0, size: 3 });
    expect(result.debris).toBeNull();
  });

  it("cuts the overhang on the right and keeps the overlap", () => {
    const result = resolvePlacement(below, { center: 1, size: 3 });
    expect(result.kind).toBe("cut");
    expect(result.placed).toEqual({ center: 0.5, size: 2 });
    expect(result.debris).toEqual({ center: 2, size: 1 });
  });

  it("cuts the overhang on the left and keeps the overlap", () => {
    const result = resolvePlacement(below, { center: -1, size: 3 });
    expect(result.kind).toBe("cut");
    expect(result.placed).toEqual({ center: -0.5, size: 2 });
    expect(result.debris).toEqual({ center: -2, size: 1 });
  });

  it("conserves length: placed plus debris equals the dropped size", () => {
    for (const center of [-2.9, -1.7, -0.4, 0.4, 1.3, 2.9]) {
      const result = resolvePlacement(below, { center, size: 3 });
      const total = (result.placed?.size ?? 0) + (result.debris?.size ?? 0);
      expect(total).toBeCloseTo(3, 10);
    }
  });

  it("misses when the spans do not overlap", () => {
    const result = resolvePlacement(below, { center: 3, size: 3 });
    expect(result.kind).toBe("miss");
    expect(result.placed).toBeNull();
    expect(result.debris).toEqual({ center: 3, size: 3 });
  });

  it("treats spans that only touch as a miss", () => {
    expect(resolvePlacement(below, { center: 3, size: 3 }).kind).toBe("miss");
  });
});

describe("level rules", () => {
  it("alternates the sliding axis, starting with x", () => {
    expect([1, 2, 3, 4].map(axisForLevel)).toEqual(["x", "z", "x", "z"]);
  });

  it("speeds up with the level and stops growing at level 20", () => {
    expect(speedForLevel(5)).toBeGreaterThan(speedForLevel(1));
    expect(speedForLevel(20)).toBe(speedForLevel(40));
  });
});

describe("StackGame", () => {
  it("starts with one base block and the moving axis on x", () => {
    const game = new StackGame();
    expect(game.level).toBe(0);
    expect(game.axis).toBe("x");
    expect(game.over).toBe(false);
  });

  it("starts the moving block at the far edge of its swing", () => {
    const game = new StackGame();
    expect(game.movingCenter(0)).toBe(CONFIG.amplitude);
    expect(game.movingCenter(Math.PI / 2)).toBeCloseTo(0, 10);
  });

  it("adds a perfect block, scores it and keeps the combo going", () => {
    const game = new StackGame();
    const result = game.drop(0);
    expect(result.kind).toBe("perfect");
    expect(game.level).toBe(1);
    expect(game.combo).toBe(1);
    expect(game.score).toBe(2);
    expect(game.axis).toBe("z");
  });

  it("resets the combo on a cut and narrows the block", () => {
    const game = new StackGame();
    game.drop(0);
    game.drop(1);
    expect(game.combo).toBe(0);
    expect(game.top.d).toBeCloseTo(2, 10);
    expect(game.top.w).toBe(CONFIG.baseSize);
  });

  it("grows a narrowed block back after a streak of perfect drops", () => {
    const game = new StackGame();
    game.drop(1.5);
    const narrowed = game.top.w;
    expect(narrowed).toBeLessThan(CONFIG.baseSize);

    // Four perfect drops: the regrow starts at the third and applies to the
    // axis of the block being placed, so the fourth (x axis) widens the block.
    game.drop(0);
    game.drop(game.top.x);
    game.drop(game.top.z);
    game.drop(game.top.x);
    expect(game.combo).toBe(4);
    expect(game.top.w).toBeCloseTo(narrowed + CONFIG.regrowAmount, 10);
    expect(game.top.w).toBeLessThanOrEqual(CONFIG.baseSize);
  });

  it("ends the game on a miss and refuses further drops", () => {
    const game = new StackGame();
    const result = game.drop(10);
    expect(result.kind).toBe("miss");
    expect(result.index).toBeNull();
    expect(game.over).toBe(true);
    expect(game.won).toBe(false);
    expect(() => game.drop(0)).toThrow();
  });

  it("wins after the configured number of levels", () => {
    const game = new StackGame();
    for (let i = 0; i < CONFIG.levelsToWin; i += 1) {
      game.drop(game.axis === "x" ? game.top.x : game.top.z);
    }
    expect(game.won).toBe(true);
    expect(game.over).toBe(true);
    expect(game.level).toBe(CONFIG.levelsToWin);
  });

  it("is deterministic: the same drops give the same tower", () => {
    const play = (): string => {
      const game = new StackGame();
      for (const offset of [0.3, -0.5, 0.05, 1.1, -0.2]) {
        const center = (game.axis === "x" ? game.top.x : game.top.z) + offset;
        game.drop(center);
      }
      return JSON.stringify([game.blocks, game.score, game.combo]);
    };
    expect(play()).toBe(play());
  });
});
