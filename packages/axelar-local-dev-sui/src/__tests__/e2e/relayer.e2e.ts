import { EvmRelayer, RelayerType, createNetwork, deployContract, setLogger, stopAll } from '@axelar-network/axelar-local-dev';
import { TxBuilder } from '@axelar-network/axelar-cgp-sui';
import { arrayify, defaultAbiCoder } from 'ethers/lib/utils';
import type { Contract } from 'ethers';

import { SuiNetwork } from '../../SuiNetwork';
import { SuiRelayer } from '../../SuiRelayer';

// Reuses core's Executable rather than shipping a duplicate test contract:
// it is the same AxelarExecutable the deleted package carried, already built.
const Executable = require('@axelar-network/axelar-local-dev/src/artifacts/src/contracts/test/Executable.sol/Executable.json');

setLogger(() => null);

/**
 * The full round trip against a real EVM chain. Excluded from CI by the
 * spec/e2e split: the EVM -> Sui half is already covered without anvil in
 * SuiRelayer.spec.ts, and this adds a second runtime's start-up cost.
 */
describe('Sui <-> EVM relay', () => {
    let sui: SuiNetwork;
    let suiRelayer: SuiRelayer;
    let evmRelayer: EvmRelayer;
    let evm: any;
    let executable: Contract;

    beforeAll(async () => {
        sui = new SuiNetwork();
        await sui.init();
        suiRelayer = new SuiRelayer(sui);

        evm = await createNetwork({ name: 'Avalanche' });
        executable = await deployContract(evm.userWallets[0], Executable, [evm.gateway.address, evm.gasService.address]);

        evmRelayer = new EvmRelayer();
        evmRelayer.setRelayer(RelayerType.Sui, suiRelayer);

        await executable.addSibling('sui', sui.sample.channelAddress);
    }, 900000);

    afterAll(async () => {
        await sui?.stop();
        await stopAll();
    });

    it('relays EVM -> Sui', async () => {
        const message = 'hello sui from avalanche';

        await (await executable.set('sui', message, { value: BigInt(1e16) })).wait();
        await evmRelayer.relay();

        const events = await sui.client.queryEvents({
            query: { MoveEventType: `${sui.sample.packageId}::gmp::Executed` },
            order: 'descending',
            limit: 1,
        });

        expect(events.data.length).toBe(1);
        expect(Buffer.from((events.data[0].parsedJson as any).payload).toString('utf8')).toContain(message);
    }, 600000);

    it('relays Sui -> EVM', async () => {
        const message = 'hello avalanche from sui';
        // Executable._execute abi.decodes a string, so raw utf8 bytes would
        // revert inside the executable - and executeEvmExecutable swallows that,
        // leaving the value silently unchanged.
        const payload = arrayify(defaultAbiCoder.encode(['string'], [message]));

        // Built through cgp-sui's TxBuilder rather than a raw Transaction: it
        // encodes each argument from the on-chain Move signature, so plain
        // values work and the test does not depend on @mysten/sui subpath types
        // resolving the same way under tsc and ts-jest.
        const builder = new TxBuilder(sui.client);
        // Cast because ts-jest resolves @mysten/sui's subpath types differently
        // from tsc - under ts-jest, Transaction comes back without moveCall and
        // with a 0-arg splitCoins. The runtime is correct either way.
        const [coin] = (builder.tx as any).splitCoins(builder.tx.gas, [1_000_000]);

        await builder.moveCall({
            target: `${sui.sample.packageId}::gmp::send_call`,
            arguments: [
                sui.sample.singletonId,
                sui.gatewayId,
                sui.gasServiceId,
                'Avalanche',
                executable.address,
                payload,
                sui.getExecutorAddress(),
                coin,
            ] as any,
        });

        await builder.signAndExecute(sui.deployer, { showEvents: true });

        await suiRelayer.relay();

        expect(await executable.value()).toBe(message);
    }, 600000);
});
