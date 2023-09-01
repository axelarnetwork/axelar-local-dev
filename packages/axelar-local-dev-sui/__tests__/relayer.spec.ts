import { SuiNetwork } from '../src/SuiNetwork';
import { SuiRelayer } from '../src/SuiRelayer';
import path from 'path';
import { ethers } from 'ethers';
import { TransactionBlock } from '@mysten/sui.js/transactions';

describe('relayer', () => {
    let client: SuiNetwork;
    let relayer: SuiRelayer;

    beforeEach(async () => {
        client = new SuiNetwork();
        await client.init();
        relayer = new SuiRelayer(client);

        // initialize commands for testing
        relayer['commands']['avalanche'] = [];
    });

    it('should update command list for sui -> evm call_contract transaction', async () => {
        expect(relayer['commands']['avalanche'].length).toBe(0);

        // Deploy a sample module
        const response = await client.deploy(path.join(__dirname, '../move/sample'));

        const msg = 'hello from sui';
        const payload = ethers.utils.defaultAbiCoder.encode(['string'], [msg]);

        // Send a callContract transaction
        const tx = new TransactionBlock();
        tx.moveCall({
            target: `${response.packages[0].packageId}::hello_world::call`,
            arguments: [tx.pure('avalanche'), tx.pure('0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789'), tx.pure(payload), tx.pure(1)],
        });
        await client.execute(tx);

        // Update callContract events
        await relayer.updateEvents();

        // Check if the command is added to the relayer
        expect(relayer['commands']['avalanche'].length).toBe(1);
    });
});
