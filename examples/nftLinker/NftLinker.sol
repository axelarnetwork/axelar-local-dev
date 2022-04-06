// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import '@openzeppelin/contracts/token/ERC721/ERC721.sol';
import { AxelarGasReceiver } from '@axelar-network/axelar-cgp-solidity/src/util/AxelarGasReceiver.sol';
import { IAxelarExecutable } from '@axelar-network/axelar-cgp-solidity/src/interfaces/IAxelarExecutable.sol';
import { IERC20 } from '@axelar-network/axelar-cgp-solidity/src/interfaces/IERC20.sol';

contract NftLinker is ERC721, IAxelarExecutable {
    mapping(uint256 => bytes) public original; //abi.encode(originaChain, operator, tokenId);
    mapping(string => string) public linkers;
    string chainName;
    AxelarGasReceiver gasReceiver;
    event Log(uint256);
    function addLinker(string memory chain, string memory linker) external {
        linkers[chain] = linker;
    }

    constructor(string memory chainName_, address gateway_, address gasReceiver_) 
    ERC721('Axelar NFT Linker', 'ANL') 
    IAxelarExecutable(gateway_) {
        chainName = chainName_;
        gasReceiver = AxelarGasReceiver(gasReceiver_);
    }

    function sendNFT(
        address operator, 
        uint256 tokenId, 
        string memory destinationChain, 
        address destinationAddress,
        address gasToken,
        uint256 gasAmount
    ) external {
        if(operator == address(this)) {
            require(ownerOf(tokenId) == _msgSender(), 'NOT_YOUR_TOKEN');
            _sendMintedToken(tokenId, destinationChain, destinationAddress, gasToken, gasAmount);
        } else {
            IERC721(operator).transferFrom(_msgSender(), address(this), tokenId);
            _sendNativeToken(operator, tokenId, destinationChain, destinationAddress, gasToken, gasAmount);
        }
    }

    function _sendMintedToken(
        uint256 tokenId, 
        string memory destinationChain, 
        address destinationAddress,
        address gasToken,
        uint256 gasAmount
    ) internal {
        _burn(tokenId);
        string memory originalChain;
        address operator;
        uint256 originalTokenId;
        (originalChain, operator, originalTokenId) = abi.decode(original[tokenId], (string, address, uint256));
        bytes memory payload = abi.encode(originalChain, operator, originalTokenId, destinationAddress);
        IERC20(gasToken).transferFrom(msg.sender, address(this), gasAmount);
        IERC20(gasToken).approve(address(gasReceiver), gasAmount);
        gasReceiver.receiveGas(destinationChain, linkers[destinationChain], payload, gasToken, gasAmount);
        gateway.callContract(destinationChain, linkers[destinationChain], payload);
    }

    function _sendNativeToken(
        address operator, 
        uint256 tokenId, 
        string memory destinationChain, 
        address destinationAddress,
        address gasToken,
        uint256 gasAmount
    ) internal {
        bytes memory payload = abi.encode(chainName, operator, tokenId, destinationAddress);
        IERC20(gasToken).transferFrom(msg.sender, address(this), gasAmount);
        IERC20(gasToken).approve(address(gasReceiver), gasAmount);
        gasReceiver.receiveGas(destinationChain, linkers[destinationChain], payload, gasToken, gasAmount);
        gateway.callContract(destinationChain, linkers[destinationChain], payload);
    }

    function _execute(string memory sourceChain, string memory sourceAddress, bytes calldata payload) internal override {
        require(keccak256(bytes(sourceAddress)) == keccak256(bytes(linkers[sourceChain])), 'NOT_A_LINKER');
        string memory originalChain;
        address operator;
        uint256 tokenId;
        address destinationAddress;
        (originalChain, operator, tokenId, destinationAddress) = abi.decode(payload, (string, address ,uint256, address));
        if(keccak256(bytes(originalChain)) == keccak256(bytes(chainName))) {
            IERC721(operator).transferFrom(address(this), destinationAddress, tokenId);
        } else {
            bytes memory originalData = abi.encode(originalChain, operator, tokenId);
            uint256 newTokenId = uint256(keccak256(originalData));
            original[newTokenId] = originalData;
            emit Log(newTokenId);
            _safeMint(destinationAddress, newTokenId);
        }
    }
}