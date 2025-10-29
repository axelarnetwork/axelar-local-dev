// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import {IERC20} from "@updated-axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IERC20.sol";

contract MockBeefyVault {
    address public want;
    uint256 public pricePerFullShare;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(address _want) {
        want = _want;
        pricePerFullShare = 1e18; // Default 1:1
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function setPricePerFullShare(uint256 _price) external {
        pricePerFullShare = _price;
    }

    function getPricePerFullShare() external view returns (uint256) {
        return pricePerFullShare;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(allowance[from][msg.sender] >= amount, "Insufficient allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function withdraw(uint256 shares) external {
        require(balanceOf[msg.sender] >= shares, "Insufficient balance");
        balanceOf[msg.sender] -= shares;

        // Calculate USDC to return based on pricePerFullShare
        uint256 usdcAmount = (shares * pricePerFullShare) / 1e18;

        // Transfer USDC to caller
        IERC20(want).transfer(msg.sender, usdcAmount);
    }
}
