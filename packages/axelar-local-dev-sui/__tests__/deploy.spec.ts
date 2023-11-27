import { SuiNetwork } from '../src/SuiNetwork';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import path from 'path';

describe('Sui Network', () => {
    let client: SuiNetwork;

    beforeEach(async () => {
        client = new SuiNetwork();
        await client.init();
    });

    it('should deploy a sample module', async () => {
        const response = await client.deploy(path.join(__dirname, '../move/sample'));

        expect(response.packages.length).toBe(1);
    });

    it('should deploy and execute a function', async () => {
        const response = await client.deploy(path.join(__dirname, '../move/sample'));
        const packageId = response.packages[0].packageId;
        const singleton: any = response.publishTxn.objectChanges?.find((change) => (change as any).objectType === `${packageId}::test::Singleton` )
        
        const tx = new TransactionBlock();
        const msg = 'hello from test';

        tx.moveCall({
            target: `${response.packages[0].packageId}::test::send_call`,
            arguments: [tx.object(singleton.objectId), tx.pure('Avalanche'), tx.pure('0x0'), tx.pure(msg)],
        });
        await client.execute(tx);

        const { data } = await client.queryEvents({
            query: {
                MoveModule: {
                    module: `test`,
                    package: packageId,
                },
            },
            limit: 1,
        });

        const event = (data[0].parsedJson as any);

        expect(event.destination_chain).toEqual('Avalanche');
        expect(event.destination_address).toEqual('0x0');
        expect(String.fromCharCode(...event.payload)).toEqual(msg);
    });
});
