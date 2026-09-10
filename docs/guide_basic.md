## Executing Cross-chain Transactions Guide

The script below demonstrates a simple use-case of this module.
It shows how to create two test blockchains and move tokens between them using the Interchain Token Service (ITS), which is the recommended way to transfer tokens across chains.

> Note: this environment currently uses ITS `1.2.4`, whereas Axelar mainnet runs ITS `2.1.1` (the ITS Hub architecture), so the ITS API and routing shown here differ from mainnet. See [its-mainnet-parity.md](./its-mainnet-parity.md).

```typescript
import {
  createNetwork,
  relay,
  registerRemoteITS,
} from "@axelar-network/axelar-local-dev";
import {
  keccak256,
  toUtf8Bytes,
  parseEther,
  formatEther,
} from "ethers/lib/utils";

async function main() {
  // Initialize an Ethereum network
  const ethereum = await createNetwork({
    name: "Ethereum",
  });

  // Initialize an Avalanche network
  const avalanche = await createNetwork({
    name: "Avalanche",
  });

  // Let each chain's Interchain Token Service trust the other's, so ITS
  // messages can be routed between them.
  await registerRemoteITS([ethereum, avalanche]);

  // Extract user wallets for both Ethereum and Avalanche networks
  const [ethUserWallet] = ethereum.userWallets;
  const [avalancheUserWallet] = avalanche.userWallets;

  // Deploy a new Interchain Token on Ethereum and mint the initial supply to
  // the Ethereum user. The salt determines the token's cross-chain id.
  const salt = keccak256(toUtf8Bytes("my-interchain-token"));
  const ethToken = await ethereum.its.deployInterchainToken(
    ethUserWallet,
    salt,
    "My Interchain Token",
    "MIT",
    18,
    parseEther("1000"), // initial supply
    ethUserWallet.address // token minter
  );

  // Deploy the same token on Avalanche (this shares the same token id and
  // relays the deployment cross-chain).
  const avalancheToken = await ethereum.its.deployRemoteInterchainToken(
    ethUserWallet,
    salt,
    ethUserWallet.address,
    avalanche,
    parseEther("1") // cross-chain gas
  );

  // Transfer 100 tokens from the Ethereum user to the Avalanche user. The
  // native value pays for cross-chain gas.
  //
  // NOTE: the recipient is passed as raw `bytes` and MUST be encoded in the
  // destination chain's own address format. Both chains here are EVM, so the
  // 20-byte `0x...` address can be passed directly. For a non-EVM destination
  // (e.g. XRPL, Sui, Stellar, or a Cosmos chain) you must encode the recipient
  // in that chain's format instead — an EVM `0x` address would be wrong.
  await ethToken
    .connect(ethUserWallet)
    .interchainTransfer(
      avalanche.name,
      avalancheUserWallet.address,
      parseEther("100"),
      "0x",
      { value: parseEther("1") }
    )
    .then((tx) => tx.wait());

  // Relay the transaction
  await relay();

  // Log the token balances
  console.log(
    formatEther(await ethToken.balanceOf(ethUserWallet.address)),
    "MIT in Ethereum wallet"
  );
  console.log(
    formatEther(await avalancheToken.balanceOf(avalancheUserWallet.address)),
    "MIT in Avalanche wallet"
  );
}

main();
```
