import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { toBigInt } from "ethers";
import { convertCosmosAddress } from "../..";
import { CosmosChain } from "../../types";
import { CosmosClient } from "../cosmos/CosmosClient";

/**
 * RelayerAccountManager manages the relayer account on wasm and axelar.
 * - Create a relayer account from mnemonic or generate a new one if not provided
 * - Fund the relayer accounts if the balance of either wasm chain or axelar chain is below the minAmount
 * - Get the relayer address based on the prefix. Default prefix is wasm
 * - Get the relayer fund on wasm and axelar
 */
export class RelayerAccountManager {
  public static DEFAULT_FUND_AMOUNT = "10000000000";
  public static DEFAULT_MIN_FUND_AMOUNT = "100000000";
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

  /**
   * Create a relayer account from mnemonic or generate a new one if not provided
   * @param prefix chain prefix. Available options: wasm, axelar
   * @param mnemonic mnemonic of the relayer account
   * @returns an instance of DirectSecp256k1HdWallet
   */
  static async createRelayerAccount(
    prefix: CosmosChain,
    mnemonic?: string
  ): Promise<DirectSecp256k1HdWallet> {
    if (mnemonic) {
      return DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix });
    }
    return DirectSecp256k1HdWallet.generate(12, { prefix });
  }

  /**
   * Get the relayer address based on the prefix. Default prefix is wasm
   * @param prefix chain prefix. Available options: wasm, axelar
   * @returns relayer address
   */
  async getRelayerAddress(prefix: CosmosChain = "agoric"): Promise<string> {
    const accounts = await this.relayerAccount.getAccounts();
    const relayerAddress = accounts[0].address;

    if (prefix === "agoric") {
      return relayerAddress;
    }
    return convertCosmosAddress(relayerAddress, prefix);
  }

  /**
   * Fund the relayer accounts if the balance of either wasm chain or axelar chain is below the minAmount
   * @param minAmount minimum amount to fund the relayer accounts. Default is 10,000,000
   */
  async fundRelayerAccountsIfNeeded(
    minAmount = RelayerAccountManager.DEFAULT_MIN_FUND_AMOUNT
  ): Promise<void> {
    const fund = await this.getRelayerFund();

    if (
      toBigInt(fund.wasm.balance) < toBigInt(minAmount) ||
      toBigInt(fund.axelar.balance) < toBigInt(minAmount)
    ) {
      await this.fundRelayer(minAmount);
    }
  }

  /**
   * Fund the relayer account on wasm and axelar. Default amount is 1,000,000,000
   * @param amount amount to fund the relayer accounts. Default is 1,000,000,000
   */
  async fundRelayer(
    amount = RelayerAccountManager.DEFAULT_FUND_AMOUNT
  ): Promise<void> {
    const relayerAddress = await this.getRelayerAddress("agoric");
    const relayerAxelarAddress = await this.getRelayerAddress("axelar");

    // Fund the relayer address on wasm
    await this.wasmClient.fundWallet(relayerAddress, amount);
    // Fund the relayer address on axelar
    await this.axelarClient.fundWallet(relayerAxelarAddress, amount);
  }

  /**
   * Get the relayer fund on wasm and axelar
   * @returns relayer fund on wasm and axelar
   */
  async getRelayerFund() {
    const relayerAddress = await this.getRelayerAddress("agoric");
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
