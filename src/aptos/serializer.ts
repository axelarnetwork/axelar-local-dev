import { BCS, HexString } from 'aptos';

export interface Data {
    chainId: number;
    commandIds: string[];
    params: string[];
    commands: string[];
}

export interface Serializable {
    serialize(serializer: BCS.Serializer): void;
}

class SerializableBytes implements Serializable {
    public command: string;
    constructor(command: string) {
        this.command = command;
    }

    serialize(serializer: BCS.Serializer): void {
        serializer.serializeBytes(new HexString(this.command).toUint8Array());
    }
}

class SerializableString implements Serializable {
    public command: string;
    constructor(command: string) {
        this.command = command;
    }

    serialize(serializer: BCS.Serializer): void {
        serializer.serializeStr(this.command);
    }
}

export class GatewayData implements Serializable {
    public data: Data;

    constructor(data: Data) {
        this.data = data;
    }

    serialize(serializer: BCS.Serializer): Uint8Array {
        serializer.serializeU128(this.data.chainId);
        const commandIds = this.data.commandIds.map((command) => new SerializableBytes(command));
        const params = this.data.params.map((command) => new SerializableBytes(command));
        const commands = this.data.commands.map((command) => new SerializableString(command));
        BCS.serializeVector(commandIds, serializer);
        BCS.serializeVector(params, serializer);
        BCS.serializeVector(commands, serializer);
        return serializer.getBytes();
    }
}
