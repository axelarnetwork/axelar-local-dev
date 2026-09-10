import { copyMovePackage, getDeploymentOrder, getLocalDependencies, TxBuilder, updateMoveToml } from '@axelar-network/axelar-cgp-sui';
import type { Keypair } from '@mysten/sui/cryptography';
import type { SuiClient, SuiTransactionBlockResponse } from '@mysten/sui/client';

export interface PublishResult {
    packageId: string;
    publishTxn: SuiTransactionBlockResponse;
}

/**
 * Ported from cgp-sui's unpublished test/testutils.js. Everything it calls is
 * public API; only this ~15-line wrapper is missing from the shipped package.
 *
 * `fromDir = null` resolves to cgp-sui's own shipped move/ sources, which are
 * included in its published files list.
 */
export async function publishPackage(
    client: SuiClient,
    keypair: Keypair,
    packageName: string,
    compileDir: string,
    fromDir: string | null = null,
): Promise<PublishResult> {
    copyMovePackage(packageName, fromDir, compileDir);

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
