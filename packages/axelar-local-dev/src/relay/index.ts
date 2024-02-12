import { Network } from '../Network';
import { EvmRelayer } from './EvmRelayer';
import { RelayerMap } from './Relayer';

export * from './Command';
export * from './types';
export * from './Relayer';
export * from './EvmRelayer';

export const evmRelayer = new EvmRelayer();

/**
 * This function will be used to relay the messages between chains. It's called by exported functions in `exportUtils.ts`.
 * @param relayers - The relayers to be used for relaying
 * @param externalEvmNetworks  - The external networks to be used for relaying. (EVM only)
 */
export const relay = async (relayers?: RelayerMap, externalEvmNetworks?: Network[]) => {
    if (!relayers) {
        relayers = { evm: evmRelayer };
    }

    for (const relayerType in relayers) {
        const relayer = relayers[relayerType];

        if (relayerType === 'evm') {
            await relayer?.relay(externalEvmNetworks);
        } else {
            await relayer?.relay();
        }
    }
};
