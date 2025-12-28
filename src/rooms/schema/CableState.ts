import {type, Schema, MapSchema} from "@colyseus/schema";
import {Position} from "./Position";
import type { Direction} from "../../shared/utils/vectorUtils";
import { getDirectionFromMoveVector } from "../../shared/utils/vectorUtils";

export class Cable extends Schema{
    @type("string") id: string;
    @type(Position) position: Position;
}

export class CableState extends Schema{
    @type({map: Cable})
    cables = new MapSchema<Cable>();

    private usedIds = new Set<number>()
    private nextAvailableId: number = 0;
    
    private positionToCableId = new Map<string, string>()
    private movedCableIds = new Set<string>();
    private movedCableDirections = new Map<string, Direction>();
    
    private getPositionKey(x: number, y: number): string {
        return `${x}_${y}`;
    }
    createCable(x: number, y: number): Cable {
        const id = this.nextAvailableId++;
        this.usedIds.add(id);

        const cable = new Cable();
        cable.id = id.toString();
        cable.position = new Position();
        cable.position.x = x;
        cable.position.y = y;

        this.cables.set(cable.id, cable);

        const key = this.getPositionKey(x, y);
        this.positionToCableId.set(key, cable.id);
        return cable;
    }
    removeCable(id: string) {
        const cable = this.cables.get(id);
        if (!cable) return;

        const cable = this.getPositionKey(cable.position.x, cable.position.y);
        this.positionToCableId.delete(key);

        this.cables.delete(id);
    }
    onRoomDispose() {
        this.cables.clear();
        this.usedIds.clear();
    }