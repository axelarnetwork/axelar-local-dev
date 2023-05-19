# Axelar Local Development Environment

This monorepo contains the following packages to support local cross-chain development:

- [@axelar-network/axelar-local-dev](./packages/axelar-local-dev/)
- [@axelar-network/axelar-local-dev-aptos (Optional)](./packages/axelar-local-dev-aptos/)
- [@axelar-network/axelar-local-dev-near (Optional)](./packages/axelar-local-dev-near/)

For developing cross-chain application between EVM to EVM chains, only the `axelar-local-dev` package is required.

For those who wants to test cross-chain application between EVM chains and other chain stacks, please follows the following guide:

- [EVM <-> Aptos Guide](./docs/guide_evm_aptos.md)
- [EVM <-> Near Guide](./docs/guide_evm_near.md)

## Install

```
npm install @axelar-network/axelar-local-dev
```

## Examples

See [axelar-examples repo](https://github.com/axelarnetwork/axelar-examples/) for example use of this local development environment.

## Usage

- [Basic Guide](./docs/guide_basic.md)

## API Reference

See [API Reference](./docs/api_reference.md)

## Supported Chain Stacks

- [Aptos](./packages/axelar-local-dev-aptos/)
- [Near](./packages/axelar-local-dev-near/)
