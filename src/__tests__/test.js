/* eslint-disable @typescript-eslint/no-var-requires */
'use strict';

const chai = require('chai');
const {
    utils: { defaultAbiCoder },
    Contract,
    Wallet,
} = require('ethers');

const { expect } = chai;
const {
    createNetwork,
    relay,
    stopAll,
    utils: { setLogger, deployContract },
    getDepositAddress,
    getFee,
    listen,
    forkNetwork,
    mainnetInfo,
    networks,
    contracts: { BurnableMintableCappedERC20 },
} = require('../');
const { keccak256, toUtf8Bytes } = require('ethers/lib/utils');

setLogger(() => undefined);

jest.setTimeout(300000);

describe.skip('forking', () => {
    afterEach(async () => {
        stopAll();
    });
    it('should fork Avalanche mainnet', async () => {
        const chainName = 'Avalanche';
        const chains = mainnetInfo;
        const avalanche = chains.find((chain) => chain.name === chainName);
        const chain = await forkNetwork(avalanche, {
            ganacheOptions: {
                fork: { deleteCache: true },
            },
        });
        const tokenAddress = await chain.gateway.tokenAddresses('axlUSDC');
        chain.usdc = new Contract(tokenAddress, BurnableMintableCappedERC20.abi, chain.provider);
        expect(await chain.usdc.name()).to.equal('Axelar Wrapped USDC');
        const address = new Wallet(keccak256(toUtf8Bytes('random'))).address;
        await chain.giveToken(address, 'uusdc', 1234);
        expect(Number(await chain.usdc.balanceOf(address))).to.equal(1234);
        expect(chain.gateway.address).to.equal(avalanche.gateway);
    });
    it('should fork Avalanche and Ethereum and send some USDC back and forth', async () => {
        const chains = mainnetInfo;
        const alias = 'uusdc';

        for (const chainName of ['Avalanche', 'Ethereum']) {
            const chainInfo = chains.find((chain) => chain.name === chainName);
            const chain = await forkNetwork(chainInfo);
            chain.usdc = await chain.getTokenContract(alias);
        }

        const avalanche = networks[0];
        const ethereum = networks[1];

        const [userAvalanche] = avalanche.userWallets;
        const [userEthereum] = ethereum.userWallets;
        const amount1 = BigInt(100e6);
        const fee1 = BigInt(getFee(avalanche, ethereum));
        await avalanche.giveToken(userAvalanche.address, alias, amount1);
        expect(BigInt(await avalanche.usdc.balanceOf(userAvalanche.address))).to.equal(amount1);
        await (await avalanche.usdc.connect(userAvalanche).approve(avalanche.gateway.address, amount1)).wait();
        await (
            await avalanche.gateway.connect(userAvalanche).sendToken(ethereum.name, userEthereum.address, avalanche.tokens[alias], amount1)
        ).wait();

        await relay();
        expect(BigInt(await ethereum.usdc.balanceOf(userEthereum.address))).to.equal(BigInt(amount1 - fee1));
        const amount2 = amount1 - fee1;
        const fee2 = BigInt(getFee(ethereum, avalanche));
        await (await ethereum.usdc.connect(userEthereum).approve(ethereum.gateway.address, amount2)).wait();
        await (
            await ethereum.gateway.connect(userEthereum).sendToken(avalanche.name, userAvalanche.address, ethereum.tokens[alias], amount2)
        ).wait();

        await relay();
        expect(BigInt(await avalanche.usdc.balanceOf(userAvalanche.address))).to.equal(BigInt(amount2 - fee2));
    });
});
