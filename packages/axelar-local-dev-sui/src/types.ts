import type { GatewayApprovalInfo, DiscoveryInfo } from '@axelar-network/axelar-cgp-sui';

export interface SerializedWeightedSigners {
    signers: { pub_key: string; weight: number }[];
    threshold: number;
    nonce: string;
}

export interface SuiNetworkOptions {
    nodeUrl?: string;
    faucetUrl?: string;
}

/**
 * Everything a second process needs to talk to an already-published local
 * framework. `pnpm run start`, `deploy` and `execute` are separate processes,
 * so this is written to a side-file rather than held in memory.
 */
export interface SuiDeployment {
    packageIds: Record<string, string>;
    gatewayPackageId: string;
    gatewayId: string;
    discoveryPackageId: string;
    discoveryId: string;
    gasServiceId: string;
    domainSeparator: string;
    /** Private keys of the local gateway's weighted signers. Local only. */
    signerKeys: string[];
    /**
     * The signer set, in a JSON-safe shape. Public keys are hex rather than
     * Uint8Array: this blob travels through a side-file, and a Uint8Array
     * comes back from JSON as a plain object, which the BCS encoder rejects
     * with "Expected array, found object".
     */
    signers: SerializedWeightedSigners;
    /** The bundled sample GMP app, and the Channel other chains address. */
    sample: { packageId: string; singletonId: string; channelAddress: string };
}

export type { GatewayApprovalInfo, DiscoveryInfo };
