// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./MockERC20.sol";
import "./EIP712.sol";
import "./PermitHash.sol";
import "./SignatureVerification.sol";

/**
 * @notice Permit2 implementation with REAL EIP-712 signature verification
 * @dev Matches the actual Uniswap Permit2 SignatureTransfer implementation
 *
 * Reference: https://github.com/Uniswap/permit2/blob/main/src/SignatureTransfer.sol
 *
 * Key difference from real Permit2:
 * - Token Transfer: Real Permit2 uses SafeTransferLib.safeTransferFrom()
 *   This uses standard transferFrom() which is sufficient with MockERC20.
 *
 * All other logic (EIP-712 signatures, ERC1271, nonce bitmap, validation) matches exactly.
 */
contract MockPermit2 is EIP712 {
    using PermitHash for PermitHash.PermitBatchTransferFrom;
    using SignatureVerification for bytes;
    /**
     * @notice Thrown when the requested amount for a transfer is larger than the permissioned amount
     * @param maxAmount The maximum amount a spender can request to transfer
     */
    error InvalidAmount(uint256 maxAmount);

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
        // Verify EIP-712 signature using SignatureVerification library
        // Supports both EOA (ecrecover) and contract signatures (ERC1271)

        // Hash the permit data for signature verification
        PermitHash.TokenPermissions memory tokenPerms = PermitHash
            .TokenPermissions({
                token: permit.permitted.token,
                amount: permit.permitted.amount
            });
        bytes32 tokenPermissionsHash = keccak256(
            abi.encode(PermitHash._TOKEN_PERMISSIONS_TYPEHASH, tokenPerms)
        );

        // Create the permit transfer from typehash
        bytes32 PERMIT_TRANSFER_FROM_TYPEHASH = keccak256(
            "PermitTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline)TokenPermissions(address token,uint256 amount)"
        );
        bytes32 dataHash = keccak256(
            abi.encode(
                PERMIT_TRANSFER_FROM_TYPEHASH,
                tokenPermissionsHash,
                msg.sender,
                permit.nonce,
                permit.deadline
            )
        );

        signature.verify(_hashTypedData(dataHash), owner);

        // TOKEN TRANSFER:
        // Real Permit2 uses: ERC20(token).safeTransferFrom(owner, to, amount)
        // This uses standard transferFrom() which works with MockERC20
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
        // Convert to PermitHash.PermitBatchTransferFrom for hashing
        PermitHash.TokenPermissions[]
            memory permitted = new PermitHash.TokenPermissions[](
                permit.permitted.length
            );
        for (uint256 i = 0; i < permit.permitted.length; ++i) {
            permitted[i] = PermitHash.TokenPermissions({
                token: permit.permitted[i].token,
                amount: permit.permitted[i].amount
            });
        }

        PermitHash.PermitBatchTransferFrom memory hashPermit = PermitHash
            .PermitBatchTransferFrom({
                permitted: permitted,
                nonce: permit.nonce,
                deadline: permit.deadline
            });

        // Hash the permit with witness data using PermitHash library
        bytes32 dataHash = hashPermit.hashWithWitness(
            witness,
            witnessTypeString
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
        // Verify EIP-712 signature using SignatureVerification library
        // Supports both EOA (ecrecover) and contract signatures (ERC1271)
        signature.verify(_hashTypedData(dataHash), owner);

        // TOKEN TRANSFERS (batch):
        // Real Permit2 uses: ERC20(token).safeTransferFrom(owner, to, amount)
        // This uses standard transferFrom() which is sufficient with MockERC20
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
