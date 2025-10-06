// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract StakingContract is ERC20 {
    IERC20 public stakingToken;
    uint256 public totalStaked;

    mapping(address => uint256) public stakedBalances;

    constructor(address _stakingToken) ERC20("StakeToken", "STK") {
        stakingToken = IERC20(_stakingToken);
    }

    function stake(uint256 _amount) external {
        require(_amount > 0, "Cannot stake 0 tokens");

        stakingToken.transferFrom(msg.sender, address(this), _amount);
        stakedBalances[msg.sender] += _amount;
        totalStaked += _amount;

        _mint(msg.sender, _amount);
    }

    function unstake(uint256 _amount) external {
        require(_amount > 0, "Cannot unstake 0 tokens");
        require(
            stakedBalances[msg.sender] >= _amount,
            "Insufficient staked balance"
        );

        stakedBalances[msg.sender] -= _amount;
        totalStaked -= _amount;

        _burn(msg.sender, _amount);
        stakingToken.transfer(msg.sender, _amount);
    }

    function stakedBalanceOf(address _account) external view returns (uint256) {
        return stakedBalances[_account];
    }
}
