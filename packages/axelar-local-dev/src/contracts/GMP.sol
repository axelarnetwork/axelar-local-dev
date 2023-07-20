// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

// Axelar CGP SDK
import { TokenDeployer } from '@axelar-network/axelar-cgp-solidity/contracts/TokenDeployer.sol';
import { AxelarGateway } from '@axelar-network/axelar-cgp-solidity/contracts/AxelarGateway.sol';
import { AxelarAuthWeighted } from '@axelar-network/axelar-cgp-solidity/contracts/auth/AxelarAuthWeighted.sol';
import { AxelarGatewayProxy } from '@axelar-network/axelar-cgp-solidity/contracts/AxelarGatewayProxy.sol';
import { AxelarGasService } from '@axelar-network/axelar-cgp-solidity/contracts/gas-service/AxelarGasService.sol';
import { AxelarGasServiceProxy } from '@axelar-network/axelar-cgp-solidity/contracts/gas-service/AxelarGasServiceProxy.sol';

// Axelar GMP SDK
import { IAxelarExecutable } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IAxelarExecutable.sol';
import { AxelarExpressExecutable } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/express/AxelarExpressExecutable.sol';
