import path from 'path';
import { Contract, ethers, Wallet } from 'ethers';
import { contracts, createNetwork, deployContract, EvmRelayer, Network, relay, setLogger } from '@axelar-network/axelar-local-dev';
import HelloWorld from '../artifacts/__tests__/contracts/HelloWorld.sol/HelloWorld.json';
import { createMultiversXNetwork, MultiversXNetwork, MultiversXRelayer, registerMultiversXRemoteITS } from '../src';
import {
    Address,
    AddressValue,
    BinaryCodec,
    BytesType,
    BytesValue,
    ContractFunction,
    ResultsParser,
    SmartContract,
    StringType,
    StringValue,
    TupleType
} from '@multiversx/sdk-core/out';

const { keccak256, toUtf8Bytes } = ethers.utils;

setLogger(() => undefined);

describe('multiversx', () => {
    let client: MultiversXNetwork;
    let evmNetwork: Network;
    let wallet: Wallet;

    beforeAll(async () => {
        client = await createMultiversXNetwork();
    });

    beforeEach(async () => {
        evmNetwork = await createNetwork();
        wallet = evmNetwork.userWallets[0];
    });

    it('should be able to relay tx from EVM to MultiversX', async () => {
        // Deploy multiversx contract
        const contractCode = path.join(__dirname, 'contracts/hello-world.wasm');

        const contractAddress = await client.deployContract(contractCode, [
            new AddressValue(client.gatewayAddress as Address),
            new AddressValue(client.gasReceiverAddress as Address)
        ]);

        // Deploy EVM contract
        const helloWorld = await deployContract(wallet, HelloWorld, [
            evmNetwork.gateway.address,
            evmNetwork.gasService.address
        ]);

        // Send tx from EVM to Multiversx
        const msg = 'Hello Multiversx From EVM!';
        await helloWorld.setRemoteValue('multiversx', contractAddress, msg, { value: ethers.utils.parseEther('0.1') });

        const multiversXRelayer = new MultiversXRelayer();

        // Relay tx from EVM to MultiversX
        await relay({
            multiversx: multiversXRelayer,
            evm: new EvmRelayer({ multiversXRelayer })
        });

        const result = await client.callContract(contractAddress, 'received_value');
        const parsedResult = new ResultsParser().parseUntypedQueryResponse(result);
        expect(parsedResult?.values?.[0]);

        const decoded = new BinaryCodec().decodeTopLevel(
            parsedResult.values[0],
            new TupleType(new StringType(), new StringType(), new BytesType())
        ).valueOf();
        const message = decoded.field2.toString();

        expect(message).toEqual(msg);
    });

    it('should be able to relay tx from Multiversx to Evm', async () => {
        // Deploy multiversx contract
        const contractCode = path.join(__dirname, 'contracts/hello-world.wasm');

        const contractAddress = await client.deployContract(contractCode, [
            new AddressValue(client.gatewayAddress as Address),
            new AddressValue(client.gasReceiverAddress as Address)
        ]);

        // Deploy EVM contract
        const helloWorld = await deployContract(wallet, HelloWorld, [
            evmNetwork.gateway.address,
            evmNetwork.gasService.address
        ]);

        const multiversXRelayer = new MultiversXRelayer();
        // Update events first so new Multiversx logs are processed afterwards
        await multiversXRelayer.updateEvents();

        const msg = 'Hello EVM From Multiversx!';
        const messageEvm = ethers.utils.defaultAbiCoder.encode(['string'], [msg]).substring(2);
        const contract = new SmartContract({ address: Address.fromBech32(contractAddress) });
        const transaction = contract.call({
            caller: client.owner,
            func: new ContractFunction('setRemoteValue'),
            gasLimit: 20_000_000,
            args: [
                new StringValue(evmNetwork.name),
                new StringValue(helloWorld.address),
                new BytesValue(Buffer.from(messageEvm, 'hex'))
            ],
            value: 20_000_000,
            chainID: 'localnet'
        });
        transaction.setNonce(client.ownerAccount.getNonceThenIncrement());

        const returnCode = await client.signAndSendTransaction(transaction);

        expect(returnCode.isSuccess());

        await relay({
            multiversx: multiversXRelayer,
            evm: new EvmRelayer({ multiversXRelayer })
        });

        const evmMessage = await helloWorld.value();
        expect(evmMessage).toEqual(msg);
    });

    it('should be able to approve contract call', async () => {
        const payloadHash = ethers.utils.randomBytes(32);
        const args = [
            'ethereum',
            '0xD62F0cF0801FAC878F66ebF316AB42DED01F25D8',
            'erd1qqqqqqqqqqqqqpgqlz32muzjtu40pp9lapy35n0cvrdxll47d8ss9ne0ta'
        ];
        const tx = await client.executeGateway(
            'approveContractCall',
            Buffer.from(ethers.utils.randomBytes(32)).toString('hex'),
            args[0],
            args[1],
            args[2],
            Buffer.from(payloadHash).toString('hex')
        );
        expect(tx).toBeTruthy();
    });

    it('should be able to call contract execute', async () => {
        const contractCode = path.join(__dirname, 'contracts/hello-world.wasm');

        const contractAddress = await client.deployContract(contractCode, [
            new AddressValue(client.gatewayAddress as Address),
            new AddressValue(client.gasReceiverAddress as Address)
        ]);

        const commandId = Buffer.from(ethers.utils.randomBytes(32)).toString('hex');
        const toSend = 'Hello Test World!';
        const payload = toUtf8Bytes(toSend);
        const payloadHash = keccak256(payload).substring(2);
        const args = [
            'ethereum',
            '0xD62F0cF0801FAC878F66ebF316AB42DED01F25D8',
            contractAddress
        ];
        const approveTx = await client.executeGateway(
            'approveContractCall',
            commandId,
            args[0],
            args[1],
            args[2],
            payloadHash
        );
        expect(approveTx).toBeTruthy();

        const tx = await client.executeContract(
            commandId,
            contractAddress,
            args[0],
            args[1],
            Buffer.from(payload).toString('hex')
        );
        expect(tx).toBeTruthy();

        const result = await client.callContract(contractAddress, 'received_value');
        const parsedResult = new ResultsParser().parseUntypedQueryResponse(result);
        expect(parsedResult?.values?.[0]);

        const decoded = new BinaryCodec().decodeTopLevel(
            parsedResult.values[0],
            new TupleType(new StringType(), new StringType(), new BytesType())
        ).valueOf();
        const message = decoded.field2.toString();

        expect(message).toEqual(toSend);
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

    // it('should be able to send token from MultiversX to EVM', async () => {
    //     const evmIts = new Contract(evmNetwork.interchainTokenService.address, contracts.IInterchainTokenService.abi, wallet.connect(evmNetwork.provider));
    //
    //     await registerMultiversXRemoteITS(client, [evmNetwork]);
    //
    //     const name = 'InterchainToken';
    //     const symbol = 'ITE';
    //     const decimals = 18;
    //     const amount = 1000;
    //     const salt = keccak256(ethers.utils.defaultAbiCoder.encode(['uint256', 'uint256'], [process.pid, process.ppid]));
    //     const fee = 100000000;
    //
    //     const tokenId = await client.its.interchainTokenId(client.owner, salt);
    //
    //     await client.its.deployInterchainToken(
    //         salt,
    //         name,
    //         symbol,
    //         decimals,
    //         amount,
    //         client.owner,
    //     );
    //
    //     let tokenIdentifier = await client.its.getValidTokenIdentifier(tokenId);
    //     expect(tokenIdentifier);
    //     tokenIdentifier = tokenIdentifier as string;
    //
    //     const multiversXRelayer = new MultiversXRelayer();
    //     // Update events first so new Multiversx logs are processed afterwards
    //     await multiversXRelayer.updateEvents();
    //
    //     await client.its.deployRemoteInterchainToken(
    //         '',
    //         salt,
    //         client.owner,
    //         evmNetwork.name,
    //         fee,
    //     );
    //
    //     // Relay tx from MultiversX to EVM
    //     await relay({
    //         multiversx: multiversXRelayer,
    //         evm: new EvmRelayer({ multiversXRelayer })
    //     });
    //
    //     // TODO: The evm execute transaction is not actually executed successfully for some reason...
    //     // const evmTokenAddress = await evmIts.interchainTokenAddress('0x' + tokenId);
    //     // const code = await evmNetwork.provider.getCode(evmTokenAddress);
    //     // expect (code !== '0x');
    //     //
    //     // const destinationToken = new Contract(evmTokenAddress, IERC20.abi, evmNetwork.provider);
    //     // let balance = await destinationToken.balanceOf(wallet.address);
    //     // expect(!balance);
    //     //
    //     // const result = await client.its.interchainTransfer(tokenId, evmNetwork.name, wallet.address, tokenIdentifier, amount.toString(), '5');
    //     // expect(result);
    //     //
    //     // // Relay tx from MultiversX to EVM
    //     // await relay({
    //     //     multiversx: multiversXRelayer,
    //     //     evm: new EvmRelayer({ multiversXRelayer })
    //     // });
    //     //
    //     // balance = await destinationToken.balanceOf(wallet.address);
    //     // expect(balance === '995');
    // });
});
