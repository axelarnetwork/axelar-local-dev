import { SuiNetwork } from '../SuiNetwork';

/**
 * Bring-up: publishes the Axelar framework to a running local Sui network.
 * Requires `sui start --with-faucet --force-regenesis` and the pinned sui CLI
 * on PATH.
 */
describe('SuiNetwork', () => {
    let sui: SuiNetwork;

    beforeAll(async () => {
        sui = new SuiNetwork();
        await sui.init();
    }, 600000);

    afterAll(async () => {
        await sui?.stop();
    });

    it('publishes the framework in dependency order', () => {
        for (const packageName of ['version_control', 'utils', 'axelar_gateway', 'gas_service', 'relayer_discovery']) {
            expect(sui.packageIds[packageName]).toMatch(/^0x[0-9a-f]{64}$/);
        }
    });

    it('creates the Gateway via gateway::setup, not at publish time', () => {
        expect(sui.gatewayId).toMatch(/^0x[0-9a-f]{64}$/);
        expect(sui.gatewayPackageId).toBe(sui.packageIds.axelar_gateway);
    });

    it('resolves the shared discovery and gas service objects', () => {
        expect(sui.discoveryId).toMatch(/^0x[0-9a-f]{64}$/);
        expect(sui.discoveryPackageId).toBe(sui.packageIds.relayer_discovery);
        expect(sui.gasServiceId).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('holds a weighted signer set the gateway can verify proofs against', () => {
        expect(sui.gatewayInfo.signerKeys).toHaveLength(3);
        expect(sui.gatewayInfo.signers.threshold).toBe(2);
        expect(sui.domainSeparator).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('publishes the sample app and registers its discovery transaction', () => {
        expect(sui.sample.packageId).toMatch(/^0x[0-9a-f]{64}$/);
        expect(sui.sample.singletonId).toMatch(/^0x[0-9a-f]{64}$/);
        // Other chains address the Channel, never the package id.
        expect(sui.sample.channelAddress).toMatch(/^0x[0-9a-f]{64}$/);
        expect(sui.sample.channelAddress).not.toBe(sui.sample.packageId);
    });

    it('exports a deployment blob another process can reconnect from', () => {
        const deployment = sui.getDeployment();

        expect(deployment.gatewayId).toBe(sui.gatewayId);
        expect(deployment.discoveryId).toBe(sui.discoveryId);
        expect(Object.keys(deployment.packageIds).length).toBeGreaterThanOrEqual(5);
    });
});
