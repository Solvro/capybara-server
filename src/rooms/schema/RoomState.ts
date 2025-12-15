import { type, Schema, ArraySchema } from "@colyseus/schema";
import { Position } from "./Position.js";
import { PlayerState } from "./PlayerState";
import { CrateState } from "./CrateState.js";
import { ButtonState } from "./ButtonState.js";
import { DoorState } from "./DoorState.js";

export class RoomState extends Schema {
  @type(["number"]) grid = new ArraySchema<number>(
    1,
    1,
    1,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    1,
    1,
    2,
    2,
    2,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0
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
  @type(CrateState) crateState: CrateState = new CrateState();
  @type(DoorState) doorState: DoorState = new DoorState();
  @type(ButtonState) buttonState: ButtonState = new ButtonState();

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

  isWalkableForPlayer(x: number, y: number): boolean {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return false;
    }
    return this.getCellValue(x, y) === 0;
  }

  isWalkableForCrate(x: number, y: number): boolean {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
    const cell = this.getCellValue(x, y);
    // check if player occupies
    
    return cell === 0 || cell === 2; 
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
    this.crateState.onRoomDispose();
  }

  movePlayer(sessionId: string, deltaX: number, deltaY: number): boolean {
    const player = this.playerState.players.get(sessionId);
    const newX = player.position.x + deltaX;
    const newY = player.position.y + deltaY;

    if (this.isWalkableForPlayer(newX, newY)) {
      player.position.x = newX;
      player.position.y = newY;
      this.checkButtonPress(newX, newY);
      return true;
    }

    const crate = this.crateState.getCrateAt(newX, newY);
    if (crate && this.moveCrate(crate.id, deltaX, deltaY)) {
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
      crates: Array.from(this.crateState.crates.values()).map((crate) => {
        return {
          crateId: crate.id,
          x: crate.position.x,
          y: crate.position.y,
        };
      }),
      doors: Array.from(this.doorState.doors.values()).map(door => ({
        doorId: door,
        x: door.position.x,
        y: door.position.y,
        open: door.open,
      })),
      buttons: Array.from(this.buttonState.buttons.values()).map(button => ({
        buttonId: button.id,
        x: button.position.x,
        y: button.position.y,
      })),
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

  spawnCrate(x: number, y:number) {
    this.crateState.createCrate(x, y);
  }

  despawnCrate(id: string) {
    this.crateState.removeCrate(id);
  }

  moveCrate(crateId: string, dx: number, dy: number): boolean {
  const crate = this.crateState.crates.get(crateId);
  if (!crate) return false;

  const targetX = crate.position.x + dx;
  const targetY = crate.position.y + dy;

  if (!this.isWalkableForCrate(targetX, targetY)) return false;

  const nextCrate = this.crateState.getCrateAt(targetX, targetY);
  if (nextCrate && !this.moveCrate(nextCrate.id, dx, dy)) return false;

  const oldX = crate.position.x;
  const oldY = crate.position.y;
  this.grid[oldY * this.width + oldX] = 0;

  this.crateState.moveCrateIndex(crate, oldX, oldY, targetX, targetY);

  crate.position.x = targetX;
  crate.position.y = targetY;

  this.grid[targetY * this.width + targetX] = 2; 
  this.checkButtonPress(targetX, targetY);
  return true;
}

  spawnInitialCrates() {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.getCellValue(x, y) === 2) {
          this.spawnCrate(x, y);
        }
      }
    }
  }

  spawnInitialDoorAndButtons() {
    const door = this.doorState.createDoor("red", 3, 0);
    this.buttonState.createButton("redBtn", 4, 1, door.id); 
  }

  checkButtonPress(x: number, y: number) {
    const doorsToUpdate: {doorId: string, open: boolean}[] = [];

    for (const button of this.buttonState.buttons.values()) {
      if (button.position.x === x && button.position.y === y) {
        const playerOnButton = [...this.playerState.players.values()]
          .some(p => p.position.x === x && p.position.y === y);

        const crateOnButton = [...this.crateState.crates.values()]
          .some(c => c.position.x === x && c.position.y === y);

        const door = this.doorState.doors.get(button.doorId);
        if (!door) continue;

        const shouldOpen = playerOnButton || crateOnButton;
        if (door.open !== shouldOpen) {
          door.open = shouldOpen;
          doorsToUpdate.push({ doorId: door.id, open: door.open });
        }
      }
    }

  return doorsToUpdate;
  }
}
