// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import {AxelarExecutable} from "@updated-axelar-network/axelar-gmp-sdk-solidity/contracts/executable/AxelarExecutable.sol";
import {IAxelarGasService} from "@updated-axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IAxelarGasService.sol";
import {IFactory} from "./interfaces/IFactory.sol";
import {Wallet} from "./Wallet.sol";

contract Factory is IFactory, AxelarExecutable {
    address immutable _gateway;
    IAxelarGasService public immutable gasService;
    string private constant EXPECTED_SOURCE_CHAIN = "agoric";
    bytes32 private constant EXPECTED_SOURCE_CHAIN_HASH =
        keccak256(bytes(EXPECTED_SOURCE_CHAIN));

    event Received(address indexed sender, uint256 amount);

    constructor(
        address gateway_,
        address gasReceiver_
    ) payable AxelarExecutable(gateway_) {
        gasService = IAxelarGasService(gasReceiver_);
        _gateway = gateway_;
    }

    function _createSmartWallet(
        string calldata ownerAddress,
        address expectedWalletAddress
    ) internal {
        address newWallet = address(
            new Wallet{salt: keccak256(abi.encodePacked(ownerAddress))}(
                _gateway,
                address(gasService),
                ownerAddress
            )
        );

        // Validate that created wallet matches expected address
        if (newWallet != expectedWalletAddress) {
            revert IFactory.WalletAddressMismatch(
                expectedWalletAddress,
                newWallet
            );
        }

        emit IFactory.SmartWalletCreated(newWallet, ownerAddress, EXPECTED_SOURCE_CHAIN);
    }

    function _execute(
        bytes32 /*commandId*/,
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes calldata payload
    ) internal override {
        if (keccak256(bytes(sourceChain)) != EXPECTED_SOURCE_CHAIN_HASH) {
            revert IFactory.InvalidSourceChain(EXPECTED_SOURCE_CHAIN, sourceChain);
        }

        // Decode expected wallet address from payload
        address expectedWalletAddress = abi.decode(payload, (address));

        // Create the wallet
        _createSmartWallet(sourceAddress, expectedWalletAddress);
    }

    function createWallet(
        string calldata ownerAddress,
        address expectedWalletAddress
    ) external {
        _createSmartWallet(ownerAddress, expectedWalletAddress);
    }

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    fallback() external payable {
        emit Received(msg.sender, msg.value);
    }
}
