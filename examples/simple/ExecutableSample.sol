// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IAxelarExecutable } from 'axelar-cgp-solidity/src/interfaces/IAxelarExecutable.sol';
import { IERC20 } from 'axelar-cgp-solidity/src/interfaces/IERC20.sol';

contract ExecutableSample is IAxelarExecutable {
    string public value;
    string[] public chains;
    string[] public addresses; 

    constructor(address gateway) IAxelarExecutable(gateway) {}

    //Call this function on setup to tell this contract who it's sibling contracts are.
    function addSibling(string calldata chain_, string calldata address_) external {
        chains.push(chain_);
        addresses.push(address_);
    }

    //Call this function to update the value of this contract along with all its siblings'.
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

    /*
    Call this function to update the value of this contract along with all its siblings'
    and send some token to one of it's siblings to be passed along to a different destination.
    */
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
            //We skip the chain the token is going to.
            if(keccak256(bytes(chains[i])) == keccak256(bytes(chain_))) {
                index = i;
                continue;
            }
            //But update the rest.
            gateway.callContract(
                chains[i],
                addresses[i],
                abi.encode(value_)
            );
        }
        require(index < chains.length, 'INVALID DESTINATION'); 
        //We update the contract the token is going to as part of sending it the token.
        gateway.callContractWithToken(
            chains[index],
            addresses[index],
            abi.encode(value_, destination_),
            symbol_,
            amount_
        );
    }

    //Handles calls created by set on the destination chain. Simply updates this contract's value.
    function _execute(
        string memory /*sourceChain*/,
        string memory /*sourceAddress*/,
        bytes calldata payload
    ) internal override {
        value = abi.decode(payload, (string));
    }

    /*Handles calls created by setAndSend. Updates this contract's value 
    and gives the token received to the destination specified at the source chain. */
    function _executeWithToken(
        string memory /*sourceChain*/,
        string memory /*sourceAddress*/, 
        bytes calldata payload,
        string memory tokenSymbol, 
        uint256 amount
    ) internal override {
        address destination;
        (value, destination) = abi.decode(payload, (string, address));
        address tokenAddress = _getTokenAddress(tokenSymbol);
        IERC20(tokenAddress).transfer(destination, amount);
    }
}