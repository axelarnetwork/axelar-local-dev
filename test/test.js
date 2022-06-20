'use strict';

const chai = require('chai');
const {
  utils: {
    defaultAbiCoder,
    keccak256,
  },
} = require('ethers');
const { solidity } = require('ethereum-waffle');
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
		deployContract,
	},
	setupNetwork,
	getDepositAddress,
	getFee,
	listen
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
		after(async () => {
			await blank.close();
		})
	});

	afterEach(async () => {
		expect(await chain.gateway.tokenAddresses('aUSDC')).to.equal(chain.usdc.address);
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
		await chain.giveToken(user.address, 'aUSDC', amount);
		expect(await chain.usdc.balanceOf(user.address)).to.equal(amount);
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
			const depositAddress = getDepositAddress(chain1, chain2, user2.address, 'aUSDC');
			const amount = BigInt(12423532412);
			const fee = BigInt(getFee(chain1, chain2, 'aUSDC'));
			await chain1.giveToken(user1.address, 'aUSDC', amount);
			await (await chain1.usdc.connect(user1).transfer(depositAddress, amount)).wait();
			await relay();
			expect(await chain2.usdc.balanceOf(user2.address)).to.equal(amount - fee);
		});
		it('should generate a deposit address to use twice', async () => {
			const depositAddress = getDepositAddress(chain1, chain2, user2.address, 'aUSDC');
			const amount1 = BigInt(12423532412);
			const amount2 = BigInt(5489763092348);
			const fee = BigInt(getFee(chain1, chain2, 'aUSDC'));
			await chain1.giveToken(user1.address, 'aUSDC', amount1);
			await (await chain1.usdc.connect(user1).transfer(depositAddress, amount1)).wait();
			await relay();
			expect(await chain2.usdc.balanceOf(user2.address)).to.equal(amount1 - fee);

			await chain1.giveToken(user1.address, 'aUSDC', amount2);
			await (await chain1.usdc.connect(user1).transfer(depositAddress, amount2)).wait();
			await relay();
			expect(await chain2.usdc.balanceOf(user2.address)).to.equal(amount1 - fee + amount2 - fee);
		});
		it('should generate a deposit address remotely', async () => {
			const port = 8501
			await new Promise((resolve) => {
				listen(port, resolve());
			});
			const depositAddress = await getDepositAddress(chain1, chain2, user2.address, 'aUSDC', port);
			const amount = BigInt(12423532412);
			const fee = BigInt(getFee(chain1, chain2, 'aUSDC'));
			await chain1.giveToken(user1.address, 'aUSDC', amount);
			await (await chain1.usdc.connect(user1).transfer(depositAddress, amount)).wait();
			await relay();
			expect(await chain2.usdc.balanceOf(user2.address)).to.equal(amount - fee);
		});
	});
	describe('send token', async () => {
		it('should send some usdc over', async () => {
			const amount = BigInt(1e8);
			const fee = BigInt(getFee(chain1, chain2, 'aUSDC'));
			await chain1.giveToken(user1.address, 'aUSDC', amount);
			await (await chain1.usdc.connect(user1).approve(chain1.gateway.address, amount)).wait();
			await (await chain1.gateway.connect(user1).sendToken(chain2.name, user2.address, 'aUSDC', amount)).wait();
			await relay();
			expect(await chain2.usdc.balanceOf(user2.address)).to.equal(amount - fee);
		});
	});
	describe('call contract', async () => {
		let ex1, ex2;
		const Executable = require('../build/Executable.json');

		const message = 'hello there executables!';
		const payload = defaultAbiCoder.encode(['string'], [message]);
		beforeEach(async () => {
			ex1 = await deployContract(user1, Executable, [chain1.gateway.address, chain1.gasReceiver.address]);
			ex2 = await deployContract(user2, Executable, [chain2.gateway.address, chain1.gasReceiver.address]);

			await (await ex1.connect(user1).addSibling(chain2.name, ex2.address));
			await (await ex2.connect(user2).addSibling(chain1.name, ex1.address));
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
			await (await chain1.gasReceiver.connect(user1)
				.payNativeGasForContractCall(user1.address, chain2.name, ex2.address, payload, user1.address, {value: 1e6}));
			await (await chain1.gateway.connect(user1)
				.callContract(chain2.name, ex2.address, payload)).wait();
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
			await (await ex1.connect(user1).set(chain2.name, message, {value: BigInt(1e18)})).wait();
			await relay();

			expect(await ex1.value()).to.equal(message);
			expect(await ex2.value()).to.equal(message);
			expect(await ex2.sourceChain()).to.equal(chain1.name);
			expect(await ex2.sourceAddress()).to.equal(ex1.address);
		});
	});
	describe('call contract with token', async () => {
		let ex1, ex2;
		const Executable = require('../build/ExecutableWithToken.json');
		
		const message = 'hello there executables!';
		const amount = 1234255675;
		const fee = getFee(chain1, chain2, 'aUSDC');
		let payload;
		
		beforeEach(async () => {
			payload = defaultAbiCoder.encode(['string', 'address'], [message, user2.address]);
			ex1 = await deployContract(user1, Executable, [chain1.gateway.address, chain1.gasReceiver.address]);
			ex2 = await deployContract(user2, Executable, [chain2.gateway.address, chain1.gasReceiver.address]);

			await (await ex1.connect(user1).addSibling(chain2.name, ex2.address));
			await (await ex2.connect(user2).addSibling(chain1.name, ex1.address));

			await chain1.giveToken(user1.address, 'aUSDC', amount);
		});
		it('should call a contract manually and fulfill the call', async () => {
			await (await chain1.usdc.connect(user1).approve(chain1.gateway.address, amount)).wait();
			await (await chain1.gateway.connect(user1).callContractWithToken(chain2.name, ex2.address, payload, 'aUSDC', amount)).wait();
			await relay();
			const filter = chain2.gateway.filters.ContractCallApprovedWithMint();
			const args = (await chain2.gateway.queryFilter(filter))[0].args;
			await (await ex2.connect(user2).executeWithToken(args.commandId, chain1.name, user1.address, payload, 'aUSDC', amount-fee)).wait();

			expect(await ex1.value()).to.equal('');
			expect(await ex2.value()).to.equal(message);
			expect(await ex2.sourceChain()).to.equal(chain1.name);
			expect(await ex2.sourceAddress()).to.equal(user1.address);
			expect(await chain2.usdc.balanceOf(user2.address)).to.equal(amount-fee);
		});
		it('should pay for gas and call a contract manually', async () => {
			await (await chain1.gasReceiver.connect(user1)
				.payNativeGasForContractCallWithToken(user1.address, chain2.name, ex2.address, payload, 'aUSDC', amount, user1.address, {value: 1e6}));

			await (await chain1.usdc.connect(user1).approve(chain1.gateway.address, amount)).wait();
			await (await chain1.gateway.connect(user1)
				.callContractWithToken(chain2.name, ex2.address, payload, 'aUSDC', amount)).wait();
			await relay();

			expect(await ex1.value()).to.equal('');
			expect(await ex2.value()).to.equal(message);
			expect(await ex2.sourceChain()).to.equal(chain1.name);
			expect(await ex2.sourceAddress()).to.equal(user1.address);
			expect(await chain2.usdc.balanceOf(user2.address)).to.equal(amount-fee);
		});
		it('should call a contract through the sibling and fulfill the call', async () => {

			await (await chain1.usdc.connect(user1).approve(ex1.address, amount)).wait();
			await (await ex1.connect(user1).setAndSend(chain2.name, message, user2.address, 'aUSDC', amount)).wait();
			await relay();
			const filter = chain2.gateway.filters.ContractCallApprovedWithMint();
			const args = (await chain2.gateway.queryFilter(filter))[0].args;
			await (await ex2.connect(user2).executeWithToken(args.commandId, chain1.name, ex1.address, payload, 'aUSDC', amount - fee)).wait();
			
			expect(await ex1.value()).to.equal(message);
			expect(await ex2.value()).to.equal(message);
			expect(await ex2.sourceChain()).to.equal(chain1.name);
			expect(await ex2.sourceAddress()).to.equal(ex1.address);
			expect(await chain2.usdc.balanceOf(user2.address)).to.equal(amount-fee);
		});
		it('shouldhave the sibling pay for gas and make the call', async () => {
			await (await chain1.usdc.connect(user1).approve(ex1.address, amount)).wait();
			await (await ex1.connect(user1).setAndSend(chain2.name, message, user2.address, 'aUSDC', amount, {value: 1e6})).wait();
			await relay();

			expect(await ex1.value()).to.equal(message);
			expect(await ex2.value()).to.equal(message);
			expect(await ex2.sourceChain()).to.equal(chain1.name);
			expect(await ex2.sourceAddress()).to.equal(ex1.address);
			expect(await chain2.usdc.balanceOf(user2.address)).to.equal(amount-fee);
		});
	});
});