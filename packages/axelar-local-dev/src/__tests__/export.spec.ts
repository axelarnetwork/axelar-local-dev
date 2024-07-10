/* eslint-disable @typescript-eslint/no-var-requires */
'use strict';

import chai from 'chai';
import { Wallet } from 'ethers';
import fs from 'fs';
const { expect } = chai;
import { deployContract, setLogger, createAndExport, destroyExported, Network, networks, setupAndExport } from '../';
import { AxelarExpressExecutable__factory as AxelarExpressExecutableFactory } from '../types/factories/@axelar-network/axelar-gmp-sdk-solidity/contracts/express/AxelarExpressExecutable__factory';
import { ExpressWithToken__factory as ExpressWithTokenFactory } from '../types/factories/src/contracts/test/ExpressWithToken__factory';
import { ExecutableWithToken__factory as ExecuteWithTokenFactory } from '../types/factories/src/contracts/test/ExecutableWithToken__factory';
import ExpressWithToken from '../artifacts/src/contracts/test/ExpressWithToken.sol/ExpressWithToken.json';
import ExecuteWithToken from '../artifacts/src/contracts/test/ExecutableWithToken.sol/ExecutableWithToken.json';
import { EvmRelayer } from '../relay/EvmRelayer';

setLogger(() => null);

async function deployAndFundUsdc(chain: Network) {
    await chain.deployToken('Axelar Wrapped aUSDC', 'aUSDC', 6, BigInt(1e22));
}

describe('export', () => {
    describe('createAndExport', () => {
        const wallet = Wallet.createRandom();
        const chains = ['A', 'B'];
        const outputPath = './local.json';
        const evmRelayer = new EvmRelayer();
        let chain1: Network;
        let chain2: Network;
        let srcOwner: Wallet;
        let destOwner: Wallet;

        beforeEach(async () => {
            await createAndExport({
                accountsToFund: [wallet.address],
                chainOutputPath: outputPath,
                callback: (chain: Network) => deployAndFundUsdc(chain),
                relayers: { evm: evmRelayer },
                chains,
                port: 18500,
                relayInterval: 500,
            });

            chain1 = networks[0];
            chain2 = networks[1];
            srcOwner = networks[0].ownerWallet;
            destOwner = networks[1].ownerWallet;
        });

        afterEach(async () => {
            await destroyExported({ evm: evmRelayer });
        });

        it('should export a local.json file correctly', async () => {
            const data = fs.readFileSync(outputPath, 'utf8');
            const chainJson = JSON.parse(data);
            // read file and convert to json object
            expect(chainJson.length).to.equal(2);
            expect(chainJson[0].name).to.equal(chains[0]);
            expect(chainJson[1].name).to.equal(chains[1]);

            for (const chain of chainJson) {
                expect(chain.gateway).to.not.be.undefined;
                expect(chain.gasService).to.not.be.undefined;
                expect(chain.constAddressDeployer).to.not.be.undefined;
                expect(chain.create3Deployer).to.not.be.undefined;
                expect(chain.rpc).to.be.not.undefined;
                expect(chain.tokens.aUSDC).to.not.be.undefined;
            }
        });

        it('should be able to relay tokens from chain A to chain B', async () => {
            const contract1 = await deployContract(srcOwner, ExecuteWithToken, [chain1.gateway.address, chain1.gasService.address]).then(
                (contract) => ExecuteWithTokenFactory.connect(contract.address, srcOwner)
            );

            const contract2 = await deployContract(destOwner, ExecuteWithToken, [chain2.gateway.address, chain2.gasService.address]).then(
                (contract) => ExecuteWithTokenFactory.connect(contract.address, destOwner)
            );

            await contract1.addSibling(chain2.name, contract2.address);

            const amount = BigInt(1e18);
            await chain1.giveToken(srcOwner.address, 'aUSDC', amount);

            const token1 = await chain1.getTokenContract('aUSDC');
            await token1.connect(srcOwner).approve(contract1.address, amount);

            // print eth balance of owner
            await contract1.setAndSend(chain2.name, 'hello', wallet.address, 'aUSDC', amount, { value: BigInt(1e12) });

            await new Promise((resolve) => setTimeout(resolve, 3000));

            const token2 = await chain2.getTokenContract('aUSDC');
            const balance = await token2.balanceOf(wallet.address);
            expect(balance.toBigInt()).to.equal(amount);
            expect(await contract2.value()).to.equal('hello');
        });

        it('should be able to call express tokens from chain A to chain B', async () => {
            const contract1 = await deployContract(srcOwner, ExpressWithToken, [chain1.gateway.address, chain1.gasService.address]).then(
                (contract) => ExpressWithTokenFactory.connect(contract.address, srcOwner)
            );
            const contract2 = await deployContract(destOwner, ExpressWithToken, [chain2.gateway.address, chain2.gasService.address]).then(
                (contract) => AxelarExpressExecutableFactory.connect(contract.address, destOwner)
            );

            const amount = BigInt(1e18);
            await chain1.giveToken(srcOwner.address, 'aUSDC', amount);
            const token1 = (await chain1.getTokenContract('aUSDC')).connect(srcOwner);

            await token1.approve(contract1.address, amount);
            await contract1.sendToMany(chain2.name, contract2.address, [wallet.address], 'aUSDC', amount, { value: BigInt(1e17) });

            await new Promise((resolve) => setTimeout(resolve, 3000));

            const token2 = await chain2.getTokenContract('aUSDC');
            const balance = await token2.balanceOf(wallet.address);
            expect(balance.toBigInt()).to.equal(amount);
        });
    });

    describe('setupAndExport', () => {
        const wallet = Wallet.createRandom();
        let chain1: Network;
        let chain2: Network;
        let srcOwner: Wallet;
        let destOwner: Wallet;

        beforeEach(async () => {
            const networks = (await setupAndExport({
                callback: (chain: Network) => deployAndFundUsdc(chain),
                chains: [
                    {
                        name: 'Ethereum',
                        rpcUrl: process.env.EVM_NODE_1 || 'http://127.0.0.1:8545',
                    },
                    {
                        name: 'Avalanche',
                        rpcUrl: process.env.EVM_NODE_2 || 'http://127.0.0.1:8546',
                    },
                ],
            })) as Network[];

            if (!networks) throw Error('setupAndExport should return networks object');

            chain1 = networks[0];
            chain2 = networks[1];
            srcOwner = networks[0].ownerWallet;
            destOwner = networks[1].ownerWallet;
        });

        afterEach(async () => {
            await destroyExported();
        });

        // Note: This test is expecting the host to run a local blockchain on port 8545 and 8546.
        it.only('should be able to relay tokens from chain A to chain B', async () => {
            const contract1 = await deployContract(srcOwner, ExecuteWithToken, [chain1.gateway.address, chain1.gasService.address]).then(
                (contract) => ExecuteWithTokenFactory.connect(contract.address, srcOwner)
            );

            const contract2 = await deployContract(destOwner, ExecuteWithToken, [chain2.gateway.address, chain2.gasService.address]).then(
                (contract) => ExecuteWithTokenFactory.connect(contract.address, destOwner)
            );

            await contract1.addSibling(chain2.name, contract2.address);

            const amount = BigInt(1e18);
            await chain1.giveToken(srcOwner.address, 'aUSDC', amount);

            const token1 = await chain1.getTokenContract('aUSDC');
            await token1.connect(srcOwner).approve(contract1.address, amount);

            // print eth balance of owner
            await contract1.setAndSend(chain2.name, 'hello', wallet.address, 'aUSDC', amount, { value: BigInt(1e12) });

            await new Promise((resolve) => setTimeout(resolve, 3000));

            const token2 = await chain2.getTokenContract('aUSDC');
            const balance = await token2.balanceOf(wallet.address);
            expect(balance.toBigInt()).to.equal(amount);
            expect(await contract2.value()).to.equal('hello');
        });
    });
});
