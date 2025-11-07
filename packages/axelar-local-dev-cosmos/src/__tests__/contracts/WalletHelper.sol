// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;
import {IERC20} from "@updated-axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IERC20.sol";

// Minimal interface for Beefy Vault V7
interface IBeefyVaultV7 {
    function withdraw(uint256 _shares) external;
    function want() external view returns (address);
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool);
    function balance() external view returns (uint256);
    function totalSupply() external view returns (uint256);
}

contract WalletHelper {
    function beefyWithdrawUSDC(
        address vaultAddress,
        uint256 usdcAmount
    ) external {
        IBeefyVaultV7 vault = IBeefyVaultV7(vaultAddress);

        uint256 sharesToWithdraw = ((usdcAmount * vault.totalSupply()) +
            vault.balance() -
            1) / vault.balance();

        vault.transferFrom(msg.sender, address(this), sharesToWithdraw);

        vault.withdraw(sharesToWithdraw);

        address wantToken = vault.want();
        uint256 balance = IERC20(wantToken).balanceOf(address(this));
        IERC20(wantToken).transfer(msg.sender, balance);
    }
}
