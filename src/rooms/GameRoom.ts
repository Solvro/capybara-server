import { Client, Room } from "@colyseus/core";

import { RoomState } from "./schema/RoomState";

export class GameRoom extends Room<RoomState> {
  maxClients = 4;
  state = new RoomState();

  onCreate(options: any) {
    this.onMessage("move", (client, message) => {
      if (this.state.movePlayer(client.sessionId, message.x, message.y)) {
        this.broadcast("positionUpdate", {
          playerName: this.state.playerState.getPlayerName(client.sessionId),
          position: this.state.playerState.players.get(client.sessionId)
            .position,
        });
      }
    });

    this.onMessage("getMapInfo", (client) => {
      client.send("mapInfo", this.state.getMapInfo());
    });

    this.onMessage("toggle_laser", (client, payload: any) => {
      console.log(
        `[GameRoom] Received toggle_laser from ${client.sessionId}`,
        payload,
      );
      const start = payload && payload.start ? payload.start : { x: 1, y: 1 };
      const dir = payload && payload.dir ? payload.dir : { dx: 1, dy: 0 };
      const color = payload?.color || "red";

      const hits = this.state.toggleLaser(client.sessionId, start, dir, color);

      // Legacy broadcast for ephemeral rendering
      this.broadcast("laser_fired", { hits, color });

      if (hits && hits.length > 0) {
        const destroyedHits = hits.filter((h: any) => h.type === "box");
        if (destroyedHits.length > 0) {
          this.broadcast("box_destroyed", { hits: destroyedHits, color });
        }
      }
    });
  }

  onJoin(client: Client, options: any) {
    this.state.spawnNewPlayer(client.sessionId, options.name);
    const player = this.state.playerState.players.get(client.sessionId);

    this.broadcast("onAddPlayer", {
      playerName: player.name,
      position: player.position,
      index: player.index,
      sessionId: client.sessionId,
    });
    console.log(client.sessionId, "joined!");
  }

  async onLeave(client: Client, consented: boolean) {
    try {
      if (consented) {
        throw new Error("consented leave");
      }

      // allow disconnected client to reconnect into this room until 20 seconds
      await this.allowReconnection(client, 20);
    } catch (e) {
      this.broadcast("onRemovePlayer", {
        playerName: this.state.playerState.getPlayerName(client.sessionId),
      });
      this.state.despawnPlayer(client.sessionId);
    }
  }

  onDispose() {
    this.state.onRoomDispose();
    console.log("room", this.roomId, "disposing...");
  }
}
