'use strict';

import { ethers } from 'ethers';

export const getAptosLogID = (chain: string, event: any) => {
    return ethers.utils.id(chain + ':' + event.guid.account_address + ':' + event.version + ':' + event.sequence_number);
};
