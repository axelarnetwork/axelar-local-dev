// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IERC20 } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IERC20.sol';
import { IAxelarGasService } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IAxelarGasService.sol';
import { AxelarExecutable } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/executable/AxelarExecutable.sol';

contract ExecutableWithToken is AxelarExecutable {
    string public value;
    string public sourceChain;
    string public sourceAddress;
    IAxelarGasService public immutable gasService;
    mapping(string => string) public siblings;

    constructor(address gateway_, address gasService_) AxelarExecutable(gateway_) {
        gasService = IAxelarGasService(gasService_);
    }

    //Call this function on setup to tell this contract who it's sibling contracts are.
    function addSibling(string calldata chain_, string calldata address_) external {
        siblings[chain_] = address_;
    }

    //Call this function to update the value of this contract along with all its siblings'.
    function setAndSend(
        string calldata chain,
        string calldata value_,
        address destinationAddress,
        string calldata symbol,
        uint256 amount
    ) external payable {
        value = value_;
        bytes memory payload = abi.encode(value_, destinationAddress);
        if (msg.value > 0) {
            gasService.payNativeGasForContractCallWithToken{ value: msg.value }(
                address(this),
                chain,
                siblings[chain],
                payload,
                symbol,
                amount,
                msg.sender
            );
        }
        address token = gateway.tokenAddresses(symbol);
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        IERC20(token).approve(address(gateway), amount);
        gateway.callContractWithToken(chain, siblings[chain], payload, symbol, amount);
    }

    /*Handles calls created by setAndSend. Updates this contract's value
    and gives the token received to the destination specified at the source chain. */
    function _executeWithToken(
        string calldata sourceChain_,
        string calldata sourceAddress_,
        bytes calldata payload_,
        string calldata symbol,
        uint256 amount
    ) internal override {
        address destinationAddress;
        (value, destinationAddress) = abi.decode(payload_, (string, address));
        sourceChain = sourceChain_;
        sourceAddress = sourceAddress_;
        address token = gateway.tokenAddresses(symbol);
        IERC20(token).transfer(destinationAddress, amount);
    }
}
