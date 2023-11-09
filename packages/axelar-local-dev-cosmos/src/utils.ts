import {
  hexZeroPad,
  toUtf8Bytes,
  hexlify,
  hexStripZeros,
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
  payload: any
): Uint8Array {
  const versionHex = hexZeroPad(hexlify(version), 4);
  const payloadString = hexlify(toUtf8Bytes(JSON.stringify(payload)));
  return arrayify(versionHex.concat(payloadString));
}

export function decodeVersionedPayload(versionedPayload: Uint8Array) {
  // The version number is in the first 4 bytes
  const versionBytes = versionedPayload.slice(0, 4);
  // Convert the version bytes to a number
  const versionNumber = parseInt(hexStripZeros(versionBytes), 16);

  // The rest of the payload is the JSON object
  const jsonStringBytes = versionedPayload.slice(4);
  // Convert the UTF-8 bytes to a string
  const jsonString = new TextDecoder().decode(jsonStringBytes);
  // Parse the JSON string to an object
  const jsonObject = JSON.parse(jsonString);

  return [versionNumber, jsonObject];
}
