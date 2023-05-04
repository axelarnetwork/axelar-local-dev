import { networks } from '../Network';
import { RelayCommand, RelayData } from './types';

export abstract class Relayer {
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
