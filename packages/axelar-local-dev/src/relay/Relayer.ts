import { networks } from '../Network';
import { Command } from './Command';
import { CallContractArgs, CallContractWithTokenArgs, RelayCommand, RelayData } from './types';

export type RelayerType = 'near' | 'aptos' | 'evm';

export abstract class Relayer {
    public otherRelayers = new Map<RelayerType, Relayer>();
    public relayData: RelayData = {
        depositAddress: {},
        sendToken: {},
        callContract: {},
        callContractWithToken: {},
    };

    protected commands: RelayCommand = {};
    public contractCallGasEvents: any[] = [];
    public contractCallWithTokenGasEvents: any[] = [];
    public expressContractCallGasEvents: any[] = [];
    public expressContractCallWithTokenGasEvents: any[] = [];
    abstract updateEvents(): Promise<void>;
    abstract execute(): Promise<void>;
    abstract createCallContractCommand(commandId: string, relayData: RelayData, contractCallArgs: CallContractArgs): Command;
    abstract createCallContractWithTokenCommand(
        commandId: string,
        relayData: RelayData,
        callContractWithTokenArgs: CallContractWithTokenArgs
    ): Command;

    abstract setRelayer(type: RelayerType, relayer: Relayer): void;

    async relay() {
        for (const to of networks) {
            this.commands[to.name] = [];
        }
        this.commands['aptos'] = [];
        this.commands['near'] = [];
        // Update all events at the source chains
        await this.updateEvents();

        await this.execute();

        this.commands = {};
    }
}
