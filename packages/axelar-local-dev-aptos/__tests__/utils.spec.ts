import { findNodeModulesPath } from '..';
import path from 'path';

describe('utils', () => {
    it('should be able to find base `node_modules` path when the current dir is deep inside the node_modules folder', () => {
        const dir = findNodeModulesPath(path.join(__dirname, '..', '..', '..', '/node_modules/@axelar-network/axelar-local-dev/dist'));
        expect(dir.endsWith('node_modules')).toBeTruthy();
    });

    it('should be able to find base `node_modules` path when the current dir is deeper, but it does not inside the node_modules folder', () => {
        const path = findNodeModulesPath(__dirname);
        expect(path.endsWith('node_modules')).toBeTruthy();
    });
});
