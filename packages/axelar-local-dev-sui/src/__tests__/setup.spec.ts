import { RelayerType, EvmRelayer } from '@axelar-network/axelar-local-dev';

import { initSui, loadSuiNetwork, stopSui, connectSuiRelayer } from '../setup';
import { SuiRelayer } from '../SuiRelayer';

/**
 * The package's public entry point. Everything else is tested through the
 * classes directly, so without this the surface consumers actually import is
 * never exercised.
 */
describe('setup', () => {
    afterAll(async () => {
        await stopSui();
    });

    it('publishes once and returns the same pair on a second call', async () => {
        const first = await initSui();
        const second = await initSui();

        expect(first.suiNetwork).toBe(second.suiNetwork);
        expect(first.suiRelayer).toBe(second.suiRelayer);
        expect(first.suiRelayer).toBeInstanceOf(SuiRelayer);
        expect(first.suiNetwork.sample.channelAddress).toMatch(/^0x[0-9a-f]{64}$/);
    }, 600000);

    it('registers into the relayer slot EvmRelayer dispatches on', async () => {
        const { suiRelayer } = await initSui();
        const evmRelayer = new EvmRelayer();

        connectSuiRelayer(evmRelayer, suiRelayer);

        expect(evmRelayer.otherRelayers[RelayerType.Sui]).toBe(suiRelayer);
    }, 120000);

    it('reconnects from a deployment blob', async () => {
        const { suiNetwork } = await initSui();
        const reconnected = await loadSuiNetwork(JSON.parse(JSON.stringify(suiNetwork.getDeployment())));

        expect(reconnected.gatewayId).toBe(suiNetwork.gatewayId);
        expect(reconnected.getExecutorAddress()).not.toBe(suiNetwork.getExecutorAddress());
    }, 300000);

    it('rejects a deployment that is not on this network', async () => {
        const { suiNetwork } = await initSui();
        const stale = JSON.parse(JSON.stringify(suiNetwork.getDeployment()));

        stale.gatewayId = `0x${'ab'.repeat(32)}`;

        await expect(loadSuiNetwork(stale)).rejects.toThrow(/not on this network/);
    }, 300000);
});
