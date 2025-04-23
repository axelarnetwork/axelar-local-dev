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
    struct Message {
        string sender;
        string message;
    }

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
    string public chainName; // name of the chain this contract is deployed to

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
        _send(sourceChain, sourceAddress, vendorAddress);
    }

    function char(bytes1 b) internal pure returns (bytes1 c) {
        if (uint8(b) < 10) return bytes1(uint8(b) + 0x30);
        else return bytes1(uint8(b) + 0x57);
    }

    function _send(
        string calldata destinationChain,
        string calldata destinationAddress,
        address message
    ) internal {
        // 1. Generate GMP payload
        bytes memory executeMsgPayload = abi.encode(message);
        bytes memory payload = abi.encodePacked(
            bytes4(0x00000000),
            executeMsgPayload
        );

        // 2. Pay for gas
        gasService.payNativeGasForContractCall{value: msg.value}(
            address(this),
            destinationChain,
            destinationAddress,
            payload,
            msg.sender
        );

        // 3. Make GMP call
        gateway.callContract(destinationChain, destinationAddress, payload);
    }

    function _encodePayload(
        bytes memory executeMsgPayload
    ) internal view returns (bytes memory) {
        // Schema
        //   bytes4  version number (0x00000001)
        //   bytes   ABI-encoded payload, indicating function name and arguments:
        //     string                   CosmWasm contract method name
        //     dynamic array of string  CosmWasm contract argument name array
        //     dynamic array of string  argument abi type array
        //     bytes                    abi encoded argument values

        // contract call arguments for ExecuteMsg::receive_message_evm{ source_chain, source_address, payload }
        bytes memory argValues = abi.encode(
            chainName,
            address(this).toString(),
            executeMsgPayload
        );

        string[] memory argumentNameArray = new string[](3);
        argumentNameArray[0] = "source_chain";
        argumentNameArray[1] = "source_address";
        argumentNameArray[2] = "payload";

        string[] memory abiTypeArray = new string[](3);
        abiTypeArray[0] = "string";
        abiTypeArray[1] = "string";
        abiTypeArray[2] = "bytes";

        bytes memory gmpPayload;
        gmpPayload = abi.encode(
            "receive_message_evm",
            argumentNameArray,
            abiTypeArray,
            argValues
        );
    }
}
