/**
 * @fileoverview Main CLI entry point for Agoric to Axelar integration operations.
 * This module provides a command-line interface for executing various DeFi operations
 * across chains using Agoric's Orchestration API and Axelar's General Message Passing (GMP).
 */

import { config } from "dotenv";
import {
  createRemoteEVMAccount,
  supplyToAave,
  supplyToCompound,
  withdrawFromAave,
  withdrawFromCompound,
} from "./flows.js";
import { AxelarChain } from "./types.js";

config();

const DEFAULT_GAS_AMOUNT = 20_000_000;
const DEFAULT_TRANSFER_AMOUNT = 100_000n;
// Default value is based on https://github.com/agoric-labs/agoric-to-axelar-local/pull/23
const DEFAULT_FACTORY_ADDRESS = (process.env.FACTORY_ADDRESS ||
  "0xcD58949D815d25A06560AFa539972bB5B4B28902") as `0x${string}`;
const DEFAULT_REMOTE_ADDRESS = (process.env.REMOTE_ADDRESS ||
  "0x37859b854cc97F7bD4B69524d37EcCCEb0dbF3eb") as `0x${string}`;
const DEFAULT_DESTINATION_CHAIN = (process.env.DESTINATION_CHAIN ||
  "Avalanche") as AxelarChain;

const printUsage = () => {
  console.log(`
Usage: yarn <command> [options]

Commands:
  create-account    Create a remote EVM account
  supply-aave      Supply funds to Aave
  withdraw-aave    Withdraw funds from Aave
  supply-compound  Supply funds to Compound
  withdraw-compound Withdraw funds from Compound
  run-all          Execute all operations in sequence

Options:
  --factory-address <address>     Factory contract address (default: ${DEFAULT_FACTORY_ADDRESS})
  --remote-address <address>      Remote EVM address (default: ${DEFAULT_REMOTE_ADDRESS})
  --destination-chain <chain>     Destination chain (default: ${DEFAULT_DESTINATION_CHAIN})
  --gas-amount <amount>           Gas amount (default: ${DEFAULT_GAS_AMOUNT})
  --transfer-amount <amount>      Transfer amount (default: ${DEFAULT_TRANSFER_AMOUNT})
  --withdraw-amount <amount>      Withdraw amount (default: ${DEFAULT_TRANSFER_AMOUNT})
  --help                          Show this help message

Examples:
  yarn create-account
  yarn supply-aave -- --transfer-amount 200000
  yarn withdraw-aave -- --remote-address 0x123...abc --withdraw-amount 50000
`);
};

function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0];

  const options = {
    factoryAddress: DEFAULT_FACTORY_ADDRESS,
    remoteAddress: DEFAULT_REMOTE_ADDRESS,
    destinationChain: DEFAULT_DESTINATION_CHAIN,
    gasAmount: DEFAULT_GAS_AMOUNT,
    transferAmount: DEFAULT_TRANSFER_AMOUNT,
    withdrawAmount: DEFAULT_TRANSFER_AMOUNT,
  };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case "--factory-address":
        if (nextArg) options.factoryAddress = nextArg as `0x${string}`;
        i++;
        break;
      case "--remote-address":
        if (nextArg) options.remoteAddress = nextArg as `0x${string}`;
        i++;
        break;
      case "--destination-chain":
        if (nextArg)
          options.destinationChain =
            nextArg as typeof DEFAULT_DESTINATION_CHAIN;
        i++;
        break;
      case "--gas-amount":
        if (nextArg) options.gasAmount = parseInt(nextArg);
        i++;
        break;
      case "--transfer-amount":
        if (nextArg) options.transferAmount = BigInt(nextArg);
        i++;
        break;
      case "--withdraw-amount":
        if (nextArg) options.withdrawAmount = BigInt(nextArg);
        i++;
        break;
      case "--help":
        printUsage();
        process.exit(0);
    }
  }

  return { command, options };
}

const main = async () => {
  try {
    const { command, options } = parseArgs();

    if (!command || command === "--help") {
      printUsage();
      process.exit(1);
    }

    console.log(`Executing command: ${command}`);
    console.log("Options:", options);

    switch (command) {
      case "create-account":
        await createRemoteEVMAccount({
          factoryAddress: options.factoryAddress as `0x${string}`,
          destinationEVMChain: options.destinationChain,
          gasAmount: options.gasAmount,
        });
        break;
      case "supply-aave":
        await supplyToAave(
          {
            destinationEVMChain: options.destinationChain,
            gasAmount: options.gasAmount,
            transferAmount: options.transferAmount,
          },
          options.remoteAddress as `0x${string}`,
        );
        break;
      case "withdraw-aave":
        await withdrawFromAave(
          {
            destinationEVMChain: options.destinationChain,
            gasAmount: options.gasAmount,
            withdrawAmount: options.withdrawAmount,
          },
          options.remoteAddress as `0x${string}`,
        );
        break;
      case "supply-compound":
        await supplyToCompound(
          {
            destinationEVMChain: options.destinationChain,
            gasAmount: options.gasAmount,
            transferAmount: options.transferAmount,
          },
          options.remoteAddress as `0x${string}`,
        );
        break;

      case "withdraw-compound":
        await withdrawFromCompound(
          {
            destinationEVMChain: options.destinationChain,
            gasAmount: options.gasAmount,
            withdrawAmount: options.withdrawAmount,
          },
          options.remoteAddress as `0x${string}`,
        );
        break;
      default:
        console.error(`❌ Unknown command: ${command}`);
        printUsage();
        process.exit(1);
    }
  } catch (error) {
    console.error("❌ Error during execution:", error);
    process.exit(1);
  }
};

main();
