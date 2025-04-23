import { defaultAxelarChainInfo, AxelarRelayerService } from './index';
import {
  evmRelayer,
  createNetwork,
  deployContract,
  relay,
  RelayerType,
} from '@axelar-network/axelar-local-dev';
import { Contract } from 'ethers';

export const relayBasic = async () => {
  const axelarRelayer = await AxelarRelayerService.create(
    defaultAxelarChainInfo
  );

  const ethereumNetwork = await createNetwork({ name: 'Ethereum' });

  const multiCallContract = await deployContract(
    ethereumNetwork.userWallets[0],
    require('../artifacts/src/__tests__/contracts/Multicall.sol/Multicall.json')
  );
  console.log('MultiCall Contract Address:', multiCallContract.address);

  const factoryContract = await deployContract(
    ethereumNetwork.userWallets[0],
    require('../artifacts/src/__tests__/contracts/Factory.sol/Factory.json'),
    [
      ethereumNetwork.gateway.address,
      ethereumNetwork.gasService.address,
      'Ethereum',
    ]
  );
  console.log('Factory Contract Address:', factoryContract.address);

  const walletContractAbi =
    require('../artifacts/src/__tests__/contracts/Factory.sol/Wallet.json').abi;
  const wallet = new Contract(
    '0x959c9a26d962c38f40d270a3825298cd58a8039e',
    walletContractAbi,
    ethereumNetwork.userWallets[0]
  );

  evmRelayer.setRelayer(RelayerType.Agoric, axelarRelayer);

  while (true) {
    await relay({
      agoric: axelarRelayer,
      evm: evmRelayer,
    });
    try {
      const ethereumMessage = await wallet.storedMessage();
      console.log('Ethereum Message:', ethereumMessage);
    } catch (e) {
      console.log('Error:', e);
    }
  }
};
