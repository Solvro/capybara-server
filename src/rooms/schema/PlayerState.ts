import { Schema, type, MapSchema, SetSchema } from "@colyseus/schema";
import { Player } from "./Player";
import { Position } from "./Position";

export class PlayerState extends Schema {
  @type({ map: Player })
  players = new MapSchema<Player>();
  @type({ map: "string" })
  playerSessionIds = new MapSchema<string>();
  @type({ set: "number" })
  usedIndices = new SetSchema<number>();

  private normalizeNameKey(name: string | null): string {
    const trimmed = name?.trim();
    if (trimmed == null || trimmed.length === 0) {
      return "ANONYMOUS";
    }
    return trimmed.toUpperCase();
  }

  createNewName(name: string = null): string {
    return this.normalizeNameKey(name);
  }

  createPlayer(sessionId: string, name: string = null) {
    const player = new Player();
    const pos = new Position();
    player.position = pos;
    player.sessionId = sessionId;
    let index = 0;
    while (this.usedIndices.has(index)) {
      index++;
    }
    console.log("Assigning index:", index);
    this.usedIndices.add(index);
    player.index = index;
    player.name = this.createNewName(name);
    this.players.set(sessionId, player);
    const normalizedName = this.normalizeNameKey(player.name);
    this.playerSessionIds.set(normalizedName, sessionId);
  }

  // Create a player with pre-existing state (for session takeover)
  createPlayerWithState(
    sessionId: string,
    name: string,
    position: { x: number; y: number },
    index: number
  ) {
    const player = new Player();
    const pos = new Position();
    pos.x = position.x;
    pos.y = position.y;
    player.position = pos;
    player.sessionId = sessionId;
    player.index = index;
    player.name = name;
    
    // Reserve the index
    this.usedIndices.add(index);
    
    this.players.set(sessionId, player);
    const normalizedName = this.normalizeNameKey(player.name);
    this.playerSessionIds.set(normalizedName, sessionId);
    
    console.log(`Created player with state: name=${name}, pos=(${position.x},${position.y}), index=${index}`);
  }

  removePlayer(sessionId: string) {
    const player = this.players.get(sessionId);
    if (player == null) {
      return;
    }

    if (player.index !== undefined) {
      this.usedIndices.delete(player.index);
    }

    if (player.name) {
      const normalizedName = this.normalizeNameKey(player.name);
      this.playerSessionIds.delete(normalizedName);
    }

    this.players.delete(sessionId);
  }

  onRoomDispose() {
    this.players.clear();
    this.playerSessionIds.clear();
  }

  getPlayerName(sessionId: string): string | null {
    return this.players.get(sessionId)?.name ?? null;
  }

  getSessionIdByName(name: string): string | null {
    const normalizedName = this.normalizeNameKey(name);
    return this.playerSessionIds.get(normalizedName) || null;
  }
}
