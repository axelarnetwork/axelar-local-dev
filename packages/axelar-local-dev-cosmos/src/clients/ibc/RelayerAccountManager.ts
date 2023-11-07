import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { ethers } from "ethers";
import { CosmosChain } from "../../types";
import { CosmosClient } from "../cosmos/CosmosClient";
import { convertCosmosAddress } from "../../docker";

export class RelayerAccountManager {
  public static DEFAULT_FUND_AMOUNT = "1000000000";
  public static DEFAULT_MIN_FUND_AMOUNT = "10000000";
  private axelarClient: CosmosClient;
  private wasmClient: CosmosClient;
  public relayerAccount: DirectSecp256k1HdWallet;

  constructor(
    axelarClient: CosmosClient,
    wasmClient: CosmosClient,
    relayerAccount: DirectSecp256k1HdWallet
  ) {
    this.axelarClient = axelarClient;
    this.wasmClient = wasmClient;
    this.relayerAccount = relayerAccount;
  }

  static async createRelayerAccount(
    prefix: CosmosChain,
    mnemonic?: string
  ): Promise<DirectSecp256k1HdWallet> {
    if (mnemonic) {
      return DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix });
    }
    return DirectSecp256k1HdWallet.generate(12, { prefix });
  }

  async getRelayerAddress(prefix: CosmosChain = "wasm"): Promise<string> {
    const accounts = await this.relayerAccount.getAccounts();
    const relayerAddress = accounts[0].address;

    if (prefix === "wasm") {
      return relayerAddress;
    }
    return convertCosmosAddress(relayerAddress, prefix);
  }

  async fundRelayerAccountsIfNeeded(
    minAmount = RelayerAccountManager.DEFAULT_MIN_FUND_AMOUNT
  ): Promise<void> {
    const fund = await this.getRelayerFund();

    if (
      ethers.BigNumber.from(fund.wasm.balance).lt(minAmount) ||
      ethers.BigNumber.from(fund.axelar.balance).lt(minAmount)
    ) {
      await this.fundRelayer(minAmount);
    }
  }

  async fundRelayer(
    amount = RelayerAccountManager.DEFAULT_FUND_AMOUNT
  ): Promise<void> {
    const relayerAddress = await this.getRelayerAddress("wasm");
    const relayerAxelarAddress = await this.getRelayerAddress("axelar");

    // Fund the relayer address on wasm
    await this.wasmClient.fundWallet(relayerAddress, amount);
    // console.log(
    //   `Funded ${amount}${this.wasmClient.getChainInfo().denom} to relayer address on wasm:`,
    //   relayerAddress
    // );

    // Fund the relayer address on axelar
    await this.axelarClient.fundWallet(relayerAxelarAddress, amount);
    // console.log(
    //   `Funded ${amount}${this.axelarClient.getChainInfo().denom} to relayer address on axelar:`,
    //   relayerAxelarAddress
    // );
  }

  async getRelayerFund() {
    const relayerAddress = await this.getRelayerAddress("wasm");
    const relayerAxelarAddress = await this.getRelayerAddress("axelar");

    const balance = await this.wasmClient.getBalance(relayerAddress);
    // console.log("Relayer wasm balance", balance);

    const axelarBalance = await this.axelarClient.getBalance(
      relayerAxelarAddress
    );
    // console.log("Relayer axelar balance", axelarBalance);

    return {
      wasm: { address: relayerAddress, balance },
      axelar: { address: relayerAxelarAddress, balance: axelarBalance },
    };
  }
}
