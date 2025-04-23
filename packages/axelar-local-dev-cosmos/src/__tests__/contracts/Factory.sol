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

contract Wallet is AxelarExecutableWithToken, Ownable {
    struct Call {
        address target;
        bytes data;
    }

    constructor(
        address gateway_,
        string memory owner_
    ) AxelarExecutableWithToken(gateway_) Ownable(owner_) {}

    function _execute(
        bytes32 commandId,
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes calldata payload
    ) internal override onlyOwner(sourceAddress) {
        (Call[] memory calls, uint256 totalCalls) = abi.decode(
            payload,
            (Call[], uint256)
        );
        require(calls.length == totalCalls, "Payload length mismatch");

        for (uint256 i = 0; i < calls.length; i++) {
            (bool success, ) = calls[i].target.call(calls[i].data);
            require(success, "Contract call failed");
        }
    }

    function _executeWithToken(
        bytes32 commandId,
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes calldata payload,
        string calldata tokenSymbol,
        uint256 amount
    ) internal override {
        // Decode the payload: expect two arrays of equal length.
        // (address[] memory targets, bytes[] memory callDatas) = abi.decode(payload, (address[], bytes[]));
        // require(targets.length == callDatas.length, "Payload length mismatch");

        address stakingAddress = abi.decode(payload, (address));

        require(amount > 0, "Deposit amount must be greater than zero");
        address tokenAddress = gatewayWithToken().tokenAddresses(tokenSymbol);

        IERC20(tokenAddress).transfer(address(this), amount); // Transfer tokens from user
        IERC20(tokenAddress).approve(stakingAddress, amount); // Approve Aave Pool

        StakingContract(stakingAddress).stake(amount); // Deposit into Aave
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
        address newVendorAddress = address(new Wallet(_gateway, owner));
        return newVendorAddress;
    }

    function _execute(
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes calldata payload
    ) internal override {
        address vendorAddress = createVendor(sourceAddress);

        bytes memory msgPayload = abi.encodePacked(
            bytes4(0x00000000),
            abi.encode(vendorAddress)
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
