import { defaultAxelarChainInfo, AxelarRelayerService } from "./index";
import {
    evmRelayer,
    createNetwork,
    deployContract,
    relay,
    RelayerType,
} from "@axelar-network/axelar-local-dev";
import { Contract } from "ethers";

export const relayBasic = async () => {
    const axelarRelayer = await AxelarRelayerService.create(
        defaultAxelarChainInfo
    );

    const Factory = require("../artifacts/src/__tests__/contracts/Factory.sol/Factory.json");
    const WalletContract = require("../artifacts/src/__tests__/contracts/Factory.sol/Wallet.json");

    const ethereumNetwork = await createNetwork({ name: "Ethereum" });
    const ethereumContract = await deployContract(
        ethereumNetwork.userWallets[0],
        Factory,
        [ethereumNetwork.gateway.address,
        ethereumNetwork.gasService.address,
            'Ethereum',
        ]
    );

    const wallet = new Contract('0x959c9a26d962c38f40d270a3825298cd58a8039e', WalletContract.abi, ethereumNetwork.userWallets[0]);

    console.log('Ethereum Contract Address:', ethereumContract.address);

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
