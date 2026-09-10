# @axelar-network/axelar-local-dev-sui

A local Axelar deployment on a Sui network, so cross-chain examples can send messages between Sui and the EVM chains that `@axelar-network/axelar-local-dev` provides.

## Prerequisites

The `sui` CLI must be on `PATH`, at exactly the version `axelar-cgp-sui` pins in its `version.json`.
Publishing compiles through `sui move build`, and other versions fail during Move dependency resolution with an error that names an unrelated object id, so `SuiNetwork.init` checks the version up front and refuses to continue on a mismatch.

Install the pinned release from the [Sui releases page](https://github.com/MystenLabs/sui/releases) and, if you already have a different version, put the pinned one first on `PATH` rather than replacing it.

## Running

Start a local Sui network in one terminal:

```bash
pnpm run start:sui
```

That runs `sui start --with-faucet --force-regenesis`, which resets local Sui network state under `~/.sui`.
It is a script rather than something `initSui` does, precisely so that reset is something you ask for.

Then publish the framework and get a relayer:

```ts
import { initSui } from '@axelar-network/axelar-local-dev-sui';
import { EvmRelayer, RelayerType } from '@axelar-network/axelar-local-dev';

const { suiNetwork, suiRelayer } = await initSui();

const evmRelayer = new EvmRelayer();
evmRelayer.setRelayer(RelayerType.Sui, suiRelayer);
```

`initSui` publishes six Move packages in dependency order, calls `gateway::setup` with a generated weighted signer set, publishes a sample GMP app and registers its relayer-discovery transaction.
It takes roughly 30 seconds.

## Sending to Sui

The destination address for a message into Sui is the receiving package's **Channel object address**, not its package id.
`suiNetwork.sample.channelAddress` is the sample app's.

```solidity
executable.set('sui', 'hello', { value: 1e16 });   // destinationChain is lowercase 'sui'
```

Two things that are easy to get wrong and produce no error:

- A destination package must register a discovery transaction, or the relayer cannot work out how to deliver to it and the message is simply never executed.
- The destination chain name must be lowercase `sui`.

## Across processes

`SuiNetwork.getDeployment()` returns everything a second process needs, and `SuiNetwork.fromDeployment()` rebuilds a handle from it without republishing.
This is what a harness that runs start, deploy and execute as separate processes needs.
The blob is JSON-safe: signer public keys are hex, because a `Uint8Array` comes back from JSON as a plain object and the BCS encoder then rejects it.

## Testing

```bash
pnpm run test:sui        # bring-up and relay tests, no EVM chain needed
pnpm run test-e2e:sui    # the full round trip against anvil, local only
```

Both need a local Sui network running.
The e2e is excluded from CI: the EVM to Sui direction is already covered without anvil, and the remaining Sui to EVM leg is not worth a second runtime's start-up cost per PR.

## Scope

This is a local development harness and it does not correspond to anything you can run against testnet.
It publishes its own gateway and holds the signer keys, so it can sign proofs; on testnet the gateway is Axelar's and the real verifier set signs.
The same is true of the EVM side of `axelar-local-dev`.

What does carry over to testnet is application code: the Move module's use of `Channel`, `register_transaction`, `consume_approved_message`, and `prepare_message` plus `gas_service::pay_gas` and `send_message`.
Those are the same APIs deployed on Sui testnet and mainnet.
