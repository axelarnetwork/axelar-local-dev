## Axelar Local Dev: MultiversX Integration

This package allows you to create a local development environment for cross-chain communication using the [MultiversX](https://multiversx.com/) protocol.

WIP

## Installation

To install this package, use the following command:

```bash
npm install @axelar-network/axelar-local-dev-multiversx
```

## Prerequisite

Before getting started, you'll need to install a MultiversX localnet on your local machine.

1. **Install Mxpy CLI Tool**

Download from here: https://docs.multiversx.com/sdk-and-tools/sdk-py/installing-mxpy#install-using-mxpy-up-recommended

_Note: Our examples are tested on Mxpy version `7.3.0`._

2. **Create a MultiversX Localnet**

More info: https://docs.multiversx.com/developers/setup-local-testnet

```bash
mkdir -p .multiversx && cd .multiversx
mxpy localnet setup
mxpy localnet start
```

## Configuration
