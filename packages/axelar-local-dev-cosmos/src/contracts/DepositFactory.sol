// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import {AxelarExecutable} from "@updated-axelar-network/axelar-gmp-sdk-solidity/contracts/executable/AxelarExecutable.sol";
import {IAxelarGasService} from "@updated-axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IAxelarGasService.sol";
import {Ownable} from "./Ownable.sol";
import {Wallet} from "./Wallet.sol";

error InvalidSourceChain(string expected, string actual);
error WalletAddressMismatch(address expected, address actual);
error EmptyLcaOwner();
error InvalidTokenOwner();
error InvalidToken();
error InvalidAmount();

// Minimal version taken from: https://github.com/Uniswap/permit2/blob/cc56ad0f3439c502c246fc5cfcc3db92bb8b7219/src/interfaces/IPermit2.sol
interface IPermit2 {
    struct TokenPermissions {
        address token;
        uint256 amount;
    }

    struct PermitTransferFrom {
        TokenPermissions permitted;
        uint256 nonce;
        uint256 deadline;
    }

    struct SignatureTransferDetails {
        address to;
        uint256 requestedAmount;
    }

    function permitWitnessTransferFrom(
        PermitTransferFrom calldata permit,
        SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes32 witness,
        string calldata witnessTypeString,
        bytes calldata signature
    ) external;
}

// Payload that Factory receives from Axelar to create + deposit in a new Wallet
struct CreateAndDepositPayload {
    // the smart wallet owner (the actual owner of the wallet being created)
    string lcaOwner;
    // EVM address that signed the Permit2 EIP-712 (the token owner on this chain)
    address tokenOwner;
    // Permit2 SignatureTransfer permit (supports single token)
    IPermit2.PermitTransferFrom permit;
    // Witness data for additional context (e.g., hash of wallet address + chainId)
    bytes32 witness;
    // EIP-712 type string for witness validation
    string witnessTypeString;
    // 65-byte or 64-byte (EIP-2098) signature
    bytes signature;
    // Expected wallet address computed via create2 on sending side
    address expectedWalletAddress;
}

contract DepositFactory is AxelarExecutable, Ownable {
    address internal immutable _gateway;
    IAxelarGasService public immutable gasService;

    // Permit2 SignatureTransfer entrypoint
    IPermit2 public immutable permit2;

    string private constant EXPECTED_SOURCE_CHAIN = "agoric";
    bytes32 private constant EXPECTED_SOURCE_CHAIN_HASH =
        keccak256(bytes(EXPECTED_SOURCE_CHAIN));

    event SmartWalletCreated(
        address indexed wallet,
        string owner,
        string sourceChain
    );

    event Received(address indexed sender, uint256 amount);

    constructor(
        address gateway_,
        address gasReceiver_,
        address permit2_,
        string memory owner_
    ) payable AxelarExecutable(gateway_) Ownable(owner_) {
        gasService = IAxelarGasService(gasReceiver_);
        _gateway = gateway_;
        permit2 = IPermit2(permit2_);
    }

    function _createSmartWallet(
        string memory owner
    ) internal returns (address) {
        address newWallet = address(
            new Wallet{salt: keccak256(abi.encodePacked(owner))}(
                _gateway,
                address(gasService),
                owner
            )
        );
        return newWallet;
    }

    function _createAndDeposit(
        string memory lcaOwner,
        address tokenOwner,
        IPermit2.PermitTransferFrom memory permit,
        bytes32 witness,
        string memory witnessTypeString,
        bytes memory signature,
        address expectedWalletAddress
    ) internal returns (address newWallet) {
        if (bytes(lcaOwner).length == 0) revert EmptyLcaOwner();
        if (tokenOwner == address(0)) revert InvalidTokenOwner();
        if (permit.permitted.token == address(0)) revert InvalidToken();
        if (permit.permitted.amount == 0) revert InvalidAmount();

        newWallet = _createSmartWallet(lcaOwner);

        // Validate that created wallet matches expected address
        if (newWallet != expectedWalletAddress) {
            revert WalletAddressMismatch(expectedWalletAddress, newWallet);
        }

        IPermit2.SignatureTransferDetails memory details = IPermit2
            .SignatureTransferDetails({
                to: newWallet,
                requestedAmount: permit.permitted.amount
            });

        permit2.permitWitnessTransferFrom(
            permit,
            details,
            tokenOwner,
            witness,
            witnessTypeString,
            signature
        );
    }

    function _execute(
        bytes32 /*commandId*/,
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes calldata payload
    ) internal override onlyOwner(sourceAddress) {
        if (keccak256(bytes(sourceChain)) != EXPECTED_SOURCE_CHAIN_HASH) {
            revert InvalidSourceChain(EXPECTED_SOURCE_CHAIN, sourceChain);
        }

        CreateAndDepositPayload memory p = abi.decode(
            payload,
            (CreateAndDepositPayload)
        );

        address smartWalletAddress;
        string memory walletOwner = p.lcaOwner;

        // Wallet creation + deposit
        smartWalletAddress = _createAndDeposit(
            p.lcaOwner,
            p.tokenOwner,
            p.permit,
            p.witness,
            p.witnessTypeString,
            p.signature,
            p.expectedWalletAddress
        );

        emit SmartWalletCreated(smartWalletAddress, walletOwner, sourceChain);
    }

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    fallback() external payable {
        emit Received(msg.sender, msg.value);
    }
}
