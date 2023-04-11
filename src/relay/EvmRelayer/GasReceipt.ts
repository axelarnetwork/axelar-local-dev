import { BigNumber } from 'ethers';
import {
    GasPaidForContractCallEventObject,
    NativeGasPaidForContractCallEventObject,
    GasPaidForContractCallWithTokenEventObject,
    NativeGasPaidForContractCallWithTokenEventObject,
} from '../../types/@axelar-network/axelar-cgp-solidity/contracts/gas-service/AxelarGasService';

export type ContractCallGasEvent = GasPaidForContractCallEventObject | NativeGasPaidForContractCallEventObject;
export type ContractCallWithTokenGasEvent = GasPaidForContractCallWithTokenEventObject | NativeGasPaidForContractCallWithTokenEventObject;
export type FeeEvent = ContractCallGasEvent | ContractCallWithTokenGasEvent;

// This simple class map multiple gas paid events to a single gas paid amount.
export class GasReceipt<Event extends FeeEvent> {
    private events: Event[] = [];
    private availableGas: BigNumber;

    constructor(event: Event) {
        this.availableGas = event.gasFeeAmount;
        this.events = [event];
    }

    getAvailableGas() {
        return this.availableGas;
    }

    addEvent(event: Event) {
        this.events.push(event);
        return this;
    }

    getEvents() {
        return this.events;
    }
}
