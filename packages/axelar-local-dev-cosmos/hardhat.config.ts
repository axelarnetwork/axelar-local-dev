import "@nomicfoundation/hardhat-toolbox";
import { config as envConfig } from "dotenv";
import { HardhatUserConfig } from "hardhat/config";

envConfig();

const { PRIVATE_KEY } = process.env;

const testnets = {
  fuji: {
    url: "https://api.avax-test.network/ext/bc/C/rpc",
    gasPrice: 225000000000,
    chainId: 43113,
    accounts: [`0x${PRIVATE_KEY}`],
  },
  base: {
    url: "https://sepolia.base.org/",
    gasPrice: 225000000000,
    chainId: 84532,
    accounts: [`0x${PRIVATE_KEY}`],
  },
};

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 10000,
            details: {
              yul: true,
            },
          },
        },
      },
      {
        version: "0.8.9",
        settings: {
          optimizer: {
            enabled: true,
            runs: 10000,
            details: {
              yul: true,
            },
          },
        },
      },
    ],
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    ...(PRIVATE_KEY ? testnets : {}),
  },
  paths: {
    sources: "./src/__tests__/contracts",
  },
  mocha: {
    timeout: 200000,
  },
};

export default config;
