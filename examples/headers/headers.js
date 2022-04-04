const {createNetwork, networks, relay, getFee, getGasCost} = require('../../dist/networkUtils');
const { deployContract } = require('../../dist/utils');

const Headers = require('../../build/Headers.json');

( async () => {
    const n = 5;
    for(let i=0;i<n;i++) {
        const chain = await createNetwork({seed: i.toString()});
        const [user] = chain.userWallets;
        chain.headers = await deployContract(user, Headers, [chain.gateway.address, chain.gasReceiver.address, 10]);
    }
    for(let i=0;i<n;i++) {
        const chain = networks[i];
        const [user] = chain.userWallets;
        const chains = [];
        const fees = [];
        const gases = [];
        for(let j=0;j<n;j++) {
            if(i==j) continue;
            await (await chain.headers.connect(user).addSibling(networks[j].name, networks[j].headers.address)).wait();
            chains.push(networks[j].name);
            fees.push(getFee(chain, networks[j], 'UST'));
            gases.push(getGasCost(chain, networks[j], chain.ust.address, 1e6));
        }
        let s = fees.reduce((partialSum, a) => partialSum + a, 0) + gases.reduce((partialSum, a) => partialSum + a, 0);;
        await chain.giveToken(user.address, 'UST', s);
        await (await chain.ust.connect(user).approve(chain.headers.address, s)).wait();
        await (await chain.headers.connect(user).updateRemoteHeaders('UST', chains, fees, gases, 1e6)).wait();
    }
    await relay();
    for(let i=0;i<n;i++) {
        const chain = networks[i];
        const [user] = chain.userWallets;
        console.log(`---- ${chain.name} -----`);
        for(let j=0;j<n;j++) {
            if(i==j) continue;
            const l = Number(await chain.headers.getStoredLength(networks[j].name));
            if(l == 0) continue;
            const [lastBlock, lastHeader] = await chain.headers.getHeader(networks[j].name, 0);
            console.log(`${networks[j].name}: ${lastHeader} at ${lastBlock}`);
            const block = await networks[j].provider.getBlock(Number(lastBlock));
            console.log(block.hash);
        }
    }
})();