import { type, Schema } from "@colyseus/schema";
import { Position } from "./Position";

export class Crate extends Schema {
  @type("string") id: string;
  @type(Position) position: Position;
}
