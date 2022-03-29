'use strict';

const {createNetwork: createChain, relay} = require('../../dist/networkUtils.js');
const { deployContract } = require('../../dist/utils.js');
const { utils : {defaultAbiCoder} } = require('ethers');

const ExecutableSample = require('../../build/ExecutableSample.json');

(async() => {
	//Create two chains and get a funded user for each
    const chain1 = await createChain();
    const [user1] = chain1.userWallets;
    const chain2 = await createChain({seed: "asdasd"});
    const [user2] = chain2.userWallets;
	
	//Deploy our IAxelarExecutable contracts
    const ex1 = await deployContract(user1, ExecutableSample, [chain1.gateway.address]);
    const ex2 = await deployContract(user2, ExecutableSample, [chain2.gateway.address]);

	//Inform our exeuctables about each other.
    await (await ex1.connect(user1).addSibling(chain2.name, ex2.address)).wait();
    await (await ex2.connect(user2).addSibling(chain1.name, ex1.address)).wait();

	//Get some UST on chain1.
    await chain1.giveToken(user1.address, 'UST', 10000);

	//This is used for logging.
	const print = async() => {
		console.log(`user1 has ${await chain1.ust.balanceOf(user1.address)} UST.`);
		console.log(`user2 has ${await chain2.ust.balanceOf(user2.address)} UST.`);
		console.log(`ex1: ${await ex1.value()}`);
		console.log(`ex2: ${await ex2.value()}`);
	}

	console.log('--- Initially ---');
    await print();

	//Approve the AxelarGateway to use our UST on chain1.
    await (await chain1.ust.connect(user1).approve(chain1.gateway.address, 10000)).wait();
	//And have it send it to chain2.
    await (await chain1.gateway.connect(user1).sendToken(chain2.name, user2.address, 'UST', 10000)).wait();
	//This facilitates the send.
    await relay();
	//After which the funds have reached chain2
	console.log('--- After Sending Token ---');
    await print();

	//Set the value on chain1. This will also cause the value on chain2 to change after relay() is called.
    await (await ex1.connect(user1).set("Hello World!")).wait();
	console.log('--- After Setting but Before Relay---');
    await print();
	//Updates the value on chain2 also.
    await relay();
	console.log('--- After Setting and Relaying---');
    await print();


	//Approve the executable to use our UST on chain2.
    await (await chain2.ust.connect(user2).approve(ex2.address, 10000)).wait();
	//Set the value on chain2 and initiate a transfer of UST to chain1. 
	//This will also cause the value on chain1 to change after relay() is called.
    await (await ex2.connect(user2).setAndSend('Have some UST!', chain1.name, user1.address, 'UST', 10000)).wait();
	
	console.log('--- After Setting And Sending but Before Relay---');
	await print();
	//Updates the value on chain1 also, and gets the UST to user1.
	await relay();
	console.log('--- After Setting And Sending and Relaying---');
	await print();

	//We can manually call a contract on another chain also.
	await (await chain2.gateway.connect(user2).callContract(
		chain1.name, 
		ex1.address, 
		defaultAbiCoder.encode(['string'], ['Only Chain1 sees this.']),
	)).wait();
	await relay();

	console.log('--- After Manually sending a contract call to Chain1 ---');
	await print();

	//Or manually call a contract with token on another chain.
    await (await chain1.ust.connect(user1).approve(chain1.gateway.address, 5000)).wait();
	await (await chain1.gateway.connect(user1).callContractWithToken(
		chain2.name, 
		ex2.address, 
		defaultAbiCoder.encode(['string', 'address'], ['Only Chain2 sees this one though.', user2.address]),
		'UST',
		5000,
	)).wait();
	await relay();

	console.log('--- After Manually sending a contract call with token to Chain2 ---');
	await print();
})();