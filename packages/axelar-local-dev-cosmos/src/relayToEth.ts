import { defaultAxelarChainInfo, AxelarRelayerService } from "./index";
import { SigningStargateClient } from "@cosmjs/stargate";
import { encode } from "@metamask/abi-utils";

import {
  evmRelayer,
  createNetwork,
  deployContract,
  relay,
  RelayerType,
} from "@axelar-network/axelar-local-dev";

export const relayDataToEth = async () => {
  // Initialize the Axelar Relayer Service with default configuration
  const axelarRelayer = await AxelarRelayerService.create(
    defaultAxelarChainInfo,
  );

  const SendReceive = require("../artifacts/src/__tests__/contracts/SendReceive.sol/SendReceive.json");

  const ethereumNetwork = await createNetwork({ name: "Ethereum" });
  const ethereumContract = await deployContract(
    ethereumNetwork.userWallets[0],
    SendReceive,
    [
      ethereumNetwork.gateway.address,
      ethereumNetwork.gasService.address,
      "Ethereum",
    ],
  );

  const ibcRelayer = axelarRelayer.ibcRelayer;

  console.log("IBC RELAYER", JSON.stringify(ibcRelayer.srcChannelId));

  const IBC_DENOM_AXL_USDC = "ubld";
  const AMOUNT_IN_ATOMIC_UNITS = "1000000";
  const CHANNEL_ID = ibcRelayer.srcChannelId;
  const DENOM = "ubld";
  const AXELAR_GMP_ADDRESS =
    "axelar1dv4u5k73pzqrxlzujxg3qp8kvc3pje7jtdvu72npnt5zhq05ejcsn5qme5";

  const signer = ibcRelayer.wasmClient;
  const senderAddress = "agoric1estsewt6jqsx77pwcxkn5ah0jqgu8rhgflwfdl";

  // TODO
  const DESTINATION_ADDRESS = ethereumContract.address;
  const DESTINATION_CHAIN = "Ethereum";

  const payload = encode(
    ["string", "string"],
    ["agoric1estsewt6jqsx77pwcxkn5ah0jqgu8rhgflwfdl", "Hello, world!"],
  );

  const memo = {
    destination_chain: DESTINATION_CHAIN,
    destination_address: DESTINATION_ADDRESS,
    payload: Array.from(payload),
    fee: null,
    type: 1,
  };

  const message = [
    {
      typeUrl: "/ibc.applications.transfer.v1.MsgTransfer",
      value: {
        sender: senderAddress,
        receiver: AXELAR_GMP_ADDRESS,
        token: {
          denom: IBC_DENOM_AXL_USDC,
          amount: AMOUNT_IN_ATOMIC_UNITS,
        },
        timeoutTimestamp: (Math.floor(Date.now() / 1000) + 600) * 1e9,
        sourceChannel: CHANNEL_ID,
        sourcePort: "transfer",
        memo: JSON.stringify(memo),
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
  // Set up the Relayer for Wasm Chain
  evmRelayer.setRelayer(RelayerType.Agoric, axelarRelayer);

  console.log("Sending transaction...", message);
  const response = await signingClient.signAndBroadcast(
    senderAddress,
    message,
    fee,
  );
  console.log("transaction response", response);

  // Relay messages between Ethereum and Agoric chains
  await relay({
    agoric: axelarRelayer,
    evm: evmRelayer,
  });

  // // Verify the message on the Ethereum contract
  const ethereumMessage = await ethereumContract.storedMessage();
  console.log("Message on Ethereum Contract:", ethereumMessage);
};
