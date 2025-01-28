import {
  // AxelarRelayerService,
  IBCRelayerService,
  defaultAxelarChainInfo,
} from './index';
import {
  Network,
  createNetwork,
  deployContract,
  evmRelayer,
  relay,
} from '@axelar-network/axelar-local-dev';
import { Contract } from 'ethers';
import SendReceive from '../artifacts/src/__tests__/contracts/SendReceive.sol/SendReceive.json';
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { SigningStargateClient } from '@cosmjs/stargate/build/signingstargateclient';
import { assertIsDeliverTxSuccess } from '@cosmjs/stargate/build/stargateclient';
import { encode } from '@metamask/abi-utils';

interface IbcTransferParams {
  signer: DirectSecp256k1HdWallet;
  channelId: string;
  DESTINATION_EVM_CHAIN: string;
  EVM_CONTRACT_ADDRESS: string;
  DENOM_SENDING_TOKEN: string;
  AMOUNT_IN_ATOMIC_UNITS: string;
  DENOM_GAS_FEE: string;
}
const ibcTransfer = async ({
  signer,
  channelId,
  DESTINATION_EVM_CHAIN,
  EVM_CONTRACT_ADDRESS,
  DENOM_SENDING_TOKEN,
  AMOUNT_IN_ATOMIC_UNITS,
  DENOM_GAS_FEE,
}: IbcTransferParams) => {
  try {
    const accounts = await signer.getAccounts();
    const senderAddress = accounts[0].address;
    console.log('Sender Address:', senderAddress);

    const payload = encode(['string'], ['increment']);

    const memo = {
      destination_chain: DESTINATION_EVM_CHAIN,
      destination_address: EVM_CONTRACT_ADDRESS,
      payload: Array.from(payload),
      fee: null,
      type: 1,
    };

    const AXELAR_GMP_ADDRESS =
      'axelar1dv4u5k73pzqrxlzujxg3qp8kvc3pje7jtdvu72npnt5zhq05ejcsn5qme5';

    const message = [
      {
        typeUrl: '/ibc.applications.transfer.v1.MsgTransfer',
        value: {
          sender: senderAddress,
          receiver: AXELAR_GMP_ADDRESS,
          token: {
            denom: DENOM_SENDING_TOKEN,
            amount: AMOUNT_IN_ATOMIC_UNITS,
          },
          timeoutTimestamp: (Math.floor(Date.now() / 1000) + 600) * 1e9,
          sourceChannel: channelId,
          sourcePort: 'transfer',
          memo: JSON.stringify(memo),
        },
      },
    ];

    const fee = {
      gas: '250000',
      amount: [{ denom: DENOM_GAS_FEE, amount: '30000' }],
    };

    console.log('Sending transaction...', message);

    console.log('Preparing to invoke contract...');
    const RPC_URL_AGORIC = 'http://localhost/agoric-rpc';
    const signingClient = await SigningStargateClient.connectWithSigner(
      RPC_URL_AGORIC,
      signer
    );

    console.log('Sending transaction...');
    const response = await signingClient.signAndBroadcast(
      senderAddress,
      message,
      fee
    );

    assertIsDeliverTxSuccess(response);
    console.log('Transaction sent successfully. Response:', response);
  } catch (error) {
    console.error('Error during the transaction:', error);
  }
};

// export const start = async () => {
//   const cosmosRelayer: AxelarRelayerService = await AxelarRelayerService.create(
//     defaultAxelarChainInfo
//   );
//   const ibcRelayer: IBCRelayerService = cosmosRelayer.ibcRelayer;
//   const signer: DirectSecp256k1HdWallet = ibcRelayer.wasmClient.owner;
//   const srcChannelId: string = ibcRelayer.srcChannelId || 'channel-0';
//   const evmNetwork: Network = await createNetwork({
//     name: 'Ethereum',
//   });

//   // Deploy Contract
//   const evmContract: Contract = await deployContract(
//     evmNetwork.userWallets[0],
//     SendReceive,
//     [evmNetwork.gateway.address, evmNetwork.gasService.address, 'ethereum']
//   );

//   console.log('Deploy EVM Contract', evmContract.address);

//   await ibcTransfer({
//     signer,
//     channelId: srcChannelId,
//     DESTINATION_EVM_CHAIN: 'Ethereum',
//     EVM_CONTRACT_ADDRESS: evmContract.address,
//     // DENOM_SENDING_TOKEN: 'BF12D4A433705DF7C9485CA8D2CCB4FEDB541F32B9323004DA7FC73D7B98FB7D',
//     DENOM_SENDING_TOKEN: 'ubld',
//     AMOUNT_IN_ATOMIC_UNITS: '1000000',
//     DENOM_GAS_FEE: 'ubld',
//   });

//   // Relay messages between Ethereum and Agoric
//   await relay({
//     agoric: cosmosRelayer,
//     evm: evmRelayer,
//   });

//   const count = await evmContract.getCount();
//   console.log('Count is', count.toString());
// };

export const start = async () => {
  const cosmosRelayer: AxelarRelayerService = await AxelarRelayerService.create(
    defaultAxelarChainInfo
  );

  cosmosRelayer.listenForEvents();
  relay({
    evm: evmRelayer,
    agoric: cosmosRelayer,
  });
};
