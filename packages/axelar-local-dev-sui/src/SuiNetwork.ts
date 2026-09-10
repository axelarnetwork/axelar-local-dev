import { CLOCK_PACKAGE_ID, TxBuilder, bcsStructs, getDefinedSuiVersion, getInstalledSuiVersion } from '@axelar-network/axelar-cgp-sui';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { getFaucetHost, requestSuiFromFaucetV0 } from '@mysten/sui/faucet';
import { hexlify } from 'ethers/lib/utils';
import { randomBytes } from 'crypto';
import { rmSync } from 'fs';

import { Path } from './path';
import { defaultSuiConfig } from './config';
import { publishPackage, stageMovePackages } from './utils/publish';
import { requireObjectId } from './utils/objects';
import { generateSigners } from './utils/signers';
import type { DiscoveryInfo, GatewayApprovalInfo, SuiDeployment, SuiNetworkOptions } from './types';

/** Roots whose dependency closures make up the local Axelar framework. */
const FRAMEWORK_ROOTS = ['axelar_gateway', 'gas_service', 'relayer_discovery'];

/**
 * A local Axelar deployment on a Sui network.
 *
 * Composition over inheritance: the old v2 class extended SuiClient, which is
 * now an alias re-export in @mysten/sui and moves under us across SDK majors.
 */
export class SuiNetwork {
    readonly name = 'sui';
    readonly client: SuiClient;
    readonly nodeUrl: string;
    readonly faucetUrl: string;
    readonly deployer: Ed25519Keypair;
    readonly operator: Ed25519Keypair;
    readonly compileDir: string;

    packageIds: Record<string, string> = {};
    gatewayInfo!: GatewayApprovalInfo;
    discoveryInfo!: DiscoveryInfo;
    gasServiceId!: string;
    domainSeparator!: string;

    constructor(options: SuiNetworkOptions = {}) {
        this.nodeUrl = options.nodeUrl || defaultSuiConfig.nodeUrl || getFullnodeUrl('localnet');
        this.faucetUrl = options.faucetUrl || defaultSuiConfig.faucetUrl || getFaucetHost('localnet');
        this.client = new SuiClient({ url: this.nodeUrl });
        this.deployer = new Ed25519Keypair();
        this.operator = new Ed25519Keypair();
        this.compileDir = Path.compile;
    }

    get gatewayPackageId(): string {
        return this.gatewayInfo.packageId;
    }

    get gatewayId(): string {
        return this.gatewayInfo.gateway;
    }

    get discoveryPackageId(): string {
        return this.discoveryInfo.packageId;
    }

    get discoveryId(): string {
        return this.discoveryInfo.discovery;
    }

    /**
     * Publishing compiles through `sui move build`, and cgp-sui's manifests only
     * resolve on the CLI version it pins. A newer CLI treats their placeholder
     * addresses as published on-chain objects and fails with
     * "Object 0x..b0 not found", which is impossible to diagnose from the message.
     */
    static assertSuiVersion(): void {
        const defined = getDefinedSuiVersion();
        let installed: string | undefined;

        try {
            installed = getInstalledSuiVersion();
        } catch (error) {
            throw new Error(`the 'sui' CLI is required on PATH to publish Move packages, but running it failed: ${error}`);
        }

        if (!installed) {
            throw new Error("could not determine the installed 'sui' CLI version; is it on PATH?");
        }

        if (installed !== defined) {
            throw new Error(
                `sui CLI version mismatch: found ${installed}, axelar-cgp-sui requires ${defined}. ` +
                    `Other versions fail during dependency resolution with an unrelated-looking error. ` +
                    `Install the pinned release from https://github.com/MystenLabs/sui/releases/tag/${defined} and put it first on PATH.`,
            );
        }
    }

    async init(): Promise<void> {
        SuiNetwork.assertSuiVersion();
        await this.assertNodeReachable();

        await Promise.all([this.fundWallet(this.deployer.toSuiAddress()), this.fundWallet(this.operator.toSuiAddress())]);

        const order = this.stageFramework();

        for (const packageName of order) {
            const { packageId, publishTxn } = await publishPackage(this.client, this.deployer, packageName, this.compileDir);

            this.packageIds[packageName] = packageId;

            if (packageName === 'relayer_discovery') {
                this.discoveryInfo = {
                    packageId,
                    discovery: requireObjectId(publishTxn, `${packageId}::discovery::RelayerDiscovery`),
                };
            }

            if (packageName === 'gas_service') {
                this.gasServiceId = requireObjectId(publishTxn, `${packageId}::gas_service::GasService`);
            }

            if (packageName === 'axelar_gateway') {
                // Publishing only mints an OwnerCap. The Gateway itself is created
                // by gateway::setup below.
                await this.setupGateway(packageId, requireObjectId(publishTxn, `${packageId}::owner_cap::OwnerCap`));
            }
        }
    }

    /** Copy the framework and its local dependencies into a writable scratch tree. */
    stageFramework(): string[] {
        const order: string[] = [];

        for (const root of FRAMEWORK_ROOTS) {
            for (const packageName of stageMovePackages(root, this.compileDir, null)) {
                if (!order.includes(packageName)) order.push(packageName);
            }
        }

        return order;
    }

    private async setupGateway(packageId: string, ownerCapId: string): Promise<void> {
        const { signers, signerKeys } = generateSigners({
            count: defaultSuiConfig.signerCount,
            threshold: defaultSuiConfig.signerThreshold,
        });

        this.domainSeparator = hexlify(randomBytes(32));

        const builder = new TxBuilder(this.client);

        await builder.moveCall({
            target: `${packageId}::gateway::setup`,
            // TxBuilder.moveCall fetches the normalized Move signature and encodes
            // each argument from it, so plain numbers and byte arrays are correct
            // here. Its declared type is narrower than that runtime contract.
            arguments: [
                ownerCapId,
                this.operator.toSuiAddress(),
                this.domainSeparator,
                defaultSuiConfig.minimumRotationDelay,
                defaultSuiConfig.previousSignersRetention,
                bcsStructs.gateway.WeightedSigners.serialize(signers).toBytes(),
                CLOCK_PACKAGE_ID,
            ] as unknown as Parameters<TxBuilder['moveCall']>[0]['arguments'],
        });

        const result = await builder.signAndExecute(this.deployer, { showObjectChanges: true });

        this.gatewayInfo = {
            packageId,
            gateway: requireObjectId(result, `${packageId}::gateway::Gateway`),
            signers,
            signerKeys,
            domainSeparator: this.domainSeparator,
        } as GatewayApprovalInfo;
    }

    async fundWallet(address: string): Promise<void> {
        let lastError: unknown;

        // The localnet faucet rejects requests for the first seconds after
        // `sui start`, so a single attempt is a race.
        for (let attempt = 0; attempt < defaultSuiConfig.faucetRetries; attempt++) {
            try {
                await requestSuiFromFaucetV0({ host: this.faucetUrl, recipient: address });
                return;
            } catch (error) {
                lastError = error;
                await new Promise((resolve) => setTimeout(resolve, defaultSuiConfig.faucetRetryDelayMs));
            }
        }

        throw new Error(`could not fund ${address} from the faucet at ${this.faucetUrl} after ${defaultSuiConfig.faucetRetries} attempts: ${lastError}`);
    }

    private async assertNodeReachable(): Promise<void> {
        try {
            await this.client.getChainIdentifier();
        } catch (error) {
            throw new Error(
                `no Sui network is reachable at ${this.nodeUrl}. Start one with ` +
                    `\`sui start --with-faucet --force-regenesis\` (note: that resets local Sui state). Cause: ${error}`,
            );
        }
    }

    getExecutorAddress(): string {
        return this.deployer.toSuiAddress();
    }

    getDeployment(): SuiDeployment {
        return {
            packageIds: this.packageIds,
            gatewayPackageId: this.gatewayPackageId,
            gatewayId: this.gatewayId,
            discoveryPackageId: this.discoveryPackageId,
            discoveryId: this.discoveryId,
            gasServiceId: this.gasServiceId,
            domainSeparator: this.domainSeparator,
            signerKeys: this.gatewayInfo.signerKeys,
        };
    }

    async stop(): Promise<void> {
        rmSync(this.compileDir, { recursive: true, force: true });
    }
}
