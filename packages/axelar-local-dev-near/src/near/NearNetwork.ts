import { ethers, Wallet } from 'ethers';
import { arrayify, defaultAbiCoder, keccak256 } from 'ethers/lib/utils';
import { ClientConfig, Config, JsonRpcProvider, NEAR, NearAccount, SandboxServer, TransactionResult, Worker } from 'near-workspaces';
import { logger } from '@axelar-network/axelar-local-dev';
import path from 'path';
import { Command } from '../relay/Command';

/* Defining the structure of the NearEvent object based on NEP-297 standard (Events Format - https://nomicon.io/Standards/EventsFormat) */
export interface NearEvent {
    data: any;
    event: string;
    standard: string;
    version: string;
}

export class NearNetwork extends Worker {
    public gatewayAccount!: NearAccount;

    private operatorWallet!: Wallet;

    static logs: NearEvent[] = [];

    private server!: SandboxServer;

    /**
     * It stops the NEAR sandbox worker.
     */
    async stopNetwork() {
        await this.tearDown();
        logger.log('Near Network Stopped');
    }

    /**
     * It creates a new account called `near_axelar_auth_gateway` and deploys the `axelar_auth_gateway`
     * contract to it
     */
    async deployAxelarFrameworkModules() {
        logger.log('Deploying Axelar Framework Modules');

        this.operatorWallet = Wallet.createRandom();

        const wasmFilePath = path.join(path.resolve(__dirname), './contracts/axelar_cgp_near.wasm');

        this.gatewayAccount = await this.createAccountAndDeployContract('axelar_cgp_near', wasmFilePath, 200);

        const operators = ethers.utils.defaultAbiCoder.encode(
            ['address[]', 'uint256[]', 'uint256'],
            [[this.operatorWallet.address], [1], 1]
        );

        await this.gatewayAccount.call(this.gatewayAccount, 'new', {
            recent_operators: [operators],
        });

        logger.log('Axelar Framework Modules deployed');
    }

    /**
     * IMPORTANT NOTE: This function is the only one that should be used to call a contract method.
     * It calls a contract method, and returns the transaction result. It also logs any events emitted by the contract and passes them so that they can be used by the relay.
     * @param {NearAccount} account - NearAccount - The account that will be used to call the contract.
     * @param {NearAccount} contract - The name of the contract you want to call.
     * @param {string} method - The name of the method you want to call
     * @param {any} args - any - the arguments to pass to the contract method
     * @param [amount=0] - The amount of tokens to send with the transaction.
     * @returns The transaction result.
     */
    async callContract(account: NearAccount, contract: NearAccount, method: string, args: any, amount = 0): Promise<TransactionResult> {
        const tx = await account.callRaw(contract, method, args, { attachedDeposit: NEAR.parse(`${amount}`) });

        const events = tx.result.receipts_outcome
            .map((receipt) => receipt.outcome.logs.map((log) => log))
            .flatMap((log) => log)
            .filter((log) => log.includes('axelar_near'))
            .map((event) => JSON.parse(event.slice(11)));

        if (events.length > 0) {
            NearNetwork.logs.push(...events);
        }

        return tx;
    }

    /**
     * It creates a new account, and deploys a contract to it
     * @param {string} accountId - The name of the account you want to create.
     * @param {string} contractWasmPath - The path to the compiled contract.
     * @param [nearAmount=200] - The amount of NEAR tokens to give the account.
     * @returns The account/contract object
     */
    async createAccountAndDeployContract(accountId: string, contractWasmPath: string, nearAmount = 200) {
        const root = this.rootAccount;
        const account = await root.createSubAccount(accountId, {
            initialBalance: NEAR.parse(`${nearAmount} N`).toJSON(),
        });
        await account.deploy(contractWasmPath);
        return account;
    }

    /**
     * It takes an array of commands, encodes them, signs them, and then calls the `execute` function
     * on the gateway contract (NEAR)
     * @param {Command[]} commands - Command[] - An array of commands to be executed.
     * @returns The result of the execution of the command.
     */
    async executeGateway(commands: Command[]) {
        const data = arrayify(
            defaultAbiCoder.encode(
                ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
                [0, commands.map((com) => com.commandId), commands.map((com) => com.name), commands.map((com) => com.encodedData)]
            )
        );

        const signature = await this.operatorWallet.signMessage(arrayify(keccak256(data)));

        const signData = defaultAbiCoder.encode(
            ['address[]', 'uint256[]', 'uint256', 'bytes[]'],
            [[this.operatorWallet.address], [1], 1, [signature]]
        );

        const input = defaultAbiCoder.encode(['bytes', 'bytes'], [data, signData]);

        const result = await this.gatewayAccount.callRaw(
            this.gatewayAccount,
            'execute',
            {
                input,
            },
            { attachedDeposit: '0' }
        );

        return result;
    }

    /**
     * It executes a command on the destination chain (NEAR).
     * @param {string} commandId - The command ID that you want to execute.
     * @param {string} destinationNearAccountId - The account ID of the contract that we want to call.
     * @param {string} sourceChain - The chain that the command is being executed on.
     * @param {string} sourceAddress - The address of the account that is sending the command.
     * @param {string} payload - The payload of the command.
     * @returns The transaction result.
     */
    async executeRemote(
        commandId: string,
        destinationNearAccountId: string,
        sourceChain: string,
        sourceAddress: string,
        payload: string
    ): Promise<TransactionResult> {
        const tx = await this.gatewayAccount.callRaw(
            destinationNearAccountId,
            'execute',
            {
                command_id: commandId,
                source_chain: sourceChain,
                source_address: sourceAddress,
                payload,
            },
            { attachedDeposit: '0' }
        );

        return tx;
    }

    // NEAR Events
    /**
     *  This function returns an array of NearEvent objects for 'contract_call_event' event
     *  Event example: {"standard":"axelar_near","version":"1.0.0","event":"contract_call_event","data":{"address":"axelar_auth_weighted.test.near","destination_chain":"Polygon","destination_contract_address":"0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88","payload_hash":"0xcead85dcdfcdc3f9aa5aa82658669488859283d53026229b179f017824d15a1f","payload":"0x00000000000000000000000070997970c51812dc3a010c7d01b50e0d17dc79c80000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc"}}
     * @returns An array of NearEvent objects.
     */
    queryContractCallEvents(): NearEvent[] {
        return NearNetwork.logs.filter((el) => el.event == 'contract_call_event');
    }

    /**
     * IMPORTANT NOTE: This function is not implemented yet, just returns an empty array.
     * `queryPayGasContractCallEvents()` returns an array of NearEvent objects for 'pay_gas_contract_call_event' event
     * @returns An empty array.
     */
    queryPayGasContractCallEvents(): NearEvent[] {
        return [];
    }

    // near-workspaces-js Sandbox Worker implementation

    /**
     * This function initializes a new NearNetwork object with the given configuration, starts a new
     * SandboxServer, and initializes the manager
     * @param config - Partial<Config>
     * @returns A promise that resolves to a NearNetwork object.
     */
    static async init(config: Partial<Config>): Promise<NearNetwork> {
        const defaultConfig = await this.defaultConfig();
        const worker = new NearNetwork({ ...defaultConfig, ...config });
        worker.server = await SandboxServer.init(worker.config);
        await worker.server.start();
        await worker.manager.init();
        return worker;
    }

    /**
     * It returns a promise that resolves to a configuration object
     * @returns The default configuration for the sandbox server.
     */
    static async defaultConfig(): Promise<Config> {
        const port = await SandboxServer.nextPort();
        return {
            ...this.clientConfig,
            homeDir: SandboxServer.randomHomeDir(),
            port,
            rm: false,
            refDir: null,
            rpcAddr: `http://localhost:${port}`,
        };
    }

    /**
     * It returns a JsonRpcProvider object.
     * @returns A JsonRpcProvider object.
     */
    get provider(): JsonRpcProvider {
        return JsonRpcProvider.from(this.rpcAddr);
    }

    /**
     * The `tearDown()` function closes the server
     */
    async tearDown(): Promise<void> {
        try {
            await this.server.close();
        } catch (error: unknown) {
            console.log('this.server.close() threw error.', JSON.stringify(error, null, 2));
        }
    }

    private static get clientConfig(): ClientConfig {
        return {
            network: 'sandbox',
            rootAccountId: 'test.near',
            rpcAddr: '', // Will be over written
            initialBalance: NEAR.parse('100 N').toJSON(),
        };
    }

    private get rpcAddr(): string {
        return `http://localhost:${this.config.port}`;
    }
}
