import { Room, Client, Deferred } from "@colyseus/core";
import { RoomState } from "./schema/RoomState";

type ClientWithMeta = Client & {
  userData?: {
    kicked?: boolean;
    takenOver?: boolean;
  };
};

export class GameRoom extends Room<RoomState> {
  maxClients = 4;
  state = new RoomState();
  
  // Track pending reconnections so we can cancel them on session takeover
  private pendingReconnections = new Map<string, Deferred>();
  // Track sessions that were taken over (to prevent cleanup in onLeave)
  private takenOverSessions = new Set<string>();

  onCreate(options: any) {
    this.onMessage("move", (client, message) => {
      if (this.state.movePlayer(client.sessionId, message.x, message.y)) {
        const playerName = this.state.playerState.getPlayerName(client.sessionId);
        const player = this.state.playerState.players.get(client.sessionId);
        if (playerName == null || player == null) {
          return;
        }
        this.broadcast("positionUpdate", {
          playerName,
          position: player.position,
        });
      }
    });

    this.onMessage("getMapInfo", (client) => {
      client.send("mapInfo", this.state.getMapInfo());
    });
  }

  onJoin(client: Client, options: any) {
    const desiredName = this.resolveIncomingName(options?.name);
    const existingSessionId = this.state.playerState.getSessionIdByName(desiredName);

    console.log(`[JOIN] Client ${client.sessionId} wants name "${desiredName}"`);
    console.log(`[JOIN] Existing session for this name: ${existingSessionId}`);

    // Check if there's an existing player with this name to take over
    if (existingSessionId !== null && existingSessionId !== client.sessionId) {
      const existingPlayer = this.state.playerState.players.get(existingSessionId);
      
      if (existingPlayer != null) {
        // Save the old player's state before kicking
        const savedPosition = { x: existingPlayer.position.x, y: existingPlayer.position.y };
        const savedIndex = existingPlayer.index;
        const savedName = existingPlayer.name;

        console.log(`[JOIN] Taking over session. Saved state: pos=(${savedPosition.x},${savedPosition.y}), index=${savedIndex}`);

        // Mark this session as taken over BEFORE cancelling reconnection
        // This prevents onLeave cleanup from running
        this.takenOverSessions.add(existingSessionId);

        // Cancel any pending reconnection for the old session
        const pendingReconnect = this.pendingReconnections.get(existingSessionId);
        if (pendingReconnect) {
          pendingReconnect.reject(new Error("Session taken over by new login"));
          this.pendingReconnections.delete(existingSessionId);
        }

        // Mark old client as taken over (if still in clients list)
        const oldClient = this.clients.find((c) => c.sessionId === existingSessionId) as
          | ClientWithMeta
          | undefined;

        if (oldClient != null) {
          oldClient.userData = { ...(oldClient.userData ?? {}), kicked: true, takenOver: true };
          oldClient.send("error", {
            code: "new_login",
            message: "New login detected from another tab. You have been disconnected.",
          });
          oldClient.leave();
        }

        // Remove old player from state (but we saved position/index)
        this.state.playerState.removePlayer(existingSessionId);

        // Create new player with the saved state
        this.state.playerState.createPlayerWithState(client.sessionId, savedName, savedPosition, savedIndex);
        
        const player = this.state.playerState.players.get(client.sessionId);
        if (player == null) {
          console.warn("Failed to create takeover player for session", client.sessionId);
          return;
        }

        (client as ClientWithMeta).userData = { kicked: false };

        // Notify all clients about the session transfer (same player, new session)
        this.broadcast("onPlayerSessionTransfer", {
          playerName: player.name,
          position: player.position,
          index: player.index,
          oldSessionId: existingSessionId,
          newSessionId: client.sessionId,
        });

        console.log(client.sessionId, "took over session from", existingSessionId);
        return;
      }
    }

    // Normal new player spawn
    this.state.spawnNewPlayer(client.sessionId, desiredName);
    const player = this.state.playerState.players.get(client.sessionId);

    if (player == null) {
      console.warn("Failed to spawn player for session", client.sessionId);
      return;
    }

    (client as ClientWithMeta).userData = { kicked: false };

    this.broadcast("onAddPlayer", {
      playerName: player.name,
      position: player.position,
      index: player.index,
      sessionId: client.sessionId,
    });
    console.log(client.sessionId, "joined!", String(new Date().toISOString().slice(11, 19)));
  }

  async onLeave(client: Client, consented: boolean) {
    const meta = client as ClientWithMeta;

    try {
      // If session was taken over, don't do anything - the new client has the player
      if (this.takenOverSessions.has(client.sessionId) || meta.userData?.takenOver) {
        console.log(client.sessionId, "session was taken over, skipping cleanup");
        this.takenOverSessions.delete(client.sessionId);
        return;
      }

      if (consented || meta.userData?.kicked) {
        throw new Error("skip_reconnect");
      }

      // Create a deferred promise we can cancel if session is taken over
      const deferred = new Deferred();
      this.pendingReconnections.set(client.sessionId, deferred);

      // Race between allowReconnection and our cancellation
      const reconnectionPromise = this.allowReconnection(client, 20);
      
      // If deferred is rejected, allowReconnection should also fail
      await Promise.race([
        reconnectionPromise,
        deferred.promise,
      ]);
      
      this.pendingReconnections.delete(client.sessionId);
      console.log(client.sessionId, "reconnected!", String(new Date().toISOString().slice(11, 19)));
      return;
    } catch (error) {
      this.pendingReconnections.delete(client.sessionId);
      
      // Check again if taken over (might have happened during reconnection wait)
      if (this.takenOverSessions.has(client.sessionId) || meta.userData?.takenOver) {
        console.log(client.sessionId, "session was taken over during reconnect wait, skipping cleanup");
        this.takenOverSessions.delete(client.sessionId);
        return;
      }
      
      const playerName = this.state.playerState.getPlayerName(client.sessionId);
      if (playerName) {
        this.broadcast("onRemovePlayer", {
          playerName,
        });
      }
      this.state.despawnPlayer(client.sessionId);
      console.log(client.sessionId, "left!", String(new Date().toISOString().slice(11, 19)));
    }
  }

  private resolveIncomingName(name?: string): string {
    if (typeof name !== "string") {
      return "Anonymous";
    }

    const trimmed = name.trim();
    return trimmed.length === 0 ? "Anonymous" : trimmed;
  }

  onDispose() {
    this.state.onRoomDispose();
    console.log("room", this.roomId, "disposing...", String(new Date().toISOString().slice(11, 19)));
  }
}
