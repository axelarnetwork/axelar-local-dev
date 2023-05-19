## Usage

The following script shows a simple example of how to use this module to create two test blockchains and send some USDC from one to the other.

```typescript
import { createNetwork, relay } from "@axelar-network/axelar-local-dev";

async function main() {
  // create eth network
  const eth = await createNetwork({
    name: "Ethereum",
  });
  // deploy eth token
  await eth.deployToken("USDC", "aUSDC", 6, BigInt(100_000e6));

  // create avalanche network
  const avalanche = await createNetwork({
    name: "Avalanche",
  });
  // deploy avalanche token
  await avalanche.deployToken("USDC", "aUSDC", 6, BigInt(100_000e6));

  // extract user accounts
  const [ethUserWallet] = eth.userWallets;
  const [avalancheUserWallet] = avalanche.userWallets;

  // mint tokens on source chain
  await eth.giveToken(ethUserWallet.address, "aUSDC", BigInt(100e6));

  // extract token contracts
  const usdcEthContract = await eth.getTokenContract("aUSDC");
  const usdcAvalancheContract = await avalanche.getTokenContract("aUSDC");

  // approve gateway to use token on source chain
  const ethApproveTx = await usdcEthContract
    .connect(ethUserWallet)
    .approve(eth.gateway.address, 100e6);
  await ethApproveTx.wait();

  // ask gateway on source chain to send tokens to destination chain
  const ethGatewayTx = await eth.gateway
    .connect(ethUserWallet)
    .sendToken(avalanche.name, avalancheUserWallet.address, "aUSDC", 100e6);
  await ethGatewayTx.wait();

  // relay transactions
  await relay();

  console.log(
    (await usdcEthContract.balanceOf(ethUserWallet.address)) / 1e6,
    "aUSDC"
  );
  console.log(
    (await usdcAvalancheContract.balanceOf(avalancheUserWallet.address)) / 1e6,
    "aUSDC"
  );
}

main();
```
