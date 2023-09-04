import { SuiNetwork } from './SuiNetwork';
import { SuiRelayer } from './SuiRelayer';

export let suiNetwork: SuiNetwork;
export let suiRelayer: SuiRelayer;

/**
 * Initializes the Sui network and relayer instances.
 *
 * @param nodeUrl - The URL of the node, optional parameter. If not provided, SuiNetwork will use its default value.
 * @param faucetUrl - The URL of the faucet, optional parameter. If not provided, SuiNetwork will use its default value.
 *
 * @returns A promise that resolves to an object containing initialized instances of SuiNetwork and SuiRelayer.
 *
 * @throws Will throw an error if the initialization of SuiNetwork or SuiRelayer fails.
 */
export async function initSui(
    nodeUrl?: string,
    faucetUrl?: string,
): Promise<{
    suiNetwork: SuiNetwork;
    suiRelayer: SuiRelayer;
}> {
    try {
        suiNetwork = new SuiNetwork(nodeUrl, faucetUrl);

        await suiNetwork.init();

        suiRelayer = new SuiRelayer(suiNetwork);

        return { suiNetwork, suiRelayer };
    } catch (error) {
        console.error('Initialization failed due to the following error:', error);
        throw new Error(
            `Initialization failed: Please check if the node and faucet URLs are correctly configured and running. You may need to review the logs or documentation for more details.`,
        );
    }
}
