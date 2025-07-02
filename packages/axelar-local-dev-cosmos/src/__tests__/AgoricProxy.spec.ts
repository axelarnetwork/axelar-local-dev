import { expect } from "chai";
import { ethers } from "hardhat";
import { keccak256, stringToHex, toBytes } from "viem";
import {
  approveMessage,
  approveMessageWithToken,
  constructContractCall,
  deployToken,
  encodeMulticallPayload,
  getPayloadHash,
} from "./lib/utils";

const createRemoteEVMAccount = async (
  axelarGatewayMock,
  ownerAddress,
  sourceAddress
) => {
  const WalletFactory = await ethers.getContractFactory("Wallet");
  const wallet = await WalletFactory.deploy(
    axelarGatewayMock.target,
    ownerAddress,
    sourceAddress
  );
  await wallet.waitForDeployment();
  return wallet;
};

describe("AgoricProxy", () => {
  let owner, addr1, agoricProxy, axelarGatewayMock;

  const abiCoder = new ethers.AbiCoder();
  const expectedWalletAddress = "0x856e4424f806D16E8CBC702B3c0F2ede5468eae5";

  const sourceContract = "agoric";
  const sourceAddress = "0x1234567890123456789012345678901234567890";

  let commandIdCounter = 1;
  const getCommandId = () => {
    const commandId = keccak256(stringToHex(String(commandIdCounter)));
    commandIdCounter++;
    return commandId;
  };

  before(async () => {
    [owner, addr1] = await ethers.getSigners();

    const GasServiceFactory = await ethers.getContractFactory(
      "AxelarGasService"
    );
    const axelarGasServiceMock = await GasServiceFactory.deploy(owner.address);

    const TokenDeployerFactory = await ethers.getContractFactory(
      "TokenDeployer"
    );
    const tokenDeployer = await TokenDeployerFactory.deploy();

    const AuthFactory = await ethers.getContractFactory("AxelarAuthWeighted");
    const authContract = await AuthFactory.deploy([
      abiCoder.encode(
        ["address[]", "uint256[]", "uint256"],
        [[owner.address], [1], 1]
      ),
    ]);

    const AxelarGatewayFactory = await ethers.getContractFactory(
      "AxelarGateway"
    );
    axelarGatewayMock = await AxelarGatewayFactory.deploy(
      authContract.target,
      tokenDeployer.target
    );

    const Contract = await ethers.getContractFactory("AgoricProxy");
    agoricProxy = await Contract.deploy(
      axelarGatewayMock.target,
      axelarGasServiceMock.target,
      "Ethereum"
    );
    await agoricProxy.waitForDeployment();

    await deployToken({
      commandId: getCommandId(),
      name: "Universal Stablecoin",
      symbol: "USDC",
      decimals: 18,
      cap: 1000000,
      tokenAddress: "0x0000000000000000000000000000000000000000",
      mintLimit: 1000000,
      owner,
      AxelarGateway: axelarGatewayMock,
      abiCoder,
    });
  });

  it("fund AgoricProxy with ETH to pay for gas", async () => {
    const provider = ethers.provider;

    const agoricProxyAddress = await agoricProxy.getAddress();
    const balanceBefore = await provider.getBalance(agoricProxyAddress);
    expect(balanceBefore).to.equal(ethers.parseEther("0"));

    const tx = await owner.sendTransaction({
      to: agoricProxyAddress,
      value: ethers.parseEther("5.0"),
    });
    await tx.wait();

    const receipt = await provider.getTransactionReceipt(tx.hash);
    const iface = (await ethers.getContractFactory("AgoricProxy")).interface;
    const receivedEvent = receipt.logs
      .map((log) => {
        try {
          return iface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed && parsed.name === "Received");

    expect(receivedEvent).to.not.be.undefined;
    expect(receivedEvent.args.sender).to.equal(owner.address);
    expect(receivedEvent.args.amount).to.equal(ethers.parseEther("5.0"));

    const balanceAfter = await provider.getBalance(agoricProxyAddress);
    expect(balanceAfter).to.equal(ethers.parseEther("5.0"));
  });

  it("should create a new remote wallet using AgoricProxy", async () => {
    const commandId = getCommandId();

    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const payload = abiCoder.encode(["bytes"], ["0x"]);
    const payloadHash = keccak256(toBytes(payload));

    await approveMessage({
      commandId,
      from: sourceContract,
      sourceAddress,
      targetAddress: agoricProxy.target,
      payload: payloadHash,
      owner,
      AxelarGateway: axelarGatewayMock,
      abiCoder,
    });

    const tx = await agoricProxy.execute(
      commandId,
      sourceContract,
      sourceAddress,
      payload
    );

    await expect(tx)
      .to.emit(agoricProxy, "SmartWalletCreated")
      .withArgs(expectedWalletAddress, sourceAddress, "agoric", sourceAddress);
    await expect(tx).to.emit(agoricProxy, "CrossChainCallSent");
  });

  it("should use the remote wallet to call other contracts", async () => {
    // Deploy Multicall.sol
    const MulticallFactory = await ethers.getContractFactory("Multicall");
    const multicall = await MulticallFactory.deploy();
    await multicall.waitForDeployment();

    const wallet = await createRemoteEVMAccount(
      axelarGatewayMock,
      owner.address,
      sourceAddress
    );

    // Test ContractCall
    const multicallAddress = await multicall.getAddress();
    const abiEncodedContractCalls = [
      constructContractCall({
        target: multicallAddress,
        functionSignature: "setValue(uint256)",
        args: [10],
      }),
      constructContractCall({
        target: multicallAddress,
        functionSignature: "addToValue(uint256)",
        args: [17],
      }),
    ];
    const multicallPayload = encodeMulticallPayload(abiEncodedContractCalls);
    const payloadHash = getPayloadHash(multicallPayload);

    const commandId1 = getCommandId();
    await approveMessage({
      commandId: commandId1,
      from: sourceContract,
      sourceAddress,
      targetAddress: wallet.target,
      payload: payloadHash,
      owner,
      AxelarGateway: axelarGatewayMock,
      abiCoder,
    });

    const execTx = await wallet.execute(
      commandId1,
      sourceContract,
      sourceAddress,
      multicallPayload
    );

    expect(execTx).to.emit(wallet, "MulticallExecuted");
    const value = await multicall.getValue();
    expect(value).to.equal(27);

    // Test ContractCallWithToken
    const abiEncodedCallsWithTokens = [
      constructContractCall({
        target: multicallAddress,
        functionSignature: "addToValue(uint256)",
        args: [17],
      }),
    ];
    const multicallPayload2 = encodeMulticallPayload(abiEncodedCallsWithTokens);
    const payloadHash2 = getPayloadHash(multicallPayload2);

    const commandId2 = getCommandId();
    await approveMessageWithToken({
      commandId: commandId2,
      from: sourceContract,
      sourceAddress,
      targetAddress: wallet.target,
      payload: payloadHash2,
      owner,
      AxelarGateway: axelarGatewayMock,
      abiCoder,
      destinationTokenSymbol: "USDC",
      amount: 5000,
    });

    const execWithTokenTx = await wallet.executeWithToken(
      commandId2,
      sourceContract,
      sourceAddress,
      multicallPayload2,
      "USDC",
      5000
    );

    expect(execWithTokenTx).to.emit(wallet, "MulticallExecuted");
    const value2 = await multicall.getValue();
    expect(value2).to.equal(44);
  });
});
