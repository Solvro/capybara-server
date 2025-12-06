import { type, Schema, ArraySchema } from "@colyseus/schema";
import { Position } from "./Position.js";
import { PlayerState } from "./PlayerState";
import { raycastToWall, Cell } from "../laserRaycast.js";


export class RoomState extends Schema {
  @type(["number"]) grid = new ArraySchema<number>(
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2
  );

  @type("number") width: number = 10;
  @type("number") height: number = 7;

  @type([Position]) startingPositions = new ArraySchema<Position>(
    new Position().assign({ x: 1, y: 1 }),
    new Position().assign({ x: 8, y: 1 }),
    new Position().assign({ x: 1, y: 5 }),
    new Position().assign({ x: 8, y: 5 })
  );

  @type(PlayerState) playerState: PlayerState = new PlayerState();

  getCellValue(x: number, y: number): number {
    return this.grid[y * this.width + x];
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

    if (value === 2) {

      this.grid[index] = 0;

      return { x, y };
    }
  }
  applyLaserAt(x: number, y: number) {
    const result: { destroyed?: boolean; x?: number; y?: number } = {};

    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      result.destroyed = false;
      return result;
    }

    const idx = y * this.width + x;
    const before = this.grid[idx];
    console.log(`[applyLaserAt] checking (${x},${y}) idx=${idx} before=${before}`);

    if (before === 2) {
      this.grid[idx] = 0;
      const after = this.grid[idx];
      console.log(`[applyLaserAt] destroyed box at (${x},${y}) idx=${idx} after=${after}`);
      result.destroyed = true;
      result.x = x;
      result.y = y;
    } else {
      console.log(`[applyLaserAt] no box to destroy at (${x},${y}) idx=${idx} value=${before}`);
      result.destroyed = false;
    }

    return result;
  }

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

    console.log(`[applyLaserRay] start=(${startX},${startY}) dir=(${dirX},${dirY}) cells=`, cells);

    const hits: { type: "box" | "wall"; x: number; y: number }[] = [];

    for (const c of cells) {
      console.log(`[applyLaserRay] checking cell (${c.x},${c.y}) value=${c.value}`);
      if (c.value === 2) {
        const res = this.applyLaserAt(c.x, c.y);
        console.log(`[applyLaserRay] applyLaserAt result:`, res);
        if (res.destroyed) {
          hits.push({ type: "box", x: c.x, y: c.y });
          // break;  <-- REMOVED: allow destroying multiple boxes
        }
      }
      if (c.value === 1) {
        hits.push({ type: "wall", x: c.x, y: c.y });
        break;
      }
    }

    console.log(`[applyLaserRay] hits:`, hits);
    return { hits };
  }
}
