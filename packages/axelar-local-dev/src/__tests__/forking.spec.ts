/* eslint-disable @typescript-eslint/no-var-requires */
'use strict';

import chai from 'chai';
import { Contract, Wallet } from 'ethers';
const { expect } = chai;
import { relay, stopAll, setLogger, forkNetwork, mainnetInfo, networks, getFee, ChainCloneData } from '../';
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
        const chain: NetworkUsdc = await forkNetwork(avalanche, {
            ganacheOptions: {
                fork: { deleteCache: true },
            },
        });
        chain.usdc = await chain.getTokenContract(tokenAlias);
        expect(await chain.usdc.name()).to.equal('Axelar Wrapped USDC');
        const address = new Wallet(keccak256(toUtf8Bytes('random'))).address;
        await chain.giveToken(address, tokenAlias, BigInt(testAmount));
        expect(Number(await chain.usdc.balanceOf(address))).to.equal(testAmount);
        expect(chain.gateway.address).to.equal(avalanche.gateway);
    });

    it('should fork Avalanche and Ethereum and send some USDC back and forth', async () => {
        const chains = mainnetInfo as any;
        const alias = 'uusdc';

        for (const chainName of ['Avalanche', 'Ethereum']) {
            const chainInfo = chains[chainName.toLowerCase()];
            const chain = (await forkNetwork(chainInfo)) as any;
            chain.usdc = await chain.getTokenContract(alias);
        }

        const avalanche = networks[0] as any;
        const ethereum = networks[1] as any;

        const [userAvalanche] = avalanche.userWallets;
        const [userEthereum] = ethereum.userWallets;
        const amount1 = BigInt(100e6);
        const fee1 = BigInt(getFee());
        await avalanche.giveToken(userAvalanche.address, alias, amount1);
        expect(BigInt(await avalanche.usdc.balanceOf(userAvalanche.address))).to.equal(amount1);
        await (await avalanche.usdc.connect(userAvalanche).approve(avalanche.gateway.address, amount1)).wait();
        await (
            await avalanche.gateway.connect(userAvalanche).sendToken(ethereum.name, userEthereum.address, avalanche.tokens[alias], amount1)
        ).wait();

        await relay();
        expect(BigInt(await ethereum.usdc.balanceOf(userEthereum.address))).to.equal(BigInt(amount1 - fee1));
        const amount2 = amount1 - fee1;
        const fee2 = BigInt(getFee());
        await (await ethereum.usdc.connect(userEthereum).approve(ethereum.gateway.address, amount2)).wait();
        await (
            await ethereum.gateway.connect(userEthereum).sendToken(avalanche.name, userAvalanche.address, ethereum.tokens[alias], amount2)
        ).wait();

        await relay();
        expect(BigInt(await avalanche.usdc.balanceOf(userAvalanche.address))).to.equal(BigInt(amount2 - fee2));
    });
});
