import { Contract, ethers } from 'ethers';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { Network, createNetwork, deployContract, EvmRelayer, RelayerType } from '@axelar-network/axelar-local-dev';
import { SuiNetwork, SuiRelayer, initSui } from '@axelar-network/axelar-local-dev-sui';
import path from 'path';

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
        const msg = 'hello from sui';

        const payload = ethers.utils.defaultAbiCoder.encode(['string'], [msg]);

        // Send a callContract transaction
        const tx = new TransactionBlock();
        tx.moveCall({
            target: `${response.packages[0].packageId}::hello_world::call`,
            arguments: [tx.pure(evmChainName), tx.pure(evmContract.address), tx.pure(payload), tx.pure(1)],
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

        // add sibling
        await evmContract.addSibling('sui', `${response.packages[0].packageId}::hello_world`);
        await evmContract.set('sui', 'hello from evm', {
            value: 10000000,
        });

        await evmRelayer.relay();

        const { data } = await client.queryEvents({
            query: {
                MoveModule: {
                    module: `hello_world`,
                    package: response.packages[0].packageId,
                },
            },
            limit: 1,
        });

        const updatedMessage = (data[0].parsedJson as any).updated_message;

        expect(updatedMessage).toEqual('hello from evm');
    });
});
