// Factory Contract
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {AxelarExecutable} from "@axelar-network/axelar-gmp-sdk-solidity/contracts/executable/AxelarExecutable.sol";
import {AxelarExecutableWithToken} from "@updated-axelar-network/axelar-gmp-sdk-solidity/contracts/executable/AxelarExecutableWithToken.sol";
import {IAxelarGasService} from "@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IAxelarGasService.sol";
import {StakingContract} from "src/__tests__/contracts/StakingContract.sol";
import {IERC20} from "@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IERC20.sol";
import {StringToAddress, AddressToString} from "@axelar-network/axelar-gmp-sdk-solidity/contracts/libs/AddressString.sol";
import {Ownable} from "src/__tests__/contracts/Ownable.sol";

struct CallResult {
    bool success;
    bytes result;
}

struct AgoricResponse {
    // false if this is a smart wallet creation, true if it's a contract call
    bool isContractCallResult;
    CallResult[] data;
}

struct CallParams {
    address target;
    bytes data;
}

contract Wallet is AxelarExecutableWithToken, Ownable {
    IAxelarGasService public gasService;

    constructor(
        address gateway_,
        address gasReceiver_,
        string memory owner_
    ) AxelarExecutableWithToken(gateway_) Ownable(owner_) {
        gasService = IAxelarGasService(gasReceiver_);
    }

    function _execute(
        bytes32 commandId,
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes calldata payload
    ) internal override onlyOwner(sourceAddress) {
        CallParams[] memory calls = abi.decode(payload, (CallParams[]));
        require(calls.length == 0, "Payload is empty");

        CallResult[] memory results = new CallResult[](calls.length);

        for (uint256 i = 0; i < calls.length; i++) {
            (bool success, bytes memory result) = calls[i].target.call(
                calls[i].data
            );
            require(success, "Contract call failed");
            results[i] = CallResult(success, result);
        }

        bytes memory responsePayload = abi.encodePacked(
            bytes4(0x00000000),
            abi.encode(AgoricResponse(true, results))
        );

        _send(sourceChain, sourceAddress, responsePayload);
    }

    function _executeWithToken(
        bytes32 commandId,
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes calldata payload,
        string calldata tokenSymbol,
        uint256 amount
    ) internal override {
        address stakingAddress = abi.decode(payload, (address));

        require(amount > 0, "Deposit amount must be greater than zero");
        address tokenAddress = gatewayWithToken().tokenAddresses(tokenSymbol);

        IERC20(tokenAddress).transfer(address(this), amount); // Transfer tokens from user
        IERC20(tokenAddress).approve(stakingAddress, amount); // Approve Aave Pool

        StakingContract(stakingAddress).stake(amount); // Deposit into Aave
    }

    function _send(
        string calldata destinationChain,
        string calldata destinationAddress,
        bytes memory payload
    ) internal {
        gasService.payNativeGasForContractCall{value: msg.value}(
            address(this),
            destinationChain,
            destinationAddress,
            payload,
            msg.sender
        );

        gatewayWithToken().callContract(
            destinationChain,
            destinationAddress,
            payload
        );
    }
}

contract Factory is AxelarExecutable {
    using StringToAddress for string;
    using AddressToString for address;

    address _gateway;
    IAxelarGasService public immutable gasService;
    string public chainName;

    constructor(
        address gateway_,
        address gasReceiver_,
        string memory chainName_
    ) AxelarExecutable(gateway_) {
        gasService = IAxelarGasService(gasReceiver_);
        _gateway = gateway_;
        chainName = chainName_;
    }

    function createVendor(string memory owner) public returns (address) {
        address newVendorAddress = address(
            new Wallet(_gateway, address(gasService), owner)
        );
        return newVendorAddress;
    }

    function _execute(
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes calldata payload
    ) internal override {
        address vendorAddress = createVendor(sourceAddress);
        CallResult[] memory results = new CallResult[](1);

        results[0] = CallResult(true, abi.encode(vendorAddress));

        bytes memory msgPayload = abi.encodePacked(
            bytes4(0x00000000),
            abi.encode(AgoricResponse(false, results))
        );
        _send(sourceChain, sourceAddress, msgPayload);
    }

    function _send(
        string calldata destinationChain,
        string calldata destinationAddress,
        bytes memory payload
    ) internal {
        gasService.payNativeGasForContractCall{value: msg.value}(
            address(this),
            destinationChain,
            destinationAddress,
            payload,
            msg.sender
        );

        gateway.callContract(destinationChain, destinationAddress, payload);
    }
}
