import AxelarGasService from "@axelar-network/axelar-cgp-solidity/artifacts/contracts/gas-service/AxelarGasService.sol/AxelarGasService.json";
import { expect } from "chai";
import { ethers } from "hardhat";
import { keccak256, stringToHex, toBytes } from "viem";
import "@nomicfoundation/hardhat-chai-matchers";
import { approveMessage, deployToken } from "./lib/utils";
import { signPermit2BatchWitness } from "./lib/permit2Utils";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract } from "ethers";

const computeFactoryCreate2Address = async (
  factoryFactoryAddress: string,
  gatewayAddress: string,
  gasServiceAddress: string,
  permit2Address: string,
  owner: string,
) => {
  const salt = ethers.solidityPackedKeccak256(["string"], [owner]);

  // Get the Factory contract bytecode and constructor args
  const FactoryFactory = await ethers.getContractFactory("DepositFactory");
  const constructorArgs = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "address", "address", "string"],
    [gatewayAddress, gasServiceAddress, permit2Address, owner],
  );
  const initCode = ethers.solidityPacked(
    ["bytes", "bytes"],
    [FactoryFactory.bytecode, constructorArgs],
  );
  const initCodeHash = ethers.keccak256(initCode);

  return ethers.getCreate2Address(factoryFactoryAddress, salt, initCodeHash);
};

const computeWalletCreate2Address = async (
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

describe("FactoryFactory", () => {
  let owner: HardhatEthersSigner,
    addr1: HardhatEthersSigner,
    factoryFactory: Contract,
    axelarGatewayMock: Contract,
    axelarGasServiceMock: Contract,
    permit2Mock: Contract;

  const abiCoder = new ethers.AbiCoder();

  const sourceChain = "agoric";
  const factoryOwner = "agoric1wrfh296eu2z34p6pah7q04jjuyj3mxu9v98277";

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

    const Contract = await ethers.getContractFactory("FactoryFactory");
    factoryFactory = await Contract.deploy(
      axelarGatewayMock.target,
      axelarGasServiceMock.target,
      permit2Mock.target,
    );
    await factoryFactory.waitForDeployment();

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

  it("should create Factory with correct owner", async () => {
    const commandId = getCommandId();
    const payload = abiCoder.encode([], []);
    const payloadHash = keccak256(toBytes(payload));

    await approveMessage({
      commandId,
      from: sourceChain,
      sourceAddress: factoryOwner,
      targetAddress: factoryFactory.target,
      payload: payloadHash,
      owner,
      AxelarGateway: axelarGatewayMock,
      abiCoder,
    });

    const expectedFactoryAddress = await computeFactoryCreate2Address(
      factoryFactory.target.toString(),
      axelarGatewayMock.target.toString(),
      axelarGasServiceMock.target.toString(),
      permit2Mock.target.toString(),
      factoryOwner,
    );

    await expect(
      factoryFactory.execute(commandId, sourceChain, factoryOwner, payload),
    )
      .to.emit(factoryFactory, "FactoryCreated")
      .withArgs(expectedFactoryAddress, factoryOwner, "agoric", factoryOwner);

    const FactoryContract = await ethers.getContractFactory("DepositFactory");
    const factory = FactoryContract.attach(expectedFactoryAddress);
    expect(await factory.owner()).to.equal(factoryOwner);
  });

  it("should create Wallet via Factory hierarchy", async () => {
    const expectedFactoryAddress = await computeFactoryCreate2Address(
      factoryFactory.target.toString(),
      axelarGatewayMock.target.toString(),
      axelarGasServiceMock.target.toString(),
      permit2Mock.target.toString(),
      factoryOwner,
    );

    const FactoryContract = await ethers.getContractFactory("DepositFactory");
    const factory = FactoryContract.attach(expectedFactoryAddress);

    const commandId = getCommandId();

    // Deploy a test token that we control
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    const testToken = await MockERC20Factory.deploy("Test USDC", "USDC", 18);
    await testToken.waitForDeployment();

    // Mint tokens to owner and approve Permit2
    await testToken.mint(owner.address, 10000);
    await testToken.approve(permit2Mock.target, ethers.MaxUint256);

    // Prepare permit data
    const permitData = {
      permitted: [
        {
          token: await testToken.getAddress(),
          amount: 1000n,
        },
      ],
      nonce: 0,
      deadline: Math.floor(Date.now() / 1000) + 3600,
    };

    const witness = ethers.ZeroHash;
    const witnessTypeString =
      "CreateWallet(string owner,uint256 chainId,address factory)";

    // Sign the permit
    const signature = await signPermit2BatchWitness(
      permit2Mock,
      permitData,
      witness,
      witnessTypeString,
      await factory.getAddress(),
      owner,
    );

    const createAndDepositPayload = {
      lcaOwner: factoryOwner,
      tokenOwner: owner.address,
      permit: permitData,
      witness,
      witnessTypeString,
      signature,
    };

    const payload = abiCoder.encode(
      [
        "tuple(string lcaOwner, address tokenOwner, tuple(tuple(address token, uint256 amount)[] permitted, uint256 nonce, uint256 deadline) permit, bytes32 witness, string witnessTypeString, bytes signature)",
      ],
      [createAndDepositPayload],
    );
    const payloadHash = keccak256(toBytes(payload));

    await approveMessage({
      commandId,
      from: sourceChain,
      sourceAddress: factoryOwner,
      targetAddress: factory.target,
      payload: payloadHash,
      owner,
      AxelarGateway: axelarGatewayMock,
      abiCoder,
    });

    const expectedWalletAddress = await computeWalletCreate2Address(
      factory.target.toString(),
      axelarGatewayMock.target.toString(),
      axelarGasServiceMock.target.toString(),
      factoryOwner,
    );

    await expect(factory.execute(commandId, sourceChain, factoryOwner, payload))
      .to.emit(factory, "SmartWalletCreated")
      .withArgs(expectedWalletAddress, factoryOwner, "agoric", factoryOwner);
  });

  it("should reject invalid source chain", async () => {
    const commandId = getCommandId();
    const payload = abiCoder.encode([], []);
    const payloadHash = keccak256(toBytes(payload));
    const wrongSourceChain = "ethereum";

    await approveMessage({
      commandId,
      from: wrongSourceChain,
      sourceAddress: factoryOwner,
      targetAddress: factoryFactory.target,
      payload: payloadHash,
      owner,
      AxelarGateway: axelarGatewayMock,
      abiCoder,
    });

    await expect(
      factoryFactory.execute(
        commandId,
        wrongSourceChain,
        factoryOwner,
        payload,
      ),
    ).to.be.revertedWithCustomError(factoryFactory, "InvalidSourceChain");
  });
});
