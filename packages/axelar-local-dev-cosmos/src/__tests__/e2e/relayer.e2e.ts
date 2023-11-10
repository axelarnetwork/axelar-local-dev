import {
  Network,
  createNetwork,
  deployContract,
  evmRelayer,
  relay,
  RelayerType,
} from "@axelar-network/axelar-local-dev";
import { Contract, ethers } from "ethers";
import path from "path";
import {
  AxelarListener,
  AxelarRelayerService,
  CosmosClient,
  IBCRelayerService,
  defaultAxelarChainInfo,
} from "../..";
import SendReceive from "../../../artifacts/src/__tests__/contracts/SendReceive.sol/SendReceive.json";

describe.only("Relayer", () => {
  let cosmosRelayer: AxelarRelayerService;
  let evmNetwork: Network;
  let wasmClient: CosmosClient;
  let srcChannelId: string;
  let axelarListener: AxelarListener;
  let ibcRelayer: IBCRelayerService;
  let wasmContractAddress: string;
  let evmContract: Contract;
  let testMnemonic =
    "illness step primary sibling donkey body sphere pigeon inject antique head educate";

  beforeAll(async () => {
    ibcRelayer = await IBCRelayerService.create(testMnemonic);
    await ibcRelayer.setup();
    axelarListener = new AxelarListener(defaultAxelarChainInfo);
    wasmClient = ibcRelayer.wasmClient;
    srcChannelId = ibcRelayer.srcChannelId || "channel-0";

    cosmosRelayer = await AxelarRelayerService.create(defaultAxelarChainInfo);
    evmNetwork = await createNetwork({
      name: "Ethereum",
    });

    // Contract Deployment
    const evmSendReceive = await deployContract(
      evmNetwork.userWallets[0],
      SendReceive,
      [evmNetwork.gateway.address, evmNetwork.gasService.address, "ethereum"]
    );

    console.log("Deploy EVM Contract", evmSendReceive.address);

    // Upload the wasm contract
    const _path = path.resolve(__dirname, "../../..", "wasm/send_receive.wasm");
    const response = await wasmClient.uploadWasm(_path);
    console.log("Uploaded wasm:", response.codeId);

    // Instantiate the contract
    const { client, address: senderAddress } =
      await wasmClient.generateRandomSigningClient();

    const { contractAddress } = await client.instantiate(
      senderAddress,
      response.codeId,
      {
        channel: srcChannelId,
      },
      "amazing random contract",
      "auto"
    );

    console.log("Deployed Wasm contract:", contractAddress);
    wasmContractAddress = contractAddress;
    evmContract = evmSendReceive;
  });

  it("should be able to relay from evm to wasm chain", async () => {
    evmRelayer.setRelayer(RelayerType.Wasm, cosmosRelayer);
    const message = "hello from ethereum";

    await evmContract.send("wasm", wasmContractAddress, message, {
      value: ethers.utils.parseEther("0.001"),
    });

    await relay({
      evm: evmRelayer,
      wasm: cosmosRelayer,
    });

    const response = await wasmClient.client.queryContractSmart(
      wasmContractAddress,
      {
        get_stored_message: {},
      }
    );

    expect(response.sender.toLowerCase()).toBe(
      evmNetwork.userWallets[0].address.toLowerCase()
    );
    expect(response.message).toBe(message);
  });

  it("should be able to relay from wasm to evm chain", async () => {
    await relay({
      wasm: cosmosRelayer,
    });

    const senderAddress = wasmClient.getOwnerAccount();

    const message = "hello from cosmos";
    const execution = await wasmClient.client.execute(
      senderAddress,
      wasmContractAddress,
      {
        send_message_evm: {
          destination_chain: "ethereum",
          destination_address: evmContract.address,
          message,
        },
      },
      "auto",
      "test",
      [{ amount: "100000", denom: "uwasm" }]
    );

    await ibcRelayer.relay();

    await relay({
      wasm: cosmosRelayer,
    });

    const response = await evmContract.storedMessage();

    expect(response.sender).toBe(senderAddress);
    expect(response.message).toBe(message);
  });
});
