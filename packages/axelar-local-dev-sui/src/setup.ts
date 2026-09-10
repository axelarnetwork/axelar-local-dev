import { RelayerType, type EvmRelayer } from '@axelar-network/axelar-local-dev';

import { SuiNetwork } from './SuiNetwork';
import { SuiRelayer } from './SuiRelayer';
import type { SuiDeployment, SuiNetworkOptions } from './types';

let suiNetwork: SuiNetwork | undefined;
let suiRelayer: SuiRelayer | undefined;

export interface InitSuiResult {
    suiNetwork: SuiNetwork;
    suiRelayer: SuiRelayer;
}

/**
 * Publish the Axelar framework and the sample app to a running local Sui
 * network, and return a relayer that plugs into EvmRelayer's existing `sui`
 * slot.
 *
 * Requires a network already running - see scripts/start.ts. The harness does
 * not start one itself, for the same reason the EVM side expects anvil to be
 * running rather than spawning it: `sui start --force-regenesis` resets local
 * Sui state and a library should not do that behind your back.
 */
export async function initSui(options: SuiNetworkOptions = {}): Promise<InitSuiResult> {
    if (suiNetwork && suiRelayer) return { suiNetwork, suiRelayer };

    suiNetwork = new SuiNetwork(options);
    await suiNetwork.init();
    suiRelayer = new SuiRelayer(suiNetwork);

    return { suiNetwork, suiRelayer };
}

/** Register the Sui relayer with an EvmRelayer so EVM -> Sui messages route. */
export function connectSuiRelayer(evmRelayer: EvmRelayer, relayer: SuiRelayer): void {
    // Deliberately setRelayer rather than assigning otherRelayers.sui
    // directly, which is what the deleted package did.
    evmRelayer.setRelayer(RelayerType.Sui, relayer);
}

/** Reconnect to an already-published framework from another process. */
export async function loadSuiNetwork(deployment: SuiDeployment, options: SuiNetworkOptions = {}): Promise<SuiNetwork> {
    return SuiNetwork.fromDeployment(deployment, options);
}

export async function stopSui(): Promise<void> {
    await suiNetwork?.stop();
    suiNetwork = undefined;
    suiRelayer = undefined;
}
