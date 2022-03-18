'use strict';

const {createChain, relay} = require('./AxelarLocal');
const { deployContract } = require('ethereum-waffle');


const IAxelarExecutable = require('../build/ExecutableSample.json');



(async() => {
    const chain1 = await createChain();
    const [user1] = chain1.userWallets;
    const chain2 = await createChain();
    const [user2] = chain2.userWallets;


    const ex1 = await deployContract(user1, IAxelarExecutable, [chain1.gateway.address]);
    const ex2 = await deployContract(user2, IAxelarExecutable, [chain2.gateway.address]);
    await (await ex1.connect(user1).addSibling(chain2.name, ex2.address)).wait();
    await (await ex2.connect(user2).addSibling(chain1.name, ex1.address)).wait();


    await chain1.giveToken(user1.address, 'UST', 10000);

	const print = async() => {
		console.log(`user1 has ${await chain1.ust.balanceOf(user1.address)} UST.`);
		console.log(`user2 has ${await chain2.ust.balanceOf(user2.address)} UST.`);
		console.log(`ex1: ${await ex1.value()}`);
		console.log(`ex2: ${await ex2.value()}`);
	}

	console.log('--- Initially ---');
    await print();

    await (await chain1.ust.connect(user1).approve(chain1.gateway.address, 10000)).wait();
    await (await chain1.gateway.connect(user1).sendToken(chain2.name, user2.address, 'UST', 10000)).wait();
    await relay();
	console.log('--- After Sending Token ---');
    await print();

    await (await ex1.connect(user1).set("Hello World!")).wait();
    await relay();
	console.log('--- After Setting ---');
    await print();

    await (await chain2.ust.connect(user2).approve(ex2.address, 10000)).wait();
    await (await ex2.connect(user2).setAndSend('Have some UST!', chain1.name, user1.address, 'UST', 10000)).wait();
	await relay();
	console.log('--- After Setting And Sending ---');
	await print();
})();