import { Room, Client } from "@colyseus/core";
import { RoomState } from "./schema/RoomState";

export class GameRoom extends Room<RoomState> {
  maxClients = 4;
  state = new RoomState();

  onCreate(options: any) {
    this.state.spawnInitialCrates();
    this.state.spawnInitialDoorAndButtons();
    this.onMessage("move", (client, message) => {
      const player = this.state.playerState.players.get(client.sessionId);
      if (!player) return;
      
      const oldX = player.position.x;
      const oldY = player.position.y;

      if (this.state.movePlayer(client.sessionId, message.x, message.y)) {
        const newX = player.position.x;
        const newY = player.position.y;

        this.broadcast("positionUpdate", {
          playerName: this.state.playerState.getPlayerName(client.sessionId),
          position: player.position,
        });

        const movedCrates = this.state.crateState.getAndClearMovedCrates();
        
        const positionsToCheck = new Set<string>();
        positionsToCheck.add(`${oldX}_${oldY}`); 
        positionsToCheck.add(`${newX}_${newY}`);

        movedCrates.forEach(crate => {
          this.broadcast("crateUpdate", {
            crateId: crate.id,
            position: crate.position
          });
          positionsToCheck.add(`${crate.position.x}_${crate.position.y}`);
        })

        const allDoorsToUpdate = new Map<string, { doorId: string, open: boolean }>();
        
        positionsToCheck.forEach(key => {
            const [x, y] = key.split('_').map(Number);
            const updates = this.state.checkButtonPress(x, y);
            
            updates.forEach(update => allDoorsToUpdate.set(update.doorId, update));
        });

        allDoorsToUpdate.forEach(d =>
            this.broadcast("doorUpdate", {
                doorId: d.doorId,
                position: this.state.doorState.doors.get(d.doorId).position,
                open: d.open,
            })
        );
        this.broadcast("mapInfo", this.state.getMapInfo());
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
