import path from 'path';

const { getDefaultProvider } = require('ethers');
const fs = require('fs-extra');


import { chains, wallet } from './start';
import { preDeploy as examplePreDeploy, deploy as exampleDeploy } from './call-contract'

deploy(getEVMChains(chains), wallet);

async function deploy(chains, wallet) {
    await preDeploy();
    await doDeploy(chains, wallet);
}

function preDeploy() {
    return examplePreDeploy();
}

function doDeploy(chains, wallet) {
    const deploys = chains.map((chain) => {
        const provider = getDefaultProvider(chain.rpc);
        return exampleDeploy(chain, wallet.connect(provider));
    });

    return Promise.all(deploys);
}


function getEVMChains(selectedChains) {
    return fs
        .readJsonSync(path.join(__dirname, './chain-config/local.json'))
        .filter((chain) => selectedChains.includes(chain.name));
}

