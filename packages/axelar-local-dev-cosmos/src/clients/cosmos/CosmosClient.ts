import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { GasPrice } from '@cosmjs/stargate';
import { SigningStargateClient } from '@cosmjs/stargate';
import { CosmosChain, CosmosChainInfo } from '../../types';
import { exportOwnerAccountFromContainer, readFileSync } from '../../utils';
import { stringToPath } from '@cosmjs/crypto';
import { Registry } from "@cosmjs/proto-signing";
import { defaultRegistryTypes } from "@cosmjs/stargate";
import {
  ConfirmGatewayTxRequest as EvmConfirmGatewayTxRequest,
} from '@axelar-network/axelarjs-types/axelar/evm/v1beta1/tx';
import {
  VoteRequest,
} from '@axelar-network/axelarjs-types/axelar/vote/v1beta1/tx';
import {
  RouteMessageRequest,
} from '@axelar-network/axelarjs-types/axelar/axelarnet/v1beta1/tx';

export class CosmosClient {
  public chainInfo: Required<CosmosChainInfo>;
  public owner: DirectSecp256k1HdWallet;
  public client: SigningStargateClient;
  public gasPrice: GasPrice;

  /**
   * Constructs a new instance of the CosmosClient.
   * @param chainInfo The required information about the Cosmos chain.
   * @param owner The DirectSecp256k1HdWallet instance representing the owner's account.
   * @param client The SigningCosmWasmClient instance for interacting with the blockchain.
   * @param gasPrice The gas price to be used for transactions. Defaults to `1denom`.
   */
  private constructor(
    chainInfo: Required<CosmosChainInfo>,
    owner: DirectSecp256k1HdWallet,
    client: SigningStargateClient,
    gasPrice: GasPrice = GasPrice.fromString(`1${chainInfo.denom}`)
  ) {
    this.chainInfo = chainInfo;
    this.owner = owner;
    this.client = client;
    this.gasPrice = gasPrice;
  }

  /**
   * Asynchronously creates a new instance of the CosmosClient.
   * @param chain The Cosmos chain to interact with. Defaults to 'wasm'.
   * @param mnemonic The mnemonic for generating the wallet. If not provided, one is generated.
   * @param config Additional configuration for the chain, excluding the owner's info.
   * @param gasPrice The gas price to be used for transactions. Defaults to `1denom`.
   * @returns A promise that resolves to an instance of CosmosClient.
   */
  static async create(
    chain: CosmosChain = 'agoric',
    mnemonic?: string,
    config: Omit<CosmosChainInfo, 'owner'> = { prefix: chain },
    gasPrice?: GasPrice
  ) {
    const defaultDenom = chain === 'agoric' ? 'ubld' : 'uaxl';
    const chainInfo = {
      denom: config.denom || defaultDenom,
      lcdUrl: config.lcdUrl || `http://localhost/${chain}-lcd`,
      rpcUrl: config.rpcUrl || `http://localhost/${chain}-rpc`,
      wsUrl: config.wsUrl || `ws://localhost/${chain}-rpc/websocket`,
    };
    gasPrice = gasPrice || GasPrice.fromString(`1${chainInfo.denom}`);

    let _mnemonic = mnemonic;
    if (!_mnemonic) {
      const response = await exportOwnerAccountFromContainer(chain);
      _mnemonic = response.mnemonic;
    }

    const getAgoricSigner = async () => {
      const Agoric = {
        Bech32MainPrefix: 'agoric',
        CoinType: 564,
      };
      const hdPath = (coinType = 118, account = 0) =>
        stringToPath(`m/44'/${coinType}'/${account}'/0/0`);

      return DirectSecp256k1HdWallet.fromMnemonic(_mnemonic || '', {
        prefix: Agoric.Bech32MainPrefix,
        hdPaths: [hdPath(Agoric.CoinType, 0), hdPath(Agoric.CoinType, 1)],
      });
    };

    let owner;
    if (chain === 'agoric') {
      owner = await getAgoricSigner();
    } else {
      owner = await CosmosClient.createOrImportAccount(chain, _mnemonic);
    }
    const address = await owner
      .getAccounts()
      .then((accounts) => accounts[0].address);
    const registry = new Registry([
      ...defaultRegistryTypes,
      ["/axelar.evm.v1beta1.ConfirmGatewayTxRequest", EvmConfirmGatewayTxRequest],
      ["/axelar.vote.v1beta1.VoteRequest", VoteRequest],
      ["/axelar.axelarnet.v1beta1.RouteMessageRequest", RouteMessageRequest],
    ]);
    const client = await SigningStargateClient.connectWithSigner(
      chainInfo.rpcUrl,
      owner,
      { gasPrice: gasPrice, registry }
    );

    return new CosmosClient(
      {
        ...chainInfo,
        owner: {
          mnemonic: _mnemonic,
          address,
        },
        prefix: chain,
      },
      owner,
      client,
      gasPrice
    );
  }

  /**
   * Create a relayer account from mnemonic or generate a new one if not provided
   * @param prefix chain prefix. Available options: wasm, axelar
   * @param mnemonic mnemonic of the relayer account
   * @returns an instance of DirectSecp256k1HdWallet
   */
  static async createOrImportAccount(
    prefix: CosmosChain,
    mnemonic?: string
  ): Promise<DirectSecp256k1HdWallet> {
    if (mnemonic) {
      return DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix });
    }
    return DirectSecp256k1HdWallet.generate(12, { prefix });
  }

  /**
   * Retrieves the balance of a given address. Defaults to the chain's denom.
   * @param address The address to query the balance for.
   * @param denom The denomination of the tokens.
   * @returns Promise<string> The balance of the account.
   *
   * @example
   * const balance = await cosmosClient.getBalance("cosmos1...", "uatom");
   * console.log(balance); // Outputs the balance, e.g., "1000"
   *
   * @throws {Error} Throws an error if the network request fails.
   */
  getBalance(address: string, denom?: string) {
    return this.client
      .getBalance(address, denom || this.chainInfo.denom)
      .then((res) => res.amount);
  }

  /**
   * Retrieves the chain information of the CosmosClient instance.
   * @returns An object containing the chain's information, excluding the owner's details.
   */
  getChainInfo(): Omit<CosmosChainInfo, 'owner'> {
    return {
      prefix: this.chainInfo.prefix,
      denom: this.chainInfo.denom,
      lcdUrl: this.chainInfo.lcdUrl,
      rpcUrl: this.chainInfo.rpcUrl,
      wsUrl: this.chainInfo.wsUrl,
    };
  }

  /**
   * Sends tokens from the owner's account to another address.
   * @param address The address to send tokens to.
   * @param amount The amount of tokens to send.
   * @returns A promise that resolves to the transaction result.
   * @throws An error if the transaction fails.
   */
  async fundWallet(address: string, amount: string) {
    const ownerAddress = await this.getOwnerAccount();

    // TODO: Handle when owner account doesn't have enough balance
    return this.client
      .sendTokens(
        ownerAddress,
        address,
        [
          {
            amount,
            denom: this.chainInfo.denom,
          },
        ],
        1.8
      )
      .then((res) => {
        if (res.code !== 0) {
          throw new Error(res.rawLog || 'Failed to fund wallet');
        }
        return res;
      });
  }

  /**
   * Uploads a WebAssembly module to the blockchain.
   * @param path The file path of the WebAssembly module.
   * @returns A promise that resolves to the upload transaction result.
   * @throws An error if the upload fails.
   */
  // async uploadWasm(path: string) {
  //   const wasm = readFileSync(path);

  //   return this.client.upload(
  //     this.getOwnerAccount(),
  //     new Uint8Array(wasm),
  //     1.8
  //   );
  // }

  getOwnerAccount() {
    return this.chainInfo.owner.address;
  }

  /**
   * Creates a random signing client with a new account and funds it.
   * @param chain The chain for which to generate the client. Defaults to 'wasm'.
   * @param amount The amount of tokens to fund the new account. Defaults to '10000000'.
   * @returns A promise that resolves to an object containing the new client and its address.
   */
  async createFundedSigningClient(
    chain: CosmosChain = 'wasm',
    amount: string = '10000000'
  ) {
    const wallet = await DirectSecp256k1HdWallet.generate(12, {
      prefix: chain,
    });
    const account = await wallet.getAccounts().then((accounts) => accounts[0]);

    await this.fundWallet(account.address, amount);

    const client = await SigningStargateClient.connectWithSigner(
      this.chainInfo.rpcUrl,
      wallet,
      {
        gasPrice: this.gasPrice,
      }
    );

    return {
      client,
      address: account.address,
    };
  }
}
