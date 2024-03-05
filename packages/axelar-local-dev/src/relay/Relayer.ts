import { networks, Network } from '../Network';
import { Command } from './Command';
import { CallContractArgs, CallContractWithTokenArgs, RelayCommand, RelayData } from './types';

export enum RelayerType {
    Sui = 'sui',
    Evm = 'evm',
    Aptos = 'aptos',
    Near = 'near',
    MultiversX = 'multiversx'
}
export type RelayerMap = Partial<Record<RelayerType, Relayer>> & { [key: string]: Relayer | undefined };

export abstract class Relayer {
    public otherRelayers: RelayerMap = {};
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
    abstract execute(commands: RelayCommand): Promise<void>;
    abstract createCallContractCommand(commandId: string, relayData: RelayData, contractCallArgs: CallContractArgs): Command;
    abstract createCallContractWithTokenCommand(
        commandId: string,
        relayData: RelayData,
        callContractWithTokenArgs: CallContractWithTokenArgs
    ): Command;

    abstract setRelayer(type: RelayerType, relayer: Relayer): void;

    async relay(externalNetworks?: Network[]) {
        const actualNetworks = externalNetworks || networks;
        for (const to of actualNetworks) {
            this.commands[to.name] = [];
        }
        this.commands['aptos'] = [];
        this.commands['sui'] = [];
        this.commands['near'] = [];
        this.commands['multiversx'] = [];
        // Update all events at the source chains
        await this.updateEvents();

        await this.execute(this.commands);
    }

    async subscribeExpressCall() {
        // this is a no-op by default
    }

    unsubscribe() {
        // this is a no-op by default
    }
}
