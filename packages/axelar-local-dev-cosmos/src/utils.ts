import {
  hexZeroPad,
  toUtf8Bytes,
  hexlify,
  defaultAbiCoder,
  arrayify,
} from "ethers/lib/utils";
import crypto from "crypto";
import fs from "fs";
import { bech32 } from "bech32";
import { CosmosChain } from "./types";

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
  const payloadString = hexlify(toUtf8Bytes(JSON.stringify(payload)));
  return arrayify(versionHex.concat(payloadString));
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
