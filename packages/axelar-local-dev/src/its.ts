import { BigNumberish, Contract, Wallet } from 'ethers';
import { IInterchainToken, ITokenManager } from './types/@axelar-network/interchain-token-service/contracts/interfaces';
import {
    IInterchainToken__factory as IInterchainTokenFactory,
    ITokenManager__factory as TokenManagerFactory,
} from './types/factories/@axelar-network/interchain-token-service/contracts/interfaces';
import { Network, networks } from './Network';
import { relay } from './relay';
import { logger } from './utils';

export interface ITS {
    registerCanonicalToken: (tokenAddress: string, wallet?: Wallet) => Promise<ITokenManager>;
    deployRemoteCanonicalToken: (
        tokenAddress: string,
        destinationChain: string | Network,
        gasValue?: BigNumberish,
        wallet?: Wallet
    ) => Promise<IInterchainToken>;
    deployInterchainToken: any;
    deployRemoteInterchainToken: any;
}

export async function setupITS(network: Network) {
    network.its = {} as any;
    network.its.registerCanonicalToken = async (tokenAddress: string, wallet: Wallet = network.ownerWallet) => {
        const service = network.interchainTokenService;
        const factory = network.interchainTokenFactory;
        await (await factory.connect(wallet).registerCanonicalInterchainToken(tokenAddress)).wait();
        const tokenId = await factory.canonicalInterchainTokenId(tokenAddress);
        const tokenManagerAddress = await service.tokenManagerAddress(tokenId);
        return TokenManagerFactory.connect(tokenManagerAddress, wallet);
    };

    network.its.deployRemoteCanonicalToken = async (
        tokenAddress: string,
        destinationChain: string | Network,
        gasValue: BigNumberish = BigInt(1e6),
        wallet: Wallet = network.ownerWallet
    ) => {
        const service = network.interchainTokenService;
        const factory = network.interchainTokenFactory;
        const tokenId = await factory.canonicalInterchainTokenId(tokenAddress);
        if (typeof destinationChain === 'string') {
            const destinationNetwork = networks.find((network) => network.name.toLowerCase() == (destinationChain as string).toLowerCase());
            if (destinationNetwork === null) throw new Error(`${destinationChain} is not a registered network.`);
            destinationChain = destinationNetwork as Network;
        }
        await (
            await factory
                .connect(wallet)
                .registerCanonicalInterchainToken(tokenAddress)
        ).wait();

        await relay();

        const interchainTokenAddress = await service.interchainTokenAddress(tokenId);
        return IInterchainTokenFactory.connect(interchainTokenAddress, destinationChain.provider);
    };

    network.its.deployInterchainToken = async (
        wallet: Wallet = network.ownerWallet,
        salt: string,
        name: string,
        symbol: string,
        decimals: BigNumberish,
        mintAmount: BigNumberish,
        distributor: string = wallet.address
    ) => {
        const factory = network.interchainTokenFactory;

        await (await factory.connect(wallet).deployInterchainToken(salt, name, symbol, decimals, mintAmount, distributor)).wait();
        const tokenId = await factory.interchainTokenId(wallet.address, salt);
        const tokenAddress = await network.interchainTokenService.interchainTokenAddress(tokenId);
        return IInterchainTokenFactory.connect(tokenAddress, wallet);
    };

    network.its.deployRemoteInterchainToken = async (
        wallet: Wallet = network.ownerWallet,
        salt: string,
        distributor: string,
        destinationChain: string | Network,
        gasValue: BigNumberish
    ) => {
        const factory = network.interchainTokenFactory;

        if (typeof destinationChain === 'string') {
            const destinationNetwork = networks.find((network) => network.name.toLowerCase() == (destinationChain as string).toLowerCase());
            if (destinationNetwork === null) throw new Error(`${destinationChain} is not a registered network.`);
            destinationChain = destinationNetwork as Network;
        }

        await (
            await factory
                .connect(wallet)
                .deployRemoteInterchainTokenWithMinter(salt, distributor, destinationChain.name, distributor, gasValue, { value: gasValue })
        ).wait();

        await relay();

        const tokenId = await factory.interchainTokenId(wallet.address, salt);
        const tokenAddress = await network.interchainTokenService.interchainTokenAddress(tokenId);
        return IInterchainTokenFactory.connect(tokenAddress, destinationChain.provider);
    };
}

export async function registerRemoteITS(networks: Network[]) {
    for (const network of networks) {
        logger.log(`Registerring ITS for ${networks.length} other chain for ${network.name}...`);
        const data = [] as string[];
        for (const otherNetwork of networks) {
            data.push(
                (
                    await network.interchainTokenService.populateTransaction.setTrustedAddress(
                        otherNetwork.name,
                        otherNetwork.interchainTokenService.address
                    )
                ).data as string
            );
        }
        await (await network.interchainTokenService.multicall(data)).wait();
        logger.log(`Done`);
    }
}
