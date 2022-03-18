// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import {IAxelarGateway} from '../../node_modules/axelar-gateway-solidity/src/interfaces/IAxelarGateway.sol';

abstract contract IAxelarExecutable {
    IAxelarGateway public gateway;

    constructor(address gateway_) {
        gateway = IAxelarGateway(gateway_);
    }

    function execute(
        bytes32 commandId,
        string memory sourceChain,
        string memory sourceAddress,
        bytes calldata payload
    ) external {
        bytes32 payloadHash = keccak256(payload);
        require(IAxelarGateway(gateway).validateContractCall(
            commandId, 
            sourceChain, 
            sourceAddress, 
            payloadHash
        ), 'NOT APPROVED');
        _execute(sourceChain, sourceAddress, payload);
    }
    function executeWithMint(
        bytes32 commandId,
        string memory sourceChain,
        string memory sourceAddress,
        bytes calldata payload,
        string memory tokenSymbol,
        uint256 amount
    ) external {
        bytes32 payloadHash = keccak256(payload);
        require(IAxelarGateway(gateway).validateContractCallAndMint(
            commandId, 
            sourceChain, 
            sourceAddress, 
            payloadHash,
            tokenSymbol, 
            amount
        ), 'NOT APPROVED');

        _executeWithMint(sourceChain, sourceAddress, payload, tokenSymbol, amount);

    }

    function _execute(
        string memory sourceChain,
        string memory sourceAddress, 
        bytes calldata payload
    ) internal virtual {}
    function _executeWithMint(
        string memory sourceChain,
        string memory sourceAddress,
        bytes calldata payload, 
        string memory tokenSymbol, 
        uint256 amount
    ) internal virtual {}
}