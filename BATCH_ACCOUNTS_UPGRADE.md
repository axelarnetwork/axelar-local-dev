# Factory Contract Upgrade for Batch Account Creation

## Overview

This document describes the changes needed to the Factory.sol contract to support batch account creation for the Agoric portfolio contract's accounts manager.

## Current Implementation Issues

The current Factory contract (lines 136-158) has these limitations:

1. **Single account only**: Always creates exactly 1 account per request
2. **Hardcoded behavior**: No way to specify how many accounts to create
3. **Single response**: Returns only 1 address in the response array
4. **Inefficient**: Requires N separate GMP calls for N accounts (each taking 15-30 minutes)

## Required Changes

### 1. New Request Payload Structure

**Current (Legacy)**:
```solidity
uint256 gasAmount = abi.decode(payload, (uint256));
// Creates 1 account, gasAmount used for return message
```

**New (Batch Support)**:
```solidity
struct AccountCreationRequest {
    uint256 count;      // Number of accounts to create (1-N)
    uint256 gasAmount;  // Gas for return message
}

AccountCreationRequest memory req = abi.decode(payload, (AccountCreationRequest));
// Creates req.count accounts
```

### 2. Backward Compatibility

The new implementation uses try/catch to support both formats:

```solidity
try this.decodeAccountCreationRequest(payload) returns (
    uint256 _count,
    uint256 _gasAmount
) {
    count = _count;
    gasAmount = _gasAmount;
} catch {
    // Fall back to legacy format
    gasAmount = abi.decode(payload, (uint256));
    count = 1;
}
```

**Benefits**:
- Existing portfolio contracts continue to work
- No breaking changes for deployed code
- Gradual migration path

### 3. Batch Account Creation Loop

**Old Code** (line 142):
```solidity
address smartWalletAddress = _createSmartWallet(sourceAddress);
```

**New Code** (lines 175-187):
```solidity
CallResult[] memory results = new CallResult[](count);

for (uint256 i = 0; i < count; i++) {
    address smartWalletAddress = _createSmartWallet(sourceAddress);

    emit SmartWalletCreated(
        smartWalletAddress,
        sourceAddress,
        sourceChain,
        sourceAddress
    );

    results[i] = CallResult(true, abi.encode(smartWalletAddress));
}
```

**Changes**:
- Dynamic `results` array sized to `count`
- Loop creates multiple wallets in single transaction
- Each wallet address stored in results array
- Individual events emitted for each wallet
- Additional batch event if count > 1

### 4. Multiple Addresses in Response

**Old Response** (line 149):
```solidity
CallResult[] memory results = new CallResult[](1);
results[0] = CallResult(true, abi.encode(smartWalletAddress));
```

**New Response** (lines 175, 187):
```solidity
CallResult[] memory results = new CallResult[](count);
// ... loop fills results[0] through results[count-1] ...
```

**Impact**:
- Response payload now contains multiple addresses
- Agoric-side must iterate through results array
- Each result still has same structure (success + encoded address)

### 5. New Event for Batch Creation

```solidity
event BatchSmartWalletsCreated(
    uint256 count,
    string owner,
    string sourceChain,
    string sourceAddress
);
```

Emitted when `count > 1` to distinguish batch from single creation.

## Agoric-Side Changes Needed

### Update Payload Encoding

**In `pos-gmp.flows.ts`, update `sendMakeAccountCall`**:

```typescript
// Current payload encoding:
const payload = buildGasPayload(evmGas);

// New payload encoding for batch:
const payload = encodeAccountCreationRequest(count, evmGas);

// Helper function to add:
function encodeAccountCreationRequest(count: number, gasAmount: bigint) {
  if (count === 1) {
    // Use legacy format for single account (backward compat)
    return buildGasPayload(gasAmount);
  } else {
    // Use new struct format for batch
    // ABI encoding of struct AccountCreationRequest { count, gasAmount }
    return ethers.utils.defaultAbiCoder.encode(
      ['tuple(uint256,uint256)'],
      [[count, gasAmount]]
    );
  }
}
```

### Update Response Handling

**In `portfolio.exo.ts` parseInboundTransferWatcher**:

Currently expects single address (line 375):
```typescript
const [address] = decodeAbiParameters([{ type: 'address' }], result2);
```

Update to handle multiple addresses:
```typescript
// The response is CallResult[] where each CallResult.result contains an address
const addresses = data.map(callResult => {
  const [address] = decodeAbiParameters([{ type: 'address' }], callResult.result);
  return address;
});

// Process each address
for (const address of addresses) {
  const accountInfo: GMPAccountInfo = {
    namespace: 'eip155',
    chainName,
    chainId: caipId,
    remoteAddress: address,
  };

  // Route to accounts manager (existing logic)
  if (accountsManager && !isReservedByPortfolio) {
    accountsManager.addAccountToPool(chainName, accountInfo);
  } else {
    this.facets.manager.resolveAccount(accountInfo);
  }
}
```

## Gas Considerations

### Cost Comparison

**Current (5 individual requests)**:
- 5 separate GMP calls × (gas per call)
- 5 × 15-30 minutes waiting time
- Higher total gas due to repeated overhead

**New (1 batch request)**:
- 1 GMP call with loop overhead
- 1 × 15-30 minutes waiting time
- Lower total gas (shared GMP overhead)

### Estimated Gas Usage

```
Single Account Creation:
- Wallet deployment: ~500,000 gas
- GMP overhead: ~100,000 gas
- Total: ~600,000 gas per account

Batch 5 Accounts:
- 5 × Wallet deployment: ~2,500,000 gas
- GMP overhead (once): ~100,000 gas
- Loop overhead: ~10,000 gas
- Total: ~2,610,000 gas for 5 accounts
- Savings: 390,000 gas vs 5 individual calls
```

## Deployment Steps

### 1. Test New Factory Contract

```bash
# Compile
cd packages/axelar-local-dev-cosmos
forge build

# Test with single account (legacy)
# Should still work with old payload format

# Test with batch
# Should create multiple accounts from new payload format
```

### 2. Update Agoric Contract

```bash
# Deploy updated portfolio contract with:
# - Updated sendMakeAccountCall with new payload encoding
# - Updated GMP callback to handle multiple addresses
```

### 3. Verify Integration

```bash
# 1. Create single account (backward compat test)
# 2. Create batch of 5 accounts
# 3. Verify all 5 addresses returned in single GMP response
# 4. Verify accounts manager receives all 5 accounts
```

## Migration Path

### Phase 1: Deploy New Factory
- Deploy updated Factory.sol to testnet
- Verify backward compatibility with existing portfolios
- Existing single-account requests still work

### Phase 2: Update Agoric Contract
- Deploy updated portfolio contract
- Accounts manager starts using batch creation
- Falls back to individual creation if needed

### Phase 3: Monitor & Optimize
- Monitor gas usage vs old approach
- Adjust ACCOUNTS_TO_CREATE constant based on:
  - Gas costs
  - Pool depletion rates
  - User demand patterns

## Rollback Plan

If issues arise:

1. **Factory Issues**: Redeploy old Factory.sol
   - All requests fall back to single account creation
   - Accounts manager still works (sends 5 individual requests)

2. **Agoric Issues**: Revert portfolio contract
   - Disable accounts manager in context
   - Use direct account creation (provideEVMAccount)

3. **Both**: Complete rollback
   - Old factory + old portfolio
   - System works as before, just slower

## Success Metrics

Track these metrics to verify improvement:

1. **Account Creation Time**
   - Before: 5 accounts × 20 min avg = 100 minutes
   - After: 1 batch × 20 min avg = 20 minutes
   - Target: 80% reduction in total time

2. **Gas Costs**
   - Before: 5 × 600k = 3,000,000 gas
   - After: 1 × 2,610,000 gas
   - Target: 13% gas savings

3. **User Experience**
   - Before: Wait 15-30 min for account
   - After: Instant (from pool)
   - Target: <1 second for 95% of requests

4. **Pool Health**
   - Monitor: availableAccounts per chain
   - Target: Always ≥3 accounts available
   - Alert: If pool drops to 0

## Code Changes Summary

### Files Modified

1. **Factory.sol** (NEW version provided)
   - Add `AccountCreationRequest` struct
   - Update `_execute` to support batch creation
   - Add backward compatibility logic
   - Add `BatchSmartWalletsCreated` event
   - Add `decodeAccountCreationRequest` helper

2. **pos-gmp.flows.ts** (TODO)
   - Update `buildGasPayload` or add `encodeAccountCreationRequest`
   - Modify `sendMakeAccountCall` to use new encoding when count > 1

3. **portfolio.exo.ts** (TODO)
   - Update `parseInboundTransferWatcher.onFulfilled`
   - Handle array of addresses instead of single address
   - Loop through addresses and route each to accounts manager

## Testing Checklist

- [ ] Factory compiles without errors
- [ ] Factory accepts legacy uint256 payload (single account)
- [ ] Factory accepts new struct payload (batch accounts)
- [ ] Single account creation emits SmartWalletCreated event
- [ ] Batch creation emits BatchSmartWalletsCreated event
- [ ] Response contains correct number of addresses
- [ ] All created addresses are valid and functional
- [ ] Agoric callback receives all addresses
- [ ] Accounts manager populates pool correctly
- [ ] Pool auto-replenishment works
- [ ] Gas usage is within expected range

## Additional Notes

### Security Considerations

1. **Gas Limits**: Large batch sizes could hit block gas limits
   - Recommend max batch size of 10 accounts
   - Current ACCOUNTS_TO_CREATE = 5 is safe

2. **Denial of Service**: Malicious requests with huge count
   - Consider adding `require(count <= MAX_BATCH_SIZE)`
   - Suggested MAX_BATCH_SIZE = 10

3. **Address Verification**: Ensure all addresses are unique
   - Factory CREATE2 ensures uniqueness by default
   - No additional checks needed

### Performance Optimizations

1. **Parallel Processing**: EVM naturally parallelizes CREATE operations
2. **Memory Efficiency**: Pre-allocate results array (already done)
3. **Event Batching**: Consider single event with address array for fewer logs

### Future Enhancements

1. **Named Batches**: Include correlation ID in payload
2. **Partial Success**: Return addresses even if some creations fail
3. **Refund Logic**: Return unused gas if count < requested
4. **Access Control**: Whitelist of allowed source addresses

---

## Quick Reference: What Changed

| Aspect | Old | New |
|--------|-----|-----|
| Payload | `uint256 gasAmount` | `struct { count, gasAmount }` |
| Accounts Created | Always 1 | 1 to N (configurable) |
| Response Size | 1 address | N addresses |
| GMP Calls Needed | N (for N accounts) | 1 (for N accounts) |
| Time for 5 Accounts | ~100 minutes | ~20 minutes |
| Gas for 5 Accounts | ~3,000,000 | ~2,610,000 |
| User Wait Time | 15-30 minutes | <1 second (from pool) |

---

**Implementation Status**: ✅ Agoric-side complete, ⏳ Factory.sol update needed
