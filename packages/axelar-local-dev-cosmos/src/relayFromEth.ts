import { defaultAxelarChainInfo, AxelarRelayerService } from "./index";
import { encode, decode } from "@metamask/abi-utils";
import { Contract, ethers } from "ethers";
import { encodeVersionedPayload } from "./utils";

import {
  evmRelayer,
  createNetwork,
  deployContract,
  relay,
  RelayerType,
} from "@axelar-network/axelar-local-dev";
import { AxelarGateway } from "@axelar-network/axelar-local-dev/dist/contracts";

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
    [ethereumNetwork.gateway.address]
  );

  const gatewayContract = new Contract(
    ethereumNetwork.gateway.address,
    AxelarGateway.abi,
    ethereumNetwork.ownerWallet
  );
  const encoder = ethers.utils.defaultAbiCoder;
  const message = encode(["string"], ["fraz"]);
  const payloadArguments = encode(
    ["string", "string", "bytes"],
    ["Ethereum", "0x0830c9d8f05D1dcAE3406102420C29bBb287C199", message]
  );
  const cosmwasmPayload = encoder.encode(
    ["string", "string[]", "string[]", "bytes"],
    [
      "receive_message_evm",
      ["source_chain", "source_address", "payload"],
      ["string", "string", "bytes"],
      payloadArguments,
    ]
  );
  console.log(cosmwasmPayload);
  const encodedPayload = encodeVersionedPayload(0, cosmwasmPayload);
  await gatewayContract.callContract(
    "agoric",
    // 
    "agoric1c9gyu460lu70rtcdp95vummd6032psmpdx7wdy",
    Array.from(encodedPayload)
  );

  evmRelayer.setRelayer(RelayerType.Agoric, axelarRelayer);
  await relay({
    evm: evmRelayer,
  });

  await relay({
    agoric: axelarRelayer,
  });
  await axelarRelayer.stopListening();
};
