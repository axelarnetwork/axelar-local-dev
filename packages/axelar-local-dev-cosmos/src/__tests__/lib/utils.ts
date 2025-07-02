import { encodeFunctionData, keccak256, toBytes, encodeAbiParameters } from 'viem';
import { network } from 'hardhat';

export const constructContractCall = ({ target, functionSignature, args }) => {
  const [name, paramsRaw] = functionSignature.split('(');
  const params = paramsRaw.replace(')', '').split(',').filter(Boolean);

  return {
    target,
    data: encodeFunctionData({
      abi: [
        {
          type: 'function',
          name,
          inputs: params.map((type, i) => ({ type, name: `arg${i}` })),
        },
      ],
      functionName: name,
      args,
    }),
  };
};

export const approveMessage = async ({
  commandId,
  from,
  sourceAddress,
  targetAddress,
  payload,
  owner,
  AxelarGateway,
  abiCoder,
}) => {
  const params = abiCoder.encode(
    ['string', 'string', 'address', 'bytes32'],
    [from, sourceAddress, targetAddress, payload],
  );
  const data = toBytes(
    abiCoder.encode(
      ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
      [network.config.chainId, [commandId], ['approveContractCall'], [params]],
    ),
  );

  const hash = keccak256(data);
  const signature = await owner.signMessage(toBytes(hash));
  const signatureBundle = abiCoder.encode(
    ['address[]', 'uint256[]', 'uint256', 'bytes[]'],
    [[owner.address], [1], 1, [signature]],
  );

  const input = abiCoder.encode(['bytes', 'bytes'], [data, signatureBundle]);
  const response = await AxelarGateway.connect(owner).execute(input, {
    gasLimit: BigInt(8e6),
  });
  return response;
};

export const approveMessageWithToken = async ({
  commandId,
  from,
  sourceAddress,
  targetAddress,
  payload,
  destinationTokenSymbol,
  amount,
  owner,
  AxelarGateway,
  abiCoder,
}) => {
  const params = abiCoder.encode(
    ['string', 'string', 'address', 'bytes32', 'string', 'uint256'],
    [
      from,
      sourceAddress,
      targetAddress,
      payload,
      destinationTokenSymbol,
      amount,
    ],
  );
  const data = toBytes(
    abiCoder.encode(
      ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
      [
        network.config.chainId,
        [commandId],
        ['approveContractCallWithMint'],
        [params],
      ],
    ),
  );

  const hash = keccak256(data);
  const signature = await owner.signMessage(toBytes(hash));
  const signatureBundle = abiCoder.encode(
    ['address[]', 'uint256[]', 'uint256', 'bytes[]'],
    [[owner.address], [1], 1, [signature]],
  );

  const input = abiCoder.encode(['bytes', 'bytes'], [data, signatureBundle]);
  const response = await AxelarGateway.connect(owner).execute(input, {
    gasLimit: BigInt(8e6),
  });
  return response;
};

export const deployToken = async ({
  commandId,
  name,
  symbol,
  decimals,
  cap,
  tokenAddress,
  mintLimit,
  owner,
  AxelarGateway,
  abiCoder,
}) => {
  const params = abiCoder.encode(
    ['string', 'string', 'uint8', 'uint256', 'address', 'uint256'],
    [name, symbol, decimals, cap, tokenAddress, mintLimit],
  );

  const data = toBytes(
    abiCoder.encode(
      ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
      [network.config.chainId, [commandId], ['deployToken'], [params]],
    ),
  );

  const hash = keccak256(data);
  const signature = await owner.signMessage(toBytes(hash));
  const signatureBundle = abiCoder.encode(
    ['address[]', 'uint256[]', 'uint256', 'bytes[]'],
    [[owner.address], [1], 1, [signature]],
  );

  const input = abiCoder.encode(['bytes', 'bytes'], [data, signatureBundle]);
  const response = await AxelarGateway.connect(owner).execute(input, {
    gasLimit: BigInt(8e6),
  });
  return response;
};

export const encodeMulticallPayload = (calls) => {
  return encodeAbiParameters(
    [
      {
        type: "tuple[]",
        name: "calls",
        components: [
          { name: "target", type: "address" },
          { name: "data", type: "bytes" },
        ],
      },
    ],
    [calls]
  );
};

export const getPayloadHash = (payload) => keccak256(toBytes(payload));
