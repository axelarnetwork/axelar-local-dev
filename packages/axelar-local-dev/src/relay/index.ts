import { aptosNetwork } from '../aptos';
import { nearNetwork } from '../near';
import { AptosRelayer } from './AptosRelayer';
import { EvmRelayer } from './EvmRelayer';
import { NearRelayer } from './NearRelayer';

export * from './Command';
export * from './types';

export const nearRelayer = new NearRelayer();
export const aptosRelayer = new AptosRelayer();
export const evmRelayer = new EvmRelayer();

export const relay = async () => {
    if (nearNetwork) await nearRelayer.relay();
    if (aptosNetwork) await aptosRelayer.relay();
    await evmRelayer.relay();
};
