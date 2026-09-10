import { Secp256k1Keypair } from '@mysten/sui/keypairs/secp256k1';
import { arrayify, hexlify } from 'ethers/lib/utils';
import { randomBytes } from 'crypto';

export interface WeightedSigner {
    pub_key: Uint8Array;
    weight: number;
}

export interface WeightedSigners {
    signers: WeightedSigner[];
    threshold: number;
    nonce: string;
}

export interface GeneratedSigners {
    signers: WeightedSigners;
    signerKeys: string[];
}

/**
 * Ported from cgp-sui's calculateNextSigners, made pure - it mutated a
 * gatewayInfo object in place.
 *
 * Three signers at weight 1 with threshold 2 matches what cgp-sui's own tests
 * use. A single signer would exercise a degenerate proof path that mainnet
 * never takes.
 */
export function generateSigners({ count = 3, threshold = 2, nonce = 1 } = {}): GeneratedSigners {
    const privKeys = Array.from({ length: count }, () => hexlify(randomBytes(32)));

    const keys = privKeys.map((privKey) => ({
        privKey,
        pubKey: Secp256k1Keypair.fromSecretKey(arrayify(privKey)).getPublicKey().toRawBytes(),
    }));

    // The Move-side weighted_signers validation requires strictly ascending
    // public keys, so this sort is load-bearing rather than cosmetic.
    keys.sort((a, b) => {
        for (let i = 0; i < 33; i++) {
            if (a.pubKey[i] < b.pubKey[i]) return -1;
            if (a.pubKey[i] > b.pubKey[i]) return 1;
        }

        return 0;
    });

    return {
        signerKeys: keys.map((key) => key.privKey),
        signers: {
            signers: keys.map((key) => ({ pub_key: key.pubKey, weight: 1 })),
            threshold,
            nonce: hexlify([nonce]),
        },
    };
}
