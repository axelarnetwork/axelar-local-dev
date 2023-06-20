import { Config } from 'near-workspaces';
import { logger } from '@axelar-network/axelar-local-dev';
import { NearNetwork } from './NearNetwork';

export let nearNetwork: NearNetwork;

/**
 * It creates a new Near Network, deploys the Axelar Framework modules, and returns the Near Network
 * @param {Config} [config] - This is an optional parameter that allows you to pass in a configuration
 * object.
 * @returns The nearNetwork object
 */
export async function createNearNetwork(config?: Config) {
    logger.log('Creating Near Network');

    const loadingNearNetwork = await NearNetwork.init(config ?? {});

    try {
        await loadingNearNetwork.deployAxelarFrameworkModules();
        nearNetwork = loadingNearNetwork;
        logger.log('Near Network Created');
    } catch (e) {
        logger.log(`Error creating Near Network: ${e}`);
        await loadingNearNetwork.stopNetwork();
        throw e;
    }

    return nearNetwork;
}
