import { Contract, ethers } from 'ethers';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { Network, createNetwork, deployContract, EvmRelayer, RelayerType, evmRelayer } from '@axelar-network/axelar-local-dev';
import { SuiNetwork, SuiRelayer, initSui } from '@axelar-network/axelar-local-dev-sui';
import path from 'path';
const { arrayify } = ethers.utils;

describe('e2e', () => {
    let client: SuiNetwork;
    let relayer: SuiRelayer;
    let evmNetwork: Network;
    let evmContract: Contract;
    const evmChainName = 'Avalanche';
    const Executable = require('../artifacts/contracts/TestExecutable.sol/TestExecutable.json');

    beforeEach(async () => {
        const response = await initSui();
        client = response.suiNetwork;
        relayer = response.suiRelayer;

        evmNetwork = await createNetwork({
            name: evmChainName,
        });
    });

    it('should be able to relay from sui to evm', async () => {
        // deploy a contract on Avalanche
        evmContract = await deployContract(evmNetwork.userWallets[0], Executable, [
            evmNetwork.gateway.address,
            evmNetwork.gasService.address,
        ]);

        console.log('Deployed contract on Avalanche: ', evmContract.address);

        // Deploy a sample module
        const response = await client.deploy(path.join(__dirname, '../move/sample'));
        const packageId = response.packages[0].packageId;
        const singleton: any = response.publishTxn.objectChanges?.find((change) => (change as any).objectType === `${packageId}::test::Singleton` )
        
        const msg = 'hello from sui';

        const payload = ethers.utils.defaultAbiCoder.encode(['string'], [msg]);

        // Send a callContract transaction
        const tx = new TransactionBlock();
        tx.moveCall({
            target: `${response.packages[0].packageId}::test::send_call`,
            arguments: [tx.object(singleton.objectId), tx.pure(evmChainName), tx.pure(evmContract.address), tx.pure(String.fromCharCode(...arrayify(payload)))],
        });
        await client.execute(tx);

        await relayer.relay();

        const updatedMsg = await evmContract.value();
        expect(updatedMsg).toEqual(msg);
    });

    it('should be able to relay from evm to sui', async () => {
        const evmRelayer = new EvmRelayer();
        evmRelayer.setRelayer(RelayerType.Sui, relayer);

        // deploy a contract on Avalanche
        evmContract = await deployContract(evmNetwork.userWallets[0], Executable, [
            evmNetwork.gateway.address,
            evmNetwork.gasService.address,
        ]);

        // Deploy a sample module
        const response = await client.deploy(path.join(__dirname, '../move/sample'));
        const packageId = response.packages[0].packageId;
        const singleton: any = response.publishTxn.objectChanges?.find((change) => (change as any).objectType === `${packageId}::test::Singleton` )
        
        const singletonFields: any = await client.getObject({
            id: singleton.objectId,
            options: {
                showContent: true,
            }

        });

        let tx = new TransactionBlock();
        tx.moveCall({
            target: `${packageId}::test::register_transaction`,
            arguments: [tx.object(client.axelarDiscoveryId), tx.object(singleton.objectId)],
        });
        await client.execute(tx);

        // add sibling
        await evmContract.addSibling('sui', singletonFields.data.content.fields.channel.fields.id.id);
        await evmContract.set('sui', 'hello from evm', {
            value: 10000000,
        });

        await evmRelayer.relay();

        const { data } = await client.queryEvents({
            query: {
                MoveModule: {
                    module: `test`,
                    package: packageId,
                },
            },
            limit: 1,
        });

        const updatedMessage = (data[0].parsedJson as any).data;

        expect(String.fromCharCode(...updatedMessage)).toEqual('hello from evm');
    });
});
