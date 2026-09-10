# Mainnet parity (known gaps)

Two related gaps keep this local-dev environment behind mainnet, both stemming from the same pinned Solidity stack (see "Why it isn't done yet"): the **Interchain Token Service** version, and the **AxelarGasService** on-chain gas-estimation API. Both are closed by the same cgp-6.4 / gmp-sdk-6 / ITS-2.1.1 stack bump.

## Status

This environment pins `@axelar-network/interchain-token-service@1.2.4`, which predates the ITS Hub.
Axelar mainnet EVM chains run **ITS 2.1.1** — the ITS **Hub** architecture — deployed at the same address (`0xB5FB4BE02232B1bBA4dC8f81dc24C26980dE9e3C`) on every EVM chain.

So the ITS API surface and the cross-chain routing model in this test environment do **not** match mainnet.
Code written against local-dev's ITS (see [guide_basic.md](./guide_basic.md)) may not behave the same on mainnet, and vice-versa.
This is a deliberate, documented gap — mirroring 2.1.1 is a sizeable migration, not a version bump (see below).

## Why it isn't done yet

ITS v2 is **Hub-routed**: the real v2 contracts only accept cross-chain messages that were wrapped by the ITS Hub (a Cosmos contract on the Axelar chain).
A local, EVM-only simulator cannot use the real Hub, so the relayer has to **emulate** it.
That, combined with breaking API changes across gmp-sdk v6 / cgp v6 / ITS v2, makes this a multi-subsystem migration.

## What mirroring 2.1.1 requires

Target dependency set: `interchain-token-service@2.1.1`, `axelar-gmp-sdk-solidity@6.0.4`, `axelar-cgp-solidity@6.4.0`.

1. **Port core Solidity** — `src/contracts/GMP.sol` and the test contracts (`Executable*.sol`, `ExpressWithToken.sol`) — to gmp-sdk v6, which reorganized the executables (`AxelarExecutable` split into with/without-token; `express/AxelarExpressExecutable.sol` was removed in favour of `AxelarExpressExecutableWithToken`).
2. **Rework ITS deployment** in `src/Network.ts` (`deployInterchainTokenService`): the v2 `InterchainTokenService` constructor adds an `itsHubAddress` argument, and the proxy/trusted-chain setup changed.
3. **Update `src/its.ts`** — `setupITS`/`registerRemoteITS` must use `setTrustedChain` (and register the emulated hub) instead of `setTrustedAddress`, and the `deployRemoteInterchainToken` helper signature changed in v2 to `(salt, destinationChain, gasValue)`.
4. **Emulate the ITS Hub in `src/relay/EvmRelayer.ts`** — the novel, substantial piece. Intercept a `ContractCall` addressed to chain `'axelar'` / the hub address, decode the `MESSAGE_TYPE_SEND_TO_HUB` envelope (`destinationChain`, innerPayload), re-encode it as `MESSAGE_TYPE_RECEIVE_FROM_HUB` (`sourceChain`, innerPayload), and deliver it to the destination chain's ITS with source `('axelar', hubAddress)`. Without this, v2 ITS reverts (`InvalidMessageType`) on every inbound cross-chain message.
5. Make [guide_basic.md](./guide_basic.md) and `src/__tests__/its.spec.ts` pass under the Hub model.

## Proposed design decisions

- Emulate the Hub inside `EvmRelayer` (simplest), rather than standing up a separate mock-hub "chain".
- Keep local-dev's legacy multisig gateway — ITS only needs the gateway *interface*, so this is sufficient and avoids also migrating to the Amplifier gateway mainnet uses (a much larger change not required for ITS fidelity).

## Starting point

A WIP scaffold exists on the local branch **`its-v2-mainnet`**: dependencies are bumped to the 2.1.1 set, but the build is intentionally broken because the porting above has not been started.

## Effort

Large — comparable to, or bigger than, the ganache→anvil + pnpm migration. Not a quick follow-up.

## AxelarGasService: on-chain gas estimation

Local-dev deploys the gas service from cgp-solidity **6.2.1** (pinned by the ITS-1.2.4 stack above), which implements **none** of `estimateGasFee`, `payGas`, or `updateGasInfo`.
Axelar **mainnet** runs a newer gas service (cgp ~6.4.0) that **does** — verified against the deployed Ethereum implementation `0xcb5C784DCf8FF342625DbC53B356ed0Cbb0EBB9b`, whose bytecode contains both selectors (`estimateGasFee` `0x135eaa70`, `payGas` `0xedf936f2`).

Consequence: examples that exercise on-chain gas estimation cannot run against local-dev. The axelar-examples `call-contract-gas-estimation` example is therefore **excluded from the local EVM test roster** (see the comment in `examples/tests/evm.test.js`); the other examples use the off-chain SDK fee path (`AxelarQueryAPI.estimateGasFee`), which works.

Closing this gap = deploying the cgp-6.4.0 gas service **and** seeding gas info via `updateGasInfo(chains, GasInfo[])` so `estimateGasFee` returns a non-zero fee. cgp 6.4.0 requires gmp-sdk 6.x, so this is the **same stack bump** as the ITS 2.1.1 upgrade above — do them together.
