import "@nomicfoundation/hardhat-toolbox";
import { config as envConfig } from "dotenv";
import { HardhatUserConfig } from "hardhat/config";

envConfig();

const { INFURA_KEY, PRIVATE_KEY } = process.env;

const testnets = {
  fuji: {
    url: "https://api.avax-test.network/ext/bc/C/rpc",
    gasPrice: 225000000000,
    chainId: 43113,
    accounts: [`0x${PRIVATE_KEY}`],
  },
  sepolia: {
    url: "https://ethereum-sepolia-rpc.publicnode.com",
    gasPrice: 20000000000, // 20 Gwei
    chainId: 11155111,
    accounts: [`0x${PRIVATE_KEY}`],
  },
};

const mainnets = {
  arb: {
    // Source: https://docs.arbitrum.io/build-decentralized-apps/reference/node-providers
    url: "https://arb1.arbitrum.io/rpc",
    chainId: 42161,
    accounts: [PRIVATE_KEY as string],
  },
  avax: {
    // Source: https://build.avax.network/docs/tooling/rpc-providers#http
    url: "https://api.avax.network/ext/bc/C/rpc",
    chainId: 43114,
    accounts: [PRIVATE_KEY as string],
    gasPrice: 225_000_000_000, // 225 gwei in wei
  },
  eth: {
    url: `https://mainnet.infura.io/v3/${INFURA_KEY}`,
    chainId: 1,
    accounts: [PRIVATE_KEY as string],
  },
  // Source: https://docs.optimism.io/superchain/networks
  opt: {
    url: `https://mainnet.optimism.io`,
    chainId: 10,
    accounts: [PRIVATE_KEY as string],
  },
  // Source: https://docs.polygon.technology/pos/reference/rpc-endpoints/#amoy
  pol: {
    url: `https://polygon-rpc.com/`,
    chainId: 137,
    accounts: [PRIVATE_KEY as string],
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
    ...(PRIVATE_KEY ? mainnets : {}),
  },
  paths: {
    sources: "./src/__tests__/contracts",
  },
  mocha: {
    timeout: 200000,
  },
};

export default config;
