// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IAxelarExecutable } from '@axelar-network/axelar-cgp-solidity/src/interfaces/IAxelarExecutable.sol';

/// @dev An abstract contract responsible for sending token to and receiving token from another TokenLinker.
abstract contract TokenLinker is IAxelarExecutable {
    event SendInitiated(string destinationChain, address indexed recipient, uint256 amount);

    event ReceiveCompleted(string sourceChain, address indexed recipient, uint256 amount);

    address public immutable token;
    mapping(string => string) public links;

    constructor(address gateway_, address token_) IAxelarExecutable(gateway_) {
        token = token_;
    }

    //Call this function on setup to tell this contract who it's sibling contracts are.
    function addLinker(string calldata chain_, string calldata address_) external {
        links[chain_] = address_;
    }

    function sendTo(
        string memory chain_,
        address recipient_,
        uint256 amount_
    ) external {
        require(bytes(links[chain_]).length != 0, 'IVALID_DESTINATION_CHAIN');
        _collectToken(msg.sender, amount_);
        gateway.callContract(
            chain_,
            links[chain_],
            abi.encode(recipient_, amount_)
        );
        emit SendInitiated(chain_, recipient_, amount_);
    }

   function _execute(
        string memory sourceChain_,
        string memory sourceAddress_, 
        bytes calldata payload_
    ) internal override {
        require(keccak256(bytes(links[sourceChain_])) == keccak256(bytes(sourceAddress_)), 'IVALID_SOURCE');
        address recipient;
        uint256 amount;
        (recipient, amount) = abi.decode(payload_, (address, uint256));
        _giveToken(recipient, amount);
        emit ReceiveCompleted(sourceChain_, recipient, amount);
    }

    function _collectToken(address from, uint256 amount) internal virtual;
    function _giveToken(address to, uint256 amount) internal virtual;
}