'use strict';

const chai = require('chai');
const {
  utils: {
    defaultAbiCoder,
    keccak256,
  },
} = require('ethers');
const { deployContract, solidity } = require('ethereum-waffle');
chai.use(solidity);
const { expect } = chai;
const {createNetwork: createChain, relay, stopAll} = require('../src/api/AxelarLocal');

const IAxelarExecutable = require('../build/ExecutableSample.json');

describe('test', () => {
  let chain1, chain2, chain3;
  let user1, user2, user3;
  let executable1, executable2, executable3;

  beforeEach(async () => {
    chain1 = await createChain();
    [user1] = chain1.userWallets;
    chain2 = await createChain();
    [user2] = chain2.userWallets;
    chain3 = await createChain();
    [user3] = chain3.userWallets;

    executable1 = await deployContract(user1, IAxelarExecutable, [chain1.gateway.address]);
    executable2 = await deployContract(user2, IAxelarExecutable, [chain2.gateway.address]);
    executable3 = await deployContract(user3, IAxelarExecutable, [chain3.gateway.address]);
    await (await executable1.connect(user1).addSibling(chain2.name, executable2.address)).wait();
    await (await executable1.connect(user1).addSibling(chain3.name, executable3.address)).wait();
    await (await executable2.connect(user2).addSibling(chain1.name, executable1.address)).wait();
    await (await executable2.connect(user2).addSibling(chain3.name, executable3.address)).wait();
    await (await executable3.connect(user3).addSibling(chain1.name, executable1.address)).wait();
    await (await executable3.connect(user3).addSibling(chain2.name, executable2.address)).wait();
  });
  afterEach(async() => {
	await stopAll();
  });

	describe('sendToken', () => {
		it('should send token', async() => {
			const amount = 1000;
			await chain1.giveToken(user1.address, 'UST', amount);
			await expect(await chain1.ust.balanceOf(user1.address)).to.equal(amount);
			await expect(chain1.ust.connect(user1).approve(chain1.gateway.address, amount))
				.to.emit(chain1.ust, 'Approval')
				.withArgs(user1.address, chain1.gateway.address, amount);
			await expect(chain1.gateway.connect(user1).sendToken(chain2.name, user2.address, 'UST', amount))
				.to.emit(chain1.gateway, 'TokenSent')
				.withArgs(user1.address, chain2.name, user2.address, 'UST', amount);

			await relay();

			expect(await chain1.ust.balanceOf(user1.address))
				.to.equal(0);
			expect(await chain2.ust.balanceOf(user2.address))
				.to.equal(amount);
		});
	});

	describe('contractCall', () => {
		it('should update destination value from gateway', async() => {
			const value = 'test Value';
			const payload = defaultAbiCoder.encode(['string'], [value]);
			await expect(chain1.gateway.connect(user1).callContract(chain2.name, executable2.address, payload))
				.to.emit(chain1.gateway, 'ContractCall')
				.withArgs(user1.address, chain2.name, executable2.address, keccak256(payload), payload);

			await relay();
			expect(await executable1.value())
				.to.equal('');
			expect(await executable2.value())
				.to.equal(value);
			expect(await executable3.value())
				.to.equal('');
		});
		it('should update all values from executable', async() => {
			const value = 'test Value';
			const payload = defaultAbiCoder.encode(['string'], [value]);

			await expect(executable1.connect(user1).set(value))
				.to.emit(chain1.gateway, 'ContractCall')
				.withArgs(executable1.address, chain2.name, executable2.address, keccak256(payload), payload)
				.and.to.emit(chain1.gateway, 'ContractCall')
				.withArgs(executable1.address, chain3.name, executable3.address, keccak256(payload), payload);

			await relay();

			expect(await executable1.value())
				.to.equal(value);
			expect(await executable2.value())
				.to.equal(value);
			expect(await executable3.value())
				.to.equal(value);
		});
	});
	describe('contractCallWithMint', () => {
		it('should update destination value from gateway', async() => {
			const amount = 1000;
			await chain1.giveToken(user1.address, 'UST', amount);
			await expect(await chain1.ust.balanceOf(user1.address)).to.equal(amount);
			await expect(chain1.ust.connect(user1).approve(chain1.gateway.address, amount))
				.to.emit(chain1.ust, 'Approval')
				.withArgs(user1.address, chain1.gateway.address, amount);
			const value = 'test Value';
			const payload = defaultAbiCoder.encode(['string', 'address'], [value, user2.address]);

			await expect(chain1.gateway.connect(user1).callContractWithToken(chain2.name, executable2.address, payload, 'UST', amount))
				.to.emit(chain1.gateway, 'ContractCallWithToken')
				.withArgs(user1.address, chain2.name, executable2.address, keccak256(payload), payload, 'UST', amount);
			
				await relay();

			expect(await executable1.value())
				.to.equal('');
			expect(await executable2.value())
				.to.equal(value);
			expect(await executable3.value())
				.to.equal('');
			expect(await chain1.ust.balanceOf(user1.address))
					.to.equal(0);
			expect(await chain2.ust.balanceOf(user2.address))
				.to.equal(amount);
		});
		it('should update all values from executable', async() => {
			const amount = 1000;
			await chain1.giveToken(user1.address, 'UST', amount);
			await expect(await chain1.ust.balanceOf(user1.address)).to.equal(amount);
			await expect(chain1.ust.connect(user1).approve(executable1.address, amount))
				.to.emit(chain1.ust, 'Approval')
				.withArgs(user1.address, executable1.address, amount);
			const value = 'test Value';
			const payload2 = defaultAbiCoder.encode(['string', 'address'], [value, user2.address]);
			const payload3 = defaultAbiCoder.encode(['string'], [value]);

			await expect(executable1.connect(user1).setAndSend(value, chain2.name, user2.address, 'UST', amount))
				.to.emit(chain1.gateway, 'ContractCallWithToken')
				.withArgs(executable1.address, chain2.name, executable2.address, keccak256(payload2), payload2, 'UST', amount)
				.and.to.emit(chain1.gateway, 'ContractCall')
				.withArgs(executable1.address, chain3.name, executable3.address, keccak256(payload3), payload3);

			await relay();

			expect(await executable1.value())
				.to.equal(value);
			expect(await executable2.value())
				.to.equal(value);
			expect(await executable3.value())
				.to.equal(value);
			expect(await chain1.ust.balanceOf(user1.address))
					.to.equal(0);
			expect(await chain2.ust.balanceOf(user2.address))
				.to.equal(amount);
		});
	});
	describe('multiple Calls', () => {
		it('should update destination value from gateway', async() => {
			const amount1 = 1000;
			const amount2 = 2000;
			await chain1.giveToken(user1.address, 'UST', amount1+amount2);
			await expect(await chain1.ust.balanceOf(user1.address)).to.equal(amount1+amount2);
			

			const value = 'test Value';
			const payload2 = defaultAbiCoder.encode(['string', 'address'], [value, user2.address]);
			const payload3 = defaultAbiCoder.encode(['string'], [value]);
			
			await expect(chain1.ust.connect(user1).approve(chain1.gateway.address, amount1))
				.to.emit(chain1.ust, 'Approval')
				.withArgs(user1.address, chain1.gateway.address, amount1);
			await expect(chain1.gateway.connect(user1).sendToken(chain2.name, user2.address, 'UST', amount1))
				.to.emit(chain1.gateway, 'TokenSent')
				.withArgs(user1.address, chain2.name, user2.address, 'UST', amount1);

			await expect(chain1.ust.connect(user1).approve(executable1.address, amount2))
				.to.emit(chain1.ust, 'Approval')
				.withArgs(user1.address, executable1.address, amount2);
			await expect(executable1.connect(user1).setAndSend(value, chain2.name, user2.address, 'UST', amount2))
				.to.emit(chain1.gateway, 'ContractCallWithToken')
				.withArgs(executable1.address, chain2.name, executable2.address, keccak256(payload2), payload2, 'UST', amount2)
				.and.to.emit(chain1.gateway, 'ContractCall')
				.withArgs(executable1.address, chain3.name, executable3.address, keccak256(payload3), payload3);

			await relay();

			expect(await executable1.value())
				.to.equal(value);
			expect(await executable2.value())
				.to.equal(value);
			expect(await executable3.value())
				.to.equal(value);
			expect(await chain1.ust.balanceOf(user1.address))
					.to.equal(0);
			expect(await chain2.ust.balanceOf(user2.address))
				.to.equal(amount1+amount2);
		});
	});
});