import AxelarGasService from "@axelar-network/axelar-cgp-solidity/artifacts/contracts/gas-service/AxelarGasService.sol/AxelarGasService.json";
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
  sourceAddress,
) => {
  const WalletFactory = await ethers.getContractFactory("Wallet");
  const wallet = await WalletFactory.deploy(
    axelarGatewayMock.target,
    ownerAddress,
    sourceAddress,
  );
  await wallet.waitForDeployment();
  return wallet;
};

describe("Factory", () => {
  let owner, addr1, factory, axelarGatewayMock;

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
      AxelarGasService.abi,
      AxelarGasService.bytecode,
    );

    const axelarGasServiceMock = await GasServiceFactory.deploy(owner.address);

    const TokenDeployerFactory =
      await ethers.getContractFactory("TokenDeployer");
    const tokenDeployer = await TokenDeployerFactory.deploy();

    const AuthFactory = await ethers.getContractFactory("AxelarAuthWeighted");
    const authContract = await AuthFactory.deploy([
      abiCoder.encode(
        ["address[]", "uint256[]", "uint256"],
        [[owner.address], [1], 1],
      ),
    ]);

    const AxelarGatewayFactory =
      await ethers.getContractFactory("AxelarGateway");
    axelarGatewayMock = await AxelarGatewayFactory.deploy(
      authContract.target,
      tokenDeployer.target,
    );

    const Contract = await ethers.getContractFactory("Factory");
    factory = await Contract.deploy(
      axelarGatewayMock.target,
      axelarGasServiceMock.target,
    );
    await factory.waitForDeployment();

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

  it("fund Factory with ETH to pay for gas", async () => {
    const provider = ethers.provider;

    const factoryAddress = await factory.getAddress();
    const balanceBefore = await provider.getBalance(factoryAddress);
    expect(balanceBefore).to.equal(ethers.parseEther("0"));

    const tx = await owner.sendTransaction({
      to: factoryAddress,
      value: ethers.parseEther("5.0"),
    });
    await tx.wait();

    const receipt = await provider.getTransactionReceipt(tx.hash);
    const iface = (await ethers.getContractFactory("Factory")).interface;
    const receivedEvent = receipt?.logs
      .map((log) => {
        try {
          return iface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed && parsed.name === "Received");

    expect(receivedEvent).to.not.be.undefined;
    expect(receivedEvent?.args.sender).to.equal(owner.address);
    expect(receivedEvent?.args.amount).to.equal(ethers.parseEther("5.0"));

    const balanceAfter = await provider.getBalance(factoryAddress);
    expect(balanceAfter).to.equal(ethers.parseEther("5.0"));
  });

  it("should create a new remote wallet using Factory", async () => {
    const commandId = getCommandId();

    const payload = abiCoder.encode(["uint256"], [50000]);
    const payloadHash = keccak256(toBytes(payload));

    await approveMessage({
      commandId,
      from: sourceContract,
      sourceAddress,
      targetAddress: factory.target,
      payload: payloadHash,
      owner,
      AxelarGateway: axelarGatewayMock,
      abiCoder,
    });

    const tx = await factory.execute(
      commandId,
      sourceContract,
      sourceAddress,
      payload,
    );

    await expect(tx)
      .to.emit(factory, "SmartWalletCreated")
      .withArgs(expectedWalletAddress, sourceAddress, "agoric", sourceAddress);
    await expect(tx).to.emit(factory, "CrossChainCallSent");
  });

  it("should use the remote wallet to call other contracts", async () => {
    // Deploy Multicall.sol
    const MulticallFactory = await ethers.getContractFactory("Multicall");
    const multicall = await MulticallFactory.deploy();
    await multicall.waitForDeployment();

    const wallet = await createRemoteEVMAccount(
      axelarGatewayMock,
      owner.address,
      sourceAddress,
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
    const multicallPayload = encodeMulticallPayload(
      abiEncodedContractCalls,
      "tx1",
    );
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
      multicallPayload,
    );

    const receipt = await execTx.wait();
    const walletInterface = wallet.interface;

    // Check CallStatus events for each call
    const callStatusEvents = receipt?.logs
      .map((log) => {
        try {
          return walletInterface.parseLog(log);
        } catch {
          return null;
        }
      })
      .filter((parsed) => parsed && parsed.name === "CallStatus");

    expect(callStatusEvents).to.have.lengthOf(2);
    expect(callStatusEvents[0]?.args.callIndex).to.equal(0);
    expect(callStatusEvents[0]?.args.target).to.equal(multicallAddress);
    expect(callStatusEvents[0]?.args.success).to.be.true;

    expect(callStatusEvents[1]?.args.callIndex).to.equal(1);
    expect(callStatusEvents[1]?.args.target).to.equal(multicallAddress);
    expect(callStatusEvents[1]?.args.success).to.be.true;

    // Check MulticallStatus event
    await expect(execTx)
      .to.emit(wallet, "MulticallStatus")
      .withArgs("tx1", true, 2);

    const value = await multicall.getValue();
    expect(value).to.equal(27);

  });
});
