// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import {AxelarExecutable} from "@updated-axelar-network/axelar-gmp-sdk-solidity/contracts/executable/AxelarExecutable.sol";
import {IAxelarGasService} from "@updated-axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IAxelarGasService.sol";
import {StringToAddress, AddressToString} from "@updated-axelar-network/axelar-gmp-sdk-solidity/contracts/libs/AddressString.sol";
import {Wallet} from "./Wallet.sol";

error InvalidSourceChain(string expected, string actual);

contract Factory is AxelarExecutable {
    using StringToAddress for string;
    using AddressToString for address;

    address immutable _gateway;
    IAxelarGasService public immutable gasService;
    string private constant EXPECTED_SOURCE_CHAIN = "agoric";
    bytes32 private constant EXPECTED_SOURCE_CHAIN_HASH =
        keccak256(bytes(EXPECTED_SOURCE_CHAIN));

    event SmartWalletCreated(
        address indexed wallet,
        string owner,
        string sourceChain,
        string sourceAddress
    );

    event Received(address indexed sender, uint256 amount);

    constructor(
        address gateway_,
        address gasReceiver_
    ) payable AxelarExecutable(gateway_) {
        gasService = IAxelarGasService(gasReceiver_);
        _gateway = gateway_;
    }

    function _createSmartWallet(
        string memory owner
    ) internal returns (address) {
        address newWallet = address(
            new Wallet{salt: keccak256(abi.encodePacked(owner))}(
                _gateway,
                address(gasService),
                owner
            )
        );
        return newWallet;
    }

    function _execute(
        bytes32 /*commandId*/,
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes calldata payload
    ) internal override {
        if (keccak256(bytes(sourceChain)) != EXPECTED_SOURCE_CHAIN_HASH) {
            revert InvalidSourceChain(EXPECTED_SOURCE_CHAIN, sourceChain);
        }
        address smartWalletAddress = _createSmartWallet(sourceAddress);
        emit SmartWalletCreated(
            smartWalletAddress,
            sourceAddress,
            sourceChain,
            sourceAddress
        );
    }

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    fallback() external payable {
        emit Received(msg.sender, msg.value);
    }
}
