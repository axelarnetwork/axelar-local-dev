import { ethers, Wallet } from 'ethers';
import { arrayify, defaultAbiCoder, keccak256 } from 'ethers/lib/utils';
import { ClientConfig, Config, JsonRpcProvider, NEAR, NearAccount, SandboxServer, TransactionResult, Worker } from 'near-workspaces';
import path from 'path';
import { Command } from '../relay/Command';
import { logger } from '../utils';

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

    static async init(config: Partial<Config>): Promise<NearNetwork> {
        const defaultConfig = await this.defaultConfig();
        const worker = new NearNetwork({ ...defaultConfig, ...config });
        worker.server = await SandboxServer.init(worker.config);
        await worker.server.start();
        await worker.manager.init();
        return worker;
    }

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

    get provider(): JsonRpcProvider {
        return JsonRpcProvider.from(this.rpcAddr);
    }

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

    async stopNetwork() {
        await this.tearDown();
        logger.log('Near Network Stopped');
    }

    async deployAxelarFrameworkModules() {
        logger.log('Deploying Axelar Framework Modules');

        this.operatorWallet = Wallet.createRandom();

        const wasmFilePath = path.join(path.resolve(__dirname), './contracts/axelar_auth_gateway.wasm');

        this.gatewayAccount = await this.createAccountAndDeployContract('near_axelar_auth_gateway', wasmFilePath, 200);

        const operators = ethers.utils.defaultAbiCoder.encode(
            ['address[]', 'uint256[]', 'uint256'],
            [[this.operatorWallet.address], [1], 1]
        );

        await this.gatewayAccount.call(this.gatewayAccount, 'new', {
            recent_operators: [operators],
        });

        logger.log('Axelar Framework Modules deployed');
    }

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

    async createAccountAndDeployContract(accountId: string, contractWasmPath: string, nearAmount = 200) {
        const root = this.rootAccount;
        const account = await root.createSubAccount(accountId, {
            initialBalance: NEAR.parse(`${nearAmount} N`).toJSON(),
        });
        await account.deploy(contractWasmPath);
        return account;
    }

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

    // Events
    queryPayGasContractCallEvents(): NearEvent[] {
        return [];
    }

    queryContractCallEvents(): NearEvent[] {
        /**
         *
         *   {"standard":"axelar_near","version":"1.0.0","event":"contract_call_event","data":{"address":"axelar_auth_weighted.test.near","destination_chain":"Polygon","destination_contract_address":"0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88","payload_hash":"0xcead85dcdfcdc3f9aa5aa82658669488859283d53026229b179f017824d15a1f","payload":"0x00000000000000000000000070997970c51812dc3a010c7d01b50e0d17dc79c80000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc"}}
         */
        return NearNetwork.logs.filter((el) => el.event == 'contract_call_event');
    }
}
