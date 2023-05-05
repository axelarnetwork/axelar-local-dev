const { Wallet, utils: {keccak256, defaultAbiCoder } } = require('ethers');
const { forkAndExport } = require("./dist");

const PRIVATE_KEY_GENERATOR = 'this is a random string to get a random account. You need to provide the private key for a funded account here.'
const deployerKey = keccak256(defaultAbiCoder.encode(['string'], [PRIVATE_KEY_GENERATOR]));
const notOwnerKey = keccak256(defaultAbiCoder.encode(['string'], ['not-owner']));
const deployerAddress = new Wallet(deployerKey).address;
const notOwnerAddress = new Wallet(notOwnerKey).address;
const toFund = [deployerAddress, notOwnerAddress];

forkAndExport({
    chainOutputPath: './info/local.json',
    env: 'testnet',
    chains: ['Avalanche', 'Fantom', 'Polygon'],
    networkOptions: {ganacheOptions: {
        fork: { disableCache: true },
    }},
    accountsToFund: toFund,
})