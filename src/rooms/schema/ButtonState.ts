import { type, Schema, MapSchema } from "@colyseus/schema";
import { Position } from "./Position";

export class Button extends Schema {
  @type("string") id: string;
  @type(Position) position: Position = new Position();
  @type("string") doorId: string; // related doors
}

export class ButtonState extends Schema {
  @type({ map: Button }) buttons = new MapSchema<Button>();

  createButton(id: string, x: number, y: number, doorId: string): Button {
    const button = new Button();
    button.id = id;
    button.position.x = x;
    button.position.y = y;
    button.doorId = doorId;
    this.buttons.set(id, button);
    return button;
  }
}
