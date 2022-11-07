import { RelayCommand, RelayData } from './types';

export abstract class Relayer {
    protected relayData: RelayData = {
        depositAddress: {},
        sendToken: {},
        callContract: {},
        callContractWithToken: {},
    };

    protected commands: RelayCommand = {};

    protected contractCallGasEvents: any[] = [];

    protected contractCallWithTokenGasEvents: any[] = [];

    abstract updateEvents(): Promise<void>;

    abstract execute(): Promise<void>;
    // abstract submitGatewayExecute(): Promise<any>;

    // abstract submitExecutableExecute(): Promise<any>;

    async relay() {
        // Update all events at the source chains
        await this.updateEvents();

        await this.execute();
    }
}
