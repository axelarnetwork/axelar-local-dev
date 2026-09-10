# Axelar Local Cross-Chain Dev Environment

Welcome to the Axelar Local Development Environment! This monorepo contains essential packages to facilitate local cross-chain development:

- **Core Package**: [@axelar-network/axelar-local-dev](./packages/axelar-local-dev/)
- **Optional Packages**:
  - [@axelar-network/axelar-local-dev-cosmos](./packages/axelar-local-dev-cosmos/)
  - [@axelar-network/axelar-local-dev-sui](./packages/axelar-local-dev-sui/) (workspace-only for now, not yet published)

The `axelar-local-dev` package is all you need for cross-chain applications between EVM chains. However, if you wish to explore cross-chain applications between EVM chains and other chain stacks, check out our specific guides:

- [Evm <-> Cosmos Integration Guide](./packages/axelar-local-dev-cosmos/README.md)
- [Evm <-> Sui Integration Guide](./packages/axelar-local-dev-sui/README.md)

## Prerequisites

- This project is developed with Ethers.js version 5. Please note that it may not function correctly if you are using Ethers.js version 6 or later. It is recommended to use version 5 to ensure compatibility and proper operation of the project.
- Local chains are backed by [Foundry](https://book.getfoundry.sh/)'s `anvil`, which the library spawns as a child process. Install Foundry and make sure `anvil` is on your `PATH`:

  ```bash
  curl -L https://foundry.paradigm.xyz | bash && foundryup
  ```

- Contributing to this monorepo uses the Node version in [`.nvmrc`](./.nvmrc) and [pnpm](https://pnpm.io/) (enable it with `corepack enable`). Install workspace dependencies with `pnpm install`.

## Installation

To install the core package, use the following command:

```bash
npm install @axelar-network/axelar-local-dev
```

## Practical Examples

Visit our [axelar-examples repo](https://github.com/axelarnetwork/axelar-examples/) repository to see practical applications of this local development environment.

## Usage & Documentation

- [Executing Cross-Chain Transactions Guide](./docs/guide_basic.md)
- [Setting Up a Standalone Cross-Chain Environment](./docs/guide_create_and_exports.md)
- [API Reference](./docs/api_reference.md)

## Known limitations

Local-dev lags mainnet on the Axelar Solidity stack — see [mainnet parity gaps](./docs/its-mainnet-parity.md). In short:

- **Interchain Token Service:** local-dev uses ITS `1.2.4`; mainnet runs ITS `2.1.1` (the ITS Hub architecture), so the ITS API and cross-chain routing differ from mainnet.
- **AxelarGasService:** local-dev's gas service (cgp `6.2.1`) has no on-chain `estimateGasFee`/`payGas`; mainnet's (cgp ~`6.4.0`) does — so on-chain gas-estimation examples can't run locally.

Both are closed by the same cgp-6.4 / gmp-sdk-6 / ITS-2.1.1 stack bump.

## Supported Chain Stacks

We currently support the following chain stacks:

- [EVM](./packages/axelar-local-dev/)
- [Cosmos](./packages/axelar-local-dev-cosmos/)
- [Sui](./packages/axelar-local-dev-sui/)
