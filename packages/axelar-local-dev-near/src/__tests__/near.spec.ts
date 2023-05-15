import path from 'path';
import { Contract, Wallet } from 'ethers';
import { NearAccount } from 'near-workspaces';
import { NearRelayer } from '../relay/NearRelayer';
import { createNearNetwork, NearNetwork } from '..';
import { Network, createNetwork, stopAll, deployContract, relay } from '@axelar-network/axelar-local-dev';
import { EvmRelayer } from '@axelar-network/axelar-local-dev/dist/relay/EvmRelayer';

jest.setTimeout(120000);

describe('near', () => {
    let client: NearNetwork;

    afterEach(async () => {
        stopAll();

        if (client) {
            await client.stopNetwork();
        }
    });

    it('should be able to deploy axelar framework modules', async () => {
        client = await createNearNetwork();

        expect(client).toBeDefined();
    });
});

describe('relay', () => {
    let nearClient: NearNetwork;
    let evmClient: Network;

    let evmUser: Wallet;

    afterEach(async () => {
        stopAll();

        if (nearClient) {
            await nearClient.stopNetwork();
        }
    });

    beforeEach(async () => {
        nearClient = await createNearNetwork();
        evmClient = await createNetwork();

        evmUser = evmClient.userWallets[0];
    });

    describe('near to evm - evm to near', () => {
        let nearContract: NearAccount;
        let evmContract: Contract;

        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Executable = require('../../artifacts/src/contracts/test/Executable.sol/Executable.json');

        const nearWasmFilePath = path.join(path.resolve(__dirname), '../contracts/test/near_axelar_contract_call_example.wasm');

        beforeEach(async () => {
            nearContract = await nearClient.createAccountAndDeployContract('near_axelar_example_contract_call', nearWasmFilePath, 200);

            await nearContract.call(
                nearContract,
                'new',
                {
                    gateway_account_id: nearClient.gatewayAccount.accountId,
                },
                { attachedDeposit: '0' }
            );

            evmContract = await deployContract(evmUser, Executable, [evmClient.gateway.address, evmClient.gasService.address]);
            await await evmContract.connect(evmUser).addSibling('near', nearContract.accountId);
        });

        it('should be able to relay a transaction from EVM to NEAR', async () => {
            const value = 'Hello from Eth!';
            await (await evmContract.connect(evmUser).set('near', value)).wait();

            const nearRelayer = new NearRelayer();
            await relay({ near: nearRelayer, evm: new EvmRelayer({ nearRelayer }) });

            const nearValue = await nearContract.view('get_value', {});

            const nearContractSourceChain = await nearContract.view('get_source_chain', {});
            const nearContractSourceAddress = await nearContract.view('get_source_address', {});

            expect(nearValue).toBe(value);
            expect(nearContractSourceChain).toBe(evmClient.name);
            expect(nearContractSourceAddress).toBe(evmContract.address);
        });

        it('should be able to relay a transaction from NEAR to EVM', async () => {
            const chain = evmClient.name;
            const destinationAddress = evmContract.address;
            const value = 'Hello from Near!';

            await nearClient.callContract(
                nearContract,
                nearContract,
                'set',
                {
                    chain,
                    destination_address: destinationAddress,
                    value,
                },
                0
            );

            await relay({
                near: new NearRelayer(),
            });

            expect(await evmContract.value()).toBe(value);
            expect(await evmContract.sourceChain()).toBe('near');
            expect(await evmContract.sourceAddress()).toBe(nearContract.accountId);
        });
    });
});
