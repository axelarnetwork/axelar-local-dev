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
const {createNetwork, relay, stopAll, getNetwork} = require('../dist/networkUtils');

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

	afterEach(async () => {
		expect(await chain.gateway.tokenAddresses('UST')).to.equal(chain.ust.address);
		await (await chain.gasReceiver.connect(chain.ownerWallet).collectFees(chain.ownerWallet.address, [])).wait();
		stopAll();
	});
});