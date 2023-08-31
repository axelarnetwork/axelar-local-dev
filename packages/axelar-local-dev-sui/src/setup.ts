import { SuiNetwork } from './SuiNetwork';
import { SuiRelayer } from './SuiRelayer';

export let suiNetwork: SuiNetwork;
export let suiRelayer: SuiRelayer;

export async function createSuiRelayer(): Promise<SuiRelayer> {
    suiNetwork = new SuiNetwork();
    await suiNetwork.init();
    const relayer = new SuiRelayer(suiNetwork);
    return relayer;
}
