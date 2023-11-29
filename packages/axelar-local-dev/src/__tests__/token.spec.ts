/* eslint-disable @typescript-eslint/no-var-requires */
('use strict');
import chai from 'chai';
import { Network } from '../Network';
import { Contract, Wallet } from 'ethers';
import { createNetwork, setLogger, stopAll } from '../';

const { expect } = chai;

setLogger(() => undefined);

describe('token', () => {
    let chain: Network;
    let usdc: Contract;
    let user: Wallet;
    beforeEach(async () => {
        chain = await createNetwork();
        [user] = chain.userWallets;
        usdc = await chain.deployToken('Axelar Wrapped USDC', 'aUSDC', 6, BigInt(0));
    });
    afterEach(async () => {
        stopAll();
    });

    it('should give token to a user', async () => {
        const amount = 12584532;
        await chain.giveToken(user.address, 'aUSDC', BigInt(amount));
        expect(Number(await usdc.balanceOf(user.address))).to.equal(amount);
    });
    it('should deploy a new token', async () => {
        const name = 'Test Token';
        const symbol = 'TEST';
        const decimals = 12;
        const cap = BigInt(124932492312);
        const token = await chain.deployToken(name, symbol, decimals, cap);
        expect(await token.name()).to.equal(name);
        expect(await token.symbol()).to.equal(symbol);
        expect(Number(await token.decimals())).to.equal(decimals);
        expect(BigInt(await token.cap())).to.equal(cap);
    });
});
