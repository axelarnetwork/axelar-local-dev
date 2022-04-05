const { createNetwork, networks, relay, getGasCost } = require('../../dist/networkUtils');
const {utils: { defaultAbiCoder, keccak256 } } = require('ethers');
const { deployContract } = require('../../dist/utils');


const NftLinker = require('../../build/NftLinker.json');
const ERC721Demo = require('../../build/ERC721Demo.json');

const ownerOf = async (sourceChain, operator, tokenId) => {
    const owner = await operator.ownerOf(tokenId);
    if(owner != sourceChain.nftLinker.address) {
        return {chain: sourceChain.name, address: owner, tokenId: BigInt(tokenId)};
    } else {
        const newTokenId = BigInt(keccak256(defaultAbiCoder.encode(['string', 'address', 'uint256'], [sourceChain.name, operator.address, tokenId])));
        for(let chain of networks) {
            if(chain == sourceChain) continue;
            try {
                const address = await chain.nftLinker.ownerOf(newTokenId);
                return {chain: chain.name, address: address, tokenId: newTokenId};
            } catch (e) {}
        }
    }
}

(async () => {
    const n = 5;
    for(let i=0; i<n; i++) {
        const chain = await createNetwork({seed: 'network' + i});
        const [,deployer] = chain.userWallets;
        chain.nftLinker = await deployContract(deployer, NftLinker, [chain.name, chain.gateway.address, chain.gasReceiver.address]);
        chain.ERC721 = await deployContract(deployer, ERC721Demo, ['Demo ERC721', 'DEMO']);
    }

    for(let i=0; i<n; i++) {   
        const chain = networks[i];
        const [,deployer] = chain.userWallets;
        for(let j=0; j<n; j++) {
            if(i==j) continue;
            const otherChain = networks[j];
            await (await chain.nftLinker.connect(deployer).addLinker(otherChain.name, otherChain.nftLinker.address)).wait();
        }
    }



    const chain1 = networks[0];
    const [user1] = chain1.userWallets;
    const chain2 = networks[1];
    const [user2] = chain2.userWallets;
    await (await chain1.ERC721.connect(user1).mint(1234)).wait();
    console.log(await ownerOf(chain1, chain1.ERC721, 1234));

    const gasLimit = 1e6;
    const gasCost = getGasCost(chain1, chain2, chain1.ust.address);
    const gasAmount = gasLimit * gasCost;

    await chain1.giveToken(user1.address, 'UST', gasAmount);
    await (await chain1.ust.connect(user1).approve(chain1.nftLinker.address, gasAmount)).wait();
    await (await chain1.ERC721.connect(user1).approve(chain1.nftLinker.address, 1234)).wait(); 
    await (await chain1.nftLinker.connect(user1).sendNFT(
        chain1.ERC721.address, 
        1234, 
        chain2.name, 
        user2.address, 
        chain1.ust.address, 
        gasAmount
    )).wait(); 
    
    await relay();
    
  
    for(let i=1; i<networks.length; i++) {
        const chain = networks[i];
        const dest = networks[(i+1) % networks.length];
        const [user] = chain.userWallets;
        const [destUser] = dest.userWallets;
        const owner = await ownerOf(chain1, chain1.ERC721, 1234);
        console.log(owner, user.address);

        await chain.giveToken(user.address, 'UST', gasAmount);
        await (await chain.ust.connect(user).approve(chain.nftLinker.address, gasAmount)).wait();
        await (await chain.nftLinker.connect(user).sendNFT(
            chain.nftLinker.address, 
            owner.tokenId, 
            dest.name, 
            destUser.address, 
            chain.ust.address, 
            gasAmount
        )).wait(); 
        
        await relay();
    }
    const owner = await ownerOf(chain1, chain1.ERC721, 1234);
    console.log(owner, user1.address);
})();