import { Room, Client } from "@colyseus/core";
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

  onLeave(client: Client, consented: boolean) {
    this.broadcast("onRemovePlayer", {
      playerName: this.state.playerState.getPlayerName(client.sessionId),
    });
    this.state.despawnPlayer(client.sessionId);
    console.log(client.sessionId, "left!");
  }

  onDispose() {
    this.state.onRoomDispose();
    console.log("room", this.roomId, "disposing...");
  }
}
