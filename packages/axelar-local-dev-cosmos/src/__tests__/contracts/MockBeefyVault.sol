// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import {IERC20} from "@updated-axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IERC20.sol";

contract MockBeefyVault {
    address public want;
    uint256 public pricePerFullShare;
    uint256 private _totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(address _want) {
        want = _want;
        pricePerFullShare = 1e18; // Default 1:1
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }


    function setTotalSupply(uint256 totalSupply_) external {
        _totalSupply = totalSupply_;
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

    function balance() public view returns (uint256) {
        return IERC20(want).balanceOf(address(this));
    }

    function totalSupply() public view returns (uint256) {
        return _totalSupply;
    }

    function withdraw(uint256 shares) external {
        require(balanceOf[msg.sender] >= shares, "Insufficient balance");

        // Calculate USDC to return based on share of total balance
        uint256 usdcAmount = (balance() * shares) / totalSupply();

        balanceOf[msg.sender] -= shares;

        // Transfer USDC to caller
        IERC20(want).transfer(msg.sender, usdcAmount);
    }
}
