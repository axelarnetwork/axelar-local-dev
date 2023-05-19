'use strict';

import { ethers } from 'ethers';
import path from 'path';
import fs from 'fs';

export const getAptosLogID = (chain: string, event: any) => {
    return ethers.utils.id(chain + ':' + event.guid.account_address + ':' + event.version + ':' + event.sequence_number);
};

export const findNodeModulesPath = (currentDir: string) => {
    let pathfinder: string = currentDir;
    while (!pathfinder.includes('node_modules')) {
        pathfinder = path.join(pathfinder, '..');
        const dirs = fs.readdirSync(pathfinder);
        if (dirs.indexOf('node_modules') > -1) {
            pathfinder += '/node_modules';
        }
    }
    return pathfinder;
};
