"use strict";

import { ethers } from "ethers";
const { defaultAbiCoder, arrayify } = ethers.utils;
import { CallContractArgs, RelayData } from "@axelar-network/axelar-local-dev";
import { decodeVersionedPayload } from "./utils";
import { CosmosClient } from "./clients";
import { ExecuteResult } from "@cosmjs/cosmwasm-stargate";

//An internal class for handling axelar commands.
export class Command {
  commandId: string;
  name: string;
  data: any[];
  encodedData: string;
  post: ((options: any) => Promise<any>) | undefined;

  constructor(
    commandId: string,
    name: string,
    data: any[],
    dataSignature: string[],
    post: (wasmClient: CosmosClient) => Promise<ExecuteResult>,
    chain: string | null = null
  ) {
    this.commandId = commandId;
    this.name = name;
    this.data = data;
    this.encodedData =
      chain === "wasm" && name === "approve_contract_call"
        ? ""
        : defaultAbiCoder.encode(dataSignature, data);
    this.post = post;
  }

  static createWasmContractCallCommand = (
    commandId: string,
    relayData: RelayData,
    args: CallContractArgs
  ) => {
    return new Command(
      commandId,
      "approve_contract_call",
      [
        args.from,
        args.sourceAddress,
        args.destinationContractAddress,
        args.payloadHash,
        args.payload,
      ],
      [],
      async (wasmClient: CosmosClient) => {
        const bytesPayload = arrayify(args.payload);
        const [version, payload] = decodeVersionedPayload(bytesPayload);
        console.log(version, payload);

        const { client } = wasmClient;
        const senderAddress = await wasmClient.getOwnerAccount();

        const tx = await client.execute(
          senderAddress,
          args.destinationContractAddress,
          payload,
          "auto",
          "call_contract: evm_to_wasm",
          [{ amount: "100000", denom: wasmClient.chainInfo.denom }]
        );

        relayData.callContract[commandId].execution = tx.transactionHash;
        return tx;
      },
      "wasm"
    );
  };
}
