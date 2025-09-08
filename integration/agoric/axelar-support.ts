import { encodeFunctionData, encodeAbiParameters, hexToBytes } from "viem";
import type { AbiEncodedContractCall, ContractCall } from "./types";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { stringToPath } from "@cosmjs/crypto";

export const constructContractCall = ({
  target,
  functionSignature,
  args,
}: ContractCall): AbiEncodedContractCall => {
  const [name, paramsRaw] = functionSignature.split("(");
  const params = paramsRaw.replace(")", "").split(",").filter(Boolean);

  return {
    target,
    data: encodeFunctionData({
      abi: [
        {
          type: "function",
          name,
          inputs: params.map((type, i) => ({ type, name: `arg${i}` })),
        },
      ],
      functionName: name,
      args,
    }),
  };
};

/**
 * Builds a GMP payload from an array of contract calls.
 */

export const buildGMPPayload = (contractCalls, id = "") => {
  const abiEncodedContractCalls: AbiEncodedContractCall[] = [];
  for (const call of contractCalls) {
    const { target, functionSignature, args } = call;
    abiEncodedContractCalls.push(
      constructContractCall({ target, functionSignature, args }),
    );
  }

  const abiEncodedData = encodeAbiParameters(
    [
      {
        type: "tuple",
        name: "callMessage",
        components: [
          { name: "id", type: "string" },
          {
            name: "calls",
            type: "tuple[]",
            components: [
              { name: "target", type: "address" },
              { name: "data", type: "bytes" },
            ],
          },
        ],
      },
    ],
    [{ id, calls: abiEncodedContractCalls }],
  );

  return Array.from(hexToBytes(abiEncodedData));
};

/**
 * @param {bigint} gasAmount - gas amount for the EVM to Agoric message
 * @returns {number[]} The payload array.
 */
export const buildGasPayload = (gasAmount) => {
  const abiEncodedData = encodeAbiParameters(
    [{ type: "uint256" }],
    [gasAmount],
  );

  return Array.from(hexToBytes(abiEncodedData));
};

// For Agoric wallet
export const getSigner = async () => {
  const mnemonic = process.env.MNEMONIC;
  if (!mnemonic) {
    console.error("Mnemonic not found in environment variables.");
    process.exit(1);
  }
  const Agoric = {
    Bech32MainPrefix: "agoric",
    CoinType: 564,
  };
  const hdPath = (coinType = 118, account = 0) =>
    stringToPath(`m/44'/${coinType}'/${account}'/0/0`);

  return DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
    prefix: Agoric.Bech32MainPrefix,
    hdPaths: [hdPath(Agoric.CoinType, 0), hdPath(Agoric.CoinType, 1)],
  });
};

export const getSignerWallet = async ({ prefix }) => {
  const mnemonic = process.env.MNEMONIC;
  if (!mnemonic) {
    console.error("Mnemonic not found in environment variables.");
    process.exit(1);
  }

  return DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
    prefix,
  });
};
