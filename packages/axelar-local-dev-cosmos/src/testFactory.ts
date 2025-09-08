import { SigningStargateClient } from "@cosmjs/stargate";
import { encode } from "@metamask/abi-utils";
import { AxelarRelayerService, defaultAxelarChainInfo } from "./index";
import {
  createNetwork,
  deployContract,
  evmRelayer,
  relay,
  RelayerType,
} from "@axelar-network/axelar-local-dev";

export const testFactory = async () => {
  const axelarRelayer = await AxelarRelayerService.create(
    defaultAxelarChainInfo,
  );

  const Factory = require("../artifacts/src/__tests__/contracts/Factory.sol/Factory.json");

  const ethereumNetwork = await createNetwork({ name: "Ethereum" });
  const factoryContract = await deployContract(
    ethereumNetwork.userWallets[0],
    Factory,
    [
      ethereumNetwork.gateway.address,
      ethereumNetwork.gasService.address,
    ],
  );

  const ibcRelayer = axelarRelayer.ibcRelayer;

  const AMOUNT_IN_ATOMIC_UNITS = "1000000";
  const CHANNEL_ID = ibcRelayer.srcChannelId;
  const DENOM = "ubld";
  const AXELAR_GMP_ADDRESS =
    "axelar1dv4u5k73pzqrxlzujxg3qp8kvc3pje7jtdvu72npnt5zhq05ejcsn5qme5";
  const signer = ibcRelayer.wasmClient;
  const senderAddress = "agoric1estsewt6jqsx77pwcxkn5ah0jqgu8rhgflwfdl";
  const DESTINATION_CHAIN = "Ethereum";

  // 0 is valid for local but not for testnet or mainnet
  const feePayload = Array.from(encode(["uint256"], [0]));

  const memoForFactory = {
    destination_chain: DESTINATION_CHAIN,
    destination_address: factoryContract.address,
    payload: feePayload,
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
        memo: JSON.stringify(memoForFactory),
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

  await relay({
    evm: evmRelayer,
  });

  await relay({
    agoric: axelarRelayer,
  });

  await axelarRelayer.stopListening();
};
