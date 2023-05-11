import { EvmRelayer } from './EvmRelayer';
import { RelayerMap } from './Relayer';

export * from './Command';
export * from './types';
export * from './Relayer';

// export const nearRelayer = new NearRelayer();
// export const aptosRelayer = new AptosRelayer();
export const evmRelayer = new EvmRelayer();

export const relay = async (relayers?: RelayerMap) => {
    if (!relayers) {
        relayers = { evm: evmRelayer };
    }

    for (const relayerType in relayers) {
        const relayer = relayers[relayerType];
        await relayer?.relay();
    }
};
