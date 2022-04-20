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
const {
	createNetwork, 
	relay, 
	stopAll, 
	getNetwork, 
	utils: { 
		defaultAccounts,
		setLogger,
	},
	setupNetwork,
	getDepositAddress,
	getFee,
} = require('../dist/networkUtils');

setLogger((...args) => {});

describe('create', () => {
	let chain;
	it('should create a Network from no params', async () => {
		chain = await createNetwork();
	});
	it('should create a Network from params', async () => {
		const name = 'test';
		const id = 1234;
		chain = await createNetwork({
			name: name,
			chainId: id
		});
		expect(chain.name).to.equal('test');
		expect(chain.chainId).to.equal(id);
		expect((await chain.provider.getNetwork()).chainId).to.equal(id);
	});
	it('should create a Network and connect to it remotely through http', async () => {
		const port = 8500;
		await createNetwork({
			port: port,
		});
		chain = await getNetwork(`http://localhost:${port}`);
	});
	it('should deploy a network on a preexisting chain', async () => {
		const port = 8500;    
		const accounts = defaultAccounts(20);
		const blank = require('ganache').server({
			wallet: { accounts: accounts },
			chain: {
				chainId: 3000,
				netwrokId: 3000,
			},
			logging: { quiet: true },
		});
		blank.listen(port);
		chain = await setupNetwork(`http://localhost:${port}`, {
			ownerKey: accounts[0].secretKey,
		});
		after(() => {
			blank.close();
		})
	});

	afterEach(async () => {
		expect(await chain.gateway.tokenAddresses('UST')).to.equal(chain.ust.address);
		await (await chain.gasReceiver.connect(chain.ownerWallet).collectFees(chain.ownerWallet.address, [])).wait();
		stopAll();
	});
});

describe('token', () => {
	let chain;
	let user;
	beforeEach(async() => {
		chain = await createNetwork();
		[user] = chain.userWallets;
	});
	afterEach(async() => {
		stopAll();
	});

	it('should give token to a user', async () => {
		const amount = 12584532;
		await chain.giveToken(user.address, 'UST', amount);
		expect(await chain.ust.balanceOf(user.address)).to.equal(amount);
	});
	it('should deploy a new token', async() => {
		const name = 'Test Token';
		const symbol = 'TEST';
		const decimals = 12;
		const cap = BigInt(124932492312);
		const token = await chain.deployToken(name, symbol, decimals, cap);
		expect(await token.name()).to.equal(name);
		expect(await token.symbol()).to.equal(symbol);
		expect(await token.decimals()).to.equal(decimals);
		expect(await token.cap()).to.equal(cap);
	})
});

describe('relay', async() => {
	let chain1, chain2;
	let user1, user2;
	beforeEach(async() => {
		chain1 = await createNetwork({seed: 1});
		[user1] = chain1.userWallets;
		chain2 = await createNetwork({seed: 2});
		[user2] = chain2.userWallets;

	});
	afterEach(async() => {
		stopAll();
	});
	describe('deposit address', async() => {
		it('should generate a deposit address', async () => {
			const depositAddress = getDepositAddress(chain1, chain2, user2.address, 'UST');
			const amount = BigInt(12423532412);
			const fee = BigInt(getFee(chain1, chain2, 'UST'));
			await chain1.giveToken(user1.address, 'UST', amount);
			await (await chain1.ust.connect(user1).transfer(depositAddress, amount)).wait();
			await relay();
			expect(await chain2.ust.balanceOf(user2.address)).to.equal(amount - fee);
		});
		it('should generate a deposit address to use twice', async () => {
			const depositAddress = getDepositAddress(chain1, chain2, user2.address, 'UST');
			const amount1 = BigInt(12423532412);
			const amount2 = BigInt(5489763092348);
			const fee = BigInt(getFee(chain1, chain2, 'UST'));
			await chain1.giveToken(user1.address, 'UST', amount1);
			await (await chain1.ust.connect(user1).transfer(depositAddress, amount1)).wait();
			await relay();
			expect(await chain2.ust.balanceOf(user2.address)).to.equal(amount1 - fee);

			await chain1.giveToken(user1.address, 'UST', amount2);
			await (await chain1.ust.connect(user1).transfer(depositAddress, amount2)).wait();
			await relay();
			expect(await chain2.ust.balanceOf(user2.address)).to.equal(amount1 - fee + amount2 - fee);
		});
	});
});