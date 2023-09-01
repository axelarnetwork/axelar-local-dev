import { SuiNetwork } from '../src/SuiNetwork';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { toHEX } from '@mysten/bcs';
import path from 'path';

describe('Sui Network', () => {
    let client: SuiNetwork;

    beforeEach(async () => {
        client = new SuiNetwork();
        await client.init();
    });

    it('should deploy a sample module', async () => {
        const response = await client.deploy(path.join(__dirname, '../move/sample'));
        expect(response.packages.length).toBe(client.gatewayObjects.length);
        expect(response.packages[0].packageId).toBe(client.gatewayObjects[0].packageId);
    });

    it('should deploy and execute a function', async () => {
        const response = await client.deploy(path.join(__dirname, '../move/sample'));

        const tx = new TransactionBlock();
        const msg = 'hello from test';
        const msgBytes = new Uint8Array(Buffer.from(msg, 'utf8'));

        tx.moveCall({
            target: `${response.packages[0].packageId}::hello_world::execute`,
            arguments: [tx.pure('0x0'), tx.pure('Avalanche'), tx.pure('0x0'), tx.pure(toHEX(msgBytes))],
        });
        await client.execute(tx);

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

        // query the value
        expect(updatedMessage).toEqual(msg);
    });
});
