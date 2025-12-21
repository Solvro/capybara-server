import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";

import { PlayerState } from "./PlayerState";
import { Position } from "./Position.js";

export class Laser extends Schema {
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") dx: number = 0;
  @type("number") dy: number = 0;
  @type("boolean") isOn: boolean = false;
  @type("number") endX: number = 0;
  @type("number") endY: number = 0;
  @type("string") color: string = "red";
  @type("string") ownerSessionId: string = "";
}

export type Cell = { x: number; y: number; value?: number };

export function raycastToWall(
  grid: number[],
  width: number,
  height: number,
  startX: number,
  startY: number,
  dirX: number,
  dirY: number,
): Cell[] {
  const cells: Cell[] = [];

  const stepX = Math.sign(dirX);
  const stepY = Math.sign(dirY);

  let x = startX + stepX;
  let y = startY + stepY;

  while (x >= 0 && x < width && y >= 0 && y < height) {
    const idx = y * width + x;
    const val = grid[idx];
    cells.push({ x, y, value: val });

    if (val === 1 || val === 3) {
      break;
    }

    x += stepX;
    y += stepY;
  }

  return cells;
}

export class RoomState extends Schema {
  @type({ map: Laser }) lasers = new MapSchema<Laser>();

  @type(["number"]) grid = new ArraySchema<number>(
    3,
    3,
    3,
    3,
    3,
    2,
    2,
    3,
    3,
    3, // Row 0: (5,0) and (6,0) are laser sources
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0, // Row 1: Clear path for players
    3,
    3,
    3,
    3,
    3,
    0,
    0,
    3,
    3,
    3, // Row 2: Path under lasers
    3,
    3,
    3,
    3,
    3,
    0,
    0,
    3,
    3,
    3, // Row 3: Path under lasers
    3,
    3,
    3,
    3,
    3,
    0,
    0,
    3,
    3,
    3, // Row 4: Path under lasers
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0, // Row 5: Clear path for players
    3,
    3,
    3,
    3,
    3,
    0,
    0,
    3,
    3,
    3, // Row 6: Path under lasers
  );

  @type("number") width: number = 10;
  @type("number") height: number = 7;

  @type([Position]) startingPositions = new ArraySchema<Position>(
    new Position().assign({ x: 1, y: 1 }),
    new Position().assign({ x: 8, y: 1 }),
    new Position().assign({ x: 1, y: 5 }),
    new Position().assign({ x: 8, y: 5 }),
  );

  @type(PlayerState) playerState: PlayerState = new PlayerState();

  getCellValue(x: number, y: number): number {
    return this.grid[y * this.width + x];
  }

  constructor() {
    super();
    // Initialize static lasers
    this.activateStaticLasers();
  }

  activateStaticLasers() {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const value = this.getCellValue(x, y);
        if (value === 2) {
          // It's a laser source
          const laserId = `laser_${x}`;
          let laser = this.lasers.get(laserId);
          if (!laser) {
            laser = new Laser();
            laser.ownerSessionId = "server"; // or special ID
            this.lasers.set(laserId, laser);
          }
          // Defaults to OFF
          laser.isOn = false;
          laser.x = x;
          laser.y = y;
          laser.dx = 0;
          laser.dy = 1;
          laser.color = "yellow"; // Static laser color

          // Do not update yet
          // this.updateLaser(laserId);
        }
      }
    }
  }

  toggleStaticLasers(active: boolean) {
    const allHits: any[] = [];
    this.lasers.forEach((laser, key) => {
      if (key.startsWith("laser_")) {
        const wasOn = laser.isOn;
        laser.isOn = active;

        if (active) {
          const hits = this.updateLaser(key);
          if (hits) {
            allHits.push(...hits);
          }
        } else {
          // Force reset endpoint to start point when turning off
          // This ensures that even if isOn=false isn't synced perfectly,
          // the beam has length 0.
          laser.endX = laser.x;
          laser.endY = laser.y;
        }

        // Force map update trigger
        this.lasers.set(key, laser);
      }
    });
    return allHits;
  }

  getGridAs2DArray(): number[][] {
    const array2D: number[][] = [];
    for (let y = 0; y < this.height; y++) {
      const row: number[] = [];
      for (let x = 0; x < this.width; x++) {
        row.push(this.getCellValue(x, y));
      }
      array2D.push(row);
    }
    return array2D;
  }

  isWalkable(x: number, y: number): boolean {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return false;
    }
    return this.getCellValue(x, y) === 0;
  }

  spawnNewPlayer(sessionId: string, name: string = null) {
    this.playerState.createPlayer(sessionId, name);
    const player = this.playerState.players.get(sessionId);
    const startingPos =
      this.startingPositions[player.index % this.startingPositions.length];
    player.position.x = startingPos.x;
    player.position.y = startingPos.y;
  }

  despawnPlayer(sessionId: string) {
    this.playerState.removePlayer(sessionId);
  }

  onRoomDispose() {
    this.playerState.onRoomDispose();
  }

  movePlayer(sessionId: string, deltaX: number, deltaY: number): boolean {
    const player = this.playerState.players.get(sessionId);
    const newX = player.position.x + deltaX;
    const newY = player.position.y + deltaY;

    if (this.isWalkable(newX, newY)) {
      player.position.x = newX;
      player.position.y = newY;
      return true;
    }
    return false;
  }

  getMapInfo() {
    return {
      grid: this.getGridAs2DArray(),
      width: this.width,
      height: this.height,
      players: Array.from(this.playerState.players.values()).map((player) => {
        return {
          index: player.index,
          name: player.name,
          x: player.position.x,
          y: player.position.y,
          sessionId: player.sessionId,
        };
      }),
    };
  }

  getGrid() {
    return this.getGridAs2DArray();
  }

  getWidth() {
    return this.width;
  }

  getHeight() {
    return this.height;
  }

  getPlayerName(sessionId: string): string {
    return this.playerState.getPlayerName(sessionId);
  }

  applyLaser(x: number, y: number, ownerId: string) {
    const index = y * this.width + x;
    const value = this.grid[index];

    if (value === 3) {
      this.grid[index] = 0;

      return { x, y };
    }
  }
  toggleLaser(
    sessionId: string,
    start: { x: number; y: number },
    dir: { dx: number; dy: number },
    color: string,
  ) {
    let laser = this.lasers.get(sessionId);
    if (!laser) {
      laser = new Laser();
      laser.ownerSessionId = sessionId;
      this.lasers.set(sessionId, laser);
    }

    // specific toggle logic: if on and different direction/start -> update. If same, toggle off?
    // User asked for "turn on turn off logic just like a button".
    // Usually means: Click -> On. Click again -> Off.
    // But if we have multiple buttons (Left, Right, Up), clicking a DIFFERENT one should probably switch direction?
    // Let's assume: If ON and same params -> OFF. If ON and diff params -> UPDATE. If OFF -> ON.

    const isSameDir = laser.dx === dir.dx && laser.dy === dir.dy;

    if (laser.isOn && isSameDir) {
      laser.isOn = false;
    } else {
      console.log(`Laser fired by ${this.getPlayerName(sessionId)}`);
      laser.isOn = true;
      laser.x = start.x;
      laser.y = start.y;
      laser.dx = dir.dx;
      laser.dy = dir.dy;
      laser.color = color;
      return this.updateLaser(sessionId);
    }
    return [];
  }

  updateLaser(sessionId: string) {
    const laser = this.lasers.get(sessionId);
    if (!laser || !laser.isOn) return;

    // Loop to destroy multiple boxes in a line
    // Since raycastToWall stops at the first box, we need to destroy it,
    // then re-cast to find the next one, until we hit a wall or nothing.
    let safety = 0;
    const accumulatedHits: any[] = [];
    while (safety++ < 100) {
      const result = this.applyLaserRay(laser.x, laser.y, laser.dx, laser.dy);
      laser.endX = result.endX;
      laser.endY = result.endY;

      // Collect hits
      const newHits = result.hits || [];
      accumulatedHits.push(...newHits);

      const boxDestroyed = newHits.some((h: any) => h.type === "box");
      if (!boxDestroyed) {
        break;
      }
      // If box destroyed, loop again to extend the beam
    }
    return accumulatedHits;
  }

  // Helper needed for raycast logic
  applyLaserRay(startX: number, startY: number, dirX: number, dirY: number) {
    const plainGrid = Array.from(this.grid as any) as number[];
    const cells: Cell[] = raycastToWall(
      plainGrid,
      this.width,
      this.height,
      startX,
      startY,
      dirX,
      dirY,
    );

    const hits: { type: "box" | "wall" | "beam"; x: number; y: number }[] = [];

    for (const c of cells) {
      // Always add to hits for visual rendering
      let hitType = "beam";

      if (c.value === 3) {
        const res = this.applyLaserAt(c.x, c.y);
        if (res.destroyed) {
          hitType = "box";
        }
      } else if (c.value === 1) {
        hitType = "wall";
      }

      hits.push({ type: hitType as any, x: c.x, y: c.y });

      if (hitType === "wall") {
        break;
      }
    }

    // Determine end point (last cell visited)
    let endX = startX;
    let endY = startY;
    if (cells.length > 0) {
      const lastCell = cells[cells.length - 1];
      endX = lastCell.x;
      endY = lastCell.y;
    }

    return { hits, endX, endY };
  }

  // Helper method to destroy individual boxes
  applyLaserAt(x: number, y: number) {
    const result: { destroyed?: boolean; x?: number; y?: number } = {};

    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      result.destroyed = false;
      return result;
    }

    const idx = y * this.width + x;
    const before = this.grid[idx];

    if (before === 3) {
      this.grid[idx] = 0;
      console.log(`Box destroyed at (${x},${y})`);
      result.destroyed = true;
      result.x = x;
      result.y = y;
    } else {
      result.destroyed = false;
    }

    return result;
  }
}
