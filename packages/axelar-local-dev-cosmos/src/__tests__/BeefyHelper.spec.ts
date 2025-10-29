import { expect } from "chai";
import { ethers } from "hardhat";

describe("WalletHelper", () => {
  let walletHelper: ethers.Contract;
  let mockVault: ethers.Contract;
  let mockUSDC: ethers.Contract;
  let owner: ethers.SignerWithAddress;
  let user: ethers.SignerWithAddress;

  before(async () => {
    [owner, user] = await ethers.getSigners();

    // Deploy mock USDC token
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    mockUSDC = await MockERC20Factory.deploy("USDC", "USDC", 6);
    await mockUSDC.waitForDeployment();

    // Deploy mock Beefy vault
    const MockBeefyVaultFactory =
      await ethers.getContractFactory("MockBeefyVault");
    mockVault = await MockBeefyVaultFactory.deploy(mockUSDC.target);
    await mockVault.waitForDeployment();

    // Deploy WalletHelper
    const WalletHelperFactory = await ethers.getContractFactory("WalletHelper");
    walletHelper = await WalletHelperFactory.deploy();
    await walletHelper.waitForDeployment();
  });

  describe("beefyWithdrawUSDC", () => {
    it("should calculate correct mooTokens needed and withdraw USDC", async () => {
      const usdcAmount = ethers.parseUnits("1000", 6); // 1000 USDC
      const pricePerShare = ethers.parseEther("2.0"); // 1 mooToken = 1.5 USDC

      // Setup: Mint USDC to vault
      await mockUSDC.mint(mockVault.target, ethers.parseUnits("10000", 6));

      // Setup: Mint mooTokens to user
      const expectedShares =
        (usdcAmount * ethers.parseEther("1")) / pricePerShare;
      await mockVault.mint(user.address, expectedShares);

      // Setup: Set price per share in vault
      await mockVault.setPricePerFullShare(pricePerShare);

      // User approves WalletHelper to spend mooTokens
      await mockVault
        .connect(user)
        .approve(walletHelper.target, expectedShares);

      const userUSDCBefore = await mockUSDC.balanceOf(user.address);
      const userSharesBefore = await mockVault.balanceOf(user.address);

      // User calls beefyWithdrawUSDC
      await walletHelper
        .connect(user)
        .beefyWithdrawUSDC(mockVault.target, usdcAmount);

      const userUSDCAfter = await mockUSDC.balanceOf(user.address);
      const userSharesAfter = await mockVault.balanceOf(user.address);
      console.log(await mockUSDC.balanceOf(walletHelper.target));
      // Verify USDC was transferred to user
      expect(userUSDCAfter - userUSDCBefore).to.equal(usdcAmount);

      // Verify mooTokens were deducted from user
      expect(userSharesBefore - userSharesAfter).to.equal(expectedShares);
    });

    it("has a rounding error", async () => {
      const usdcAmount = ethers.parseUnits("1000", 6); // 1000 USDC
      const pricePerShare = ethers.parseEther("1.5"); // 1 mooToken = 1.5 USDC

      await mockUSDC.mint(mockVault.target, ethers.parseUnits("10000", 6));

      const expectedShares =
        (usdcAmount * ethers.parseEther("1")) / pricePerShare;
      await mockVault.mint(user.address, expectedShares);

      await mockVault.setPricePerFullShare(pricePerShare);

      await mockVault
        .connect(user)
        .approve(walletHelper.target, expectedShares);

      const userUSDCBefore = await mockUSDC.balanceOf(user.address);
      const userSharesBefore = await mockVault.balanceOf(user.address);

      await walletHelper
        .connect(user)
        .beefyWithdrawUSDC(mockVault.target, usdcAmount);

      const userUSDCAfter = await mockUSDC.balanceOf(user.address);
      const userSharesAfter = await mockVault.balanceOf(user.address);

      // Rounding error occurs here
      expect(userUSDCAfter - userUSDCBefore).to.equal(usdcAmount - 1n);

      expect(userSharesBefore - userSharesAfter).to.equal(expectedShares);
    });

    it("should revert if user has insufficient mooTokens", async () => {
      const usdcAmount = ethers.parseUnits("1000", 6);
      const pricePerShare = ethers.parseEther("1.0");

      await mockVault.setPricePerFullShare(pricePerShare);

      // User has 0 mooTokens but tries to withdraw
      await expect(
        walletHelper
          .connect(user)
          .beefyWithdrawUSDC(mockVault.target, usdcAmount),
      ).to.be.reverted;
    });

    it("should revert if user hasn't approved WalletHelper", async () => {
      const usdcAmount = ethers.parseUnits("100", 6);
      const pricePerShare = ethers.parseEther("1.0");
      const shares = usdcAmount;

      await mockUSDC.mint(mockVault.target, ethers.parseUnits("1000", 6));
      await mockVault.mint(user.address, shares);
      await mockVault.setPricePerFullShare(pricePerShare);

      // Don't approve WalletHelper
      await expect(
        walletHelper
          .connect(user)
          .beefyWithdrawUSDC(mockVault.target, usdcAmount),
      ).to.be.reverted;
    });
  });
});
