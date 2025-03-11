import { defaultAxelarChainInfo, AxelarRelayerService } from './index';
import {
  evmRelayer,
  createNetwork,
  deployContract,
  relay,
  RelayerType,
} from '@axelar-network/axelar-local-dev';

export const relayDataToAgoric = async () => {
  const axelarRelayer = await AxelarRelayerService.create(
    defaultAxelarChainInfo
  );
  const ibcRelayer = axelarRelayer.ibcRelayer;
  const ethereumNetwork = await createNetwork({ name: 'Ethereum' });
  evmRelayer.setRelayer(RelayerType.Agoric, axelarRelayer);
  console.log('IBC RELAYER:', JSON.stringify(ibcRelayer.srcChannelId));

  // Deploy Smart Contract on the EVM (Ethereum Virtual Machine)
  console.log('Deploying SendReceive Contract...');
  const SendReceive = require('../artifacts/src/__tests__/contracts/SendReceive.sol/SendReceive.json');
  const ethereumContract = await deployContract(
    ethereumNetwork.userWallets[0],
    SendReceive,
    [
      ethereumNetwork.gateway.address,
      ethereumNetwork.gasService.address,
      'Ethereum',
    ]
  );
  console.log('Contract Deployment Successful...');

  // Send a message from Ethereum Chain to Wasm Chain
  console.log('Sending Message to Agoric...');
  const value = BigInt(0.001 * 10 ** 18);
  const ethereumTransaction = await ethereumContract.send(
    'agoric',
    'Hi Agoric!',
    {
      value,
      gasLimit: 500000,
    }
  );
  console.log('Ethereum Chain Transaction Hash:', ethereumTransaction.hash);

  // Relay messages between Ethereum and Agoric chains
  await relay({
    agoric: axelarRelayer,
    evm: evmRelayer,
  });
};
