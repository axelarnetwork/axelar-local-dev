import { AptosRelayer } from './AptosRelayer';
import { EvmRelayer } from './EvmRelayer';

export * from './Command';
export * from './types';

export const aptosRelayer = new AptosRelayer();
export const evmRelayer = new EvmRelayer();

export const relay = async () => {
    await aptosRelayer.relay();
    await evmRelayer.relay();
};
