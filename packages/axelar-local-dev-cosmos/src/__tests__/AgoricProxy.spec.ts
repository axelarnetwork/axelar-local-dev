import { expect } from "chai";
import { ethers } from "hardhat";

describe("AgoricProxy", function () {
  let agoricProxy: any;
  let gateway: any;
  let gasService: any;
  let owner: any;
  let chainName = "Ethereum";

  before(async function () {
    // Deploy mock AxelarExecutable and IAxelarGasService if needed
    // For now, use signers' addresses as mocks
    [gateway, gasService, owner] = await ethers.getSigners();

    const contractFactory = await ethers.getContractFactory("AgoricProxy");
    agoricProxy = await contractFactory.deploy(
      await gateway.getAddress(),
      await gasService.getAddress(),
      chainName
    );
  });

  it("should deploy AgoricProxy with correct parameters", async function () {
    expect(await agoricProxy.chainName()).to.equal(chainName);
    expect(await agoricProxy.gasService()).to.equal(
      await gasService.getAddress()
    );
    expect(await agoricProxy.gateway()).to.equal(await gateway.getAddress());
  });

  it("should create a new Wallet and emit WalletCreated event", async function () {
    const ownerString = "agoric1rwwley550k9mmk6uq6mm6z4udrg8kyuyvfszjk";
    const tx = await agoricProxy.createSmartWallet(ownerString);
    const receipt = await tx.wait();

    const parsedLogs = receipt.logs
      .map((log: any) => {
        try {
          return agoricProxy.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .filter((parsed: any) => parsed && parsed.name === "WalletCreated");
    const event = parsedLogs[0];
    expect(event).to.not.be.undefined;
    expect(event.args.label).to.equal("WalletCreatedSuccess");
    expect(event.args.ownerAddress).to.equal(ownerString);

    // Check that the created wallet is a contract
    const walletAddress = event.args.target;
    expect(await owner.provider.getCode(walletAddress)).to.not.equal("0x");
  });

  it("should allow the created Wallet to receive ETH", async function () {
    const ownerString = "agoric1rwwley550k9mmk6uq6mm6z4udrg8kyuyvfszjk";
    const tx = await agoricProxy.createSmartWallet(ownerString);
    const receipt = await tx.wait();
    const parsedLogs = receipt.logs
      .map((log: any) => {
        try {
          return agoricProxy.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .filter((parsed: any) => parsed && parsed.name === "WalletCreated");
    const event = parsedLogs[0];
    const walletAddress = event.args.target;

    const sendTx = await owner.sendTransaction({
      to: walletAddress,
      value: ethers.parseEther("1.0"),
    });
    await sendTx.wait();
    const balance = await owner.provider.getBalance(walletAddress);
    expect(balance).to.equal(ethers.parseEther("1.0"));
  });
});
