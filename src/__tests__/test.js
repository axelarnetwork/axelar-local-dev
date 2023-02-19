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
} = require('../');
const BurnableMintableCappedERC20 = require('../../dist/artifacts/@axelar-network/axelar-cgp-solidity/contracts/BurnableMintableCappedERC20.sol/BurnableMintableCappedERC20.json');
const { keccak256, toUtf8Bytes } = require('ethers/lib/utils');

setLogger((...args) => {});

jest.setTimeout(300000);



describe('relay', () => {
    let chain1, chain2;
    let user1, user2;
    beforeEach(async () => {
        chain1 = await createNetwork({ seed: 1 });
        [user1] = chain1.userWallets;
        chain1.usdc = await chain1.deployToken('Axelar Wrapped USDC', 'aUSDC', 6, 0);
        chain2 = await createNetwork({ seed: 2 });
        [user2] = chain2.userWallets;
        chain2.usdc = await chain2.deployToken('Axelar Wrapped USDC', 'aUSDC', 6, 0);
    });
    afterEach(async () => {
        stopAll();
    });
    describe('deposit address', () => {
        it('should generate a deposit address', async () => {
            const depositAddress = getDepositAddress(chain1, chain2, user2.address, 'aUSDC');
            const amount = BigInt(12423532412);
            const fee = BigInt(getFee(chain1, chain2, 'aUSDC'));
            await chain1.giveToken(user1.address, 'aUSDC', amount);
            await (await chain1.usdc.connect(user1).transfer(depositAddress, amount)).wait();
            await relay();

            expect(BigInt(await chain2.usdc.balanceOf(user2.address))).to.equal(amount - fee);
        });
        it('should generate a deposit address to use twice', async () => {
            const depositAddress = getDepositAddress(chain1, chain2, user2.address, 'aUSDC');
            const amount1 = BigInt(12423532412);
            const amount2 = BigInt(5489763092348);
            const fee = BigInt(getFee(chain1, chain2, 'aUSDC'));
            await chain1.giveToken(user1.address, 'aUSDC', amount1);
            await (await chain1.usdc.connect(user1).transfer(depositAddress, amount1)).wait();
            await relay();
            expect(BigInt(await chain2.usdc.balanceOf(user2.address))).to.equal(amount1 - fee);

            await chain1.giveToken(user1.address, 'aUSDC', amount2);
            await (await chain1.usdc.connect(user1).transfer(depositAddress, amount2)).wait();
            await relay();
            expect(BigInt(await chain2.usdc.balanceOf(user2.address))).to.equal(amount1 - fee + amount2 - fee);
        });
        it('should generate a deposit address remotely', async () => {
            const port = 8501;
            await new Promise((resolve) => {
                listen(port, resolve());
            });
            const depositAddress = await getDepositAddress(chain1, chain2, user2.address, 'aUSDC', port);
            const amount = BigInt(12423532412);
            const fee = BigInt(getFee(chain1, chain2, 'aUSDC'));
            await chain1.giveToken(user1.address, 'aUSDC', amount);
            await (await chain1.usdc.connect(user1).transfer(depositAddress, amount)).wait();
            await relay();
            expect(BigInt(await chain2.usdc.balanceOf(user2.address))).to.equal(amount - fee);
        });
    });
    describe('send token', () => {
        it('should send some usdc over', async () => {
            const amount = BigInt(1e8);
            const fee = BigInt(getFee(chain1, chain2, 'aUSDC'));
            await chain1.giveToken(user1.address, 'aUSDC', amount);
            await (await chain1.usdc.connect(user1).approve(chain1.gateway.address, amount)).wait();
            await (await chain1.gateway.connect(user1).sendToken(chain2.name, user2.address, 'aUSDC', amount)).wait();
            await relay();
            expect(BigInt(await chain2.usdc.balanceOf(user2.address))).to.equal(amount - fee);
        });
    });
    describe('call contract', () => {
        let ex1, ex2;
        const Executable = require('../artifacts/src/contracts/test/Executable.sol/Executable.json');

        const message = 'hello there executables!';
        const payload = defaultAbiCoder.encode(['string'], [message]);
        beforeEach(async () => {
            ex1 = await deployContract(user1, Executable, [chain1.gateway.address, chain1.gasService.address]);
            ex2 = await deployContract(user2, Executable, [chain2.gateway.address, chain1.gasService.address]);

            await await ex1.connect(user1).addSibling(chain2.name, ex2.address);
            await await ex2.connect(user2).addSibling(chain1.name, ex1.address);
        });
        it('should call a contract manually and fulfill the call', async () => {
            await (await chain1.gateway.connect(user1).callContract(chain2.name, ex2.address, payload)).wait();
            await relay();
            const filter = chain2.gateway.filters.ContractCallApproved();
            const args = (await chain2.gateway.queryFilter(filter))[0].args;
            await (await ex2.connect(user2).execute(args.commandId, chain1.name, user1.address, payload)).wait();

            expect(await ex1.value()).to.equal('');
            expect(await ex2.value()).to.equal(message);
            expect(await ex2.sourceChain()).to.equal(chain1.name);
            expect(await ex2.sourceAddress()).to.equal(user1.address);
        });
        it('should pay for gas and call a contract manually', async () => {
            await (
                await chain1.gasService
                    .connect(user1)
                    .payNativeGasForContractCall(user1.address, chain2.name, ex2.address, payload, user1.address, { value: 1e6 })
            ).wait();
            await (await chain1.gateway.connect(user1).callContract(chain2.name, ex2.address, payload)).wait();
            await relay();

            expect(await ex1.value()).to.equal('');
            expect(await ex2.value()).to.equal(message);
            expect(await ex2.sourceChain()).to.equal(chain1.name);
            expect(await ex2.sourceAddress()).to.equal(user1.address);
        });
        it('should call a contract through the sibling and fulfill the call', async () => {
            await (await ex1.connect(user1).set(chain2.name, message)).wait();
            await relay();
            const filter = chain2.gateway.filters.ContractCallApproved();
            const args = (await chain2.gateway.queryFilter(filter))[0].args;
            await (await ex2.connect(user2).execute(args.commandId, chain1.name, ex1.address, payload)).wait();

            expect(await ex1.value()).to.equal(message);
            expect(await ex2.value()).to.equal(message);
            expect(await ex2.sourceChain()).to.equal(chain1.name);
            expect(await ex2.sourceAddress()).to.equal(ex1.address);
        });
        it('should have the sibling pay for gas and make the call', async () => {
            await (await ex1.connect(user1).set(chain2.name, message, { value: BigInt(1e18) })).wait();
            await relay();

            expect(await ex1.value()).to.equal(message);
            expect(await ex2.value()).to.equal(message);
            expect(await ex2.sourceChain()).to.equal(chain1.name);
            expect(await ex2.sourceAddress()).to.equal(ex1.address);
        });
    });
    describe('call contract with token', () => {
        let ex1, ex2;
        const Executable = require('../artifacts/src/contracts/test/ExecutableWithToken.sol/ExecutableWithToken.json');

        const message = 'hello there executables!';
        const amount = 1234255675;
        let payload;

        beforeEach(async () => {
            payload = defaultAbiCoder.encode(['string', 'address'], [message, user2.address]);
            ex1 = await deployContract(user1, Executable, [chain1.gateway.address, chain1.gasService.address]);
            ex2 = await deployContract(user2, Executable, [chain2.gateway.address, chain1.gasService.address]);

            await await ex1.connect(user1).addSibling(chain2.name, ex2.address);
            await await ex2.connect(user2).addSibling(chain1.name, ex1.address);

            await chain1.giveToken(user1.address, 'aUSDC', amount);
        });
        it('should call a contract manually and fulfill the call', async () => {
            await (await chain1.usdc.connect(user1).approve(chain1.gateway.address, amount)).wait();
            await (await chain1.gateway.connect(user1).callContractWithToken(chain2.name, ex2.address, payload, 'aUSDC', amount)).wait();
            await relay();
            const filter = chain2.gateway.filters.ContractCallApprovedWithMint();
            const args = (await chain2.gateway.queryFilter(filter))[0].args;
            await (await ex2.connect(user2).executeWithToken(args.commandId, chain1.name, user1.address, payload, 'aUSDC', amount)).wait();

            expect(await ex1.value()).to.equal('');
            expect(await ex2.value()).to.equal(message);
            expect(await ex2.sourceChain()).to.equal(chain1.name);
            expect(await ex2.sourceAddress()).to.equal(user1.address);
            expect((await chain2.usdc.balanceOf(user2.address)).toNumber()).to.equal(amount);
        });
        it('should pay for gas and call a contract manually', async () => {
            await await chain1.gasService
                .connect(user1)
                .payNativeGasForContractCallWithToken(user1.address, chain2.name, ex2.address, payload, 'aUSDC', amount, user1.address, {
                    value: 1e6,
                });

            await (await chain1.usdc.connect(user1).approve(chain1.gateway.address, amount)).wait();
            await (await chain1.gateway.connect(user1).callContractWithToken(chain2.name, ex2.address, payload, 'aUSDC', amount)).wait();
            await relay();

            expect(await ex1.value()).to.equal('');
            expect(await ex2.value()).to.equal(message);
            expect(await ex2.sourceChain()).to.equal(chain1.name);
            expect(await ex2.sourceAddress()).to.equal(user1.address);
            expect((await chain2.usdc.balanceOf(user2.address)).toNumber()).to.equal(amount);
        });
        it('should call a contract through the sibling and fulfill the call', async () => {
            await (await chain1.usdc.connect(user1).approve(ex1.address, amount)).wait();
            await (await ex1.connect(user1).setAndSend(chain2.name, message, user2.address, 'aUSDC', amount)).wait();
            await relay();
            const filter = chain2.gateway.filters.ContractCallApprovedWithMint();
            const args = (await chain2.gateway.queryFilter(filter))[0].args;
            await (await ex2.connect(user2).executeWithToken(args.commandId, chain1.name, ex1.address, payload, 'aUSDC', amount)).wait();

            expect(await ex1.value()).to.equal(message);
            expect(await ex2.value()).to.equal(message);
            expect(await ex2.sourceChain()).to.equal(chain1.name);
            expect(await ex2.sourceAddress()).to.equal(ex1.address);
            expect((await chain2.usdc.balanceOf(user2.address)).toNumber()).to.equal(amount);
        });
        it('should have the sibling pay for gas and make the call', async () => {
            await (await chain1.usdc.connect(user1).approve(ex1.address, amount)).wait();
            await (
                await ex1.connect(user1).setAndSend(chain2.name, message, user2.address, 'aUSDC', amount, {
                    value: 1e6,
                })
            ).wait();
            await relay();

            expect(await ex1.value()).to.equal(message);
            expect(await ex2.value()).to.equal(message);
            expect(await ex2.sourceChain()).to.equal(chain1.name);
            expect(await ex2.sourceAddress()).to.equal(ex1.address);
            expect((await chain2.usdc.balanceOf(user2.address)).toNumber()).to.equal(amount);
        });
    });
});

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
