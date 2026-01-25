// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

interface IFactory {
    error InvalidSourceChain(string expected, string actual);
    error WalletAddressMismatch(address expected, address actual);

    event SmartWalletCreated(
        address indexed wallet,
        string owner,
        string sourceChain
    );

    function createWallet(
        string calldata ownerAddress,
        address expectedAddress
    ) external;
}