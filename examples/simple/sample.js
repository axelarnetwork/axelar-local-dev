'use strict';

const {createNetwork: createChain, relay, getGasCost, getFee} = require('../../dist/networkUtils.js');
const { deployContract } = require('../../dist/utils.js');
const { utils : {defaultAbiCoder} } = require('ethers');

const ExecutableSample = require('../../build/ExecutableSample.json');

(async () => {
    // Create two chains and get a funded user for each
    const chain1 = await createChain({ seed: "chain1" });
    const [user1] = chain1.userWallets;
    const chain2 = await createChain({ seed: "chain2" });
    const [user2] = chain2.userWallets;

    // Deploy our IAxelarExecutable contracts
    const ex1 = await deployContract(user1, ExecutableSample, [chain1.gateway.address, chain1.gasReceiver.address]);
    const ex2 = await deployContract(user2, ExecutableSample, [chain2.gateway.address, chain2.gasReceiver.address]);

    // Inform our exeuctables about each other.
    await (await ex1.connect(user1).addSibling(chain2.name, ex2.address)).wait();
    await (await ex2.connect(user2).addSibling(chain1.name, ex1.address)).wait();

    // Get some UST on chain1.
    await chain1.giveToken(user1.address, 'UST', 10000000);

    // This is used for logging.
    const print = async () => {
        console.log(`user1 has ${await chain1.ust.balanceOf(user1.address)} UST.`);
        console.log(`user2 has ${await chain2.ust.balanceOf(user2.address)} UST.`);
        console.log(`ex1: ${await ex1.value()}`);
        console.log(`ex2: ${await ex2.value()}`);
    }

    console.log('--- Initially ---');
    await print();

    // Approve the AxelarGateway to use our UST on chain1.
    await (await chain1.ust.connect(user1).approve(chain1.gateway.address, 5000000)).wait();
    // And have it send it to chain2.
    await (await chain1.gateway.connect(user1).sendToken(chain2.name, user2.address, 'UST', 5000000)).wait();
    // This facilitates the send.
    await relay();
    // After which the funds have reached chain2
    console.log('--- After Sending Token ---');
    await print();

    const gasLimit = 1e6;
    const gasCost = getGasCost(chain1, chain2, chain1.ust.address);
    // Approve the AxelarGateway to use our UST on chain1.
    await (await chain1.ust.connect(user1).approve(ex1.address, gasCost * gasLimit)).wait();
    // Set the value on chain1. This will also cause the value on chain2 to change after relay() is called.
    await (await ex1.connect(user1).set(chain2.name, 'Hello World!', chain1.ust.address, gasCost)).wait();
    console.log('--- After Setting but Before Relay---');
    await print();
    // Updates the value on chain2 also.
    await relay();
    console.log('--- After Setting and Relaying---');
    await print();
})();