import "@nomicfoundation/hardhat-toolbox";
import { config as envConfig } from "dotenv";
import { HardhatUserConfig } from "hardhat/config";

envConfig();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      evmVersion: process.env.EVM_VERSION || "london",
      optimizer: {
        enabled: true,
        runs: 1000,
        details: {
          peephole: true,
          inliner: true,
          jumpdestRemover: true,
          orderLiterals: true,
          deduplicate: true,
          cse: true,
          constantOptimizer: true,
          yul: true,
          yulDetails: {
            stackAllocation: true,
          },
        },
      },
    },
  },
  paths: {
    sources: "./src/__tests__/contracts",
  },
  mocha: {
    timeout: 200000,
  },
};

export default config;
