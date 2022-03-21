const {createNetwork, setupNetwork} = require('../../src/api/AxelarLocal');
const {defaultAccounts} = require('../../src/api/utils');


( async() => {
    //Create an axelar netwrok and serve it at port 8501.
    const chain1 = await createNetwork({
        port: 8501,
    });
    //Give the first user 10000 UST.
    const [user1] = chain1.userWallets;
    await chain1.giveToken(user1.address, 'UST', 10000);


    //Create a netwrok and serve it at port 8502. This network will not have a gateway deployed.
    const accounts = defaultAccounts(20);
    const blank = require('ganache-core').server( {
        accounts: accounts,
        _chainId: 2,
        _chainIdRpc: 2
    });
    blank.listen(8502, err=>{
        if(err)
            throw err;
        console.log(`Serving an unitiated blockchain on 8502 with the following funded accounts.`);
    });

    const chain2 = await setupNetwork('http://localhost:8502', {
        name: 'Chain2',
        ownerKey: accounts[0].secretKey,
        userKeys: accounts.splice(1,10).map(acc=>acc.secretKey),
    });
    //This info is to be used when connecting to the network.
    console.log('')
    console.log(`Use the info below to connet to ${chain2.name}:`)
    console.log(chain2.getInfo());
})();