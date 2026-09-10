import * as cgp from '@axelar-network/axelar-cgp-sui';

/**
 * cgp-sui's "browser" export condition re-exports TxBuilderBase as TxBuilder and
 * ships no node-utils, so resolving it costs us every publishing helper. tsc
 * resolves cgp-sui's types via node10, which ignores the exports map entirely,
 * so a regression here type-checks cleanly and only fails at runtime - minutes
 * into a publish, as `publishPackage is not a function`.
 *
 * This fails in milliseconds instead.
 */
describe('cgp-sui export conditions', () => {
    it('resolves the node build, not the browser build', () => {
        expect(typeof (cgp.TxBuilder as any).prototype.publishPackage).toBe('function');
        expect(typeof cgp.getDeploymentOrder).toBe('function');
        expect(typeof cgp.copyMovePackage).toBe('function');
        expect(typeof cgp.updateMoveToml).toBe('function');
    });

    it('exports the relay helpers the SuiRelayer delegates to', () => {
        expect(typeof cgp.approveAndExecute).toBe('function');
    });
});
