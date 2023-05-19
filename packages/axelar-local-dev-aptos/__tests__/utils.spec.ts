import { findNodeModulesPath } from '..';

describe('utils', () => {
    it('should be able to find node_modules path', () => {
        const path = findNodeModulesPath(__dirname);
        expect(path).toContain('node_modules');
    });
});
