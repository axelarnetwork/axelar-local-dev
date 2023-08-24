'use strict';

import { ethers } from 'ethers';
import path from 'path';
import fs from 'fs';

export const getAptosLogID = (chain: string, event: any) => {
    return ethers.utils.id(chain + ':' + event.guid.account_address + ':' + event.version + ':' + event.sequence_number);
};
