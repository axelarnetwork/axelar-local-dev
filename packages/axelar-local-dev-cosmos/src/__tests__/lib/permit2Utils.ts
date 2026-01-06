import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract } from "ethers";

/**
 * Signs a Permit2 batch witness transfer using EIP-712
 */
export const signPermit2BatchWitness = async (
  permit2: Contract,
  permitData: {
    permitted: Array<{ token: string; amount: bigint }>;
    nonce: number;
    deadline: number;
  },
  witness: string,
  witnessTypeString: string,
  spender: string,
  signer: HardhatEthersSigner,
) => {
  const domain = {
    name: "Permit2",
    chainId: (await ethers.provider.getNetwork()).chainId,
    verifyingContract: await permit2.getAddress(),
  };

  // Construct the witness typehash
  const witnessTypehashStub =
    "PermitBatchWitnessTransferFrom(TokenPermissions[] permitted,address spender,uint256 nonce,uint256 deadline,";
  const witnessTypehash = ethers.keccak256(
    ethers.toUtf8Bytes(witnessTypehashStub + witnessTypeString),
  );

  // Hash token permissions
  const TOKEN_PERMISSIONS_TYPEHASH = ethers.keccak256(
    ethers.toUtf8Bytes("TokenPermissions(address token,uint256 amount)"),
  );
  const tokenPermissionHashes = permitData.permitted.map((p) =>
    ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "address", "uint256"],
        [TOKEN_PERMISSIONS_TYPEHASH, p.token, p.amount],
      ),
    ),
  );

  // Construct the data hash
  const dataHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "bytes32", "address", "uint256", "uint256", "bytes32"],
      [
        witnessTypehash,
        ethers.keccak256(ethers.concat(tokenPermissionHashes)),
        spender,
        permitData.nonce,
        permitData.deadline,
        witness,
      ],
    ),
  );

  // Create EIP-712 typed data hash
  const domainSeparator = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "bytes32", "uint256", "address"],
      [
        ethers.keccak256(
          ethers.toUtf8Bytes(
            "EIP712Domain(string name,uint256 chainId,address verifyingContract)",
          ),
        ),
        ethers.keccak256(ethers.toUtf8Bytes(domain.name)),
        domain.chainId,
        domain.verifyingContract,
      ],
    ),
  );

  const typedDataHash = ethers.keccak256(
    ethers.solidityPacked(
      ["string", "bytes32", "bytes32"],
      ["\x19\x01", domainSeparator, dataHash],
    ),
  );

  // For Hardhat test accounts, derive the wallet from the test mnemonic
  const signingAddress = await signer.getAddress();
  const allSigners = await ethers.getSigners();
  let accountIndex = 0;
  for (let i = 0; i < allSigners.length; i++) {
    if ((await allSigners[i].getAddress()) === signingAddress) {
      accountIndex = i;
      break;
    }
  }

  const wallet = ethers.HDNodeWallet.fromPhrase(
    "test test test test test test test test test test test junk",
    undefined,
    `m/44'/60'/0'/0/${accountIndex}`,
  );

  const sig = wallet.signingKey.sign(typedDataHash);

  // Return signature in the format expected by Permit2 (65 bytes: r + s + v)
  return ethers.solidityPacked(
    ["bytes32", "bytes32", "uint8"],
    [sig.r, sig.s, sig.v],
  );
};
