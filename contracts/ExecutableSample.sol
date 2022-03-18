// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import {IAxelarExecutable} from './interfaces/IAxelarExecutable.sol';
import {IERC20} from './interfaces/IERC20.sol';

contract ExecutableSample is IAxelarExecutable {
    string public value;
    string[] public chains;
    string[] public addresses; 

    constructor(address gateway) IAxelarExecutable(gateway) {}

    function set(string calldata value_) external {
        value = value_;
        for(uint i=0; i<chains.length; i++) {
            gateway.callContract(
                chains[i],
                addresses[i],
                abi.encode(value_)
            );
        }
    }
    function setAndSend(
        string calldata value_, 
        string memory chain_, 
        address destination_, 
        string memory symbol_, 
        uint256 amount_
    ) external {
        value = value_;

        address tokenAddress = gateway.tokenAddresses(symbol_);
        IERC20(tokenAddress).transferFrom(msg.sender, address(this), amount_);
        IERC20(tokenAddress).approve(address(gateway), amount_);
        uint256 index = chains.length;
        for(uint i=0; i<chains.length; i++) {
            if(keccak256(bytes(chains[i])) == keccak256(bytes(chain_))) {
                index = i;
                continue;
            }
            gateway.callContract(
                chains[i],
                addresses[i],
                abi.encode(value_)
            );
        }
        require(index < chains.length, 'INVALID DESTINATION'); 
        gateway.callContractWithToken(
            chains[index],
            addresses[index],
            abi.encode(value_, destination_),
            symbol_,
            amount_
        );
    }
    function addSibling(string calldata chain_, string calldata address_) external {
        chains.push(chain_);
        addresses.push(address_);
    }

    function _execute(
        string memory /*sourceChain*/,
        string memory /*sourceAddress*/,
        bytes calldata payload
    ) internal override {
        value = abi.decode(payload, (string));
    }
    function _executeWithMint(
        string memory /*sourceChain*/,
        string memory /*sourceAddress*/, 
        bytes calldata payload,
        string memory tokenSymbol, 
        uint256 amount
    ) internal override {
        address destination;
        (value, destination) = abi.decode(payload, (string, address));
        address tokenAddress = gateway.tokenAddresses(tokenSymbol);
        IERC20(tokenAddress).transfer(destination, amount);
    }
}