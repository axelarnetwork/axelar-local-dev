## Commands

Navigate to `integration` folder to invoke these commands:

### Run via direct Factory call (no Axelar)

```bash
yarn permit
```

- Creates a Permit2 SignatureTransfer permit
- Approves USDC for the Permit2 contract
- Invokes `Factory.testExecute(bytes)` directly on Ethereum Sepolia
- Intended for fast testnet validation without Axelar

### Run via Axelar GMP

```bash
yarn permit --viaAxelar

```

- Uses an off-chain script to invoke Axelar GMP
- Sends the `createAndDeposit` payload from Agoric to Ethereum via Axelar
- Requires a funded Agoric account to pay Axelar gas

### Test permit expiry

```bash
yarn permit --wait

```

- Delays execution by 2 minutes before invoking the Factory
- Used to verify that expired Permit2 signatures are correctly rejected
- Works with the direct Factory invocation path

## Environment Variables

The following environment variables must be defined in the .env file located in the integration directory to run the script successfully:

### `PRIVATE_KEY` (required)

- **Description:**  
  Ethereum EOA private key used to:
  - Sign the Permit2 EIP-712 message
  - Approve USDC for the Permit2 contract
  - Invoke the Factory contract (direct mode)

- **Network:**  
  Ethereum Sepolia

- **Requirements:**
  - Must hold sufficient **ETH** for gas on Sepolia
  - Must hold sufficient **USDC** for the transfer amount
  - Must be the token owner signing the Permit2 permit

### `MNEMONIC` (required for Axelar GMP)

**Description:**  
Mnemonic for the **Agoric wallet** used to:

- Send the IBC transfer to Axelar
- Pay **BLD** for Axelar gas
- Trigger the Axelar GMP execution flow

**Network:**  
Agoric Devnet

**Requirements:**

- Agoric account with sufficient **BLD**
- Only required when running with `--viaAxelar`
