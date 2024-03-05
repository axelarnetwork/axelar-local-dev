'use strict';

import { ethers } from 'ethers';

export const getMultiversXLogID = (chain: string, sender: string, txHash: string, logIndex: number) => {
    return ethers.utils.id(chain + ':' + sender + ':' + txHash + ':' + logIndex);
};
