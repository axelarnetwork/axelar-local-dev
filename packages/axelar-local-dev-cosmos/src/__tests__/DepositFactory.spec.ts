import AxelarGasService from "@axelar-network/axelar-cgp-solidity/artifacts/contracts/gas-service/AxelarGasService.sol/AxelarGasService.json";
import { expect } from "chai";
import { ethers } from "hardhat";
import "@nomicfoundation/hardhat-chai-matchers";
import { keccak256, stringToHex, toBytes } from "viem";
import {
  approveMessage,
  constructContractCall,
  deployToken,
  encodeMulticallPayload,
  getPayloadHash,
} from "./lib/utils";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract } from "ethers";

const computeCreate2Address = async (
  factoryAddress: string,
  gatewayAddress: string,
  gasServiceAddress: string,
  owner: string,
) => {
  const salt = ethers.solidityPackedKeccak256(["string"], [owner]);

  // Get the Wallet contract bytecode and constructor args
  const WalletFactory = await ethers.getContractFactory("Wallet");
  const constructorArgs = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "address", "string"],
    [gatewayAddress, gasServiceAddress, owner],
  );
  const initCode = ethers.solidityPacked(
    ["bytes", "bytes"],
    [WalletFactory.bytecode, constructorArgs],
  );
  const initCodeHash = ethers.keccak256(initCode);

  return ethers.getCreate2Address(factoryAddress, salt, initCodeHash);
};

const createRemoteEVMAccount = async (
  axelarGatewayMock: Contract,
  ownerAddress: string,
  sourceAddress: string,
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

describe("DepositFactory", () => {
  let owner: HardhatEthersSigner,
    addr1: HardhatEthersSigner,
    factory: Contract,
    depositFactory: Contract,
    axelarGatewayMock: Contract,
    axelarGasServiceMock: Contract,
    permit2Mock: Contract,
    testWallet: Contract;

  const abiCoder = new ethers.AbiCoder();

  const sourceChain = "agoric";
  const sourceAddress = "agoric1wrfh296eu2z34p6pah7q04jjuyj3mxu9v98277";

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

    axelarGasServiceMock = await GasServiceFactory.deploy(owner.address);

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

    // Deploy a mock Permit2 contract
    const MockPermit2Factory = await ethers.getContractFactory("MockPermit2");
    permit2Mock = await MockPermit2Factory.deploy();
    await permit2Mock.waitForDeployment();

    // Deploy a the Factory contract
    const FactoryContract = await ethers.getContractFactory("Factory");
    factory = await FactoryContract.deploy(
      axelarGatewayMock.target,
      axelarGasServiceMock.target,
    );
    await factory.waitForDeployment();

    const DepositFactoryContract =
      await ethers.getContractFactory("DepositFactory");
    depositFactory = await DepositFactoryContract.deploy(
      axelarGatewayMock.target,
      axelarGasServiceMock.target,
      permit2Mock.target,
      factory.target,
      sourceAddress,
    );
    await depositFactory.waitForDeployment();

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

  it("should create wallet and deposit tokens using Permit2", async () => {
    const commandId = getCommandId();

    // Deploy a test token that we control
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    const testToken = await MockERC20Factory.deploy("Test USDC", "USDC", 18);
    await testToken.waitForDeployment();

    // Mint tokens to owner and approve Permit2
    await testToken.mint(owner.address, 10000);
    await testToken.approve(permit2Mock.target, ethers.MaxUint256);

    // Compute the expected CREATE2 address
    const expectedWalletAddress = await computeCreate2Address(
      factory.target.toString(),
      axelarGatewayMock.target.toString(),
      axelarGasServiceMock.target.toString(),
      sourceAddress,
    );

    // Create a proper CreateAndDepositPayload
    const createAndDepositPayload = {
      lcaOwner: sourceAddress,
      tokenOwner: owner.address,
      permit: {
        permitted: {
          token: testToken.target,
          amount: 1000,
        },
        nonce: 0,
        deadline: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      },
      witness: ethers.ZeroHash, // dummy witness
      witnessTypeString:
        "CreateWallet(string owner,uint256 chainId,address factory)",
      signature: "0x" + "00".repeat(65), // dummy signature
      expectedWalletAddress: expectedWalletAddress,
    };

    const payload = abiCoder.encode(
      [
        "tuple(string lcaOwner, address tokenOwner, tuple(tuple(address token, uint256 amount) permitted, uint256 nonce, uint256 deadline) permit, bytes32 witness, string witnessTypeString, bytes signature, address expectedWalletAddress)",
      ],
      [createAndDepositPayload],
    );
    const payloadHash = keccak256(toBytes(payload));

    await approveMessage({
      commandId,
      from: sourceChain,
      sourceAddress,
      targetAddress: depositFactory.target,
      payload: payloadHash,
      owner,
      AxelarGateway: axelarGatewayMock,
      abiCoder,
    });

    const tx = await depositFactory.execute(
      commandId,
      sourceChain,
      sourceAddress,
      payload,
    );

    await expect(tx)
      .to.emit(factory, "SmartWalletCreated")
      .withArgs(expectedWalletAddress, sourceAddress, "agoric");
  });

  it("should use the remote wallet to call other contracts", async () => {
    // Deploy Multicall.sol
    const MulticallFactory = await ethers.getContractFactory("Multicall");
    const multicall = await MulticallFactory.deploy();
    await multicall.waitForDeployment();

    testWallet = await createRemoteEVMAccount(
      axelarGatewayMock,
      owner.address,
      sourceAddress,
    );

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

    const commandId = getCommandId();
    await approveMessage({
      commandId,
      from: sourceChain,
      sourceAddress,
      targetAddress: testWallet.target,
      payload: payloadHash,
      owner,
      AxelarGateway: axelarGatewayMock,
      abiCoder,
    });

    const execTx = await testWallet.execute(
      commandId,
      sourceChain,
      sourceAddress,
      multicallPayload,
    );

    await expect(execTx)
      .to.emit(testWallet, "MulticallStatus")
      .withArgs("tx1", true, 2);

    expect(await multicall.getValue()).to.equal(27);
  });

  it("wallet should reject invalid source chain", async () => {
    const wrongSourceChain = "ethereum";
    const multicallPayload = encodeMulticallPayload([], "tx2");
    const payloadHash = getPayloadHash(multicallPayload);

    const commandId = getCommandId();
    await approveMessage({
      commandId,
      from: wrongSourceChain,
      sourceAddress,
      targetAddress: testWallet.target,
      payload: payloadHash,
      owner,
      AxelarGateway: axelarGatewayMock,
      abiCoder,
    });

    await expect(
      testWallet.execute(
        commandId,
        wrongSourceChain,
        sourceAddress,
        multicallPayload,
      ),
    ).to.be.revertedWithCustomError(testWallet, "InvalidSourceChain");
  });

  it("DepositFactory should reject invalid source chain", async () => {
    const commandId = getCommandId();
    const wrongSourceChain = "ethereum";
    const payload = abiCoder.encode([], []);
    const payloadHash = keccak256(toBytes(payload));

    await approveMessage({
      commandId,
      from: wrongSourceChain,
      sourceAddress: sourceAddress,
      targetAddress: depositFactory.target,
      payload: payloadHash,
      owner,
      AxelarGateway: axelarGatewayMock,
      abiCoder,
    });

    await expect(
      depositFactory.execute(
        commandId,
        wrongSourceChain,
        sourceAddress,
        payload,
      ),
    ).to.be.revertedWithCustomError(depositFactory, "InvalidSourceChain");
  });

  it("DepositFactory should reject unauthorized caller", async () => {
    const commandId = getCommandId();
    const payload = abiCoder.encode([], []);
    const payloadHash = keccak256(toBytes(payload));
    const wrongSourceAddr = "agoric1ee9hr0jyrxhy999y755mp862ljgycmwyp4pl7q";

    await approveMessage({
      commandId,
      from: sourceChain,
      sourceAddress: wrongSourceAddr,
      targetAddress: depositFactory.target,
      payload: payloadHash,
      owner,
      AxelarGateway: axelarGatewayMock,
      abiCoder,
    });

    await expect(
      depositFactory.execute(commandId, sourceChain, wrongSourceAddr, payload),
    ).to.be.revertedWithCustomError(
      depositFactory,
      "OwnableUnauthorizedAccount",
    );
  });

  it("should reject permit with expired deadline", async () => {
    const commandId = getCommandId();

    // Deploy a test token
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    const testToken = await MockERC20Factory.deploy("Test USDC", "USDC", 18);
    await testToken.waitForDeployment();

    // Mint tokens to owner and approve Permit2
    await testToken.mint(owner.address, 10000);
    await testToken.approve(permit2Mock.target, ethers.MaxUint256);

    const lcaOwner = "agoric1testexpired";

    // Compute the expected CREATE2 address
    const expectedWalletAddress = await computeCreate2Address(
      factory.target.toString(),
      axelarGatewayMock.target.toString(),
      axelarGasServiceMock.target.toString(),
      lcaOwner,
    );

    // Create payload with EXPIRED deadline (in the past)
    const expiredDeadline = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
    const createAndDepositPayload = {
      lcaOwner: lcaOwner,
      tokenOwner: owner.address,
      permit: {
        permitted: {
          token: testToken.target,
          amount: 1000,
        },
        nonce: 100,
        deadline: expiredDeadline,
      },
      witness: ethers.ZeroHash,
      witnessTypeString:
        "CreateWallet(string owner,uint256 chainId,address factory)",
      signature: "0x" + "00".repeat(65),
      expectedWalletAddress: expectedWalletAddress,
    };

    const payload = abiCoder.encode(
      [
        "tuple(string lcaOwner, address tokenOwner, tuple(tuple(address token, uint256 amount) permitted, uint256 nonce, uint256 deadline) permit, bytes32 witness, string witnessTypeString, bytes signature, address expectedWalletAddress)",
      ],
      [createAndDepositPayload],
    );
    const payloadHash = keccak256(toBytes(payload));

    await approveMessage({
      commandId,
      from: sourceChain,
      sourceAddress,
      targetAddress: depositFactory.target,
      payload: payloadHash,
      owner,
      AxelarGateway: axelarGatewayMock,
      abiCoder,
    });

    // Should revert with SignatureExpired error from Permit2
    await expect(
      depositFactory.execute(commandId, sourceChain, sourceAddress, payload),
    ).to.be.revertedWithCustomError(permit2Mock, "SignatureExpired");
  });

  it("should reject permit with reused nonce", async () => {
    const commandId1 = getCommandId();
    const commandId2 = getCommandId();

    // Deploy a test token
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    const testToken = await MockERC20Factory.deploy("Test USDC", "USDC", 18);
    await testToken.waitForDeployment();

    // Mint tokens to owner and approve Permit2
    await testToken.mint(owner.address, 20000);
    await testToken.approve(permit2Mock.target, ethers.MaxUint256);

    const sharedNonce = 200;
    const validDeadline = Math.floor(Date.now() / 1000) + 3600;

    const lcaOwner1 = "agoric1testnonce1";
    const lcaOwner2 = "agoric1testnonce2";

    // Compute expected CREATE2 addresses
    const expectedWalletAddress1 = await computeCreate2Address(
      factory.target.toString(),
      axelarGatewayMock.target.toString(),
      axelarGasServiceMock.target.toString(),
      lcaOwner1,
    );

    const expectedWalletAddress2 = await computeCreate2Address(
      factory.target.toString(),
      axelarGatewayMock.target.toString(),
      axelarGasServiceMock.target.toString(),
      lcaOwner2,
    );

    // First transaction with nonce 200
    const payload1 = {
      lcaOwner: lcaOwner1,
      tokenOwner: owner.address,
      permit: {
        permitted: {
          token: testToken.target,
          amount: 1000,
        },
        nonce: sharedNonce,
        deadline: validDeadline,
      },
      witness: ethers.ZeroHash,
      witnessTypeString:
        "CreateWallet(string owner,uint256 chainId,address factory)",
      signature: "0x" + "00".repeat(65),
      expectedWalletAddress: expectedWalletAddress1,
    };

    const encodedPayload1 = abiCoder.encode(
      [
        "tuple(string lcaOwner, address tokenOwner, tuple(tuple(address token, uint256 amount) permitted, uint256 nonce, uint256 deadline) permit, bytes32 witness, string witnessTypeString, bytes signature, address expectedWalletAddress)",
      ],
      [payload1],
    );
    const payloadHash1 = keccak256(toBytes(encodedPayload1));

    await approveMessage({
      commandId: commandId1,
      from: sourceChain,
      sourceAddress,
      targetAddress: depositFactory.target,
      payload: payloadHash1,
      owner,
      AxelarGateway: axelarGatewayMock,
      abiCoder,
    });

    // First transaction should succeed
    await depositFactory.execute(
      commandId1,
      sourceChain,
      sourceAddress,
      encodedPayload1,
    );

    // Second transaction with SAME nonce 200 (should fail)
    const payload2 = {
      lcaOwner: lcaOwner2,
      tokenOwner: owner.address,
      permit: {
        permitted: {
          token: testToken.target,
          amount: 1000,
        },
        nonce: sharedNonce, // Same nonce!
        deadline: validDeadline,
      },
      witness: ethers.ZeroHash,
      witnessTypeString:
        "CreateWallet(string owner,uint256 chainId,address factory)",
      signature: "0x" + "00".repeat(65),
      expectedWalletAddress: expectedWalletAddress2,
    };

    const encodedPayload2 = abiCoder.encode(
      [
        "tuple(string lcaOwner, address tokenOwner, tuple(tuple(address token, uint256 amount) permitted, uint256 nonce, uint256 deadline) permit, bytes32 witness, string witnessTypeString, bytes signature, address expectedWalletAddress)",
      ],
      [payload2],
    );
    const payloadHash2 = keccak256(toBytes(encodedPayload2));

    await approveMessage({
      commandId: commandId2,
      from: sourceChain,
      sourceAddress,
      targetAddress: depositFactory.target,
      payload: payloadHash2,
      owner,
      AxelarGateway: axelarGatewayMock,
      abiCoder,
    });

    // Should revert with InvalidNonce error from Permit2
    await expect(
      depositFactory.execute(
        commandId2,
        sourceChain,
        sourceAddress,
        encodedPayload2,
      ),
    ).to.be.revertedWithCustomError(permit2Mock, "InvalidNonce");
  });
});
