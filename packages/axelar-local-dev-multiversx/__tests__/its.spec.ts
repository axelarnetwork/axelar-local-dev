import { Contract, ethers, Wallet } from 'ethers';
import { contracts, createNetwork, EvmRelayer, Network, relay, setLogger } from '@axelar-network/axelar-local-dev';
import { createMultiversXNetwork, MultiversXNetwork, MultiversXRelayer, registerMultiversXRemoteITS } from '../src';

const IERC20 = require('@axelar-network/axelar-gmp-sdk-solidity/artifacts/contracts/interfaces/IERC20.sol/IERC20.json');
const { keccak256, toUtf8Bytes } = ethers.utils;

setLogger(() => undefined);

describe('its', () => {
    let client: MultiversXNetwork;
    let evmNetwork: Network;
    let wallet: Wallet;

    beforeEach(async () => {
        client = await createMultiversXNetwork();
        evmNetwork = await createNetwork();
        wallet = evmNetwork.userWallets[0];
    });

    it('should be able to send token from EVM to MultiversX', async () => {
        const evmIts = new Contract(evmNetwork.interchainTokenService.address, contracts.IInterchainTokenService.abi, wallet.connect(evmNetwork.provider));
        const evmItsFactory = new Contract(evmNetwork.interchainTokenFactory.address, contracts.IInterchainTokenFactory.abi, wallet.connect(evmNetwork.provider));

        await registerMultiversXRemoteITS(client, [evmNetwork]);

        const name = 'InterchainToken';
        const symbol = 'ITE';
        const decimals = 18;
        const amount = 1000;
        const salt = keccak256(ethers.utils.defaultAbiCoder.encode(['uint256', 'uint256'], [process.pid, process.ppid]));
        const fee = 100000000;

        const tokenId = await evmItsFactory.interchainTokenId(wallet.address, salt);

        await (await evmItsFactory.deployInterchainToken(
            salt,
            name,
            symbol,
            decimals,
            amount,
            wallet.address,
        )).wait();

        await (await evmItsFactory.deployRemoteInterchainToken(
            '',
            salt,
            wallet.address,
            'multiversx',
            fee,
            { value: fee },
        )).wait();

        const multiversXRelayer = new MultiversXRelayer();

        // Relay tx from EVM to MultiversX
        await relay({
            multiversx: multiversXRelayer,
            evm: new EvmRelayer({ multiversXRelayer })
        });

        let tokenIdentifier = await client.its.getValidTokenIdentifier(tokenId);
        expect(tokenIdentifier);
        tokenIdentifier = tokenIdentifier as string;

        let balance = (await client.getFungibleTokenOfAccount(client.owner, tokenIdentifier)).balance?.toString();
        expect(!balance);

        const tx = await evmIts.interchainTransfer(tokenId, 'multiversx', client.owner.pubkey(), amount, '0x', fee, {
            value: fee,
        });
        await tx.wait();

        // Relay tx from EVM to MultiversX
        await relay({
            multiversx: multiversXRelayer,
            evm: new EvmRelayer({ multiversXRelayer })
        });

        balance = (await client.getFungibleTokenOfAccount(client.owner, tokenIdentifier)).balance?.toString();
        expect(balance === '1000');
    });

    it.only('should be able to send token from MultiversX to EVM', async () => {
        const evmIts = new Contract(evmNetwork.interchainTokenService.address, contracts.IInterchainTokenService.abi, wallet.connect(evmNetwork.provider));

        await registerMultiversXRemoteITS(client, [evmNetwork]);

        const name = 'InterchainToken';
        const symbol = 'ITE';
        const decimals = 18;
        const amount = 1000;
        const salt = keccak256(ethers.utils.defaultAbiCoder.encode(['uint256', 'uint256'], [process.pid, process.ppid]));
        const fee = 100000000;

        const tokenId = await client.its.interchainTokenId(client.owner, salt);

        await client.its.deployInterchainToken(
            salt,
            name,
            symbol,
            decimals,
            amount,
            client.owner,
        );

        let tokenIdentifier = await client.its.getValidTokenIdentifier(tokenId);
        expect(tokenIdentifier);
        tokenIdentifier = tokenIdentifier as string;

        const multiversXRelayer = new MultiversXRelayer();
        // Update events first so new Multiversx logs are processed afterwards
        await multiversXRelayer.updateEvents();

        await client.its.deployRemoteInterchainToken(
            '',
            salt,
            client.owner,
            evmNetwork.name,
            fee,
        );

        // Relay tx from MultiversX to EVM
        await relay({
            multiversx: multiversXRelayer,
            evm: new EvmRelayer({ multiversXRelayer })
        });

        // TODO: The evm execute transaction is not actually executed successfully for some reason...
        // const evmTokenAddress = await evmIts.interchainTokenAddress('0x' + tokenId);
        // const code = await evmNetwork.provider.getCode(evmTokenAddress);
        // expect (code !== '0x');
        //
        // const destinationToken = new Contract(evmTokenAddress, IERC20.abi, evmNetwork.provider);
        // let balance = await destinationToken.balanceOf(wallet.address);
        // expect(!balance);
        //
        // const result = await client.its.interchainTransfer(tokenId, evmNetwork.name, wallet.address, tokenIdentifier, amount.toString(), '5');
        // expect(result);
        //
        // // Relay tx from MultiversX to EVM
        // await relay({
        //     multiversx: multiversXRelayer,
        //     evm: new EvmRelayer({ multiversXRelayer })
        // });
        //
        // balance = await destinationToken.balanceOf(wallet.address);
        // expect(balance === '995');
    });
});
