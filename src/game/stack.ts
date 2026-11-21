/**
 * Pure game rules for the stacking mechanic. No rendering, no timers, no DOM:
 * the same inputs always give the same result, so the rules are unit-tested.
 */

export interface Span {
  /** Center of the span along one axis. */
  center: number;
  /** Length of the span along that axis. */
  size: number;
}

export type PlacementKind = "perfect" | "cut" | "miss";

export interface Placement {
  kind: PlacementKind;
  /** The part that stays on the tower. Null on a miss. */
  placed: Span | null;
  /** The part that falls off. Null on a perfect drop. */
  debris: Span | null;
}

export type Axis = "x" | "z";

export interface Block {
  x: number;
  z: number;
  w: number;
  d: number;
}

export const CONFIG = {
  baseSize: 3,
  /** Distance in world units that still counts as a perfect drop. */
  perfectTolerance: 0.1,
  /** How far the moving block swings from the center of the block below. */
  amplitude: 2.4,
  /** Blocks to stack before the end card shows. */
  levelsToWin: 14,
  /** Consecutive perfect drops needed before the block grows back. */
  regrowCombo: 3,
  regrowAmount: 0.15,
} as const;

/**
 * Compare the dropped span with the span below it.
 * Pure function: overlap decides what stays, what falls and what counts as perfect.
 */
export function resolvePlacement(
  below: Span,
  dropped: Span,
  tolerance: number = CONFIG.perfectTolerance,
): Placement {
  const left = Math.max(below.center - below.size / 2, dropped.center - dropped.size / 2);
  const right = Math.min(below.center + below.size / 2, dropped.center + dropped.size / 2);
  const overlap = right - left;

  if (overlap <= 0) {
    return { kind: "miss", placed: null, debris: { ...dropped } };
  }

  if (Math.abs(dropped.center - below.center) <= tolerance) {
    return { kind: "perfect", placed: { center: below.center, size: dropped.size }, debris: null };
  }

  const debrisSize = dropped.size - overlap;
  const debrisCenter =
    dropped.center > below.center ? right + debrisSize / 2 : left - debrisSize / 2;

  return {
    kind: "cut",
    placed: { center: (left + right) / 2, size: overlap },
    debris: { center: debrisCenter, size: debrisSize },
  };
}

/** Axis the next moving block slides along. The first moving block slides along x. */
export function axisForLevel(level: number): Axis {
  return level % 2 === 1 ? "x" : "z";
}

/** Swing speed in radians per second. It grows slowly so the early blocks are easy. */
export function speedForLevel(level: number): number {
  return 1.9 + Math.min(level, 20) * 0.07;
}

export interface DropResult extends Placement {
  /** Index of the new block in `blocks`. Null on a miss. */
  index: number | null;
  axis: Axis;
}

export class StackGame {
  readonly blocks: Block[] = [
    { x: 0, z: 0, w: CONFIG.baseSize, d: CONFIG.baseSize },
  ];
  score = 0;
  combo = 0;
  over = false;
  won = false;

  /** Number of blocks stacked on top of the base. */
  get level(): number {
    return this.blocks.length - 1;
  }

  /** Axis of the block that is about to be dropped. */
  get axis(): Axis {
    return axisForLevel(this.level + 1);
  }

  get top(): Block {
    const top = this.blocks[this.blocks.length - 1];
    if (!top) throw new Error("the tower always has a base block");
    return top;
  }

  /** Where the moving block is for a given swing phase. Starts at the far edge. */
  movingCenter(phase: number): number {
    const top = this.top;
    const base = this.axis === "x" ? top.x : top.z;
    return base + CONFIG.amplitude * Math.cos(phase);
  }

  /** Size of the moving block: it matches the block below. */
  movingBlock(center: number): Block {
    const top = this.top;
    return this.axis === "x"
      ? { x: center, z: top.z, w: top.w, d: top.d }
      : { x: top.x, z: center, w: top.w, d: top.d };
  }

  /** Drop the moving block at `center` along the current axis. */
  drop(center: number): DropResult {
    if (this.over) throw new Error("the game is over");

    const axis = this.axis;
    const top = this.top;
    const below: Span =
      axis === "x" ? { center: top.x, size: top.w } : { center: top.z, size: top.d };
    const dropped: Span = { center, size: below.size };

    const placement = resolvePlacement(below, dropped);

    if (placement.kind === "miss" || !placement.placed) {
      this.over = true;
      this.combo = 0;
      return { ...placement, index: null, axis };
    }

    let placed = placement.placed;
    if (placement.kind === "perfect") {
      this.combo += 1;
      this.score += 1 + Math.min(this.combo, 5);
      if (this.combo >= CONFIG.regrowCombo) {
        placed = { ...placed, size: Math.min(CONFIG.baseSize, placed.size + CONFIG.regrowAmount) };
      }
    } else {
      this.combo = 0;
      this.score += 1;
    }

    this.blocks.push(
      axis === "x"
        ? { x: placed.center, z: top.z, w: placed.size, d: top.d }
        : { x: top.x, z: placed.center, w: top.w, d: placed.size },
    );

    if (this.level >= CONFIG.levelsToWin) {
      this.over = true;
      this.won = true;
    }

    return { ...placement, placed, index: this.blocks.length - 1, axis };
  }
}
