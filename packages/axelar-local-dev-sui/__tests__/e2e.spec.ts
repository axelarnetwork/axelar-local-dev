import { SuiNetwork } from '../src/SuiNetwork';
import { SuiRelayer } from '../src/SuiRelayer';
import { Contract, ethers } from 'ethers';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { Network, createNetwork, deployContract } from '@axelar-network/axelar-local-dev';
import { EvmRelayer } from '@axelar-network/axelar-local-dev/dist/relay/EvmRelayer';
import path from 'path';

describe('e2e', () => {
    let client: SuiNetwork;
    let relayer: SuiRelayer;
    let evmNetwork: Network;
    let evmContract: Contract;
    const Executable = require('../../axelar-local-dev/src/artifacts/src/contracts/test/Executable.sol/Executable.json');

    beforeEach(async () => {
        client = new SuiNetwork();
        await client.init();
        relayer = new SuiRelayer(client);

        evmNetwork = await createNetwork({
            name: 'avalanche',
        });
    });

    it('should be able to relay from sui to evm', async () => {
        // deploy a contract on avalanche
        evmContract = await deployContract(evmNetwork.userWallets[0], Executable, [
            evmNetwork.gateway.address,
            evmNetwork.gasService.address,
        ]);

        console.log('Deployed contract on avalanche: ', evmContract.address);

        // Deploy a sample module
        const response = await client.deploy(path.join(__dirname, '../move/sample'));
        const msg = 'hello from sui';

        const payload = ethers.utils.defaultAbiCoder.encode(['string'], [msg]);

        // Send a callContract transaction
        const tx = new TransactionBlock();
        tx.moveCall({
            target: `${response.packages[0].packageId}::hello_world::call`,
            arguments: [tx.pure('avalanche'), tx.pure(evmContract.address), tx.pure(payload), tx.pure(1)],
        });
        await client.execute(tx);

        await relayer.relay();

        const updatedMsg = await evmContract.value();
        expect(updatedMsg).toEqual(msg);
    });

    it('should be able to relay from evm to sui', async () => {
        const evmRelayer = new EvmRelayer({
            suiRelayer: relayer,
        });

        // deploy a contract on avalanche
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
