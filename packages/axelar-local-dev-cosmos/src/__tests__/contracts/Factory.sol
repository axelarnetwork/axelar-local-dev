// Factory Contract
// SPDX-License-Identifier: MIT
pragma solidity  ^0.8.0;

import { AxelarExecutable } from "@axelar-network/axelar-gmp-sdk-solidity/contracts/executable/AxelarExecutable.sol";
import { AxelarExecutableWithToken } from '@updated-axelar-network/axelar-gmp-sdk-solidity/contracts/executable/AxelarExecutableWithToken.sol';
import { StakingContract } from 'src/__tests__/contracts/StakingContract.sol';
import { IERC20 } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IERC20.sol';

contract Wallet is AxelarExecutableWithToken {
    string owner;

    struct Message {
        string sender;
        string message;
    }

    Message public storedMessage; // message received from _execute

    constructor(
        address gateway_,
        string memory owner_
    ) AxelarExecutableWithToken(gateway_) {
        owner = owner_;
        storedMessage = Message('s', 'f');
    }

    function _execute(
        bytes32 commandId,
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes calldata payload
    ) internal override {
        storedMessage = Message(sourceChain, 'f');
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

        // // storedMessage = Message('fraz', toAsciiString(targets[0]));
        // // Loop over each command and execute the call.
        // for (uint256 i = 0; i < targets.length; i++) {
        //     (bool success, ) = targets[i].call(callDatas[i]);
        //     require(success, "Command execution failed");
        // }



        address stakingAddress = abi.decode(payload, (address));
        
        require(amount > 0, "Deposit amount must be greater than zero");
        address tokenAddress = gatewayWithToken().tokenAddresses(tokenSymbol);
        storedMessage = Message(tokenSymbol, 'f');

        IERC20(tokenAddress).transfer(address(this), amount); // Transfer tokens from user
        IERC20(tokenAddress).approve(stakingAddress, amount); // Approve Aave Pool

        StakingContract(stakingAddress).stake(amount); // Deposit into Aave

    }

}

contract Factory is AxelarExecutable {
    address _gateway;

    struct Message {
        string sender;
    }

    Message public storedMessage; // message received from _execute

    constructor(
        address gateway_
    ) AxelarExecutable(gateway_) {
        _gateway = gateway_;
    }

    function createVendor(string memory owner) public {
        address newVendorAddress = address(new Wallet(_gateway, owner));
        string memory newVendor = toAsciiString(newVendorAddress);

        storedMessage = Message(newVendor);
    }

    function _execute(
        string calldata /*sourceChain*/,
        string calldata sourceAddress,
        bytes calldata payload
    ) internal override {
        // storedMessage = Message(sender, message);

        createVendor(sourceAddress);
    }

    function toAsciiString(address x) internal pure returns (string memory) {
        bytes memory s = new bytes(40);
        for (uint i = 0; i < 20; i++) {
            bytes1 b = bytes1(uint8(uint(uint160(x)) / (2**(8*(19 - i)))));
            bytes1 hi = bytes1(uint8(b) / 16);
            bytes1 lo = bytes1(uint8(b) - 16 * uint8(hi));
            s[2*i] = char(hi);
            s[2*i+1] = char(lo);            
        }
        return string(s);
    }

    function char(bytes1 b) internal pure returns (bytes1 c) {
        if (uint8(b) < 10) return bytes1(uint8(b) + 0x30);
        else return bytes1(uint8(b) + 0x57);
    }
}