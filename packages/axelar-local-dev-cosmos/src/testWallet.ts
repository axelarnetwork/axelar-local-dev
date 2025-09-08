import { SigningStargateClient } from "@cosmjs/stargate";
import { encode } from "@metamask/abi-utils";
import createKeccakHash from "keccak";
import {
  AxelarRelayerService,
  defaultAxelarChainInfo,
  encodeContractCalls,
} from "./index";

import {
  createNetwork,
  deployContract,
  evmRelayer,
  relay,
  RelayerType,
} from "@axelar-network/axelar-local-dev";

const uint8ArrayToHex = (uint8Array: Uint8Array): string => {
  return `0x${Array.from(uint8Array)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
};

const pack = (
  functionSignature: string,
  paramTypes: Array<string>,
  params: Array<string>,
) => {
  const functionHash = createKeccakHash("keccak256")
    .update(functionSignature)
    .digest();

  return uint8ArrayToHex(
    Uint8Array.from([
      ...Uint8Array.from(functionHash.subarray(0, 4)),
      ...encode(paramTypes, params),
    ]),
  );
};

export const testWallet = async () => {
  const axelarRelayer = await AxelarRelayerService.create(
    defaultAxelarChainInfo,
  );

  // address present on agoric with BLD
  const senderAddress = "agoric1estsewt6jqsx77pwcxkn5ah0jqgu8rhgflwfdl";

  const Factory = require("../artifacts/src/__tests__/contracts/Factory.sol/Factory.json");
  const WalletContract = require("../artifacts/src/__tests__/contracts/Factory.sol/Wallet.json");

  const ethereumNetwork = await createNetwork({ name: "Ethereum" });
  const factoryContract = await deployContract(
    ethereumNetwork.userWallets[0],
    Factory,
    [ethereumNetwork.gateway.address, ethereumNetwork.gasService.address],
  );
  const ethereumWallet = await deployContract(
    ethereumNetwork.userWallets[0],
    WalletContract,
    [
      ethereumNetwork.gateway.address,
      ethereumNetwork.gasService.address,
      senderAddress,
    ],
  );

  console.log("Wallet Address:", ethereumWallet.address);

  const ibcRelayer = axelarRelayer.ibcRelayer;

  const AMOUNT_IN_ATOMIC_UNITS = "1000000";
  const CHANNEL_ID = ibcRelayer.srcChannelId;
  const DENOM = "ubld";
  const AXELAR_GMP_ADDRESS =
    "axelar1dv4u5k73pzqrxlzujxg3qp8kvc3pje7jtdvu72npnt5zhq05ejcsn5qme5";
  const signer = ibcRelayer.wasmClient;
  const DESTINATION_CHAIN = "Ethereum";

  const contractCalls = [
    {
      target: factoryContract.address as `0x${string}`,
      data: pack(
        "createSmartWallet(string)",
        ["string"],
        ["ownerAddress"],
      ) as `0x${string}`,
    },
  ];

  const payload = encodeContractCalls([]);

  const memoForWallet = {
    destination_chain: DESTINATION_CHAIN,
    destination_address: ethereumWallet.address,
    payload: payload,
    // fee: {
    //   amount: '8000',
    //   recipient: 'axelar1dv4u5k73pzqrxlzujxg3qp8kvc3pje7jtdvu72npnt5zhq05ejcsn5qme5',
    // },
    type: 1,
  };
  const message = [
    {
      typeUrl: "/ibc.applications.transfer.v1.MsgTransfer",
      value: {
        sender: senderAddress,
        receiver: AXELAR_GMP_ADDRESS,
        token: {
          denom: DENOM,
          amount: AMOUNT_IN_ATOMIC_UNITS,
        },
        timeoutTimestamp: (Math.floor(Date.now() / 1000) + 600) * 1e9,
        sourceChannel: CHANNEL_ID,
        sourcePort: "transfer",
        memo: JSON.stringify(memoForWallet),
      },
    },
  ];

  const fee = {
    gas: "250000",
    amount: [{ denom: DENOM, amount: "30000" }],
  };

  console.log("Preparing to send tokens...");
  const signingClient = await SigningStargateClient.connectWithSigner(
    "http://localhost/agoric-rpc",
    signer.owner,
  );

  const response = await signingClient.signAndBroadcast(
    senderAddress,
    message,
    fee,
  );
  evmRelayer.setRelayer(RelayerType.Agoric, axelarRelayer);

  await relay({
    agoric: axelarRelayer,
  });
  await axelarRelayer.stopListening();
};
