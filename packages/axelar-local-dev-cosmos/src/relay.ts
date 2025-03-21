import { defaultAxelarChainInfo, AxelarRelayerService } from "./index";
import {
    evmRelayer,
    createNetwork,
    deployContract,
    relay,
    RelayerType,
} from "@axelar-network/axelar-local-dev";

export const relayBasic = async () => {
    const axelarRelayer = await AxelarRelayerService.create(
        defaultAxelarChainInfo
    );

    const Factory = require("../artifacts/src/__tests__/contracts/Factory.sol/Factory.json");

    const ethereumNetwork = await createNetwork({ name: "Ethereum" });
    const ethereumContract = await deployContract(
        ethereumNetwork.userWallets[0],
        Factory,
        [ethereumNetwork.gateway.address,
        ethereumNetwork.gasService.address,
            'Ethereum',
        ]
    );

    console.log('Ethereum Contract Address:', ethereumContract.address);

    evmRelayer.setRelayer(RelayerType.Agoric, axelarRelayer);

    while (true) {
        await relay({
            agoric: axelarRelayer,
            evm: evmRelayer,
        });

    }
};
