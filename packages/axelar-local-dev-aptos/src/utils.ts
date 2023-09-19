'use strict';

import { ethers } from 'ethers';
import path from 'path';
import fs from 'fs';

export const getAptosLogID = (chain: string, event: any) => {
    return ethers.utils.id(chain + ':' + event.guid.account_address + ':' + event.version + ':' + event.sequence_number);
};

export const findAxelarFramework = (currentDir: string): string => {
    const node_module = findNodeModulesPath(currentDir);
    const dirs = fs.readdirSync(node_module);
    if (dirs.indexOf('@axelar-network') > -1) {
        const axelarDirs = fs.readdirSync(path.join(node_module, '@axelar-network'));
        if (axelarDirs.indexOf('axelar-cgp-aptos') > -1) {
            return path.join(node_module, '@axelar-network', 'axelar-cgp-aptos', 'aptos', 'modules', 'axelar', 'build', 'AxelarFramework');
        }
    }

    return findAxelarFramework(path.join(currentDir, '..'));
};

export const findNodeModulesPath = (currentDir: string): string => {
    const dirs = fs.readdirSync(currentDir);
    if (dirs.indexOf('node_modules') > -1) {
        return path.join(currentDir, 'node_modules');
    }
    return findNodeModulesPath(path.join(currentDir, '..'));
};
