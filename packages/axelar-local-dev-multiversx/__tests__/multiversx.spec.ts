import path from 'path';
import { ethers } from 'ethers';
import { createNetwork, deployContract, EvmRelayer, Network, relay, setLogger } from '@axelar-network/axelar-local-dev';
import HelloWorld from '../artifacts/__tests__/contracts/HelloWorld.sol/HelloWorld.json';
import { createMultiversXNetwork, MultiversXNetwork, MultiversXRelayer } from '../src';
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

    beforeEach(async () => {
        client = await createMultiversXNetwork();
        evmNetwork = await createNetwork();
    });

    it('should be able to relay tx from EVM to MultiversX', async () => {
        // Deploy multiversx contract
        const contractCode = path.join(__dirname, 'contracts/hello-world.wasm');

        const contractAddress = await client.deployContract(contractCode, [
            new AddressValue(client.gatewayAddress as Address),
            new AddressValue(client.gasReceiverAddress as Address)
        ]);

        // Deploy EVM contract
        const helloWorld = await deployContract(evmNetwork.userWallets[0], HelloWorld, [
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
        const helloWorld = await deployContract(evmNetwork.userWallets[0], HelloWorld, [
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
});
