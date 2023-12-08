# Axelar Local Cross-Chain Dev Environment

Welcome to the Axelar Local Development Environment! This monorepo contains essential packages to facilitate local cross-chain development:

- **Core Package**: [@axelar-network/axelar-local-dev](./packages/axelar-local-dev/)
- **Optional Packages**:
  - [@axelar-network/axelar-local-dev-aptos](./packages/axelar-local-dev-aptos/)
  - [@axelar-network/axelar-local-dev-near](./packages/axelar-local-dev-near/)
  - [@axelar-network/axelar-local-dev-sui](./packages/axelar-local-dev-sui/)

The `axelar-local-dev` package is all you need for cross-chain applications between EVM chains. However, if you wish to explore cross-chain applications between EVM chains and other chain stacks, check out our specific guides:

- [EVM <-> Aptos Integration Guide](./packages/axelar-local-dev-aptos/README.md#configuration)
- [EVM <-> Near Integration Guide](./packages/axelar-local-dev-near/README.md#configuration)
- [Evm <-> Sui Integration Guide](./packages/axelar-local-dev-sui/README.md)\

## Prerequisites

- This project is developed with Ethers.js version 5. Please note that it may not function correctly if you are using Ethers.js version 6 or later. It is recommended to use version 5 to ensure compatibility and proper operation of the project.

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

## Supported Chain Stacks

We currently support the following chain stacks:

- [EVM](./packages/axelar-local-dev/)
- [Aptos](./packages/axelar-local-dev-aptos/)
- [Near](./packages/axelar-local-dev-near/)
- [Sui](./packages/axelar-local-dev-sui/)
