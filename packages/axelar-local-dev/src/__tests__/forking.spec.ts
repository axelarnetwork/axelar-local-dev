/* eslint-disable @typescript-eslint/no-var-requires */
'use strict';

import chai from 'chai';
import { Contract, Wallet } from 'ethers';
const { expect } = chai;
import { stopAll, setLogger, forkNetwork, mainnetInfo } from '../';
import { keccak256, toUtf8Bytes } from 'ethers/lib/utils';
import { Network } from '../Network';

setLogger(() => undefined);

interface NetworkUsdc extends Network {
    usdc?: Contract;
}

describe.skip('forking', () => {
    afterEach(async () => {
        await stopAll();
    });

    it.skip('should fork Avalanche mainnet', async () => {
        const chainName = 'avalanche';
        const tokenAlias = 'uusdc';
        const testAmount = 1234;
        const chains = mainnetInfo as any;
        const avalanche = chains[chainName.toLowerCase()];
        const chain: NetworkUsdc = await forkNetwork(avalanche);
        chain.usdc = await chain.getTokenContract(tokenAlias);
        expect(await chain.usdc.name()).to.equal('Axelar Wrapped USDC');
        const address = new Wallet(keccak256(toUtf8Bytes('random'))).address;
        await chain.giveToken(address, tokenAlias, BigInt(testAmount));
        expect(Number(await chain.usdc.balanceOf(address))).to.equal(testAmount);
        expect(chain.gateway.address).to.equal(avalanche.gateway);
    });
});
