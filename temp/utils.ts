import { Wallet } from 'ethers';
import fs from 'fs-extra';
import path from 'path';

const axelarLocal = require('@axelar-network/axelar-local-dev');
const { AxelarQueryAPI, CHAINS, Environment } = require('@axelar-network/axelarjs-sdk');

export const wallet = new Wallet('0x39ee7aeb81c863f98d4929c62620c6bee01bdad16f7b2c860eb6c33d1a521a38');
// A list of EVM chain names to be initialized
export const chains = ["Avalanche", "Ethereum"];

export function getEVMChains(selectedChains) {
    return fs
        .readJsonSync(path.join(__dirname, './chain-config/local.json'))
        .filter((chain) => selectedChains.includes(chain.name));
}

export function calculateBridgeFee(source, destination, options = {}) {
    const api = new AxelarQueryAPI({ environment: Environment.TESTNET });
    const { gasLimit, gasMultiplier, symbol } = options;

    return api.estimateGasFee(
        CHAINS.TESTNET[source.name.toUpperCase()],
        CHAINS.TESTNET[destination.name.toUpperCase()],
        symbol || source.tokenSymbol,
        gasLimit,
        gasMultiplier,
    );
}

export function getDepositAddress(source, destination, destinationAddress, symbol) {
    return axelarLocal.getDepositAddress(source, destination, destinationAddress, symbol, 8500);
}
