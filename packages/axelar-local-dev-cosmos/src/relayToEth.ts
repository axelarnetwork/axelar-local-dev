import { defaultAxelarChainInfo, AxelarRelayerService, startChains } from './index';
import { SigningStargateClient } from '@cosmjs/stargate';
import { encode } from '@metamask/abi-utils';
import {Contract} from 'ethers';

import {
  evmRelayer,
  createNetwork,
  deployContract,
  relay,
  RelayerType,
} from '@axelar-network/axelar-local-dev';


export const relayDataToEth = async () => {
  // Start both Axelar and Wasm Chains
  // await startChains();

  // Initialize the Axelar Relayer Service with default configuration
  const axelarRelayer = await AxelarRelayerService.create(
    defaultAxelarChainInfo
  );

  const Factory = require('../artifacts/src/__tests__/contracts/Factory.sol/Factory.json');
  const Wallet = require('../artifacts/src/__tests__/contracts/Factory.sol/Wallet.json');
  const StakeContract = require('../artifacts/src/__tests__/contracts/StakingContract.sol/StakingContract.json');

  const ethereumNetwork = await createNetwork({ name: 'Ethereum' });
  const ethereumContract = await deployContract(
    ethereumNetwork.userWallets[0],
    Factory,
    [
      ethereumNetwork.gateway.address,
    ]
  );

  const tokenContract = await ethereumNetwork.deployToken("USDC", "aUSDC", 6, BigInt(100_000e6));

  const stakeContract = await deployContract(
    ethereumNetwork.userWallets[0],
    StakeContract,
    [
      tokenContract.address,
    ]
  );
  
  const ibcRelayer = axelarRelayer.ibcRelayer;

  console.log('IBC RELAYER', JSON.stringify(ibcRelayer.srcChannelId));

  const IBC_DENOM_AXL_USDC =
    'ubld';
  // 'ibc/295548A78785A1007F232DE286149A6FF512F180AF5657780FC89C009E2C348F';
  const AMOUNT_IN_ATOMIC_UNITS = '10000000';
  const FEE = '1' + '000' + '000';
  const CHANNEL_ID = ibcRelayer.srcChannelId;
  const DENOM = 'ubld';
  const AXELAR_GMP_ADDRESS =
    'axelar1dv4u5k73pzqrxlzujxg3qp8kvc3pje7jtdvu72npnt5zhq05ejcsn5qme5';

  const signer = ibcRelayer.wasmClient;
  const senderAddress = 'agoric1estsewt6jqsx77pwcxkn5ah0jqgu8rhgflwfdl';

  // TODO
  const DESTINATION_ADDRESS = ethereumContract.address;
  const DESTINATION_CHAIN = 'Ethereum';


  const payload = encode(['address'], [stakeContract.address]);

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

  await relay({
    agoric: axelarRelayer,
    evm: evmRelayer,
  });
  // await axelarRelayer.stopListening();

  // // Verify the message on the Ethereum contract
  const contractAddress = await ethereumContract.storedMessage();
  console.log('Message on Ethereum Contract:', contractAddress);

  const addy = `0x${contractAddress}`;

  if (addy === '0x') {
    console.error('Message not found on Ethereum Contract');
    return;
  }

  const memo2 = {
    destination_chain: DESTINATION_CHAIN,
    destination_address: addy,
    payload: Array.from(payload),
    fee: {
      amount: FEE,
      recipient: 'axelar1zl3rxpp70lmte2xr6c4lgske2fyuj3hupcsvcd',
  },
    type: 2,
  };

  const message2 = [
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
        memo: JSON.stringify(memo2),
      },
    },
  ];

  
  console.log('Sending transaction...', message2);
  const response2 = await signingClient.signAndBroadcast(
    senderAddress,
    message2,
    fee
  );
  console.log('transaction response', response2);

  const wallet = new Contract(addy, Wallet.abi, ethereumNetwork.userWallets[0]);

  await relay({
    agoric: axelarRelayer,
  });
  await axelarRelayer.stopListening();


  const walletMessage = await wallet.storedMessage();
  console.log('Message on Wallet Contract:', walletMessage);

  console.log('Stake Token Balance:', (await stakeContract.balanceOf(wallet.address)).toString());
  console.log('USDC Balance:', (await tokenContract.balanceOf(wallet.address)).toString());
  console.log('stake contract USDC Balance:', (await tokenContract.balanceOf(stakeContract.address)).toString());

};
