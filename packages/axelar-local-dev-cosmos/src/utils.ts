import {
  hexZeroPad,
  hexlify,
  defaultAbiCoder,
  arrayify,
} from "ethers/lib/utils";
import crypto from "crypto";
import fs, { promises as fsp } from "fs";
import { bech32 } from "bech32";
import { CosmosChain } from "./types";
import { toAccAddress } from "@cosmjs/stargate/build/queryclient/utils";
import { ConfirmGatewayTxRequest as EvmConfirmGatewayTxRequest } from "@axelar-network/axelarjs-types/axelar/evm/v1beta1/tx";
import { VoteRequest } from "@axelar-network/axelarjs-types/axelar/vote/v1beta1/tx";
import { RouteMessageRequest } from "@axelar-network/axelarjs-types/axelar/axelarnet/v1beta1/tx";
import {
  Event_Status,
  VoteEvents,
} from "@axelar-network/axelarjs-types/axelar/evm/v1beta1/types";
import { DeliverTxResponse } from "@cosmjs/stargate";
import { CallContractArgs } from "@axelar-network/axelar-local-dev";
import path from "path";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { Path } from "./path";

export async function retry(fn: () => void, maxAttempts = 5, interval = 3000) {
  let attempts = 0;
  while (attempts < maxAttempts) {
    try {
      return await fn();
    } catch (e) {
      attempts++;
      if (attempts === maxAttempts) {
        throw e;
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }
}

export function getIBCDenom(channel: string, denom: string, port = "transfer") {
  const path = `${port}/${channel}/${denom}`;
  // Compute the SHA-256 hash of the path
  const hash = crypto.createHash("sha256").update(path).digest();

  // Convert the hash to a hexadecimal representation
  const hexHash = hash.toString("hex").toUpperCase();

  // Construct the denom by prefixing the hex hash with 'ibc/'
  return `ibc/${hexHash}`;
}

export function encodeVersionedPayload(
  version: number,
  payload: string
): Uint8Array {
  const versionHex = hexZeroPad(hexlify(version), 4);
  return arrayify(versionHex.concat(payload.substring(2)));
}

export async function exportOwnerAccountFromContainer(
  chain: CosmosChain
): Promise<{ mnemonic: string; address: string }> {
  const homePath = path.join(Path.docker(chain), `.${chain}`);
  const mnemonic = readFileSync(`${homePath}/mnemonic.txt`, "utf8");
  const address = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
    prefix: chain,
  })
    .then((wallet) => wallet.getAccounts())
    .then((accounts) => accounts[0].address);

  return { mnemonic, address };
}

export function decodeVersionedPayload(versionedPayload: string) {
  // Skip the first 4 bytes (version number) and create an array of types that match the encoded data structure
  const encodedData = "0x" + versionedPayload.substring(10); // substring(10) to skip '0x' and the 4 version bytes

  // Define the structure of the encoded data based on how it was encoded in Solidity
  const types = [
    "string", // Method name
    "string[]", // Argument name array
    "string[]", // ABI type array
    "bytes",
  ];
  // Decode the payload
  const decoded = defaultAbiCoder.decode(types, encodedData);

  // Extract the method name and argument values
  const [methodName, argNames, argTypes, argValues] = decoded;

  const [sourceChain, sourceAddress, executeMsgPayload] =
    defaultAbiCoder.decode(["string", "string", "bytes"], argValues);

  return {
    methodName,
    argNames,
    argTypes,
    argValues: [
      sourceChain,
      sourceAddress,
      Buffer.from(executeMsgPayload.slice(2), "hex").toString("base64"),
    ],
  };
}

// Overload signatures
export function readFileSync(path: string): Buffer;
export function readFileSync(path: string, flag: BufferEncoding): string;
export function readFileSync(path: string, flag?: BufferEncoding) {
  try {
    return fs.readFileSync(path, flag);
  } catch (error: any) {
    if (error.code === "ENOENT") {
      // Custom handling for file not found
      throw new Error(`File not found at path: ${path}`);
    } else {
      // Re-throw the original error if it's not a 'file not found' error
      throw error;
    }
  }
}

export function convertCosmosAddress(address: string, prefix: string) {
  const decoded = bech32.decode(address);
  return bech32.encode(prefix, decoded.words);
}

export const getConfirmGatewayTxPayload = (
  sender: string,
  chain: string,
  txHash: string
) => {
  return [
    {
      typeUrl: `/axelar.evm.v1beta1.ConfirmGatewayTxRequest`,
      value: EvmConfirmGatewayTxRequest.fromPartial({
        sender: toAccAddress(sender),
        chain,
        txId: arrayify(txHash),
      }),
    },
  ];
};

export const incrementPollCounter = async () => {
  const filePath = path.join(
    __dirname,
    "../docker/axelar/.axelar/poll-counter.txt"
  );
  let number = null;
  try {
    const data = await fsp.readFile(filePath, "utf8");
    number = parseInt(data.trim(), 10);
    if (isNaN(number)) {
      throw new Error("The file does not contain a valid number.");
    }
    await fsp.writeFile(filePath, (number + 1).toString(), "utf8");
  } catch (error: any) {
    throw new Error(`Error reading or writing file: ${error.message}`);
  }
  return number;
};

export const getVoteRequestPayload = (
  sender: string,
  callContractArgs: CallContractArgs,
  confirmGatewayTx: DeliverTxResponse,
  pollId: number
) => {
  const event = {
    chain: callContractArgs.from,
    txId: arrayify(`0x${confirmGatewayTx.transactionHash}`),
    index: confirmGatewayTx.txIndex,
    status: Event_Status.STATUS_UNSPECIFIED,
    contractCall: {
      sender: arrayify(callContractArgs.sourceAddress),
      destinationChain: callContractArgs.to,
      contractAddress: callContractArgs.destinationContractAddress,
      payloadHash: arrayify(callContractArgs.payloadHash),
    },
  };

  const voteEvents = VoteEvents.encode(
    VoteEvents.fromPartial({
      chain: callContractArgs.from,
      events: [event],
    })
  ).finish();

  return [
    {
      typeUrl: `/axelar.vote.v1beta1.VoteRequest`,
      value: VoteRequest.fromPartial({
        sender: toAccAddress(sender),
        pollId: pollId,
        vote: {
          typeUrl: "/axelar.evm.v1beta1.VoteEvents",
          value: voteEvents,
        },
      }),
    },
  ];
};

export const getRouteMessagePayload = (
  sender: string,
  callContractArgs: CallContractArgs,
  eventId: string
) => {
  return [
    {
      typeUrl: `/axelar.axelarnet.v1beta1.RouteMessageRequest`,
      value: RouteMessageRequest.fromPartial({
        sender: toAccAddress(sender),
        id: eventId,
        payload: arrayify(callContractArgs.payload),
        feegranter: toAccAddress(
          // Address of gov1 wallet in the axelar chain
          "axelar1sufx2ryp5ndxdhl3zftdnsjwrgqqgd3q6sxfjs"
        ),
      }),
    },
  ];
};
