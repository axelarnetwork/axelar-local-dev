import { copyMovePackage, getDeploymentOrder, getLocalDependencies, TxBuilder, updateMoveToml } from '@axelar-network/axelar-cgp-sui';
import type { Keypair } from '@mysten/sui/cryptography';
import type { SuiClient, SuiTransactionBlockResponse } from '@mysten/sui/client';

export interface PublishResult {
    packageId: string;
    publishTxn: SuiTransactionBlockResponse;
}

/**
 * Ported from cgp-sui's unpublished test/testutils.js. Everything it calls is
 * public API; only this wrapper is missing from the shipped package.
 *
 * Unlike the reference, this does NOT copy the package: stageMovePackages has
 * already staged the whole dependency closure into `compileDir`. Copying again
 * here would resolve every package against cgp-sui's own move/ and so fail for
 * any package that does not live there, such as our sample.
 */
export async function publishPackage(
    client: SuiClient,
    keypair: Keypair,
    packageName: string,
    compileDir: string,
): Promise<PublishResult> {
    // A package must be published at 0x0; the placeholder address in the
    // manifest is rewritten to the real id afterwards so dependents link
    // against it.
    updateMoveToml(packageName, '0x0', compileDir);

    const builder = new TxBuilder(client);
    await builder.publishPackageAndTransferCap(packageName, keypair.toSuiAddress(), compileDir);
    const publishTxn = await builder.signAndExecute(keypair, { showObjectChanges: true, showEvents: true });

    const published = (publishTxn.objectChanges ?? []).find((change: any) => change.type === 'published') as any;

    if (!published?.packageId) {
        throw new Error(`publishing '${packageName}' produced no published package (digest ${publishTxn.digest})`);
    }

    updateMoveToml(packageName, published.packageId, compileDir);

    return { packageId: published.packageId, publishTxn };
}

/**
 * Stage a package and every local dependency it pulls in, then return the
 * order they must be published in.
 *
 * Staging is required rather than convenient: getContractBuild and
 * updateMoveToml write into the directory they are handed, and cgp-sui's own
 * move/ is a hardlinked path into the pnpm store.
 */
/**
 * Stage and publish a Move package that lives outside cgp-sui - an example's
 * own module, say.
 *
 * It is staged as a sibling of the already-published framework packages so its
 * `local = "../axelar_gateway"` style dependencies resolve against their real
 * on-chain addresses rather than the unpublished placeholders.
 */
export async function publishExternalPackage(
    client: SuiClient,
    keypair: Keypair,
    packageName: string,
    fromDir: string,
    compileDir: string,
): Promise<PublishResult> {
    copyMovePackage(packageName, fromDir, compileDir);

    return publishPackage(client, keypair, packageName, compileDir);
}

export function stageMovePackages(rootPackage: string, compileDir: string, rootFromDir: string | null): string[] {
    const queue = [rootPackage];
    const seen = new Set<string>();

    while (queue.length) {
        const name = queue.shift() as string;

        if (seen.has(name)) continue;
        seen.add(name);

        copyMovePackage(name, name === rootPackage ? rootFromDir : null, compileDir);

        for (const dependency of getLocalDependencies(name, compileDir)) {
            queue.push((dependency as any).directory);
        }
    }

    return getDeploymentOrder(rootPackage, compileDir);
}
