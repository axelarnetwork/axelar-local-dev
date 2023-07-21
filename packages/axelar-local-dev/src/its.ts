import { BigNumberish, Contract, Wallet } from "ethers";
import { IStandardizedToken, IStandardizedToken__factory as IStandardizedTokenFactory, ITokenManager, ITokenManager__factory as TokenManagerFactory} from "./types";
import { Network, networks } from "./Network";
import { relay } from "./relay";

export interface ITS {
    registerCanonicalToken: (tokenAddress: string, wallet?: Wallet) => Promise<ITokenManager>;
    deployRemoteCanonicalToken: (tokenAddress: string, destinationChain: string | Network, gasValue?: BigNumberish, wallet?: Wallet) => Promise<IStandardizedToken>;
    deployCustomTokenManager: {
        lockUnlock: (salt: string, tokenAddress: string, operator?: string, wallet?: Wallet) => Promise<ITokenManager>;
        mintBurn: (salt: string, tokenAddress: string, operator?: string, wallet?: Wallet) => Promise<ITokenManager>;
        liquidityPool: (salt: string, tokenAddress: string, liquidityPool: string, operator?: string, wallet?: Wallet) => Promise<ITokenManager>;
    }
}

export async function setupITS(network: Network) {
    network.its = {} as any;
    network.its.registerCanonicalToken = async (tokenAddress: string, wallet : Wallet = network.ownerWallet) => {
        const service = network.interchainTokenService;
        await (await service.connect(wallet).registerCanonicalToken(tokenAddress)).wait();
        const tokenId = await service.getCanonicalTokenId(tokenAddress);
        const tokenManagerAddress = await service.getTokenManagerAddress(tokenId);
        return TokenManagerFactory.connect(tokenManagerAddress, wallet);
    }

    network.its.deployRemoteCanonicalToken = async (tokenAddress: string, destinationChain: string | Network, gasValue: BigNumberish = BigInt(1e6), wallet: Wallet = network.ownerWallet) => {
        const service = network.interchainTokenService;
        const tokenId = await service.getCanonicalTokenId(tokenAddress);
        if(typeof(destinationChain) === 'string') {
            const destinationNetwork = networks.find(network => network.name.toLowerCase() == (destinationChain as string).toLowerCase());
            if(destinationNetwork === null) throw new Error(`${destinationChain} is not a registered network.`);
            destinationChain = destinationNetwork as Network;
        }
        await (await service.connect(wallet).deployRemoteCanonicalToken(tokenId, destinationChain.name, gasValue, {value: gasValue})).wait();
        
        await relay();

        const standardizedTokenAddress = await service.getStandardizedTokenAddress(tokenId);
        return IStandardizedTokenFactory.connect(standardizedTokenAddress, destinationChain.provider);
    }

    async function deployCustomTokenManager(salt: string, tokenManagerType: Number, params: string, wallet: Wallet = network.ownerWallet) {
        const service = network.interchainTokenService;
        await (await service.connect(wallet).deployCustomTokenManager(salt, tokenManagerType as BigNumberish, params)).wait();
        const tokenId = await service.getCustomTokenId(wallet.address, salt);
        const tokenManagerAddress = await service.getTokenManagerAddress(tokenId);
        return TokenManagerFactory.connect(tokenManagerAddress, wallet);
    }

    network.its.deployCustomTokenManager.lockUnlock = async (salt: string, tokenAddress: string, operator: string = network.ownerWallet.address, wallet: Wallet = network.ownerWallet) => {
        const params = await network.interchainTokenService.getParamsLockUnlock(operator, tokenAddress);
        return await deployCustomTokenManager(salt, 0, params, wallet);
    }
    network.its.deployCustomTokenManager.mintBurn = async (salt: string, tokenAddress: string, operator: string = network.ownerWallet.address, wallet: Wallet = network.ownerWallet) => {
        const params = await network.interchainTokenService.getParamsMintBurn(operator, tokenAddress);
        return await deployCustomTokenManager(salt, 1, params, wallet);
    }
    network.its.deployCustomTokenManager.liquidityPool = async (salt: string, tokenAddress: string, liquidityPool: string, operator: string = network.ownerWallet.address, wallet: Wallet = network.ownerWallet) => {
        const params = await network.interchainTokenService.getParamsLiquidityPool(operator, tokenAddress, liquidityPool);
        return await deployCustomTokenManager(salt, 2, params, wallet);
    }
}