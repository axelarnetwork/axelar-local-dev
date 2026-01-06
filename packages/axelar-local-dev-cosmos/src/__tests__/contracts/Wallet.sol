// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import {AxelarExecutable} from "@updated-axelar-network/axelar-gmp-sdk-solidity/contracts/executable/AxelarExecutable.sol";
import {IAxelarGasService} from "@updated-axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IAxelarGasService.sol";
import {Ownable} from "./Ownable.sol";

struct CallResult {
    bool success;
    bytes result;
}

struct AgoricResponse {
    // false if this is a smart wallet creation, true if it's a contract call
    bool isContractCallResult;
    CallResult[] data;
}

struct ContractCalls {
    address target;
    bytes data;
}

struct CallMessage {
    string id;
    ContractCalls[] calls;
}

error ContractCallFailed(string messageId, uint256 step);
error InvalidSourceChain(string expected, string actual);

contract Wallet is AxelarExecutable, Ownable {
    IAxelarGasService public gasService;
    string private constant EXPECTED_SOURCE_CHAIN = "agoric";
    bytes32 private constant EXPECTED_SOURCE_CHAIN_HASH =
        keccak256(bytes(EXPECTED_SOURCE_CHAIN));

    event CallStatus(
        string indexed id,
        uint256 indexed callIndex,
        address indexed target,
        bytes4 methodSelector,
        bool success
    );
    event MulticallStatus(string indexed id, bool success, uint256 totalCalls);
    event Received(address indexed sender, uint256 amount);

    constructor(
        address gateway_,
        address gasReceiver_,
        string memory owner_
    ) payable AxelarExecutable(gateway_) Ownable(owner_) {
        gasService = IAxelarGasService(gasReceiver_);
    }

    function _multicall(bytes calldata payload) internal {
        CallMessage memory callMessage = abi.decode(payload, (CallMessage));
        ContractCalls[] memory calls = callMessage.calls;

        uint256 len = calls.length;
        for (uint256 i = 0; i < len; ) {
            (bool success, ) = calls[i].target.call(calls[i].data);

            if (!success) {
                revert ContractCallFailed(callMessage.id, i);
            }

            emit CallStatus(
                callMessage.id,
                i,
                calls[i].target,
                bytes4(calls[i].data),
                success
            );

            unchecked {
                ++i;
            }
        }

        emit MulticallStatus(callMessage.id, true, calls.length);
    }

    function _execute(
        bytes32 /*commandId*/,
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes calldata payload
    ) internal override onlyOwner(sourceAddress) {
        if (keccak256(bytes(sourceChain)) != EXPECTED_SOURCE_CHAIN_HASH) {
            revert InvalidSourceChain(EXPECTED_SOURCE_CHAIN, sourceChain);
        }
        _multicall(payload);
    }

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    fallback() external payable {
        emit Received(msg.sender, msg.value);
    }
}
