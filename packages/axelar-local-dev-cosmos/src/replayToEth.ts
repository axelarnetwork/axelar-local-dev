import { defaultAxelarChainInfo, AxelarRelayerService, startChains } from './index';
import { SigningStargateClient } from '@cosmjs/stargate';
import { encode } from '@metamask/abi-utils';

import {
  evmRelayer,
  createNetwork,
  deployContract,
  relay,
  RelayerType,
} from '@axelar-network/axelar-local-dev';

import SendReceive from '../artifacts/src/__tests__/contracts/SendReceive.sol/SendReceive.json';

export const relayDataToEth = async () => {
  // Start both Axelar and Wasm Chains
  // await startChains();

  // Initialize the Axelar Relayer Service with default configuration
  const axelarRelayer = await AxelarRelayerService.create(
    defaultAxelarChainInfo
  );

  const ethereumNetwork = await createNetwork({ name: 'Ethereum' });
  const ethereumContract = await deployContract(
    ethereumNetwork.userWallets[0],
    SendReceive,
    [
      ethereumNetwork.gateway.address,
      ethereumNetwork.gasService.address,
      'Ethereum',
    ]
  );

  const ibcRelayer = axelarRelayer.ibcRelayer;

  console.log('IBC RELAYER', JSON.stringify(ibcRelayer.srcChannelId));

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
  const DESTINATION_ADDRESS = ethereumContract.address;
  const DESTINATION_CHAIN = 'Ethereum';

  const payload = encode(['string', 'string'], ['agoric1estsewt6jqsx77pwcxkn5ah0jqgu8rhgflwfdl', 'Hello, world!']);

  const memo = {
    destination_chain: DESTINATION_CHAIN,
    destination_address: DESTINATION_ADDRESS,
    payload: Array.from(payload),
    fee: null,
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
  // Set up the Relayer for Wasm Chain
  evmRelayer.setRelayer(RelayerType.Agoric, axelarRelayer);

  console.log('Sending transaction...', message);
  const response = await signingClient.signAndBroadcast(
    senderAddress,
    message,
    fee
  );
  console.log('transaction response', response);

  // Relay messages between Ethereum and Agoric chains
  await relay({
    agoric: axelarRelayer,
    evm: evmRelayer,
  });

  // Setup for Ethereum Network and Wasm chain relayer
  //

  // // Deploy Smart Contract on the EVM (Ethereum Virtual Machine)
  // // const ethereumContract = await deployContract(
  // //   ethereumNetwork.userWallets[0],
  // //   SendReceive,
  // //   [
  // //     ethereumNetwork.gateway.address,
  // //     ethereumNetwork.gasService.address,
  // //     'Ethereum',
  // //   ]
  // // );

  // // Deploy Contract on the Wasm Chain
  // const wasmFilePath = path.resolve(__dirname, '../wasm/send_receive.wasm');
  // const wasmUploadResponse = await wasmClient1.uploadWasm(wasmFilePath);

  // // Instantiate the Wasm Contract
  // const { client: wasmClient, address: wasmSenderAddress } =
  //   await wasmClient1.createFundedSigningClient();

  // const wasmContractInstantiation = await wasmClient.instantiate(
  //   wasmSenderAddress,
  //   wasmUploadResponse.codeId,
  //   {
  //     channel: ibcRelayer.srcChannelId,
  //   },
  //   'send_receive',
  //   'auto'
  // );
  // // ============ SETUP END ============

  // const messageToEthereum = 'Hello from Ethereum';
  // const messageToWasm = 'Hello from Wasm';

  // // Send a message from Wasm Chain to Ethereum Chain
  // const wasmTransaction = await wasmClient.execute(
  //   wasmSenderAddress,
  //   wasmContractInstantiation.contractAddress,
  //   {
  //     send_message_evm: {
  //       destination_chain: 'Ethereum',
  //       destination_address: ethereumContract.address,
  //       message: messageToWasm,
  //     },
  //   },
  //   'auto',
  //   'test',
  //   [{ amount: '100000', denom: 'uwasm' }]
  // );
  // console.log('Wasm Chain Transaction Hash:', wasmTransaction.transactionHash);

  // // Send a message from Ethereum Chain to Wasm Chain
  // const ethereumTransaction = await ethereumContract.send(
  //   'agoric',
  //   wasmContractInstantiation.contractAddress,
  //   messageToEthereum,
  //   {
  //     value: ethers.utils.parseEther('0.001'),
  //   }
  // );
  // console.log('Ethereum Chain Transaction Hash:', ethereumTransaction.hash);



  // // Verify the message on the Ethereum contract
  const ethereumMessage = await ethereumContract.storedMessage();
  console.log('Message on Ethereum Contract:', ethereumMessage);

  // // Verify the message on the Wasm contract
  // const wasmResponse = await wasmClient1.client.queryContractSmart(
  //   wasmContractInstantiation.contractAddress,
  //   {
  //     get_stored_message: {},
  //   }
  // );

  // console.log('Message on Wasm Contract:', wasmResponse);
};
