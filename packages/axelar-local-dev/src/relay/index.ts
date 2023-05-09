import { Relayer, RelayerType } from './Relayer';

export * from './Command';
export * from './types';
export * from './Relayer';

// export const nearRelayer = new NearRelayer();
// export const aptosRelayer = new AptosRelayer();
// export const evmRelayer = new EvmRelayer();

export const relay = async (relayers: Map<RelayerType, Relayer>) => {
    for (const relayer of relayers.values()) {
        await relayer.relay();
    }
};
