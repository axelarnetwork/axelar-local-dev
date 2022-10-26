'use strict';

import { ethers, ContractFactory, BigNumber, Wallet } from 'ethers';
const { defaultAbiCoder, id, arrayify, keccak256 } = ethers.utils;
import http from 'http';
import { outputJsonSync } from 'fs-extra';

export const logger = { log: console.log };

const getRandomInt = (max: number) => {
    return Math.floor(Math.random() * max);
};

export function bigNumberToNumber(bigNumber: BigNumber) {
    return bigNumber.toNumber();
}

export async function getSignedExecuteInput(data: any, wallet: Wallet) {
    const signature = await wallet.signMessage(arrayify(keccak256(data)));
    const signData = defaultAbiCoder.encode(['address[]', 'uint256[]', 'uint256', 'bytes[]'], [[wallet.address], [1], 1, [signature]]);
    return defaultAbiCoder.encode(['bytes', 'bytes'], [data, signData]);
}

export const getRandomID = () => id(getRandomInt(1e10).toString());
export const getEVMLogID = (chain: string, log: any) => {
    return id(chain + ':' + log.blockNumber + ':' + log.transactionIndex + ':' + log.logIndex);
};
export const getAptosLogID = (chain: string, event: any) => {
    return id(chain + ':' + event.guid.account_address + ':' + event.version + ':' + event.sequence_number);
};

export const defaultAccounts = (n: number, seed = '') => {
    const balance = BigInt(1e30);
    const privateKeys = [];
    let key = keccak256(defaultAbiCoder.encode(['string'], [seed]));
    for (let i = 0; i < n; i++) {
        privateKeys.push(key);
        key = keccak256(key);
    }
    return privateKeys.map((secretKey) => ({ balance, secretKey }));
};

export const deployContract = async (wallet: Wallet, contractJson: any, args: any[] = [], options = {}) => {
    const factory = new ContractFactory(contractJson.abi, contractJson.bytecode, wallet);

    const contract = await factory.deploy(...args, { ...options });
    await contract.deployed();
    return contract;
};
export const setJSON = (data: any, name: string) => {
    outputJsonSync(name, data, {
        spaces: 2,
        EOL: '\n',
    });
};
export const httpGet = (url: string) => {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            const { statusCode } = res;
            const contentType = res.headers['content-type'];
            let error;
            if (statusCode !== 200) {
                error = new Error('Request Failed.\n' + `Status Code: ${statusCode}`);
            } else if (!/^application\/json/.test(contentType!)) {
                error = new Error('Invalid content-type.\n' + `Expected application/json but received ${contentType}`);
            }
            if (error) {
                res.resume();
                reject(error);
                return;
            }
            res.setEncoding('utf8');
            let rawData = '';
            res.on('data', (chunk) => {
                rawData += chunk;
            });
            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(rawData);
                    resolve(parsedData);
                } catch (e) {
                    reject(e);
                }
            });
        });
    });
};

export function setLogger(log: (...args: any) => void) {
    logger.log = log;
}
