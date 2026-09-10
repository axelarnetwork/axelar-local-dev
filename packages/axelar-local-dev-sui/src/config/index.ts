export const defaultSuiConfig = {
    nodeUrl: process.env.SUI_URL || 'http://127.0.0.1:9000',
    faucetUrl: process.env.SUI_FAUCET_URL || 'http://127.0.0.1:9123',

    /** Passed to gateway::setup. Mirrors what cgp-sui's own tests use. */
    minimumRotationDelay: 1000,
    previousSignersRetention: 15,

    /** Weighted signer set generated for the local gateway. */
    signerCount: 3,
    signerThreshold: 2,

    /** The node is often still starting when init runs, especially in CI. */
    nodeRetries: 30,
    nodeRetryDelayMs: 2000,

    /** The faucet rate-limits for the first seconds after `sui start`. */
    faucetRetries: 8,
    faucetRetryDelayMs: 2000,
};
