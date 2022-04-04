// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;


import { IAxelarExecutable } from '@axelar-network/axelar-cgp-solidity/src/interfaces/IAxelarExecutable.sol';
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from '@axelar-network/axelar-cgp-solidity/src/interfaces/IERC20.sol';
import { AxelarGasReceiver } from '@axelar-network/axelar-cgp-solidity/src/util/AxelarGasReceiver.sol';

contract Headers is IAxelarExecutable, Ownable {
    uint256 public immutable length;
    uint256 public n;
    mapping(string => bytes32[]) public headersMap;
    mapping(string => uint256[]) public blocksMap;
    AxelarGasReceiver gasReceiver;
    mapping(string => string) public siblings;

    constructor(address gateway_, address gasReceiver_, uint256 length_) IAxelarExecutable(gateway_) {
        length = length_;
        gasReceiver = AxelarGasReceiver(gasReceiver_);
    }

    function addSibling(string memory chain_, string memory address_) external onlyOwner() {
        require(bytes(siblings[chain_]).length == 0, 'SIBLING_EXISTS');
        siblings[chain_] = address_;
    }

    function getHeader(string calldata chain, uint256 i_) external view returns (uint256 block_, bytes32 header_) {
        uint256 l = headersMap[chain].length;
        require(i_ < l, 'NOT_ENOUGHT_HEADERS_STORED');
        uint256 i = (n + l - i_) % l;
        block_ = blocksMap[chain][i];
        header_ = headersMap[chain][i];
    }

    function getStoredLength(string calldata chain) external view returns (uint256) {
        return headersMap[chain].length;
    }

    function updateRemoteHeaders(
        string memory symbol, 
        string[] memory chains, 
        uint256[] calldata fees, 
        uint256[] memory gases,
        uint256 gasLimit
    ) external {
        bytes memory payload = abi.encode(block.number-1, blockhash(block.number - 1));
        uint256 total;
        for(uint256 i = 0; i< chains.length; i++) {
            total += fees[i] + gases[i];
        }
        address token = _getTokenAddress(symbol);
        IERC20(token).transferFrom(msg.sender, address(this), total);
        for(uint256 i = 0; i < chains.length; i++) {
            IERC20(token).approve(address(gasReceiver), gases[i]);
            gasReceiver.receiveGas(
                chains[i], 
                siblings[chains[i]], 
                payload, 
                symbol, 
                fees[i], 
                token, 
                gases[i], 
                gasLimit
            );
            IERC20(token).approve(address(gateway), fees[i]);
            gateway.callContractWithToken(
                chains[i], 
                siblings[chains[i]], 
                payload, 
                symbol, 
                fees[i]
            );
        }
    }

    function _executeWithToken(
        string memory sourceChain, 
        string memory sourceAddress, 
        bytes calldata payload, 
        string memory /*tokenSymbol*/, 
        uint256 /*amount*/
    ) internal override {
        require(keccak256(bytes(sourceAddress)) == keccak256(bytes(siblings[sourceChain])), 'WRONG_SENDER');
        (
            uint256 block_,
            bytes32 header_
        ) = abi.decode(payload, (uint256, bytes32));
        uint256 l = headersMap[sourceChain].length;
        if(l < length) {
            n = l;
            blocksMap[sourceChain].push(block_);
            headersMap[sourceChain].push(header_);
        } else {
            n = (n + 1) % length;
            blocksMap[sourceChain][n] = block_;
            headersMap[sourceChain][n] = header_;
        }
    }
}