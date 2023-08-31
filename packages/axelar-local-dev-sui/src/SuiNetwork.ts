import { CoinBalance, SuiEvent, SuiClient, getFullnodeUrl, SuiEventFilter } from '@mysten/sui.js/client';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { requestSuiFromFaucetV0, getFaucetHost } from '@mysten/sui.js/faucet';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { execSync, exec } from 'child_process';
import { PublishedPackage } from './types';

export class SuiNetwork extends SuiClient {
    private executor: Ed25519Keypair;
    private faucetUrl: string;
    public nodeUrl: string;
    public gatewayObjects: PublishedPackage[] = [];

    constructor(nodeUrl?: string, faucetUrl?: string) {
        super({ url: nodeUrl || getFullnodeUrl('localnet') });
        this.nodeUrl = nodeUrl || getFullnodeUrl('localnet');
        this.faucetUrl = faucetUrl || getFaucetHost('localnet');
        this.executor = new Ed25519Keypair();
    }

    async init() {
        // Fund executor account
        await this.fundWallet(this.getExecutorAddress());
    }

    /**
     * Fund a wallet with SUI tokens from the faucet
     * @param address - address to fund
     * @returns
     */
    public fundWallet(address: string) {
        return requestSuiFromFaucetV0({
            host: this.faucetUrl,
            recipient: address,
        });
    }

    /**
     * Deploy a module given the path to the module
     * @param modulePath - path to the module containing a Move.toml file.
     * @returns A transaction object
     */
    public async deploy(modulePath: string, senderAddress: string = this.getExecutorAddress()) {
        if (!(await this.suiCommandExist())) {
            throw new Error('Please install sui command');
        }

        const { modules, dependencies } = JSON.parse(
            execSync(`sui move build --dump-bytecode-as-base64 --path ${modulePath} --with-unpublished-dependencies`, {
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
                    deployedAt: new Date().getTime(),
                };
            });

        if (!publishedPackages) {
            throw new Error('No published packages');
        }

        // add gateway compatible modules
        this.gatewayObjects.push(...publishedPackages.filter((p: any) => p.modules.includes('gateway')));

        return {
            digest: result.digest,
            packages: publishedPackages,
        };
    }

    public async execute(tx: TransactionBlock) {
        return this.signAndExecuteTransactionBlock({
            signer: this.executor,
            transactionBlock: tx,
            options: {
                showObjectChanges: true,
                showInput: true,
                showEffects: true,
                showBalanceChanges: true,
                showEvents: true,
                showRawInput: true,
            },
        });
    }

    public async subscribe(packageId: string, onMessage: (message: SuiEvent) => void) {
        const filter = {
            Package: packageId,
        };
        return this.subscribeEvent({
            filter,
            onMessage,
        });
    }

    public async queryGatewayEvents(startTime?: string, endTime?: string) {
        const timeRange = {
            startTime: startTime || (new Date().getTime() - 1000 * 60).toString(), // default to 1 minute ago
            endTime: endTime || new Date().getTime().toString(), // default to now
        };

        const events = await this.queryEvents({
            query: {
                TimeRange: timeRange,
            },
        });

        return events.data.filter((e) => {
            return e.type.includes('gateway::ContractCall');
        });
    }

    /**
     * Get the executor address
     * @returns executor address
     */
    public getExecutorAddress(): string {
        return this.executor.toSuiAddress();
    }

    /**
     * Get the balance of the executor account
     * @returns balance of the executor account
     */
    getExecutorBalance(): Promise<CoinBalance> {
        return this.getBalance({
            owner: this.executor.toSuiAddress(),
        });
    }

    private async suiCommandExist(): Promise<boolean> {
        return new Promise((resolve) => {
            const platformCmd = process.platform === 'win32' ? 'where' : 'which';

            exec(`${platformCmd} sui`, (err) => {
                if (err) {
                    resolve(false);
                } else {
                    resolve(true);
                }
            });
        });
    }
}
