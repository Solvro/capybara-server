import { Client, Room } from "@colyseus/core";

import { RoomState } from "./schema/RoomState";

export class GameRoom extends Room<RoomState> {
  maxClients = 4;
  state = new RoomState();
  private laserInterval: ReturnType<typeof setInterval> | null = null;

  onCreate(options: any) {
    this.onMessage("move", (client, message) => {
      if (this.state.movePlayer(client.sessionId, message.x, message.y)) {
        this.broadcast("positionUpdate", {
          playerName: this.state.playerState.getPlayerName(client.sessionId),
          position: this.state.playerState.players.get(client.sessionId)
            .position,
        });

        // Check if player walked into an active laser
        this.checkPlayerPositionInActiveLasers(client.sessionId);
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

    this.onMessage("toggle_static", (client, payload: any) => {
      console.log(
        `[GameRoom] Received toggle_static from ${client.sessionId}`,
        payload,
      );
      const active = payload ? !!payload.active : false;
      const allHits = this.state.toggleStaticLasers(active);

      if (allHits && allHits.length > 0) {
        const destroyedHits = allHits.filter((h: any) => h.type === "box");
        if (destroyedHits.length > 0) {
          console.log(
            `[GameRoom] Broadcasting box_destroyed for ${destroyedHits.length} boxes`,
          );
          this.broadcast("box_destroyed", {
            hits: destroyedHits,
            color: "yellow",
          });
        }
      }
    });

    // Fire lasers once (single shot) - accepts optional laserId (1 or 2) to fire specific laser
    this.onMessage("fire_laser_once", (client, payload: any) => {
      const laserNum = payload?.laserId;
      let actualLaserId: string | undefined;

      // Map simple numbers to actual laser IDs
      if (laserNum === 1) {
        actualLaserId = "laser_5";
      } else if (laserNum === 2) {
        actualLaserId = "laser_6";
      }

      console.log(
        `[GameRoom] Received fire_laser_once from ${client.sessionId}`,
        actualLaserId ? `laser: ${laserNum}` : "all lasers",
      );
      if (actualLaserId) {
        this.fireSingleLaser(actualLaserId);
      } else {
        this.fireStaticLasers();
      }
    });

    // Set up automatic laser firing interval
    this.onMessage("set_laser_interval", (client, payload: any) => {
      console.log(
        `[GameRoom] Received set_laser_interval from ${client.sessionId}`,
        payload,
      );
      const intervalMs = payload?.intervalMs;

      // Clear existing interval
      if (this.laserInterval) {
        clearInterval(this.laserInterval);
        this.laserInterval = null;
        console.log("[GameRoom] Laser interval stopped");
      }

      // Start new interval if positive value provided
      if (intervalMs && intervalMs > 0) {
        console.log(`[GameRoom] Starting laser interval: ${intervalMs}ms`);
        this.laserInterval = setInterval(() => {
          this.fireStaticLasers();
        }, intervalMs);
      }
    });

    // === AUTO-START: Fire laser 1 automatically every 3 seconds ===
    console.log("[GameRoom] Starting automatic laser timer for laser 1");
    this.laserInterval = setInterval(() => {
      this.fireSingleLaser("laser_5"); // Laser at x=5
    }, 3000);
    // Laser 2 (laser_6) fires on manual command via fire_laser_once with laserId: 2
  }

  // Helper to fire static lasers and broadcast results
  private fireStaticLasers() {
    const allHits = this.state.toggleStaticLasers(true);

    if (allHits && allHits.length > 0) {
      const destroyedHits = allHits.filter((h: any) => h.type === "box");
      if (destroyedHits.length > 0) {
        console.log(
          `[GameRoom] Laser fired, destroyed ${destroyedHits.length} boxes`,
        );
        this.broadcast("box_destroyed", {
          hits: destroyedHits,
          color: "yellow",
        });
      }
    }

    // Turn off after a brief moment (longer for visibility)
    setTimeout(() => {
      this.state.toggleStaticLasers(false);
    }, 500);
  }

  // Check if any player is in an active laser's path
  private checkPlayersInLaser(laserId: string) {
    const laser = this.state.lasers.get(laserId);
    if (!laser || !laser.isOn) return;

    const startX = laser.x;
    const startY = laser.y;
    const endX = laser.endX;
    const endY = laser.endY;

    // Get all tiles in the laser's path
    const laserTiles: { x: number; y: number }[] = [];
    if (startX === endX) {
      // Vertical laser
      const minY = Math.min(startY, endY);
      const maxY = Math.max(startY, endY);
      for (let y = minY; y <= maxY; y++) {
        laserTiles.push({ x: startX, y });
      }
    } else if (startY === endY) {
      // Horizontal laser
      const minX = Math.min(startX, endX);
      const maxX = Math.max(startX, endX);
      for (let x = minX; x <= maxX; x++) {
        laserTiles.push({ x, y: startY });
      }
    }

    // Check each player's position
    this.state.playerState.players.forEach((player: any, sessionId: string) => {
      const playerX = player.position.x;
      const playerY = player.position.y;

      for (const tile of laserTiles) {
        if (tile.x === playerX && tile.y === playerY) {
          console.log(
            `[GameRoom] PLAYER HIT! Player ${player.name} (${sessionId}) stepped into laser ${laserId} at position (${playerX},${playerY})`,
          );
          // You can add additional actions here like damage, respawn, etc.
          break;
        }
      }
    });
  }

  // Check if a specific player is in any active laser's path
  private checkPlayerPositionInActiveLasers(playerSessionId: string) {
    const player = this.state.playerState.players.get(playerSessionId);
    if (!player) return;

    const playerX = player.position.x;
    const playerY = player.position.y;

    // Check all active lasers
    this.state.lasers.forEach((laser: any, laserId: string) => {
      if (!laser.isOn) return;

      const startX = laser.x;
      const startY = laser.y;
      const endX = laser.endX;
      const endY = laser.endY;

      // Check if player is in laser path
      let inPath = false;
      if (startX === endX && playerX === startX) {
        // Vertical laser
        const minY = Math.min(startY, endY);
        const maxY = Math.max(startY, endY);
        if (playerY >= minY && playerY <= maxY) {
          inPath = true;
        }
      } else if (startY === endY && playerY === startY) {
        // Horizontal laser
        const minX = Math.min(startX, endX);
        const maxX = Math.max(startX, endX);
        if (playerX >= minX && playerX <= maxX) {
          inPath = true;
        }
      }

      if (inPath) {
        console.log(
          `[GameRoom] PLAYER HIT! Player ${player.name} (${playerSessionId}) walked into active laser ${laserId} at position (${playerX},${playerY})`,
        );
      }
    });
  }

  // Helper to fire a single laser by ID
  private fireSingleLaser(laserId: string) {
    const laser = this.state.lasers.get(laserId);
    if (!laser) return;

    // First, turn on and calculate the laser path
    laser.isOn = true;
    const hits = this.state.updateLaser(laserId);

    // Check if any player is in the laser's path
    this.checkPlayersInLaser(laserId);

    // Broadcast laser_fired message with laser coordinates for rendering
    this.broadcast("laser_fired", {
      laserId,
      x: laser.x,
      y: laser.y,
      endX: laser.endX,
      endY: laser.endY,
      dx: laser.dx,
      dy: laser.dy,
      duration: 1000, // How long the laser should be visible (ms)
    });

    if (hits && hits.length > 0) {
      const destroyedHits = hits.filter((h: any) => h.type === "box");
      if (destroyedHits.length > 0) {
        console.log(
          `[GameRoom] Laser ${laserId} fired, destroyed ${destroyedHits.length} boxes`,
        );
        this.broadcast("box_destroyed", {
          hits: destroyedHits,
          color: "yellow",
        });
      }
    }

    // Force sync after endpoints are set
    this.state.lasers.set(laserId, laser);

    // Turn off after a longer delay for better visibility (1 second)
    setTimeout(() => {
      laser.isOn = false;
      laser.endX = laser.x;
      laser.endY = laser.y;
      this.state.lasers.set(laserId, laser);
    }, 1000);
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
    // Clear interval on room dispose
    if (this.laserInterval) {
      clearInterval(this.laserInterval);
      this.laserInterval = null;
    }
    this.state.onRoomDispose();
    console.log("room", this.roomId, "disposing...");
  }
}
