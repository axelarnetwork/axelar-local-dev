// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./MockERC20.sol";

/**
 * @notice Mock Permit2 implementation for testing
 * @dev Matches the actual Uniswap Permit2 SignatureTransfer implementation
 * but with simplified signature verification for testing purposes.
 *
 * Reference: https://github.com/Uniswap/permit2/blob/main/src/SignatureTransfer.sol
 *
 * Key differences from real Permit2:
 * 1. Signature Verification: Real Permit2 validates EIP-712 signatures using:
 *    signature.verify(_hashTypedData(dataHash), owner)
 *    This mock only checks that signature is non-empty for testing simplicity.
 *
 * 2. Token Transfer: Real Permit2 uses SafeTransferLib.safeTransferFrom()
 *    This mock uses standard transferFrom() which is sufficient with MockERC20.
 *
 * All other logic (nonce bitmap, validation order, error handling) matches exactly.
 */
contract MockPermit2 {
    /**
     * @notice Thrown when the requested amount for a transfer is larger than the permissioned amount
     * @param maxAmount The maximum amount a spender can request to transfer
     */
    error InvalidAmount(uint256 maxAmount);

    /**
     * @notice Thrown when signature is empty (mock-only error for testing)
     * @dev Real Permit2 doesn't have this error - it reverts from signature.verify()
     *      when signature verification fails. This mock uses it for basic validation.
     */
    error InvalidSigner();

    /**
     * @notice Thrown when an allowance on a token has expired
     * @param deadline The timestamp at which the allowed amount is no longer valid
     */
    error SignatureExpired(uint256 deadline);

    /**
     * @notice Thrown when validating an unordered nonce that has already been used
     */
    error InvalidNonce();

    /**
     * @notice Thrown when the number of tokens in the permit does not match the number of transfer details
     */
    error LengthMismatch();

    struct TokenPermissions {
        address token;
        uint256 amount;
    }

    struct PermitTransferFrom {
        TokenPermissions permitted;
        uint256 nonce;
        uint256 deadline;
    }

    struct PermitBatchTransferFrom {
        TokenPermissions[] permitted;
        uint256 nonce;
        uint256 deadline;
    }

    struct SignatureTransferDetails {
        address to;
        uint256 requestedAmount;
    }

    /**
     * @notice Mapping of nonces used for unordered permit execution
     */
    mapping(address => mapping(uint256 => uint256)) public nonceBitmap;

    /**
     * @notice Transfers a token using a signed permit message
     * @dev Simplified version that skips EIP-712 signature verification
     */
    function permitTransferFrom(
        PermitTransferFrom memory permit,
        SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes calldata signature
    ) external {
        uint256 requestedAmount = transferDetails.requestedAmount;

        if (block.timestamp > permit.deadline)
            revert SignatureExpired(permit.deadline);
        if (requestedAmount > permit.permitted.amount)
            revert InvalidAmount(permit.permitted.amount);

        _useUnorderedNonce(owner, permit.nonce);

        // SIGNATURE VERIFICATION:
        // Real Permit2 performs full EIP-712 signature verification:
        //   signature.verify(_hashTypedData(dataHash), owner)
        // where dataHash = permit.hash() or permit.hashWithWitness(...)
        //
        // For testing, we skip cryptographic verification and only check
        // that a signature was provided. This is sufficient since tests
        // control all inputs and don't need to prove ownership via signatures.
        if (signature.length == 0) revert InvalidSigner();

        // TOKEN TRANSFER:
        // Real Permit2 uses: ERC20(token).safeTransferFrom(owner, to, amount)
        // This mock uses standard transferFrom() which works with MockERC20
        MockERC20(permit.permitted.token).transferFrom(
            owner,
            transferDetails.to,
            requestedAmount
        );
    }

    /**
     * @notice Transfers tokens using a signed permit message with witness data (batch version)
     * @dev This is the function that Factory.sol uses for createAndDeposit
     * @dev Matches real Permit2 structure: public function creates dataHash, calls private _permitTransferFrom
     */
    function permitWitnessTransferFrom(
        PermitBatchTransferFrom memory permit,
        SignatureTransferDetails[] calldata transferDetails,
        address owner,
        bytes32 witness,
        string calldata witnessTypeString,
        bytes calldata signature
    ) external {
        // Real Permit2 does: permit.hashWithWitness(witness, witnessTypeString)
        // For mock, we create a simple hash to match the structure
        bytes32 dataHash = keccak256(
            abi.encode(permit, witness, witnessTypeString)
        );
        _permitTransferFrom(
            permit,
            transferDetails,
            owner,
            dataHash,
            signature
        );
    }

    /**
     * @notice Transfers tokens using a signed permit messages (private batch implementation)
     * @dev Matches the exact logic flow of real Permit2's private _permitTransferFrom
     * @param permit The permit data signed over by the owner
     * @param transferDetails The spender's requested transfer details for the permitted tokens
     * @param owner The owner of the tokens to transfer
     * @param dataHash The hash of permit data (in real Permit2, used for EIP-712 signature verification)
     * @param signature The signature to verify
     */
    function _permitTransferFrom(
        PermitBatchTransferFrom memory permit,
        SignatureTransferDetails[] calldata transferDetails,
        address owner,
        bytes32 dataHash,
        bytes calldata signature
    ) private {
        uint256 numPermitted = permit.permitted.length;

        if (block.timestamp > permit.deadline)
            revert SignatureExpired(permit.deadline);
        if (numPermitted != transferDetails.length) revert LengthMismatch();

        _useUnorderedNonce(owner, permit.nonce);

        // SIGNATURE VERIFICATION:
        // Real Permit2 does: signature.verify(_hashTypedData(dataHash), owner)
        // For testing, we skip cryptographic verification and only check signature is non-empty
        if (signature.length == 0) revert InvalidSigner();
        // Note: dataHash is computed but not used for verification in mock

        // TOKEN TRANSFERS (batch):
        // Real Permit2 uses: ERC20(token).safeTransferFrom(owner, to, amount)
        unchecked {
            for (uint256 i = 0; i < numPermitted; ++i) {
                TokenPermissions memory permitted = permit.permitted[i];
                uint256 requestedAmount = transferDetails[i].requestedAmount;

                if (requestedAmount > permitted.amount)
                    revert InvalidAmount(permitted.amount);

                if (requestedAmount != 0) {
                    MockERC20(permitted.token).transferFrom(
                        owner,
                        transferDetails[i].to,
                        requestedAmount
                    );
                }
            }
        }
    }

    /**
     * @notice Returns the index of the bitmap and the bit position within the bitmap. Used for unordered nonces
     * @param nonce The nonce to get the associated word and bit positions
     * @return wordPos The word position or index into the nonceBitmap
     * @return bitPos The bit position
     * @dev The first 248 bits of the nonce value is the index of the desired bitmap
     * @dev The last 8 bits of the nonce value is the position of the bit in the bitmap
     */
    function bitmapPositions(
        uint256 nonce
    ) private pure returns (uint256 wordPos, uint256 bitPos) {
        wordPos = uint248(nonce >> 8);
        bitPos = uint8(nonce);
    }

    /**
     * @notice Checks whether a nonce is taken and sets the bit at the bit position in the bitmap at the word position
     * @param from The address to use the nonce at
     * @param nonce The nonce to spend
     */
    function _useUnorderedNonce(address from, uint256 nonce) internal {
        (uint256 wordPos, uint256 bitPos) = bitmapPositions(nonce);
        uint256 bit = 1 << bitPos;
        uint256 flipped = nonceBitmap[from][wordPos] ^= bit;

        if (flipped & bit == 0) revert InvalidNonce();
    }
}
