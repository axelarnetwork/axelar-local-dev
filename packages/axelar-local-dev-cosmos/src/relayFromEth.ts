import { defaultAxelarChainInfo, AxelarRelayerService } from "./index";
import { encode, decode } from "@metamask/abi-utils";
import { Contract, ethers } from "ethers";
import { encodeVersionedPayload } from "./utils";
import { encode as b64encode, decode as b64decode } from 'js-base64';
import { SigningStargateClient } from '@cosmjs/stargate';
import createKeccakHash from 'keccak';

import {
  evmRelayer,
  createNetwork,
  deployContract,
  relay,
  RelayerType,
} from "@axelar-network/axelar-local-dev";
import { AxelarGateway } from "@axelar-network/axelar-local-dev/dist/contracts";

const uint8ArrayToHex = (uint8Array: Uint8Array): string => {
  return `0x${Array.from(uint8Array)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
};

const pack = (
  functionSignature: string,
  paramTypes: Array<string>,
  params: Array<string>
) => {
  const functionHash = createKeccakHash("keccak256").update(functionSignature).digest();

  return uint8ArrayToHex(
    Uint8Array.from([
      ...Uint8Array.from(functionHash.subarray(0, 4)),
      ...encode(paramTypes, params),
    ])
  );
};

export const relayDataFromEth = async () => {
  const axelarRelayer = await AxelarRelayerService.create(
    defaultAxelarChainInfo
  );

  const Factory = require("../artifacts/src/__tests__/contracts/Factory.sol/Factory.json");
  const WalletContract = require("../artifacts/src/__tests__/contracts/Factory.sol/Wallet.json");
  const StakeContract = require("../artifacts/src/__tests__/contracts/StakingContract.sol/StakingContract.json");

  const ethereumNetwork = await createNetwork({ name: "Ethereum" });
  const ethereumContract = await deployContract(
    ethereumNetwork.userWallets[0],
    Factory,
    [ethereumNetwork.gateway.address,
      ethereumNetwork.gasService.address,
      'Ethereum',
    ]
  );  
  const ethereumWallet = await deployContract(
    ethereumNetwork.userWallets[0],
    WalletContract,
    [
      ethereumNetwork.gateway.address,
      'agoric1estsewt6jqsx77pwcxkn5ah0jqgu8rhgflwfdl',
    ]
  );

  console.log('Ethereum Contract Address:', ethereumWallet.address);


  const targets = [
    ethereumContract.address,
  ];
  const data: any = [
    pack('createVendor(string)', ['string'], ['ownerAddress']),
  ];
  console.log(data);

  const payload = Array.from(encode(['address[]', 'bytes[]'], [targets, data]));


  const ibcRelayer = axelarRelayer.ibcRelayer;

  const IBC_DENOM_AXL_USDC =
    'ubld';
  // 'ibc/295548A78785A1007F232DE286149A6FF512F180AF5657780FC89C009E2C348F';
  const AMOUNT_IN_ATOMIC_UNITS = '1000000';
  const CHANNEL_ID = ibcRelayer.srcChannelId;
  const DENOM = 'ubld';
  const AXELAR_GMP_ADDRESS =
    'axelar1dv4u5k73pzqrxlzujxg3qp8kvc3pje7jtdvu72npnt5zhq05ejcsn5qme5';

  const signer = ibcRelayer.wasmClient;
  const senderAddress = 'agoric1estsewt6jqsx77pwcxkn5ah0jqgu8rhgflwfdl';

  // TODO
  const DESTINATION_ADDRESS = ethereumWallet.address;
  const DESTINATION_CHAIN = 'Ethereum';

  // const payload = encode(['string', 'string'], ['agoric1estsewt6jqsx77pwcxkn5ah0jqgu8rhgflwfdl', 'Hello, world!']);

  const memo = {
    destination_chain: DESTINATION_CHAIN,
    destination_address: DESTINATION_ADDRESS,
    payload,
    // fee: {
    //   amount: '8000',
    //   recipient: 'axelar1dv4u5k73pzqrxlzujxg3qp8kvc3pje7jtdvu72npnt5zhq05ejcsn5qme5',
    // },
    type: 1,
  };

  const message = [
    {
      typeUrl: '/ibc.applications.transfer.v1.MsgTransfer',
      value: {
        sender: senderAddress,
        receiver: AXELAR_GMP_ADDRESS,
        token: {
          denom: IBC_DENOM_AXL_USDC,
          amount: AMOUNT_IN_ATOMIC_UNITS,
        },
        timeoutTimestamp: (Math.floor(Date.now() / 1000) + 600) * 1e9,
        sourceChannel: CHANNEL_ID,
        sourcePort: 'transfer',
        memo: JSON.stringify(memo),
      },
    },
  ];


  const fee = {
    gas: '250000',
    amount: [{ denom: DENOM, amount: '30000' }],
  };

  console.log('Preparing to send tokens...');
  const signingClient = await SigningStargateClient.connectWithSigner(
    'http://localhost/agoric-rpc',
    signer.owner
  );

  const response = await signingClient.signAndBroadcast(
    senderAddress,
    message,
    fee
  );
  evmRelayer.setRelayer(RelayerType.Agoric, axelarRelayer);

  await relay({
    agoric: axelarRelayer,
  });
  await axelarRelayer.stopListening();


  const ethereumMessage = await ethereumContract.storedMessage();
  console.log('Message on Ethereum Contract:', ethereumMessage);

  await relay({
    evm: evmRelayer,
  });

  await relay({
    agoric: axelarRelayer,
  });

  await axelarRelayer.stopListening();
};
