// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import {AxelarExecutable} from "@updated-axelar-network/axelar-gmp-sdk-solidity/contracts/executable/AxelarExecutable.sol";
import {IAxelarGasService} from "@updated-axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IAxelarGasService.sol";
import {Factory} from "./Factory.sol";

error InvalidSourceChain(string expected, string actual);

contract FactoryFactory is AxelarExecutable {
    address immutable _gateway;
    IAxelarGasService public immutable gasService;
    address public immutable permit2;
    string private constant EXPECTED_SOURCE_CHAIN = "agoric";
    bytes32 private constant EXPECTED_SOURCE_CHAIN_HASH =
        keccak256(bytes(EXPECTED_SOURCE_CHAIN));

    event FactoryCreated(
        address indexed factory,
        string owner,
        string sourceChain,
        string sourceAddress
    );
    event Received(address indexed sender, uint256 amount);

    constructor(
        address gateway_,
        address gasReceiver_,
        address permit2_
    ) payable AxelarExecutable(gateway_) {
        gasService = IAxelarGasService(gasReceiver_);
        _gateway = gateway_;
        permit2 = permit2_;
    }

    function _createFactory(string memory owner) internal returns (address) {
        address newFactory = address(
            new Factory{salt: keccak256(abi.encodePacked(owner))}(
                _gateway,
                address(gasService),
                permit2,
                owner
            )
        );
        return newFactory;
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
        address factoryAddress = _createFactory(sourceAddress);
        emit FactoryCreated(
            factoryAddress,
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
