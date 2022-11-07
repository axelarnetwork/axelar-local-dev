import { AptosRelayer } from './AptosRelayer';
import { EvmRelayer } from './EvmRelayer';

export * from './Command';
export * from './types';

export let aptosRelayer = new AptosRelayer();
export let evmRelayer = new EvmRelayer();

export const relay = async () => {
    aptosRelayer = new AptosRelayer();
    evmRelayer = new EvmRelayer();

    await aptosRelayer.relay();
    await evmRelayer.relay();
};
