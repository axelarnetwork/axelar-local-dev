# Agoric to Axelar Integration CLI

This CLI tool provides a command-line interface for executing cross-chain DeFi operations using Agoric's Orchestration API and Axelar's General Message Passing (GMP).

## Overview

The `main.ts` file serves as the entry point for various cross-chain operations including:

- Creating remote EVM accounts
- Supplying/withdrawing funds to/from Aave
- Supplying/withdrawing funds to/from Compound

### Supported EVM Chains

The following EVM chains are supported for cross-chain operations:

- **Ethereum** - Ethereum testnet
- **Avalanche** - Avalanche testnet (Fuji)

## Configuration

### Environment Variables

The following environment variables can be set in a `.env` file:

- `MNEMONIC` - **Required** - 24 word mnemonic phrase for the Agoric wallet used to sign GMP (General Message Passing) transactions. You can get one from the [Keplr extension](https://chromewebstore.google.com/detail/keplr/dmkamcknogkgcdfhhbddcghachkejeap?hl=en&pli=1). Use the [Agoric testnet faucet](https://devnet.explorer.agoric.net/agoric/faucet) to get testnet BLD tokens. BLD is required to pay for gas fees, and a default amount of 20 BLD is hardcoded in the code which is sufficient for Agoric to EVM chain transactions.
- `FACTORY_ADDRESS` - Factory contract address (default: `0x726cAF5f0BA64AF97337c6Db80F5d26Aa9DEAE75`)
- `REMOTE_ADDRESS` - Remote EVM address (default: `0x84f600b91AFFf07Be1c033dE21007Bc092CC096e`)
- `DESTINATION_CHAIN` - Destination chain name (default: `Avalanche`)

### Default Constants

- **Gas Amount**: 20,000,000 ubld - Gas amount allocated for Agoric to Axelar IBC (Inter-Blockchain Communication) transfers. This covers the computational cost of cross-chain message passing and execution on the destination chain. Denominated in ubld (micro BLD tokens).
- **Transfer Amount**: 100,000 uusdc - Default amount for DeFi operations:
  - For supply operations: Amount to deposit into Aave/Compound protocols
  - For withdraw operations: Amount to withdraw from Aave/Compound protocols to the remote EVM account (not back to the Agoric wallet)
  - Denominated in uusdc (micro USDC tokens)

## Available Commands

### create-account

Creates a remote EVM account on the destination chain.

```bash
yarn create-account [options]
```

### supply-aave

Supplies funds to Aave protocol on the destination chain.

```bash
yarn supply-aave [options]
```

### withdraw-aave

Withdraws funds from Aave protocol.

```bash
yarn withdraw-aave [options]
```

### supply-compound

Supplies funds to Compound protocol on the destination chain.

```bash
yarn supply-compound [options]
```

### withdraw-compound

Withdraws funds from Compound protocol.

```bash
yarn withdraw-compound [options]
```

## Command Line Options

All commands support the following options:

- `--factory-address <address>` - Factory contract address
- `--remote-address <address>` - Remote EVM address
- `--destination-chain <chain>` - Destination chain name
- `--gas-amount <amount>` - Gas amount for transactions
- `--transfer-amount <amount>` - Amount to transfer (for supply operations)
- `--withdraw-amount <amount>` - Amount to withdraw (for withdraw operations)
- `--help` - Show help message

## Usage Examples

```bash
# Create account with default settings
yarn create-account

# Supply to Aave with custom transfer amount
yarn supply-aave -- --transfer-amount 200000

# Withdraw from Aave with custom address and amount
yarn withdraw-aave -- --remote-address 0x123...abc --withdraw-amount 50000

# Supply to Compound on different chain
yarn supply-compound -- --destination-chain Ethereum --transfer-amount 150000
```

## Architecture

### Flow Functions (imported from ./flows.js)

- `createRemoteEVMAccount()` - Creates remote EVM accounts
- `supplyToAave()` - Handles Aave supply operations
- `withdrawFromAave()` - Handles Aave withdraw operations
- `supplyToCompound()` - Handles Compound supply operations
- `withdrawFromCompound()` - Handles Compound withdraw operations
