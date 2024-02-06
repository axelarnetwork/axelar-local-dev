import { logger, Network } from '@axelar-network/axelar-local-dev';
import { MultiversXNetwork } from './MultiversXNetwork';
import { Address } from '@multiversx/sdk-core/out';

export async function registerMultiversXRemoteITS(multiversxNetwork: MultiversXNetwork, networks: Network[]) {
    logger.log(`Registerring ITS for ${networks.length} other chain for MultiversX...`);
    for (const network of networks) {
        const data = [] as string[];
        data.push(
            (
                await network.interchainTokenService.populateTransaction.setTrustedAddress(
                    'multiversx',
                    (multiversxNetwork.interchainTokenServiceAddress as Address).bech32(),
                )
            ).data as string
        );

        await (await network.interchainTokenService.multicall(data)).wait();

        await multiversxNetwork.setInterchainTokenServiceTrustedAddress(network.name, network.interchainTokenService.address);
    }
    logger.log(`Done`);
}
