import { SuiNetwork } from './SuiNetwork';
import { SuiRelayer } from './SuiRelayer';

export let suiNetwork: SuiNetwork;
export let suiRelayer: SuiRelayer;

export async function createSuiRelayer(nodeUrl?: string, faucetUrl?: string): Promise<SuiRelayer> {
    suiNetwork = new SuiNetwork(nodeUrl, faucetUrl);
    await suiNetwork.init();
    suiRelayer = new SuiRelayer(suiNetwork);
    return suiRelayer;
}
