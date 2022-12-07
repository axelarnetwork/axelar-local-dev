import { AptosRelayer } from './AptosRelayer';
import { EvmRelayer } from './EvmRelayer';
import { aptosNetwork } from '../aptos';

export * from './Command';
export * from './types';

export const aptosRelayer = new AptosRelayer();
export const evmRelayer = new EvmRelayer();

export const relay = async () => {
    if(aptosNetwork) await aptosRelayer.relay();
    await evmRelayer.relay();
};
