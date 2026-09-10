import path from 'path';

export const Path = {
    base: path.join(__dirname, '..'),
    /** Move sources shipped with this package (the sample app). */
    move: path.join(__dirname, '..', 'move'),
    /**
     * Scratch directory the framework is staged into before publishing.
     *
     * Never build inside cgp-sui's own `move/`: getContractBuild and
     * updateMoveToml both write into the directory they are given, and under
     * pnpm that path is hardlinked into the global store.
     */
    compile: path.join(__dirname, '..', '.move-compile'),
};
