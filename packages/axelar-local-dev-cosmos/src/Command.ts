"use strict";

import { ethers } from "ethers";
const { defaultAbiCoder } = ethers.utils;
import { CallContractArgs, RelayData } from "@axelar-network/axelar-local-dev";
import {
  decodeVersionedPayload,
  getConfirmGatewayTxPayload,
  getRouteMessagePayload,
  getVoteRequestPayload,
  incrementPollCounter,
} from "./utils";
import { CosmosClient } from "./clients";

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
    post: (wasmClient: CosmosClient) => Promise<any>,
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

        const { client } = wasmClient;
        const senderAddress = wasmClient.getOwnerAccount();

        // Confirm that event has fired on the EVM chain
        const confirmGatewayTxPayload = getConfirmGatewayTxPayload(
          senderAddress,
          args.from,
          args.transactionHash
        );
        const confirmGatewayTxResponse = await client.signAndBroadcast(
          senderAddress,
          confirmGatewayTxPayload,
          "auto"
        );

        // Vote on the poll created by the axelar (normally done by the validator)
        const pollId = await incrementPollCounter();
        const voteRequestPayload = getVoteRequestPayload(
          wasmClient.getOwnerAccount(),
          args,
          confirmGatewayTxResponse,
          pollId
        );
        const VoteRequestResponse = await wasmClient.client.signAndBroadcast(
          wasmClient.getOwnerAccount(),
          voteRequestPayload,
          "auto"
        );

        // Route the message created by the poll to the destination chain
        const eventId = VoteRequestResponse.events
          .find((e: any) => e.type === "axelar.evm.v1beta1.EVMEventConfirmed")
          ?.attributes.find((a: any) => a.key === "event_id")
          ?.value.slice(1, -1);

        if (!eventId) {
          throw new Error("Event ID not found in EVMEventConfirmed event");
        }

        const routeMessagePayload = getRouteMessagePayload(
          wasmClient.getOwnerAccount(),
          args,
          eventId
        );
        const routeMessageResponse = await wasmClient.client.signAndBroadcast(
          wasmClient.getOwnerAccount(),
          routeMessagePayload,
          "auto"
        );

        relayData.callContract[commandId].execution =
          routeMessageResponse.transactionHash;

        return routeMessageResponse;
      },
      "wasm"
    );
  };
}
