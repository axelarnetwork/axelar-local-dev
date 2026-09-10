/* eslint-disable @typescript-eslint/no-var-requires */
'use strict';

import { createNetwork, relay, stopAll, registerRemoteITS, setLogger } from '../';
import { keccak256, toUtf8Bytes, parseEther } from 'ethers/lib/utils';
import { Wallet } from 'ethers';
import { Network } from '../Network';
import chai from 'chai';
const { expect } = chai;

setLogger(() => null);

// Mirrors docs/guide_basic.md: deploy an Interchain Token, deploy it remotely,
// then move it across chains with interchainTransfer. Keeps the guide honest.
describe('interchain token service', () => {
    let ethereum: Network;
    let avalanche: Network;
    let ethUser: Wallet;
    let avalancheUser: Wallet;

    beforeEach(async () => {
        ethereum = await createNetwork({ seed: 'ethereum' });
        avalanche = await createNetwork({ seed: 'avalanche' });
        await registerRemoteITS([ethereum, avalanche]);
        [ethUser] = ethereum.userWallets;
        [avalancheUser] = avalanche.userWallets;
    });

    afterEach(async () => {
        await stopAll();
    });

    it('should transfer an interchain token from one chain to another', async () => {
        const salt = keccak256(toUtf8Bytes('my-interchain-token'));

        const ethToken = await ethereum.its.deployInterchainToken(
            ethUser,
            salt,
            'My Interchain Token',
            'MIT',
            18,
            parseEther('1000'),
            ethUser.address
        );

        const avalancheToken = await ethereum.its.deployRemoteInterchainToken(
            ethUser,
            salt,
            ethUser.address,
            avalanche,
            parseEther('1')
        );

        // Initial supply is minted to the deployer on the source chain only.
        expect((await ethToken.balanceOf(ethUser.address)).toBigInt()).to.equal(parseEther('1000').toBigInt());
        expect((await avalancheToken.balanceOf(avalancheUser.address)).toBigInt()).to.equal(BigInt(0));

        await ethToken
            .connect(ethUser)
            .interchainTransfer(avalanche.name, avalancheUser.address, parseEther('100'), '0x', { value: parseEther('1') })
            .then((tx: any) => tx.wait());

        await relay();

        expect((await ethToken.balanceOf(ethUser.address)).toBigInt()).to.equal(parseEther('900').toBigInt());
        expect((await avalancheToken.balanceOf(avalancheUser.address)).toBigInt()).to.equal(parseEther('100').toBigInt());
    });
});
