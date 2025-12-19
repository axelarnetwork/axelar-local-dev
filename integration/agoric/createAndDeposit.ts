/**
 * Create a Permit2 SignatureTransfer permit,
 * sign it with EIP-712, then encode the signature as EIP-2098 (64-byte compact),
 * then invoke Factory.testExecute(bytes payload).
 */

import { ethers, Wallet } from "ethers";
import {
  SignatureTransfer,
  PermitBatchTransferFrom,
} from "@uniswap/permit2-sdk";
import { encodeAbiParameters, hexToBytes } from "viem";
import { getSigner } from "./axelar-support";
import { AxelarGmpOutgoingMemo } from "./types";
import { SigningStargateClient } from "@cosmjs/stargate";
import { addresses, channels, urls } from "./config";

const SMART_WALLET_OWNER = "agoric1y3e3mlnrkuh6j2qcnlrtap42j8mzw240vwr74j";

const config = {
  ethereum: {
    testnet: {
      rpc: "https://ethereum-sepolia-rpc.publicnode.com",
      contracts: {
        /** source: https://docs.uniswap.org/contracts/v4/deployments#sepolia-11155111 */
        permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
        // Factory address (spender must be Factory) => https://sepolia.etherscan.io/address/0x3534aC7177F6D3e5A647551d736B21eB443b3097
        factory: "0x7bCB9A7Fcf5c18f617f6200915cB0269c032e30C",
        // source: https://developers.circle.com/stablecoins/usdc-contract-addresses#testnet
        USDC: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
      },
    },
  },
  // axelar testnet
  axelar: {
    contracts: {
      gasReceiver: "axelar1zl3rxpp70lmte2xr6c4lgske2fyuj3hupcsvcd", // for testnets
    },
    chainIds: {
      ethereum: "ethereum-sepolia",
    },
    gasEstimate: "20000000", // 20 BLD
  },
} as const;

const { freeze } = Object;

/**
 * Builds an Axelar GMP payload by ABI-encoding contract calls.
 *
 * In Permit2 flows, the encoded call data includes a CreateAndDepositPayload(search in Factory.sol)
 * containing a Permit2 SignatureTransfer permit and signature, which the
 * Factory contract consumes to create and fund a smart wallet.
 */

export const buildCreateAndDepositPayload = ({
  lcaOwner,
  tokenOwner,
  permit,
  witness,
  witnessTypeString,
  signature,
}: {
  lcaOwner: string;
  tokenOwner: `0x${string}`;
  permit: {
    permitted: Array<{ token: `0x${string}`; amount: bigint }>;
    nonce: bigint;
    deadline: bigint;
  };
  witness: `0x${string}`;
  witnessTypeString: string;
  signature: `0x${string}`;
}) => {
  const abiEncodedData = encodeAbiParameters(
    [
      {
        type: "tuple",
        name: "p",
        components: [
          { name: "lcaOwner", type: "string" },
          { name: "tokenOwner", type: "address" },
          {
            name: "permit",
            type: "tuple",
            components: [
              {
                name: "permitted",
                type: "tuple[]",
                components: [
                  { name: "token", type: "address" },
                  { name: "amount", type: "uint256" },
                ],
              },
              { name: "nonce", type: "uint256" },
              { name: "deadline", type: "uint256" },
            ],
          },
          { name: "witness", type: "bytes32" },
          { name: "witnessTypeString", type: "string" },
          { name: "signature", type: "bytes" },
        ],
      },
    ],
    [
      {
        lcaOwner,
        tokenOwner,
        permit: {
          permitted: permit.permitted,
          nonce: permit.nonce,
          deadline: permit.deadline,
        },
        witness,
        witnessTypeString,
        signature,
      },
    ],
  );

  return abiEncodedData;
};

/**
 * Convert a normal 65-byte ECDSA signature (r,s,v) into EIP-2098 64-byte (r,vs).
 * vs = s with the highest bit set if v == 28 (or == 1 in 0/1 form)
 */
const toEip2098 = (signature65: string): string => {
  const sig = ethers.Signature.from(signature65);

  const sBig = BigInt(sig.s);
  const HIGH_BIT = 1n << 255n;
  const vsBig = sig.v === 28 ? sBig | HIGH_BIT : sBig & ~HIGH_BIT;

  return ethers.concat([sig.r, ethers.toBeHex(vsBig, 32)]);
};

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const FACTORY_ABI = ["function testExecute(bytes payload) external"];

const makeEVMOrchestrator = (signer: ethers.Wallet) => {
  return {
    getAddress: async () => (await signer.getAddress()) as `0x${string}`,

    withContract: async <T>(
      addr: `0x${string}`,
      abi: string[],
      callback: (it: ethers.Contract) => T,
    ) => {
      const contract = new ethers.Contract(addr, abi, signer);
      const result = await callback(contract);
      return result;
    },
  };
};
type EVMOrchestrator = ReturnType<typeof makeEVMOrchestrator>;

type FlowContext = {
  contracts: typeof config.ethereum.testnet.contracts;
  permit: PermitBatchTransferFrom;
  sig65: `0x${string}`;
  tokenOwner: `0x${string}`;
  lcaOwner: string;
  witness: `0x${string}`;
  witnessTypeString: string;
};

/**
 * Directly invokes the Factory contract using encoded Permit2 payload.
 *
 * This helper bypasses Axelar GMP and calls `Factory.testExecute(bytes)` directly
 * for testnet debugging. It simulates the post-verification execution
 * path that would normally be triggered by the Axelar Gateway.
 *
 * The function:
 * - ABI-encodes a CreateAndFundPayload containing a Permit2 SignatureTransfer permit
 *   and signature
 * - Calls the Factory contract to create a new smart wallet
 * - Funds the wallet by consuming the Permit2 permit
 *
 * WARNING:
 * - This should only be used for testing.
 * - In production, the Factory is invoked via Axelar GMP, not directly.
 * - The signer must be the token owner and must have approved Permit2 beforehand.
 */

const invokeFactoryContractDirectly = async (
  orch: EVMOrchestrator,
  {
    contracts = config.ethereum.testnet.contracts,
    permit,
    sig65,
    tokenOwner,
    lcaOwner,
    witness,
    witnessTypeString,
  }: FlowContext,
) => {
  console.log("invoking Factory.testExecute directly");

  await orch.withContract(contracts.factory, FACTORY_ABI, async (factory) => {
    // --- invoke Factory.testExecute(bytes) ---

    const encodedPayload = buildCreateAndDepositPayload({
      lcaOwner,
      tokenOwner,
      permit: {
        permitted: permit.permitted as Array<{
          token: `0x${string}`;
          amount: bigint;
        }>,
        nonce: permit.nonce as bigint,
        deadline: permit.deadline as bigint,
      },
      witness,
      witnessTypeString,
      signature: sig65,
    });

    const tx = await factory.testExecute(encodedPayload);
    console.log("testExecute tx:", tx.hash);
    await tx.wait();
    console.log("✅ testExecute confirmed");
  });
};

/**
 * Sends a Permit2-based create-and-deposit request to the Factory contract
 * via Axelar GMP from the Agoric chain.
 */
const createAndDepositViaAxelar = async (
  orch: EVMOrchestrator,
  {
    permit,
    sig65,
    tokenOwner,
    contracts,
    witness,
    witnessTypeString,
  }: FlowContext,
) => {
  const agoricSigner = await getSigner();
  const accounts = await agoricSigner.getAccounts();
  const agoricOwner = accounts[0].address;
  console.log("Agoric Address:", agoricOwner);

  const lcaOwner = SMART_WALLET_OWNER;

  const abiEncodedData = buildCreateAndDepositPayload({
    lcaOwner,
    tokenOwner,
    permit: {
      permitted: permit.permitted as Array<{
        token: `0x${string}`;
        amount: bigint;
      }>,
      nonce: permit.nonce as bigint,
      deadline: permit.deadline as bigint,
    },
    witness,
    witnessTypeString,
    signature: sig65,
  });
  const encodedPayload = Array.from(hexToBytes(abiEncodedData));

  const axelarMemo: AxelarGmpOutgoingMemo = {
    destination_chain: config.axelar.chainIds.ethereum,
    destination_address: contracts.factory,
    payload: encodedPayload,
    type: 1,
    fee: {
      amount: config.axelar.gasEstimate,
      recipient: config.axelar.contracts.gasReceiver,
    },
  };

  const ibcPayload = [
    {
      typeUrl: "/ibc.applications.transfer.v1.MsgTransfer",
      value: {
        sender: agoricOwner,
        receiver: addresses.AXELAR_GMP,
        token: {
          denom: "ubld",
          amount: config.axelar.gasEstimate,
        },
        timeoutTimestamp: (Math.floor(Date.now() / 1000) + 600) * 1e9,
        sourceChannel: channels.AGORIC_DEVNET_TO_AXELAR,
        sourcePort: "transfer",
        memo: JSON.stringify(axelarMemo),
      },
    },
  ];

  console.log("connecting with signer");
  const signingClient = await SigningStargateClient.connectWithSigner(
    urls.RPC_AGORIC_DEVNET,
    agoricSigner,
  );

  const fee = {
    gas: "1000000",
    amount: [{ denom: "ubld", amount: "1000000" }],
  };

  console.log("Sign and Broadcast transaction...");
  const response = await signingClient.signAndBroadcast(
    agoricOwner,
    ibcPayload,
    fee,
  );
  console.log("RESPONSE:", response);
};

const makeWalletSigner = (provider: ethers.Provider, signer: ethers.Wallet) => {
  return {
    getChainId: async () => Number((await provider.getNetwork()).chainId),
    getAddress: async () => (await signer.getAddress()) as `0x${string}`,
    /** Sign EIP-712 (returns normal 65-byte signature) */
    signTypedData: (...params: Parameters<typeof signer.signTypedData>) =>
      signer.signTypedData(...params),
    withContract: async <T>(
      addr: `0x${string}`,
      abi: string[],
      callback: (it: ethers.Contract) => T,
    ) => {
      const contract = new ethers.Contract(addr, abi, signer);
      const result = await callback(contract);
      return result;
    },
  };
};
type Signer = ReturnType<typeof makeWalletSigner>;

const addMinutes = (t: number, n: number) => Math.floor(t / 1000) + 60 * n;

const makeUI = (
  chain: typeof config.ethereum.testnet,
  { signer, ems }: { signer: Signer; ems: EVMMessageService },
) => {
  const { contracts } = chain;
  const self = freeze({
    async openPortfolio(amount: bigint) {
      const permit: PermitBatchTransferFrom = {
        permitted: [{ token: contracts.USDC, amount }],
        nonce: Date.now(),
        deadline: BigInt(addMinutes(Date.now(), 7)),
        spender: contracts.factory,
      };

      const chainId = await signer.getChainId();

      // Define witness type structure for EIP-712 signing
      const witnessType = {
        CreateWallet: [
          { name: "owner", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "factory", type: "address" },
        ],
      };

      // Witness type string must follow Permit2's EIP-712 format:
      // "[WitnessType] witness)[WitnessTypeDefinition]TokenPermissions(address token,uint256 amount)"
      const witnessTypeString =
        "CreateWallet witness)CreateWallet(string owner,uint256 chainId,address factory)TokenPermissions(address token,uint256 amount)";

      // Create witness data object for signing
      const witnessData = {
        owner: SMART_WALLET_OWNER,
        chainId: BigInt(chainId),
        factory: contracts.factory,
      };

      // Use permitWitnessTransferFrom
      const { domain, types, values } = SignatureTransfer.getPermitData(
        permit,
        contracts.permit2,
        chainId,
        {
          witness: witnessData,
          witnessTypeName: "CreateWallet",
          witnessType,
        },
      );

      // Generate witness hash for the contract payload using EIP-712 struct hash
      // Use TypedDataEncoder to ensure consistency with SDK
      const witness = ethers.TypedDataEncoder.hashStruct(
        "CreateWallet",
        witnessType,
        witnessData,
      ) as `0x${string}`;

      // Sign EIP-712 (returns normal 65-byte signature)
      const signature65 = await signer.signTypedData(
        domain as any,
        types,
        values,
      );

      await ems.handleIntent("OpenPortfolio", {
        signature65,
        permit,
        amount,
        witness,
        witnessTypeString,
      });
    },

    /**
     * Extend USDC ERC20 API by approving withdraw by Permit2,
     * unless already done.
     *
     * cf. https://medium.com/@rcontreraspimentel/a-comprehensive-guide-to-uniswaps-permit2-d945c7291d88
     * Jan 16, 2023
     */
    async ensurePermit2Allowance(amount: bigint) {
      await signer.withContract(contracts.USDC, ERC20_ABI, async (usdc) => {
        const addr = await signer.getAddress();
        const allowance = await usdc.allowance(addr, contracts.permit2);
        const sufficient = allowance >= amount;
        console.log(
          "USDC allowance to Permit2",
          allowance,
          sufficient ? "sufficient" : "insuffient",
        );
        if (sufficient) return;

        // XXX should use max amount?
        await (await usdc.approve(contracts.permit2, amount)).wait();

        const allowancePost = await usdc.allowance(addr, contracts.permit2);
        console.log("USDC allowance to Permit2 (after):", allowancePost);
      });
    },
  });
  return self;
};

const makeEVMHandler = (
  orch: EVMOrchestrator,
  {
    contracts,

    invokeFactory,
    waitBeforeCall,
  }: {
    contracts: typeof config.ethereum.testnet.contracts;
    invokeFactory: any;
    waitBeforeCall?: () => Promise<void>;
  },
) => {
  return {
    async handleIntent(
      _intent: "OpenPortfolio",
      {
        signature65,
        permit,
        amount,
        witness,
        witnessTypeString,
      }: {
        signature65: string;
        permit: PermitBatchTransferFrom;
        amount: bigint;
        witness: `0x${string}`;
        witnessTypeString: string;
      },
    ) {
      // Convert to EIP-2098 compact signature (64 bytes)
      const signature2098 = toEip2098(signature65);

      console.log({ permit });
      console.log("sig65 bytes:", (signature65.length - 2) / 2);
      console.log("sig2098 bytes:", (signature2098.length - 2) / 2);

      console.log("real EVM Handler would check sig, hand off to exo/flow");

      await waitBeforeCall?.();

      const tokenOwner = await orch.getAddress();
      const lcaOwner = SMART_WALLET_OWNER;

      await invokeFactory(orch, {
        contracts,
        tokenOwner,
        permit,
        sig65: signature65 as `0x${string}`,
        lcaOwner,
        witness,
        witnessTypeString,
      });
    },
  };
};
type EVMHandler = ReturnType<typeof makeEVMHandler>;
type EVMMessageService = EVMHandler; // transparent, for now

const requiredEnv = (env: Record<string, string | undefined>, name: string) => {
  const value = env[name];
  if (!value) throw Error(`${name} is required`);
  return value;
};

const main = async ({
  argv = process.argv,
  env = process.env,
  chain = config.ethereum.testnet,
  makeProvider = (rpc: string) => new ethers.JsonRpcProvider(rpc),
  now = Date.now,
} = {}) => {
  // PRIVATE KEY of EOA
  const PK = requiredEnv(env, "PRIVATE_KEY");
  const hasFlag = (name: string) => argv.includes(`--${name}`);
  const [waitFlag, viaAxelar] = ["wait", "viaAxelar"].map(hasFlag);

  const provider = makeProvider(chain.rpc);
  const signer = new ethers.Wallet(PK, provider);

  const walletSigner = makeWalletSigner(provider, signer);

  const orch = makeEVMOrchestrator(signer);

  const waitBeforeCall = waitFlag // yarn permit --wait
    ? async () => {
        console.log("waiting 2min");
        await sleep(2 * 60 * 1000);
      }
    : async () => {};

  const invokeFactory = viaAxelar
    ? createAndDepositViaAxelar
    : invokeFactoryContractDirectly;

  // treat EVM Handler as EVM Message Service
  // in prod, the former is off-chain while the latter is on chain
  const ems = makeEVMHandler(orch, {
    contracts: chain.contracts,
    waitBeforeCall,
    invokeFactory,
  });
  const ui = makeUI(chain, { signer: walletSigner, ems });
  await ui.openPortfolio(1n * 1_00_000n);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
