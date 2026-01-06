import {
  SigningStargateClient,
  assertIsDeliverTxSuccess,
} from "@cosmjs/stargate";
import { getSigner, buildGMPPayload } from "./axelar-support.ts";
import { addresses, channels, tokens, urls } from "./config.ts";
import {
  AxelarChain,
  AxelarGMPMessageType,
  GmpArgsWithdrawAmount,
  type AxelarGmpOutgoingMemo,
  type BaseGmpArgs,
  type GmpArgsContractCall,
  type GmpArgsTransferAmount,
} from "./types.ts";

const AxelarIds = {
  Avalanche: "Avalanche",
  Ethereum: "ethereum-sepolia",
};

export type ContractKey = "aavePool" | "compound" | "usdc";
export type ChainConfig = {
  contractAddresses: Record<ContractKey, `0x${string}`>;
};

export const axelarChainsMap: Record<AxelarChain, ChainConfig> = {
  Avalanche: {
    contractAddresses: {
      // https://testnet.snowtrace.io/address/0x8B9b2AF4afB389b4a70A474dfD4AdCD4a302bb40
      aavePool: "0x8B9b2AF4afB389b4a70A474dfD4AdCD4a302bb40",
      // Compound is not deployed on the Avalanche testnet, so we use a placeholder address
      compound: "0x",
      // Source: // https://developers.circle.com/stablecoins/usdc-contract-addresses
      usdc: "0x5425890298aed601595a70AB815c96711a31Bc65",
    },
  },
  Ethereum: {
    contractAddresses: {
      // Source: https://aave.com/docs/resources/addresses
      aavePool: "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951",
      // Soruce: https://docs.compound.finance/#networks
      compound: "0xAec1F48e02Cfb822Be958B68C7957156EB3F0b6e",
      // Source: // https://developers.circle.com/stablecoins/usdc-contract-addresses
      usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    },
  },
};

export const createRemoteEVMAccount = async (
  gmpArgs: BaseGmpArgs & { factoryAddress: `0x${string}` },
) => {
  const { destinationEVMChain, gasAmount, factoryAddress } = gmpArgs;

  await sendGmp({
    destinationAddress: factoryAddress,
    destinationEVMChain: AxelarIds[destinationEVMChain] as AxelarChain,
    type: AxelarGMPMessageType.ContractCall,
    gasAmount,
    contractInvocationData: [],
  });
};

export const makeAxelarMemo = (gmpArgs: GmpArgsContractCall) => {
  const {
    contractInvocationData,
    destinationEVMChain,
    destinationAddress,
    gasAmount,
    type,
  } = gmpArgs;

  const payload = buildGMPPayload(contractInvocationData, "tx1");
  const memo: AxelarGmpOutgoingMemo = {
    destination_chain: destinationEVMChain,
    destination_address: destinationAddress,
    payload,
    type,
  };

  memo.fee = {
    // This amount specifies the outbound gas for sending GMP message
    amount: String(gasAmount),
    recipient: addresses.AXELAR_GAS,
  };

  return JSON.stringify(memo);
};

export const sendIbc = async ({ memo, amount }) => {
  const signer = await getSigner();

  const accounts = await signer.getAccounts();
  const senderAddress = accounts[0].address;
  console.log("Sender Address:", senderAddress);

  const ibcPayload = [
    {
      typeUrl: "/ibc.applications.transfer.v1.MsgTransfer",
      value: {
        sender: senderAddress,
        receiver: addresses.AXELAR_GMP,
        token: {
          denom: tokens.nativeTokenAgoric,
          amount,
        },
        timeoutTimestamp: (Math.floor(Date.now() / 1000) + 600) * 1e9,
        sourceChannel: channels.AGORIC_DEVNET_TO_AXELAR,
        sourcePort: "transfer",
        memo,
      },
    },
  ];

  console.log("connecting with signer");
  const signingClient = await SigningStargateClient.connectWithSigner(
    urls.RPC_AGORIC_DEVNET,
    signer,
  );

  const fee = {
    gas: "1000000",
    amount: [{ denom: tokens.nativeTokenAgoric, amount: "1000000" }],
  };

  console.log("Sign and Broadcast transaction...");
  const response = await signingClient.signAndBroadcast(
    senderAddress,
    ibcPayload,
    fee,
  );

  console.log("Asserting");
  assertIsDeliverTxSuccess(response);
};

export const sendGmp = async (gmpArgs: GmpArgsContractCall) => {
  const memo = makeAxelarMemo(gmpArgs);
  return sendIbc({ memo, amount: String(gmpArgs.gasAmount) });
};

export const supplyToAave = async (
  gmpArgs: GmpArgsTransferAmount,
  remoteEVMAddress: `0x${string}`,
) => {
  const { destinationEVMChain, transferAmount, gasAmount } = gmpArgs;
  const { contractAddresses } = axelarChainsMap[destinationEVMChain];

  await sendGmp({
    destinationAddress: remoteEVMAddress,
    destinationEVMChain,
    type: AxelarGMPMessageType.ContractCall,
    gasAmount,
    contractInvocationData: [
      {
        functionSignature: "approve(address,uint256)",
        args: [contractAddresses.aavePool, transferAmount],
        target: contractAddresses.usdc,
      },
      {
        functionSignature: "supply(address,uint256,address,uint16)",
        args: [contractAddresses.usdc, transferAmount, remoteEVMAddress, 0],
        target: contractAddresses.aavePool,
      },
    ],
  });
};

export const withdrawFromAave = async (
  gmpArgs: GmpArgsWithdrawAmount,
  remoteEVMAddress: `0x${string}`,
) => {
  const { destinationEVMChain, withdrawAmount, gasAmount } = gmpArgs;
  const { contractAddresses } = axelarChainsMap[destinationEVMChain];

  await sendGmp({
    destinationAddress: remoteEVMAddress,
    destinationEVMChain,
    type: AxelarGMPMessageType.ContractCall,
    gasAmount,
    contractInvocationData: [
      {
        functionSignature: "withdraw(address,uint256,address)",
        args: [contractAddresses.usdc, withdrawAmount, remoteEVMAddress],
        target: contractAddresses.aavePool,
      },
    ],
  });
};

export const supplyToCompound = async (
  gmpArgs: GmpArgsTransferAmount,
  remoteEVMAddress: `0x${string}`,
) => {
  const { destinationEVMChain, transferAmount, gasAmount } = gmpArgs;
  const { contractAddresses } = axelarChainsMap[destinationEVMChain];

  await sendGmp({
    destinationAddress: remoteEVMAddress,
    destinationEVMChain,
    type: AxelarGMPMessageType.ContractCall,
    gasAmount,
    contractInvocationData: [
      {
        functionSignature: "approve(address,uint256)",
        args: [contractAddresses.compound, transferAmount],
        target: contractAddresses.usdc,
      },
      {
        functionSignature: "supply(address,uint256)",
        args: [contractAddresses.usdc, transferAmount],
        target: contractAddresses.compound,
      },
    ],
  });
};

export const withdrawFromCompound = async (
  gmpArgs: GmpArgsWithdrawAmount,
  remoteEVMAddress: `0x${string}`,
) => {
  const { destinationEVMChain, withdrawAmount, gasAmount } = gmpArgs;
  const { contractAddresses } = axelarChainsMap[destinationEVMChain];

  await sendGmp({
    destinationAddress: remoteEVMAddress,
    destinationEVMChain,
    type: AxelarGMPMessageType.ContractCall,
    gasAmount,
    contractInvocationData: [
      {
        functionSignature: "withdraw(address,uint256)",
        args: [contractAddresses.usdc, withdrawAmount],
        target: contractAddresses.compound,
      },
    ],
  });
};
