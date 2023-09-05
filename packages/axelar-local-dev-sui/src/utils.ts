import { ethers } from 'ethers';
import { EventId } from '@mysten/sui.js/client';

export const getCommandId = (event: EventId) => {
    return ethers.utils.id([event.txDigest, event.eventSeq].join(':'));
};
