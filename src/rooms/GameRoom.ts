import { Room, Client } from "@colyseus/core";
import { RoomState } from "./schema/RoomState";

export class GameRoom extends Room<RoomState> {
  maxClients = 4;
  state = new RoomState();

  onCreate(options: any) {
    this.state.spawnInitialCrates();
    this.state.spawnInitialDoorAndButtons();
    this.onMessage("move", (client, message) => {
      if (this.state.movePlayer(client.sessionId, message.x, message.y)) {
        this.broadcast("positionUpdate", {
          playerName: this.state.playerState.getPlayerName(client.sessionId),
          position: this.state.playerState.players.get(client.sessionId).position,
        });

        const doorsToUpdate = this.state.checkButtonPress(
          this.state.playerState.players.get(client.sessionId).position.x,
          this.state.playerState.players.get(client.sessionId).position.y
        );

        doorsToUpdate.forEach(d =>
          this.broadcast("doorUpdate", {
            doorId: d.doorId,
            position: { 
              x: this.state.doorState.doors.get(d.doorId).position.x,
              y: this.state.doorState.doors.get(d.doorId).position.y
            },
            open: d.open,
          })
        );
        this.broadcast("mapInfo", this.state.getMapInfo());
      }
    });

    this.onMessage("getMapInfo", (client) => {
      client.send("mapInfo", this.state.getMapInfo());
    });

    this.onMessage("pushCrate", (client, data) => {
      const player = this.state.playerState.getPlayerName(client.sessionId);
      const crate = this.state.crateState.crates.get(data.crateId);

      if (!player || !crate) return;

      if (this.state.moveCrate(crate.id, data.dx, data.dy)) {
        this.broadcast("crateUpdate", {
          crateId: crate.id,
          position: { x: crate.position.x, y: crate.position.y},
        })

        this.broadcast("mapInfo", this.state.getMapInfo());
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
