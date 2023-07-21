// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

// Axelar CGP SDK
import { TokenManagerDeployer } from '@axelar-network/interchain-token-service/contracts/utils/TokenManagerDeployer.sol';
import { StandardizedTokenLockUnlock } from '@axelar-network/interchain-token-service/contracts/token-implementations/StandardizedTokenLockUnlock.sol';
import { StandardizedTokenMintBurn } from '@axelar-network/interchain-token-service/contracts/token-implementations/StandardizedTokenMintBurn.sol';
import { StandardizedTokenDeployer } from '@axelar-network/interchain-token-service/contracts/utils/StandardizedTokenDeployer.sol';
import { StandardizedToken } from '@axelar-network/interchain-token-service/contracts/token-implementations/StandardizedToken.sol';
import { RemoteAddressValidator } from '@axelar-network/interchain-token-service/contracts/remote-address-validator/RemoteAddressValidator.sol';
import { RemoteAddressValidatorProxy } from '@axelar-network/interchain-token-service/contracts/proxies/RemoteAddressValidatorProxy.sol';
import { TokenManagerLockUnlock } from '@axelar-network/interchain-token-service/contracts/token-manager/implementations/TokenManagerLockUnlock.sol';
import { TokenManagerMintBurn } from '@axelar-network/interchain-token-service/contracts/token-manager/implementations/TokenManagerMintBurn.sol';
import { TokenManagerLiquidityPool } from '@axelar-network/interchain-token-service/contracts/token-manager/implementations/TokenManagerLiquidityPool.sol';
import { InterchainTokenService } from '@axelar-network/interchain-token-service/contracts/interchain-token-service/InterchainTokenService.sol';
import { InterchainTokenServiceProxy } from '@axelar-network/interchain-token-service/contracts/proxies/InterchainTokenServiceProxy.sol';