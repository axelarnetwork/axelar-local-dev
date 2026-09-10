import type { SuiObjectChange, SuiTransactionBlockResponse } from '@mysten/sui/client';

/** The object-change variants that actually name an object. 'published' does not. */
type ObjectChangeWithId = Extract<SuiObjectChange, { objectId: string; objectType: string }>;

/**
 * Ported from cgp-sui's unpublished test/testutils.js.
 *
 * The match is a substring, so an upstream rename returns undefined rather
 * than failing. Always pair this with requireObjectId at a call site that
 * cannot proceed without the object.
 */
export function findObjectId(tx: SuiTransactionBlockResponse, objectType: string, type = 'created', excludes?: string): string | undefined {
    const match = (tx.objectChanges ?? []).find(
        (change): change is ObjectChangeWithId =>
            change.type === type &&
            'objectType' in change &&
            change.objectType.includes(objectType) &&
            !(excludes && change.objectType.includes(excludes)),
    );

    return match?.objectId;
}

/** findObjectId, but loud. Use this everywhere the object is required. */
export function requireObjectId(tx: SuiTransactionBlockResponse, objectType: string, type = 'created', excludes?: string): string {
    const objectId = findObjectId(tx, objectType, type, excludes);

    if (!objectId) {
        const seen = (tx.objectChanges ?? []).map((c) => ('objectType' in c ? c.objectType : c.type));

        throw new Error(
            `expected a ${type} object matching '${objectType}' in transaction ${tx.digest}, found none. ` +
                `This usually means axelar-cgp-sui renamed it. Objects in this transaction: ${seen.join(', ') || '(none)'}`,
        );
    }

    return objectId;
}
