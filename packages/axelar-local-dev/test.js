const { createNetwork, relay } = require('./dist');
const { utils: { keccak256 }, Contract } = require('ethers');
const IStandardizedToken = require('./dist/artifacts/@axelar-network/interchain-token-service/contracts/token-implementations/StandardizedTokenLockUnlock.sol/StandardizedTokenLockUnlock.json')
const ITokenManager = require('./dist/artifacts/@axelar-network/interchain-token-service/contracts/token-manager/implementations/TokenManagerMintBurn.sol/TokenManagerMintBurn.json')

const name = 'Token Name';
const symbol = 'TN';
const decimals = 0;
const salt = keccak256('0x');

(async () => {
    const network1 = await createNetwork();
    const network2 = await createNetwork();
    const tokenId = await network1.interchainTokenService.getCustomTokenId(network1.ownerWallet.address, salt);
    const tokenManagerAddress = await network1.interchainTokenService.getTokenManagerAddress(tokenId);
    const tokenAddress = await network1.interchainTokenService.getStandardizedTokenAddress(tokenId);
    await network1.interchainTokenService.deployAndRegisterStandardizedToken(salt, name, symbol, decimals, 123, network1.ownerWallet.address);
    await network2.interchainTokenService.deployAndRegisterStandardizedToken(salt, name, symbol, decimals, 0, tokenManagerAddress);
    const token1 = new Contract(tokenAddress, IStandardizedToken.abi, network1.ownerWallet);
    const token2 = new Contract(tokenAddress, IStandardizedToken.abi, network2.ownerWallet);
    const tokenManager1 = new Contract(tokenManagerAddress, ITokenManager.abi, network1.ownerWallet);
    const tokenManager2 = new Contract(tokenManagerAddress, ITokenManager.abi, network2.ownerWallet);
    async function print() {
        console.log(
            Number(await token1.balanceOf(network1.ownerWallet.address)),
            Number(await token2.balanceOf(network2.ownerWallet.address)),
        );
    }
    await print();

    await token1.interchainTransfer(network2.name, network2.ownerWallet.address, 123, '0x', {value: 1e6});
    await print();
    await relay();
    await print();

    await tokenManager2.sendToken(network1.name, network1.ownerWallet.address, 123, '0x', {value: 1e6});
    await print();
    await relay();
    await print();

    await token1.approve(tokenManagerAddress, 123);
    await tokenManager1.sendToken(network2.name, network2.ownerWallet.address, 123, '0x', {value: 1e6});
    await print();
    await relay();
    await print();

    const tokenManager = await network2.its.registerCanonicalToken(token2.address);
    const token = await network2.its.deployRemoteCanonicalToken(token2.address, network1);

    await token2.approve(tokenManager.address, 123);
    await tokenManager.connect(network2.ownerWallet).sendToken(network1.name, network1.ownerWallet.address, 123, '0x', {value: 1e6});

    async function print2() {
        console.log(
            Number(await token.balanceOf(network1.ownerWallet.address)),
            Number(await token2.balanceOf(network2.ownerWallet.address)),
        );
    }

    await print2();
    await relay();
    await print2();

    await token.connect(network1.ownerWallet).interchainTransfer(network2.name, network2.ownerWallet.address, 123, '0x', {value: 1e6});

    await print2();
    await relay();
    await print2();

    
})();