import { CoinBalance, GetBalanceParams, SuiClient, getFullnodeUrl } from '@mysten/sui.js/client';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { requestSuiFromFaucetV0, getFaucetHost } from '@mysten/sui.js/faucet';
import { BCS, fromHEX, toHEX, getSuiMoveConfig } from '@mysten/bcs';

import fs from 'fs';
import path from 'path';

export class SuiNetwork {
    private executor: Ed25519Keypair;
    private client: SuiClient;
    private nodeUrl: string;
    private faucetUrl: string;
    private bcs = new BCS(getSuiMoveConfig());

    constructor(nodeUrl?: string, faucetUrl?: string) {
        // create a client connected to devnet
        this.nodeUrl = nodeUrl || getFullnodeUrl('localnet');
        this.faucetUrl = faucetUrl || getFaucetHost('localnet');

        this.client = new SuiClient({ url: this.nodeUrl });
        this.executor = new Ed25519Keypair();
    }

    async init() {
        // Fund executor account
        this.fundWallet(this.getExecutorAddress());
    }

    private registerTypes() {
        // TODO: Add more types

        this.bcs.registerStructType('GenericMessage', {
            source_chain: 'string',
            source_address: 'string',
            target_id: 'address',
            payload_hash: 'vector<u8>',
        });
    }

    public fundWallet(address: string) {
        return requestSuiFromFaucetV0({
            host: this.faucetUrl,
            recipient: address,
        });
    }

    public getExecutorAddress(): string {
        return this.executor.toSuiAddress();
    }

    /**
     * Check if gateway module is deployed
     * @returns boolean
     */
    public async isGatewayDeployed(): Promise<boolean> {
        // TODO: check if gateway module is deployed
        return Promise.resolve(false);
    }

    /**
     * Deploy a module given the path to the module
     * @param modulePath - path to the module.
     * @param compiledModules - compiled modules
     * @returns A transaction object
     */
    public async deploy(modulePath: string, compiledModules: string[]) {
        const packageMetadata = fs.readFileSync(path.join(modulePath, 'package-metadata.bcs'));
        const moduleDatas = compiledModules.map((module: string) => {
            return fs.readFileSync(path.join(modulePath, 'bytecode_modules', module));
        });
    }

    /**
     * Get the balance of the executor account
     * @returns balance of the executor account
     */
    getExecutorBalance(): Promise<CoinBalance> {
        return this.client.getBalance({
            owner: this.executor.toSuiAddress(),
        });
    }

    /**
     * Deploy the gateway module and the other modules
     */
    deployAxelarModules() {
        // TODO: deploy gateway module and other modules
    }

}
