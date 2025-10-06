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

  const CallContractWithToken = require("../artifacts/src/__tests__/contracts/ContractCallWithToken.sol/CallContractWithToken.json");

  const ethereumNetwork = await createNetwork({ name: "Ethereum" });
  const ethereumContract = await deployContract(
    ethereumNetwork.userWallets[0],
    CallContractWithToken,
    [ethereumNetwork.gateway.address, ethereumNetwork.gasService.address],
  );

  // Deploy tokens
  const tokenContract = await ethereumNetwork.deployToken(
    "USDC",
    "aUSDC",
    6,
    BigInt(100_000e6),
  );

  const ibcRelayer = axelarRelayer.ibcRelayer;

  console.log("IBC RELAYER", JSON.stringify(ibcRelayer.srcChannelId));

  const IBC_DENOM_AXL_USDC =
    // 'ubld';
    "ibc/5BDD47E9E73BF91C14497E254F0A751F1A7D3A6084343F66EA7CEE834A384651";
  const AMOUNT_IN_ATOMIC_UNITS = "10" + "000" + "000";
  const FEE = "1" + "000" + "000";
  const CHANNEL_ID = ibcRelayer.srcChannelId;
  const DENOM = "ubld";
  const AXELAR_GMP_ADDRESS =
    "axelar1dv4u5k73pzqrxlzujxg3qp8kvc3pje7jtdvu72npnt5zhq05ejcsn5qme5";

  const signer = ibcRelayer.wasmClient;
  const senderAddress = "agoric1estsewt6jqsx77pwcxkn5ah0jqgu8rhgflwfdl";

  const DESTINATION_ADDRESS = ethereumContract.address;
  const DESTINATION_CHAIN = "Ethereum";

  const ADDRESS_TO_DEPOSIT = "0x20E68F6c276AC6E297aC46c84Ab260928276691D";

  const payload = encode(["address[]"], [[ADDRESS_TO_DEPOSIT]]);
  console.log(
    "Balance of account before relaying",
    await tokenContract.balanceOf(ADDRESS_TO_DEPOSIT),
  );

  const memo = {
    destination_chain: DESTINATION_CHAIN,
    destination_address: DESTINATION_ADDRESS,
    payload: Array.from(payload),
    fee: {
      amount: FEE,
      recipient: "axelar1zl3rxpp70lmte2xr6c4lgske2fyuj3hupcsvcd",
    },
    type: 2,
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

  console.log(
    "Balance of account after relaying",
    await tokenContract.balanceOf(ADDRESS_TO_DEPOSIT),
  );
  const ethereumMessage = await ethereumContract.storedMessage();
  console.log("Message on Ethereum Contract:", ethereumMessage);
};
