import { CoinBalance, SuiEvent, SuiClient, getFullnodeUrl, SuiTransactionBlockResponseOptions } from '@mysten/sui.js/client';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { Keypair } from '@mysten/sui.js/cryptography';
import { requestSuiFromFaucetV0, getFaucetHost } from '@mysten/sui.js/faucet';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { execSync, exec } from 'child_process';
import { PublishedPackage } from './types';

/**
 * `SuiNetwork` class provides methods and functionalities to interact with the Sui network.
 * It extends the functionalities of `SuiClient`, offering a higher-level abstraction for
 * various network operations.
 *
 * @extends {SuiClient}
 *
 * @property {Ed25519Keypair} executor - Represents the keypair of the executor.
 * @property {string} faucetUrl - URL of the faucet for fetching tokens.
 * @property {string} nodeUrl - URL of the node to connect to the Sui network.
 * @property {PublishedPackage[]} gatewayObjects - Array to store packages compatible with gateway.
 *
 * Main Features:
 * - Initialize and fund the executor account.
 * - Deploy modules to the network.
 * - Execute transaction with optional configurations.
 * - Query gateway events within a specified time range.
 */
export class SuiNetwork extends SuiClient {
    private executor: Ed25519Keypair;
    private faucetUrl: string;
    public nodeUrl: string;
    public gatewayObjects: PublishedPackage[] = [];
    public axelarValidators: string = '';
    public axelarPackageId: string = '';

    /**
     * Constructs an instance of SuiNetwork
     *
     * @param nodeUrl - Optional node URL; defaults to localnet if not provided
     * @param faucetUrl - Optional faucet URL; defaults to localnet if not provided
     */
    constructor(nodeUrl?: string, faucetUrl?: string) {
        super({ url: nodeUrl || getFullnodeUrl('localnet') });
        this.nodeUrl = nodeUrl || getFullnodeUrl('localnet');
        this.faucetUrl = faucetUrl || getFaucetHost('localnet');
        this.executor = new Ed25519Keypair();
    }

    /**
     * Initialize the SuiNetwork by funding the executor account
     */
    async init() {
        // Fund executor account
        await this.fundWallet(this.getExecutorAddress());

        const scriptPath = 'scripts/publish-package.js';
        const path = require.resolve('@axelar-network/axelar-cgp-sui/' + scriptPath).slice(0, -scriptPath.length) + 'move/axelar';
        const { publishTxn } = await this.deploy(path);
        const validators = publishTxn.objectChanges?.find((obj: any) => {
            return obj.objectType && obj.objectType.endsWith('validators::AxelarValidators');
        }) as any;
        this.axelarValidators = validators.objectId;
        this.axelarPackageId = validators.objectType.slice(0, 66);
    }

    /**
     * Request funds for a given wallet from the Sui faucet
     *
     * @param address - The address of the wallet to fund
     * @returns A Promise that resolves once the funding request is made
     */
    public fundWallet(address: string) {
        return requestSuiFromFaucetV0({
            host: this.faucetUrl,
            recipient: address,
        });
    }

    /**
     * Builds and deploys a module from a specified path
     *
     * @param modulePath - Path to the module containing a Move.toml file
     * @param senderAddress - Optional sender address; defaults to executor address if not provided
     * @returns A Promise with transaction details and published packages
     */
    public async deploy(modulePath: string, senderAddress: string = this.getExecutorAddress()) {
        if (!(await this.suiCommandExist())) {
            throw new Error('Please install sui command');
        }

        const { modules, dependencies } = JSON.parse(
            execSync(`sui move build --dump-bytecode-as-base64 --path ${modulePath}`, {
                encoding: 'utf-8',
                stdio: 'pipe', // silent the output
            }),
        );

        const tx = new TransactionBlock();
        const [upgradeCap] = tx.publish({
            modules,
            dependencies,
        });
        tx.transferObjects([upgradeCap], tx.pure(senderAddress));

        const result = await this.execute(tx);

        const publishedPackages = result.objectChanges
            ?.filter((change) => change.type === 'published')
            ?.map((change: any) => {
                return {
                    packageId: change.packageId,
                    modules: change.modules,
                    deployedAt: Date.now(),
                };
            });

        if (!publishedPackages || publishedPackages.length === 0) {
            throw new Error('No published packages');
        }

        // add gateway compatible modules
        this.gatewayObjects.push(...publishedPackages.filter((p: any) => p.modules.includes('gateway')));

        return {
            digest: result.digest,
            packages: publishedPackages,
            publishTxn: result,
        };
    }

    /**
     * Signs and executes a transaction block
     *
     * @param tx - The transaction block to execute
     * @param keypair - Optional keypair for signing; defaults to executor keypair if not provided
     * @param options - Optional settings for the transaction execution response
     * @returns A Promise with details of the transaction execution
     */
    public async execute(tx: TransactionBlock, keypair: Keypair = this.executor, options?: SuiTransactionBlockResponseOptions) {
        // todo: add check for sui command
        return this.signAndExecuteTransactionBlock({
            signer: keypair || this.executor,
            transactionBlock: tx,
            options: {
                showObjectChanges: true,
                showInput: true,
                showEffects: true,
                showBalanceChanges: true,
                showEvents: true,
                showRawInput: true,
                ...options,
            },
        });
    }

    /**
     * Signs and executes a transaction block
     *
     * @param tx - The transaction block to execute
     * @param sender - Optional sender address to execute as, defaults to the executor address
     * @returns A Promise with details of the transaction dev inspect
     */
    public async devInspect(tx: TransactionBlock, sender: string = this.executor.getPublicKey().toSuiAddress()) {
        // todo: add check for sui command
        return this.devInspectTransactionBlock({
            sender: sender || this.executor.getPublicKey().toSuiAddress(),
            transactionBlock: tx,
        });
    }

    /**
     * Queries for gateway events within a specified time range
     *
     * @param startTime - Optional start time for the query; defaults to 1 minute ago if not provided
     * @param endTime - Optional end time for the query; defaults to current time if not provided
     * @returns A Promise with the filtered gateway events
     */
    public async queryGatewayEvents(startTime?: string, endTime?: string) {
        const now = Date.now();
        const events = await this.queryEvents({
            query: {
                TimeRange: {
                    startTime: startTime || (now - 1000 * 60).toString(),
                    endTime: endTime || now.toString(),
                },
            },
        });

        return events.data.filter((e) => e.type.includes('gateway::ContractCall'));
    }

    /**
     * Fetches the address of the executor
     *
     * @returns The address of the executor
     */
    public getExecutorAddress(): string {
        return this.executor.toSuiAddress();
    }

    /**
     * Fetches the balance of the executor account
     *
     * @returns A Promise with the balance details of the executor account
     */
    public getExecutorBalance(): Promise<CoinBalance> {
        return this.getBalance({
            owner: this.executor.toSuiAddress(),
        });
    }

    /**
     * Checks if the `sui` command is available in the system
     *
     * @returns A Promise that resolves to true if the command exists, false otherwise
     */
    public async suiCommandExist(): Promise<boolean> {
        try {
            const platformCmd = process.platform === 'win32' ? 'where' : 'which';
            await exec(`${platformCmd} sui`);
            return true;
        } catch (err) {
            return false;
        }
    }
}
