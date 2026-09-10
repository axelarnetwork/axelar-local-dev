import {
    CLOCK_PACKAGE_ID,
    TxBuilder,
    bcsStructs,
    getDefinedSuiVersion,
    getInstalledSuiVersion,
    updateMoveToml,
} from '@axelar-network/axelar-cgp-sui';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { getFaucetHost, requestSuiFromFaucetV0 } from '@mysten/sui/faucet';
import { arrayify, hexlify } from 'ethers/lib/utils';
import { randomBytes } from 'crypto';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';

import { Path } from './path';
import { defaultSuiConfig } from './config';
import { publishExternalPackage, publishPackage, stageMovePackages } from './utils/publish';
import { requireObjectId } from './utils/objects';
import { generateSigners } from './utils/signers';
import type { DiscoveryInfo, GatewayApprovalInfo, SerializedWeightedSigners, SuiDeployment, SuiNetworkOptions } from './types';

/** Uint8Array public keys do not survive a JSON round trip; hex does. */
function serializeSigners(signers: any): SerializedWeightedSigners {
    return {
        signers: signers.signers.map((signer: any) => ({ pub_key: hexlify(signer.pub_key), weight: signer.weight })),
        threshold: signers.threshold,
        nonce: signers.nonce,
    };
}

function deserializeSigners(signers: SerializedWeightedSigners): any {
    return {
        signers: signers.signers.map((signer) => ({ pub_key: arrayify(signer.pub_key), weight: signer.weight })),
        threshold: signers.threshold,
        nonce: signers.nonce,
    };
}

/**
 * The sample app depends on the gateway, gas service and relayer discovery, so
 * its dependency closure is the whole local framework and one root is enough.
 */
const ROOT_PACKAGE = 'sample';

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
    sample!: { packageId: string; singletonId: string; channelAddress: string };

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

    /**
     * Rebuild a handle to an already-published framework, for a process that
     * did not publish it. `pnpm run start`, `deploy` and `execute` are three
     * separate processes, so the ids travel through a side-file.
     *
     * A fresh keypair is generated and funded rather than carrying the original
     * deployer's secret in that file: any funded account can drive the gateway,
     * so there is no reason to write a key to disk.
     */
    static async fromDeployment(deployment: SuiDeployment, options: SuiNetworkOptions = {}): Promise<SuiNetwork> {
        const sui = new SuiNetwork(options);

        await sui.assertNodeReachable();
        await sui.fundWallet(sui.deployer.toSuiAddress());

        sui.packageIds = deployment.packageIds;
        sui.gasServiceId = deployment.gasServiceId;
        sui.domainSeparator = deployment.domainSeparator;
        sui.sample = deployment.sample;
        sui.discoveryInfo = { packageId: deployment.discoveryPackageId, discovery: deployment.discoveryId };
        sui.gatewayInfo = {
            packageId: deployment.gatewayPackageId,
            gateway: deployment.gatewayId,
            signers: deserializeSigners(deployment.signers),
            signerKeys: deployment.signerKeys,
            domainSeparator: deployment.domainSeparator,
        } as GatewayApprovalInfo;

        await sui.assertDeploymentLive();

        return sui;
    }

    /**
     * A side-file survives `sui start --force-regenesis`, which discards every
     * published object, so a stale one resolves happily here and then fails
     * somewhere unrelated with a Move abort or a read of a null object.
     */
    async assertDeploymentLive(): Promise<void> {
        const gateway = await this.client.getObject({ id: this.gatewayId, options: {} });

        if (!gateway.data) {
            throw new Error(
                `the recorded Sui deployment is not on this network: gateway ${this.gatewayId} does not exist. ` +
                    'A chain-config side-file survives `sui start --force-regenesis`; delete it and run start again.',
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

            if (packageName === ROOT_PACKAGE) {
                await this.registerSample(packageId, requireObjectId(publishTxn, `${packageId}::gmp::Singleton`));
            }
        }
    }

    /**
     * Tell relayer discovery how to deliver to the sample app, and record the
     * Channel address other chains must address messages to.
     *
     * Skipping the registration makes inbound messages undeliverable: the
     * relayer's discovery lookup returns nothing and the message is simply
     * never executed, with no error anywhere.
     */
    private async registerSample(packageId: string, singletonId: string): Promise<void> {
        const builder = new TxBuilder(this.client);

        await builder.moveCall({
            target: `${packageId}::gmp::register_transaction`,
            arguments: [this.discoveryId, singletonId],
        });

        await builder.signAndExecute(this.deployer, {});

        const singleton = await this.client.getObject({ id: singletonId, options: { showContent: true } });
        const content = singleton.data?.content;

        if (!content || content.dataType !== 'moveObject') {
            throw new Error(`sample Singleton ${singletonId} has no readable content`);
        }

        const channelAddress = (content.fields as any)?.channel?.fields?.id?.id;

        if (!channelAddress) {
            throw new Error(`could not read the Channel address out of sample Singleton ${singletonId}`);
        }

        this.sample = { packageId, singletonId, channelAddress };
    }

    /**
     * Copy the sample and every local dependency it pulls out of cgp-sui into a
     * writable scratch tree, and return the order they must be published in.
     */
    stageFramework(): string[] {
        return stageMovePackages(ROOT_PACKAGE, this.compileDir, Path.move);
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

    /**
     * Publish a Move package of your own against this deployment.
     *
     * `fromDir` is the directory containing `<packageName>/Move.toml`. The
     * package is staged beside the published framework, so its local
     * dependencies link against real addresses.
     */
    async publishPackage(packageName: string, fromDir: string) {
        // This shells out to `sui move build` just as init does, and a
        // reconnected process never ran init's version check.
        SuiNetwork.assertSuiVersion();

        // A process that reconnected via fromDeployment never staged anything,
        // and stop() deletes the tree, so the framework this package's
        // `local = "../axelar_gateway"` dependencies point at may be absent.
        // Re-staging is cheap and idempotent, and without it the Move build
        // fails on unresolvable dependencies.
        if (!existsSync(join(this.compileDir, 'axelar_gateway'))) {
            this.stageFramework();
            this.restoreFrameworkAddresses();
        }

        return publishExternalPackage(this.client, this.deployer, packageName, fromDir, this.compileDir);
    }

    /**
     * Re-staged manifests carry cgp-sui's placeholder addresses. Point them at
     * what is actually published, or dependents link against 0xa1 and friends.
     */
    private restoreFrameworkAddresses(): void {
        for (const [packageName, packageId] of Object.entries(this.packageIds)) {
            updateMoveToml(packageName, packageId, this.compileDir);
        }
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

        throw new Error(
            `could not fund ${address} from the faucet at ${this.faucetUrl} after ${defaultSuiConfig.faucetRetries} attempts: ${lastError}`,
        );
    }

    /**
     * Waits rather than failing fast: in CI the network is started in the
     * background and comes up alongside the build, so a single probe is a race.
     */
    async assertNodeReachable(): Promise<void> {
        let lastError: unknown;

        for (let attempt = 0; attempt < defaultSuiConfig.nodeRetries; attempt++) {
            try {
                await this.client.getChainIdentifier();

                return;
            } catch (error) {
                lastError = error;
                await new Promise((resolve) => setTimeout(resolve, defaultSuiConfig.nodeRetryDelayMs));
            }
        }

        throw new Error(
            `no Sui network became reachable at ${this.nodeUrl}. Start one with ` +
                `\`sui start --with-faucet --force-regenesis\` (note: that resets local Sui state). Cause: ${lastError}`,
        );
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
            signers: serializeSigners(this.gatewayInfo.signers),
            sample: this.sample,
        };
    }

    async stop(): Promise<void> {
        rmSync(this.compileDir, { recursive: true, force: true });
    }
}
