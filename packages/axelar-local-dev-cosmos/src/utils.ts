import {
  hexZeroPad,
  toUtf8Bytes,
  hexlify,
  defaultAbiCoder,
  arrayify,
} from "ethers/lib/utils";

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

export function encodeVersionedPayload(
  version: number,
  payload: string
): Uint8Array {
  const versionHex = hexZeroPad(hexlify(version), 4);
  const payloadString = hexlify(toUtf8Bytes(JSON.stringify(payload)));
  return arrayify(versionHex.concat(payloadString));
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
