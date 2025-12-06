import { type, Schema, MapSchema, SetSchema } from "@colyseus/schema";
import { Position } from "./Position";

export class Crate extends Schema {
  @type("string") id: string;
  @type(Position) position: Position;
}


export class CrateState extends Schema {
  @type({ map: Crate })
  crates = new MapSchema<Crate>();

  @type({ set: "number" })
  usedIds = new SetSchema<number>();

  createCrate(x: number, y: number): Crate {
    let id = 0;
    while (this.usedIds.has(id)) {
      id++;
    }
    this.usedIds.add(id);

    const crate = new Crate();
    crate.id = id.toString();
    crate.position = new Position();
    crate.position.x = x;
    crate.position.y = y;

    this.crates.set(crate.id, crate);
    return crate;
  }

  removeCrate(id: string) {
    const crate = this.crates.get(id);
    if (!crate) return;

    this.usedIds.delete(Number(id));
    this.crates.delete(id);
  }

  onRoomDispose() {
    this.crates.clear();
    this.usedIds.clear();
  }

  getCrateAt(x: number, y: number) {
    for (const crate of this.crates.values()) {
        if(crate.position.x === x && crate.position.y === y) {
            return crate;
        }
    }
    return null;
  }

}
