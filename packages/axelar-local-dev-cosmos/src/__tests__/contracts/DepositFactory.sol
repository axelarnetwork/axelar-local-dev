// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import {AxelarExecutable} from "@updated-axelar-network/axelar-gmp-sdk-solidity/contracts/executable/AxelarExecutable.sol";
import {IAxelarGasService} from "@updated-axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IAxelarGasService.sol";
import {StringToAddress, AddressToString} from "@updated-axelar-network/axelar-gmp-sdk-solidity/contracts/libs/AddressString.sol";
import {Ownable} from "./Ownable.sol";
import {Wallet} from "./Wallet.sol";

error InvalidSourceChain(string expected, string actual);

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

    struct PermitBatchTransferFrom {
        TokenPermissions[] permitted;
        uint256 nonce;
        uint256 deadline;
    }

    struct SignatureTransferDetails {
        address to;
        uint256 requestedAmount;
    }

    function permitTransferFrom(
        PermitTransferFrom calldata permit,
        SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes calldata signature
    ) external;

    function permitWitnessTransferFrom(
        PermitBatchTransferFrom calldata permit,
        SignatureTransferDetails[] calldata transferDetails,
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
    // Permit2 SignatureTransfer batch permit (supports single or multiple tokens)
    IPermit2.PermitBatchTransferFrom permit;
    // Witness data for additional context (e.g., hash of wallet address + chainId)
    bytes32 witness;
    // EIP-712 type string for witness validation
    string witnessTypeString;
    // 65-byte or 64-byte (EIP-2098) signature
    bytes signature;
}

contract DepositFactory is AxelarExecutable, Ownable {
    using StringToAddress for string;
    using AddressToString for address;

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
        string sourceChain,
        string sourceAddress
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
        IPermit2.PermitBatchTransferFrom memory permit,
        bytes32 witness,
        string memory witnessTypeString,
        bytes memory signature
    ) internal returns (address newWallet) {
        require(bytes(lcaOwner).length > 0, "lcaOwner cannot be empty");
        require(tokenOwner != address(0), "tokenOwner=0");
        require(permit.permitted.length > 0, "no tokens");
        require(permit.permitted[0].token != address(0), "token=0");
        require(permit.permitted[0].amount > 0, "amount=0");

        newWallet = _createSmartWallet(lcaOwner);

        // Create transfer details array (even if just one token)
        IPermit2.SignatureTransferDetails[]
            memory detailsArray = new IPermit2.SignatureTransferDetails[](
                permit.permitted.length
            );

        for (uint256 i = 0; i < permit.permitted.length; i++) {
            detailsArray[i] = IPermit2.SignatureTransferDetails({
                to: newWallet,
                requestedAmount: permit.permitted[i].amount
            });
        }

        // NOTE: Witness validation is not enforced at the contract level.
        // The witness should contain: keccak256(abi.encode(
        //     keccak256("CreateWallet(string owner,uint256 chainId,address factory)"),
        //     keccak256(bytes(lcaOwner)),
        //     block.chainid,
        //     address(this)
        // ))
        //
        // Also current witness data contents are DUMMY/PLACEHOLDER values.
        // The witness type structure and fields need to be finalized before production.

        permit2.permitWitnessTransferFrom(
            permit,
            detailsArray,
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
            p.signature
        );

        emit SmartWalletCreated(
            smartWalletAddress,
            walletOwner,
            sourceChain,
            sourceAddress
        );
    }

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    fallback() external payable {
        emit Received(msg.sender, msg.value);
    }
}
