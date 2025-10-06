import {
  createNetwork,
  deployContract,
  evmRelayer,
  relay,
  RelayerType,
} from "@axelar-network/axelar-local-dev";
import { AxelarRelayerService, defaultAxelarChainInfo } from "./index";

export const relayBasic = async () => {
  const axelarRelayer = await AxelarRelayerService.create(
    defaultAxelarChainInfo,
  );

  const ethereumNetwork = await createNetwork({ name: "Ethereum" });
  await ethereumNetwork.deployToken("USDC", "aUSDC", 6, BigInt(100_000e6));

  const multiCallContract = await deployContract(
    ethereumNetwork.userWallets[0],
    require("../artifacts/src/__tests__/contracts/Multicall.sol/Multicall.json"),
  );
  console.log("MultiCall Contract Address:", multiCallContract.address);

  const factoryContract = await deployContract(
    ethereumNetwork.userWallets[0],
    require("../artifacts/src/__tests__/contracts/Factory.sol/Factory.json"),
    [ethereumNetwork.gateway.address, ethereumNetwork.gasService.address],
  );
  console.log("Factory Contract Address:", factoryContract.address);

  evmRelayer.setRelayer(RelayerType.Agoric, axelarRelayer);

  while (true) {
    await relay({
      agoric: axelarRelayer,
      evm: evmRelayer,
    });
  }
};
