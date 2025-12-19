Factory was deployed to Ethereum Sepolia with the createAndDeposit changes:
[0x9F9684d7FA7318698a0030ca16ECC4a01944836b](https://sepolia.etherscan.io/address/0x9F9684d7FA7318698a0030ca16ECC4a01944836b)

## Testing `createAndDeposit` via direct calls

### Command

```bash
cd integration && yarn permit
```

### What this does

- Creates a **Permit2 SignatureTransfer** permit with the Factory set as the spender
- Approves **1 USDC** for the Permit2 contract
- Invokes `Factory.testExecute(bytes)` directly (bypasses Axelar)

### Why `testExecute` exists

- It is a **test-only helper** added to the Factory
- Allows rapid validation of Factory logic without requiring Axelar setup

### Results

- Multiple executions succeeded
- Each run:
  - Created a **CREATE2** smart wallet
  - Funded the wallet with **1 USDC**

### Example Transactions

- [Tx1](https://sepolia.etherscan.io/tx/0x7fc50d775d3c5964a96e8baab9e828ab1f82deb4c92505ce0db5897639bf6a22)
- [Tx2](https://sepolia.etherscan.io/tx/0xc894aca0d5389dd63d6006b946dc1d84ecce3bb4b3d96ff620a4e9af0499ee39)
- [Tx3](https://sepolia.etherscan.io/tx/0x63052406f4557e3f41afef23ba2d70544589144f86e782800e8dce547e1d7caa)

## Testing createAndDeposit via Axelar

### Command

```bash
yarn permit --viaAxelar
```

### What it does

- Uses an **off-chain script** to invoke **Axelar GMP**
- Sends the same `createAndDeposit` payload via an Axelar GMP contract call
- Does **not** call the Factory contract directly

### Result

- Successful `createAndDeposit` execution:
  - https://sepolia.etherscan.io/tx/0xf79bc6d31c5403d918fcba9431498aee97e7e76b134c91ff2d054a2137add718

## Testing permit deadline

### Command

```bash
yarn permit --wait
```

- The permit deadline is configured to **2 minutes** in `createAndDeposit.ts` line 365.
- When the `--wait` flag is used, execution is delayed by **2 minutes** before invoking the Factory
- This ensures the permit expires prior to the contract call
- The transaction reverted as expected with an error during execution:

```bash
$ yarn permit --wait

yarn run v1.22.22
warning ../package.json: No license field
$ vite-node agoric/createAndDeposit.ts --wait
{
  permit: {
    permitted: {
      token: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      amount: 1000000n
    },
    nonce: 1766153212854n,
    deadline: 1766153332n,
    spender: '0x9F9684d7FA7318698a0030ca16ECC4a01944836b'
  }
}
sig65 bytes: 65
sig2098 bytes: 64
USDC allowance to Permit2 (after): 1000000
invoking via directly
waiting 2min
Error: execution reverted (unknown custom error) (action="estimateGas", data="0xcd21db4f0000000000000000000000000000000000000000000000000000000069455c74", reason=null, transaction={ "data": "0x766f5a8c000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000001c0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000e00000000000000000000000008cb4b25e77844fc0632aca14f1f9b23bdd654ebf0000000000000000000000001c7d4b196cb0c7b01d743fbc6116a902379c723800000000000000000000000000000000000000000000000000000000000f42400000000000000000000000000000000000000000000000000000019b36ef53b60000000000000000000000000000000000000000000000000000000069455c740000000000000000000000000000000000000000000000000000000000000120000000000000000000000000000000000000000000000000000000000000001461676f726963313137363631353332333737343100000000000000000000000000000000000000000000000000000000000000000000000000000000000000416ac0036d36ef8525c7ca3d7676e6775c8e13c1151dd05ede889fa0c040e39537167842370fa567387156629f99f474eb9132fb746d373a626aeaf38f7ef97d641c00000000000000000000000000000000000000000000000000000000000000", "from": "0x8Cb4b25E77844fC0632aCa14f1f9B23bdd654EbF", "to": "0x9F9684d7FA7318698a0030ca16ECC4a01944836b" }, invocation=null, revert=null, code=CALL_EXCEPTION, version=6.13.4)
    at makeError (file:///home/rabi/Desktop/Agoric/agoric-to-axelar-local/integration/node_modules/ethers/src.ts/utils/errors.ts:694:21)
    at getBuiltinCallException (file:///home/rabi/Desktop/Agoric/agoric-to-axelar-local/integration/node_modules/ethers/src.ts/abi/abi-coder.ts:118:12)
    at Function.getBuiltinCallException (file:///home/rabi/Desktop/Agoric/agoric-to-axelar-local/integration/node_modules/ethers/src.ts/abi/abi-coder.ts:235:16)
    at JsonRpcProvider.getRpcError (file:///home/rabi/Desktop/Agoric/agoric-to-axelar-local/integration/node_modules/ethers/src.ts/providers/provider-jsonrpc.ts:989:32)
    at file:///home/rabi/Desktop/Agoric/agoric-to-axelar-local/integration/node_modules/ethers/src.ts/providers/provider-jsonrpc.ts:563:45
    at processTicksAndRejections (node:internal/process/task_queues:105:5) {
  code: 'CALL_EXCEPTION',
  action: 'estimateGas',
  data: '0xcd21db4f0000000000000000000000000000000000000000000000000000000069455c74',
  reason: null,
  transaction: {
    to: '0x9F9684d7FA7318698a0030ca16ECC4a01944836b',
    data: '0x766f5a8c000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000001c0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000e00000000000000000000000008cb4b25e77844fc0632aca14f1f9b23bdd654ebf0000000000000000000000001c7d4b196cb0c7b01d743fbc6116a902379c723800000000000000000000000000000000000000000000000000000000000f42400000000000000000000000000000000000000000000000000000019b36ef53b60000000000000000000000000000000000000000000000000000000069455c740000000000000000000000000000000000000000000000000000000000000120000000000000000000000000000000000000000000000000000000000000001461676f726963313137363631353332333737343100000000000000000000000000000000000000000000000000000000000000000000000000000000000000416ac0036d36ef8525c7ca3d7676e6775c8e13c1151dd05ede889fa0c040e39537167842370fa567387156629f99f474eb9132fb746d373a626aeaf38f7ef97d641c00000000000000000000000000000000000000000000000000000000000000',
    from: '0x8Cb4b25E77844fC0632aCa14f1f9B23bdd654EbF'
  },
  invocation: null,
  revert: null,
  shortMessage: 'execution reverted (unknown custom error)',
  info: {
    error: {
      code: 3,
      message: 'execution reverted',
      data: '0xcd21db4f0000000000000000000000000000000000000000000000000000000069455c74'
    },
    payload: {
      method: 'eth_estimateGas',
      params: [Array],
      id: 30,
      jsonrpc: '2.0'
    }
  }
}
error Command failed with exit code 1.
info Visit https://yarnpkg.com/en/docs/cli/run for documentation about this command.
```
