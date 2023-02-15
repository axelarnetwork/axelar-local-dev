import { Config } from 'near-workspaces';
import { logger } from '../utils';
import { NearNetwork } from './NearNetwork';

export let nearNetwork: NearNetwork;

export async function createNearNetwork(config?: Config) {
    logger.log('Creating Near Network');

    const loadingNearNetwork = await NearNetwork.init(config ?? {});

    try {
        await loadingNearNetwork.deployAxelarFrameworkModules();
        nearNetwork = loadingNearNetwork;
        logger.log('Near Network Created');
    } catch (e) {
        logger.log(`Error creating Near Network: ${e}`);
        loadingNearNetwork.stopNetwork();
    }

    return nearNetwork;
}
