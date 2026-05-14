// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import { AxelarExecutable } from '@updated-axelar-network/axelar-gmp-sdk-solidity/contracts/executable/AxelarExecutable.sol';
import { IRemoteAccountFactory } from './interfaces/IRemoteAccountFactory.sol';
import { IRemoteAccount, ContractCall } from './interfaces/IRemoteAccount.sol';
import { IRemoteAccountRouter, IPermit2, DepositPermit, ProvideRemoteAccountInstruction, RemoteAccountExecuteInstruction, AuthorizeRouterInstruction, DeauthorizeRouterInstruction, ConfirmVettingAuthorityInstruction } from './interfaces/IRemoteAccountRouter.sol';

/**
 * @title RemoteAccountAxelarRouter
 * @notice The single AxelarExecutable entry point for all remote account operations
 * @dev Handles account creation, deposits, and multicalls atomically.
 *      Remote accounts delegate authorization to the factory that deployed them:
 *      any caller authorized by the factory can operate any accounts it created.
 *      This supports O(1) router migration — updating router status in the
 *      factory instantly updates the caller authorization for all accounts.
 *
 *      The factory maintains a vetted/authorized router map for two-factor
 *      authorization:
 *      - Vetting: the factory's vetting authority can vet or unvet routers
 *        via direct calls
 *      - Authorization (operational switch): the Agoric chain principal can
 *        authorize or deauthorize vetted routers via GMP messages
 *
 *      Migration to a new router is done in 2 steps:
 *      1. the vetting authority vets and the principal authorizes the new router
 *      2. the principal optionally deauthorizes the old router via GMP
 */
contract RemoteAccountAxelarRouter is AxelarExecutable, IRemoteAccountRouter {
    IRemoteAccountFactory public immutable override factory;
    IPermit2 public immutable override permit2;

    // Immutable, but cannot be declaratively marked as such because this is a string
    // Only used for validation error messages. The router is seldom deployed
    // so the cost of storing this string is accepted.
    string public axelarSourceChain;
    bytes32 private immutable axelarSourceChainHash;

    error InvalidSourceChain(string expected, string actual);
    error InvalidPayload(bytes4 selector);

    error UnauthorizedCaller(string source);

    /**
     * @param axelarGateway The Axelar gateway address
     * @param axelarSourceChain_ The source chain name
     * @param factory_ The RemoteAccountFactory address
     * @param permit2_ The Permit2 contract address
     */
    constructor(
        address axelarGateway,
        string memory axelarSourceChain_,
        address factory_,
        address permit2_
    ) AxelarExecutable(axelarGateway) {
        factory = IRemoteAccountFactory(factory_);
        permit2 = IPermit2(permit2_);

        axelarSourceChain = axelarSourceChain_;
        axelarSourceChainHash = keccak256(bytes(axelarSourceChain_));
    }

    /**
     * @notice Patch the first string slot in an ABI-encoded payload with a source string from calldata
     * @dev This is a low-level function that uses inline assembly to directly
     * manipulate the target payload in memory. It assumes the payload is an
     * ABI-encoded function call where the first argument is a string, and it
     * replaces that argument with the provided source string from calldata.
     * The function also includes safety checks to ensure the payload is
     * well-formed and that the length of the source string matches the length
     * of the existing string in the payload.
     * @param targetPayload The ABI-encoded function call payload in memory,
     *        which will be modified in place.
     * @param sourceString The source string as calldata bytes.
     */
    function patchFirstString(
        bytes memory targetPayload,
        bytes calldata sourceString
    ) internal pure {
        assembly {
            // 1. Minimum Payload Check: 4 (selector) + 32 (offset) = 36 bytes (0x24)
            let payloadTotalLen := mload(targetPayload)
            if lt(payloadTotalLen, 0x24) {
                revert(0, 0)
            }

            // 2. Get the pointer to the start of the ABI arguments (after the 4-byte selector)
            let argsBase := add(targetPayload, 0x24)

            // 3. Read the offset for the first argument (stored at the first 32-byte slot)
            let stringOffset := mload(argsBase)

            // 4. Calculate the absolute memory position of the string's length word
            // Base + Offset (Relative to Base)
            let lengthWordPos := add(argsBase, stringOffset)

            // 5. Safety: Ensure the payload buffer contains the length word (0x20)
            //    and the full string data (sourceString.length) past stringOffset.
            //    stringOffset is relative to argsBase (byte 4 of the payload),
            //    while payloadTotalLen counts from byte 0, so we add 4 to bridge
            //    that difference: 4 + stringOffset + 0x20 + sourceString.length.
            //    Since sourceString.length == existingLen is verified in step 6,
            //    this also prevents calldatacopy from writing past the buffer.
            if gt(add(add(stringOffset, 0x24), sourceString.length), payloadTotalLen) {
                revert(0, 0)
            }

            // 6. Read existing length and verify it matches the source exactly
            let existingLen := mload(lengthWordPos)
            if iszero(eq(existingLen, sourceString.length)) {
                revert(0, 0)
            }

            // 7. Perform the Overwrite
            // The data starts exactly 32 bytes (0x20) after the length word
            let dataStartPos := add(lengthWordPos, 0x20)

            calldatacopy(dataStartPos, sourceString.offset, sourceString.length)
        }
    }

    /**
     * @notice Validate that the provided selector is a known process instruction selector
     * @dev Reverts if the selector does not match any of the supported instruction selectors.
     *      The checks are arranged in decreasing order of expected frequency.
     * @param selector The instruction selector to validate
     */
    function checkInstructionSelector(bytes4 selector) internal pure {
        if (
            selector != RemoteAccountAxelarRouter.processRemoteAccountExecuteInstruction.selector &&
            selector != RemoteAccountAxelarRouter.processProvideRemoteAccountInstruction.selector &&
            selector != RemoteAccountAxelarRouter.processAuthorizeRouterInstruction.selector &&
            selector != RemoteAccountAxelarRouter.processDeauthorizeRouterInstruction.selector &&
            selector != RemoteAccountAxelarRouter.processConfirmVettingAuthorityInstruction.selector
        ) {
            revert InvalidInstructionSelector(selector);
        }
    }

    /**
     * @notice Calls the instruction processor function after patching the source address inside the encoded call data
     * @dev The call will fail if the encoded call is not well formed (e.g.
     *      invalid instruction selector or first argument is not a string /
     *      bytes of the same length as the source address).
     *      The function returns the success status and result of the call,
     *      and reverts if an out of gas situation is detected.
     * @param encodedCall The encoded call data to process
     * @param sourceAddress The source address to patch into the encoded call data
     */
    function processInstruction(
        bytes calldata encodedCall,
        string calldata sourceAddress
    ) internal returns (bool success, bytes memory result) {
        bytes memory rewrittenCall = encodedCall;
        patchFirstString(rewrittenCall, bytes(sourceAddress));

        uint256 gasBefore = gasleft();
        (success, result) = address(this).call(rewrittenCall);
        uint256 gasAfter = gasleft();

        // Heuristic: If we lost more than 85% of the gas AND got no return data,
        // it is very unlikely for this to be a manual revert().
        // Legitimate manual reverts without reason usually happen early during
        // decoding or validation.
        // Conversely, a relayer not providing sufficient gas would have to hit a
        // call nested 10 or more levels deep for the tx to not revert, which is
        // similarly unlikely.
        // We err on the side of caution by reverting the transaction for some
        // manual reverts, which allows relayers to potentially retry with more
        // gas. At worse we would spend more in relay fees for reattempting, or
        // take more time to make a failed tx decision in the resolver, both of
        // which are better than quickly treating it as a failed operation,
        // requiring the end-user to take action and sign a new intent.
        if (!success && gasAfter <= (gasBefore / 7)) {
            if (result.length == 0) {
                // The call likely ran out of gas without RemoteAccount interception
                revert SubcallOutOfGas();
            }

            if (bytes4(result) == IRemoteAccount.ContractCallFailed.selector) {
                // Extract the reason bytes length from the encoded error data.
                // The ContractCallFailed error is encoded as:
                // - selector (4 bytes, already checked)
                // - target (32 bytes)
                // - callSelector (32 bytes)
                // - callIndex (32 bytes)
                // - reason offset (32 bytes, relative to start of params at byte 4)
                // - reason length (32 bytes, at the offset position)
                // - reason data (variable)

                // Read the offset at position 100-131 (after 4 + 96 bytes of fixed fields)
                uint256 reasonOffset;
                assembly {
                    // result is a bytes memory, so the data starts at result + 0x20
                    // Position of offset field: 0x20 (length) + 4 (selector) + 96 (4 fixed 32-byte fields) = 0x84
                    reasonOffset := mload(add(result, 0x84))
                }

                // reasonOffset is relative to byte 4 (start of ABI params), so add 4
                uint256 reasonLengthPosition = 4 + reasonOffset;

                // Check if we have enough data to read the length
                if (reasonLengthPosition + 32 <= result.length) {
                    uint256 reasonLength;
                    assembly {
                        // Read the length at the calculated position
                        reasonLength := mload(add(result, add(0x20, reasonLengthPosition)))
                    }

                    if (reasonLength == 0) {
                        // The call made by RemoteAccount likely ran out of gas
                        revert SubcallOutOfGas();
                    }
                }
            }
        }
    }

    /**
     * @notice Internal handler for Axelar GMP messages
     * @dev Validates source chain, then decodes and processes the payload
     *      The source address is validated against the payload data by each processor.
     * @param sourceChain The source chain (must match configured axelarSourceChain)
     * @param sourceAddress The source address
     * @param payload The router instruction encoded as a call selector with a signature in the
     *                form of (string txId, address expectedAccountAddress, Instruction instruction)
     */
    function _execute(
        bytes32 /*commandId*/,
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes calldata payload
    ) internal override {
        if (keccak256(bytes(sourceChain)) != axelarSourceChainHash) {
            revert InvalidSourceChain(axelarSourceChain, sourceChain);
        }

        // Parse the payload as an ABI-encoded function call (see
        // https://docs.soliditylang.org/en/latest/abi-spec.html) whose arguments
        // start with a string (the transaction id) followed by an address (the
        // expected account address). The first argument is then replaced with
        // the source address provided to this function (after checking the
        // length matches) and the resulting payload is used to dynamically call
        // the process function in this contract.
        // Using such a function-call payload encoding potentially allows
        // explorers to show more details about it, and simplifies the
        // implementation of both the sender, which can rely on the contract ABI,
        // and this receiver, which can avoid fully decoding the payload.
        // The recommendation is to pad the transaction id argument with 0-bytes
        // to match the length of the address and minimize gas costs.
        // The transaction id is included in the OperationResult event, allowing a
        // resolver to observe/trace transactions.
        // Note that the second argument of all functions is an address: either the
        // expected remote account address or the factory address (for admin
        // operations like AuthorizeRouter, DeauthorizeRouter, ConfirmVettingAuthority).
        // It is included in the emitted OperationResult event.

        bytes4 selector = bytes4(payload[:4]);
        bytes calldata encodedArgs = payload[4:];

        // Validate the selector before decoding and dispatching to a non existent processor function.
        checkInstructionSelector(selector);

        // Decode the common part of the arguments in the encoded call data.
        // This also serves as a validation that the payload is well formed.
        (string memory txId, address expectedAddress) = abi.decode(encodedArgs, (string, address));

        // Call the process function then emit an event describing the result.
        // This reverts if an out of gas situation is detected so relayers can resubmit with more gas.
        (bool success, bytes memory result) = processInstruction(payload, sourceAddress);

        // Note that this is a transport-level event applicable to any instruction.
        emit OperationResult(txId, sourceAddress, txId, expectedAddress, selector, success, result);
    }

    /**
     * @notice Process a provision instruction, optionally processing a deposit permit
     * @dev This is an external function which can only be called by this contract
     *      Used to create a call stack that can be reverted atomically
     *      Only the factory's principal can invoke this operation to ensure only the
     *      controller can redeem signed permits.
     *      The depositPermit in the instruction is optional to allow the controller to
     *      use the factory's public provideRemoteAccount mechanism without fund transfer.
     * @param sourceAddress Must be the principal account address of the factory
     * @param factoryAddress The address of the factory
     * @param instruction The decoded ProvideRemoteAccountInstruction
     */
    function processProvideRemoteAccountInstruction(
        string calldata sourceAddress,
        address factoryAddress,
        ProvideRemoteAccountInstruction calldata instruction
    ) external override {
        require(msg.sender == address(this));

        // Check the factory's principal is the source
        if (factoryAddress != address(factory)) {
            revert UnauthorizedCaller(sourceAddress);
        }
        factory.verifyFactoryPrincipalAccount(sourceAddress);

        require(instruction.expectedAccountAddress != factoryAddress);

        // NOTE: this allows the factory's principal to provision and deposit
        // into any remote account without proof that it holds the corresponding
        // principal account. Unfortunately there are no built-in capabilities
        // over GMP, and implementing one would require some stateful mechanism.

        // Permit2 transfer happens before provideRemoteAccount, but this is safe:
        // processProvideRemoteAccountInstruction runs inside a try/catch in _execute
        // (via processInstruction), so if provideRemoteAccount reverts, the entire
        // instruction — including the permit2 transfer — is rolled back atomically.
        // Transfer first to avoid expensive creation if deposit fails (e.g. insufficient funds,
        // expired permit).
        // The subsequent provideRemoteAccount call will revert this deposit if the expectedAccountAddress
        // does not match the address derived from the designated principal account.
        if (instruction.depositPermit.length > 0) {
            // Verify that the instruction is well formed
            require(instruction.depositPermit.length == 1);
            DepositPermit calldata deposit = instruction.depositPermit[0];

            // Use structured call (not generic encoded payload) to ensure transfer
            // destination matches the verified accountAddress from the instruction.
            IPermit2.SignatureTransferDetails memory details = IPermit2.SignatureTransferDetails({
                // We will check address matches expectations after transfer
                to: instruction.expectedAccountAddress,
                requestedAmount: deposit.permit.permitted.amount
            });
            permit2.permitWitnessTransferFrom(
                deposit.permit,
                details,
                deposit.owner,
                deposit.witness,
                deposit.witnessTypeString,
                deposit.signature
            );
        }

        factory.provideRemoteAccount(
            instruction.principalAccount,
            instruction.expectedAccountAddress
        );
    }

    /**
     * @notice Process an execute instruction by sending calls to a remote account
     * @dev This is an external function which can only be called by this contract
     *      Used to create a call stack that can be reverted atomically
     * @param sourceAddress The principal account address of the remote account
     * @param expectedAccountAddress The expected account address corresponding to the source address
     * @param instruction The decoded RemoteAccountExecuteInstruction
     */
    function processRemoteAccountExecuteInstruction(
        string calldata sourceAddress,
        address expectedAccountAddress,
        RemoteAccountExecuteInstruction calldata instruction
    ) external override {
        require(msg.sender == address(this));

        // Provide or verify the remote account exists at the expected address
        factory.provideRemoteAccount(sourceAddress, expectedAccountAddress);

        if (instruction.multiCalls.length > 0) {
            IRemoteAccount(expectedAccountAddress).executeCalls(instruction.multiCalls);
        }
    }

    /**
     * @notice Process the instruction to confirm transfer of the factory vetting authority
     * @dev This is an external function which can only be called by this contract
     *      Used to create a call stack that can be reverted atomically
     *      Only the factory's principal can confirm the factory's vetting
     *      authority transfer via GMP. The new vetting authority must have been
     *      previously proposed directly by the current vetting authority.
     * @param sourceAddress The principal account address of the factory
     * @param factoryAddress The expected factory address
     * @param instruction The decoded ConfirmVettingAuthorityInstruction
     */
    function processConfirmVettingAuthorityInstruction(
        string calldata sourceAddress,
        address factoryAddress,
        ConfirmVettingAuthorityInstruction calldata instruction
    ) external override {
        require(msg.sender == address(this));

        // Check the factory's principal is the source
        if (factoryAddress != address(factory)) {
            revert UnauthorizedCaller(sourceAddress);
        }
        factory.verifyFactoryPrincipalAccount(sourceAddress);

        factory.confirmVettingAuthorityTransfer(instruction.authority);
    }

    /**
     * @notice Process an authorize router instruction
     * @dev This is an external function which can only be called by this contract.
     *      Only the factory's principal can authorize routers via GMP.
     *      The router must be vetted first.
     * @param sourceAddress The principal account address of the factory
     * @param factoryAddress The expected factory address
     * @param instruction The decoded AuthorizeRouterInstruction
     */
    function processAuthorizeRouterInstruction(
        string calldata sourceAddress,
        address factoryAddress,
        AuthorizeRouterInstruction calldata instruction
    ) external override {
        require(msg.sender == address(this));

        if (factoryAddress != address(factory)) {
            revert UnauthorizedCaller(sourceAddress);
        }
        factory.verifyFactoryPrincipalAccount(sourceAddress);

        factory.authorizeRouter(instruction.router);
    }

    /**
     * @notice Process a deauthorize router instruction
     * @dev This is an external function which can only be called by this contract.
     *      Only the factory's principal can deauthorize routers via GMP.
     *      The current router cannot deauthorize itself.
     * @param sourceAddress The principal account address of the factory
     * @param factoryAddress The expected factory address
     * @param instruction The decoded DeauthorizeRouterInstruction
     */
    function processDeauthorizeRouterInstruction(
        string calldata sourceAddress,
        address factoryAddress,
        DeauthorizeRouterInstruction calldata instruction
    ) external override {
        require(msg.sender == address(this));

        if (factoryAddress != address(factory)) {
            revert UnauthorizedCaller(sourceAddress);
        }
        factory.verifyFactoryPrincipalAccount(sourceAddress);

        factory.deauthorizeRouter(instruction.router);
    }
}
