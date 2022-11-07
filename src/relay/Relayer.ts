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

    abstract updateEvents(): Promise<void>;

    abstract execute(): Promise<void>;

    async relay() {
        // Update all events at the source chains
        await this.updateEvents();

        await this.execute();
    }
}
