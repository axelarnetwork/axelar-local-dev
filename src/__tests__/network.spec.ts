/* eslint-disable @typescript-eslint/no-var-requires */
'use strict';

import { getNetwork, setupNetwork, stopAll } from '..';
import { Network } from '../Network';
import { createNetwork } from '../networkUtils';
import { defaultAccounts, setLogger } from '../utils';
import { Wallet } from 'ethers';
import chai from 'chai';

const { expect } = chai;
setLogger(() => null);

jest.setTimeout(300000);

function validateNetwork(network: Network) {
    // wallets
    expect(network.provider).to.not.be.undefined;
    expect(network.userWallets).to.not.be.undefined;
    expect(network.ownerWallet).to.not.be.undefined;
    expect(network.operatorWallet).to.not.be.undefined;
    expect(network.adminWallets).to.not.be.undefined;

    // contracts
    expect(network.gasService).to.not.be.undefined;
    expect(network.constAddressDeployer).to.not.be.undefined;
    expect(network.create3Deployer).to.not.be.undefined;
    expect(network.gateway).to.not.be.undefined;
    expect(network.expressService).to.not.be.undefined;
    expect(network.expressProxyDeployer).to.not.be.undefined;
}

describe('Network', () => {
    let network;

    afterAll(async () => {
        await stopAll();
    });

    it('should create a Network from no params', async () => {
        network = await createNetwork();
        validateNetwork(network);
    });

    it('should create a Network from params', async () => {
        const name = 'test';
        const id = 1234;
        network = await createNetwork({
            name,
            chainId: id,
        });
        expect(network.name).to.equal('test');
        expect(network.chainId).to.equal(id);
        expect((await network.provider.getNetwork()).chainId).to.equal(id);
        validateNetwork(network);
    });

    it('should create a Network and connect to it remotely through http', async () => {
        const port = 8500;
        await createNetwork({
            port,
        });
        network = await getNetwork(`http://localhost:${port}`);
        validateNetwork(network);
    });
    it('should deploy a network on a preexisting chain', async () => {
        const port = 8600;
        const accounts = defaultAccounts(20);
        const server = require('ganache').server({
            wallet: { accounts },
            chain: {
                chainId: 3000,
                networkId: 3000,
            },
            logging: { quiet: true },
        });
        await server.listen(port);
        network = await setupNetwork(`http://localhost:${port}`, {
            ownerKey: new Wallet(accounts[0].secretKey),
        });
        validateNetwork(network);
        await server.close();
    });
});
