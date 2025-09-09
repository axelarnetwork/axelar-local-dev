# Agoric to Axelar Integration CLI

This CLI tool provides a command-line interface for executing cross-chain DeFi operations using Agoric's Orchestration API and Axelar's General Message Passing (GMP).

### Supported EVM Chains

The following EVM chains are supported for cross-chain operations:

- **Ethereum** - Ethereum testnet
- **Avalanche** - Avalanche testnet (Fuji)

#### Chain Selection Notes

For most testing, we prefer Avalanche due to its fast finality, making development and testing more efficient.

**However, there are important limitations to consider:**

- **CCTP (Cross-Chain Transfer Protocol) doesn't work on Avalanche.** CCTP is the mechanism through which Agoric contracts send funds to remote EVM accounts (functionality not in this repo). When CCTP testing is essential, use **Ethereum testnet**.

- **Aave Protocol on Ethereum uses different USDC** compared to Circle-issued [USDC](https://www.circle.com/usdc), which can affect testing scenarios.

- Compound is not available on Avalanche testnet.

**Note:** Testing is not perfect across all chains - some features work on certain testnets but not others. Choose your testnet based on the specific functionality you need to test.

#### USDC Requirements for Testing

For Aave/Compound testing, ensure USDC tokens are present in the remote EVM account created using the [`create-account`](#create-account) command. To get testnet USDC tokens, use the [Circle faucet](https://faucet.circle.com/).

## Prerequisites

### Deploy Factory.sol Contract

Before using the CLI, you need to deploy the [`Factory.sol`](../../packages/axelar-local-dev-cosmos/src/__tests__/contracts/Factory.sol) contract on your target EVM chain (Avalanche or Ethereum testnet):

**Important:** Use the correct contract version for your target chain:

- **Avalanche**: Use the hardcoded gas version from [PR #23](https://github.com/agoric-labs/agoric-to-axelar-local/pull/23)
- **Ethereum**: Use the hardcoded gas version from [PR #24](https://github.com/agoric-labs/agoric-to-axelar-local/pull/24)

These versions use hardcoded gas values instead of expecting the gas amount from the Agoric contract call.

1. Navigate to the contract directory:

   ```bash
   cd packages/axelar-local-dev-cosmos
   ```

2. Set up your `.env` file with the required environment variables:
   - `PRIVATE_KEY` - Private key of the account that will deploy the contract (without 0x prefix)
   - `INFURA_KEY` - (Optional) Infura API key for Ethereum networks

3. Deploy the Factory contract:

   ```bash
   # Navigate to project root first
   cd ../../

   # Deploy to Avalanche Fuji testnet
   npm run deploy -- fuji

   # Deploy to Ethereum Sepolia testnet
   npm run deploy -- sepolia
   ```

4. Copy the deployed Factory contract address from the output and set it as `FACTORY_ADDRESS` in your integration folder `.env` file.

5. **Fund the Factory contract with native tokens** - The deployed Factory contract needs native tokens (ETH for Ethereum, AVAX for Avalanche) to pay for gas when sending responses back to Agoric. This is required because the [`_send` function](../../packages/axelar-local-dev-cosmos/src/__tests__/contracts/Factory.sol#L148-L164) uses `gasService.payNativeGasForContractCall{value: gasAmount}` to pay for cross-chain gas fees.

   Send native tokens to the deployed Factory contract address to ensure it can respond to Agoric requests.

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
