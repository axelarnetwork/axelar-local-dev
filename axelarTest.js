// axelarTest.js
const axelar = require('@axelar-network/axelar-local-dev');

(async () => {
	const chain1 = await  axelar.createNetwork();
	const [ user1 ] = chain1.userWallets;
	const chain2 = await  axelar.createNetwork();
	const [ user2 ] = chain2.userWallets;

	await chain1.giveToken(user1.address, 'aUSDC', 1000);

	console.log(`user1 has ${await  chain1.usdc.balanceOf(user1.address)} aUSDC.`);
	console.log(`user2 has ${await  chain2.usdc.balanceOf(user2.address)} aUSDC.`);

	// Approve the AxelarGateway to use our aUSDC on chain1.
	await (await chain1.usdc.connect(user1).approve(chain1.gateway.address, 100)).wait();
	// And have it send it to chain2.
	await (await chain1.gateway.connect(user1).sendToken(chain2.name, user2.address, 'aUSDC', 100)).wait();
	// Have axelar relay the tranfer to chain2.
	await  axelar.relay();

	console.log(`user1 has ${await chain1.usdc.balanceOf(user1.address)} aUSDC.`);
	console.log(`user2 has ${await chain2.usdc.balanceOf(user2.address)} aUSDC.`);
})();