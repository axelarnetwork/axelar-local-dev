'use strict';

import { ethers, Wallet, Contract } from 'ethers';
const { defaultAbiCoder, arrayify } = ethers.utils;
const AddressZero = ethers.constants.AddressZero;
import { getSignedExecuteInput, getRandomID, getEVMLogID as getEVMLogID, logger, getAptosLogID } from '../utils';
import { Network, networks } from '../Network';
import { getFee, getGasPrice, depositAddresses } from '../networkUtils';
import { aptosNetwork } from '../aptosNetworkUtils';
import { Command } from './command';
import { CallContractArgs, NativeGasPaidForContractCallArgs } from './types';
import IAxelarExecutable from '../artifacts/@axelar-network/axelar-cgp-solidity/contracts/interfaces/IAxelarExecutable.sol/IAxelarExecutable.json';

export interface RelayData {
    depositAddress: any;
    sendToken: any;
    callContract: any;
    callContractWithToken: any;
}

// Constants used in the encironment to relay
export const gasLogs: any[] = [];
export const gasLogsWithToken: any[] = [];

const getAliasFromSymbol = (tokens: { [key: string]: string }, symbol: string) => {
    for (const alias in tokens) {
        if (tokens[alias] == symbol) return alias;
    }
    return '';
};

const updateGasLogs = async (from: Network, blockNumber: number) => {
    let filter = from.gasReceiver.filters.GasPaidForContractCall();
    let newGasLogs: any = (await from.gasReceiver.queryFilter(filter, from.lastRelayedBlock + 1, blockNumber)).map((log) => log.args);
    for (const gasLog of newGasLogs) {
        gasLogs.push(gasLog);
    }

    filter = from.gasReceiver.filters.NativeGasPaidForContractCall();
    newGasLogs = (await from.gasReceiver.queryFilter(filter, from.lastRelayedBlock + 1, blockNumber)).map((log) => {
        return { ...log.args, gasToken: AddressZero };
    });
    for (const gasLog of newGasLogs) {
        gasLogs.push(gasLog);
    }

    filter = from.gasReceiver.filters.GasPaidForContractCallWithToken();
    newGasLogs = (await from.gasReceiver.queryFilter(filter, from.lastRelayedBlock + 1, blockNumber)).map((log) => log.args);
    for (const gasLog of newGasLogs) {
        gasLogsWithToken.push(gasLog);
    }
    filter = from.gasReceiver.filters.NativeGasPaidForContractCallWithToken();
    newGasLogs = (await from.gasReceiver.queryFilter(filter, from.lastRelayedBlock + 1, blockNumber)).map((log) => {
        return { ...log.args, gasToken: AddressZero };
    });
    for (const gasLog of newGasLogs) {
        gasLogsWithToken.push(gasLog);
    }
};

const updateGasLogsAptos = async () => {
    const events = await aptosNetwork.queryPayGasContractCallEvents();

    for (const event of events) {
        const args: NativeGasPaidForContractCallArgs = {
            sourceAddress: event.data.source_address,
            destinationAddress: event.data.destination_address,
            gasFeeAmount: event.data.gas_fee_amount,
            destinationChain: event.data.destination_chain,
            payloadHash: event.data.payload_hash,
            refundAddress: event.data.refund_address,
        };

        gasLogs.push(args);
    }
};

const updateDepositAddresses = async (from: Network, blockNumber: number, relayData: RelayData, commands: { [key: string]: Command[] }) => {
    for (const address in depositAddresses[from.name]) {
        const data = depositAddresses[from.name][address];
        const tokenSymbol = from.tokens[data.alias];
        const token = await from.getTokenContract(tokenSymbol);
        const fee = getFee(from, data.destinationChain, data.alias);
        const balance = await token.balanceOf(address);
        const to = networks.find((chain: Network) => chain.name == data.destinationChain);
        const destinationTokenSymbol = to!.tokens[data.alias];
        if (balance > fee) {
            const commandId = getRandomID();
            relayData.depositAddress[commandId] = {
                from: from.name,
                to: data.destinationChain,
                amountIn: balance,
                fee: fee,
                amountOut: balance - fee,
            };
            commands[data.destinationChain].push(
                new Command(
                    commandId,
                    'mintToken',
                    [destinationTokenSymbol, data.destinationAddress, balance - fee],
                    ['string', 'address', 'uint256']
                )
            );
            const wallet = new Wallet(data.privateKey, from.provider);
            if (Number(await from.provider.getBalance(address)) == 0) {
                // Create a transaction object
                const tx = {
                    to: address,
                    // Convert currency unit from ether to wei
                    value: BigInt(1e16),
                };
                // Send a transaction
                await (await from.ownerWallet.sendTransaction(tx)).wait();
            }
            await (await token.connect(wallet).transfer(from.ownerWallet.address, balance)).wait();
        }
    }
};

const updateTokenSent = async (from: Network, blockNumber: number, relayData: RelayData, commands: { [key: string]: Command[] }) => {
    const filter = from.gateway.filters.TokenSent();
    const logsFrom = await from.gateway.queryFilter(filter, from.lastRelayedBlock + 1, blockNumber);
    for (const log of logsFrom) {
        const args: any = log.args;
        const alias = getAliasFromSymbol(from.tokens, args.symbol);
        const fee = getFee(from, args.destinationChain, alias);
        if (args.amount <= fee) continue;
        const amountOut = args.amount.sub(fee);
        const commandId = getEVMLogID(from.name, log);
        const to = networks.find((chain: Network) => chain.name == args.destinationChain);
        const destinationTokenSymbol = to!.tokens[alias];

        relayData.sendToken[commandId] = {
            from: from.name,
            to: args.destinationChain,
            amountIn: args.amount,
            fee: fee,
            alias: alias,
            amountOut: amountOut,
        };
        commands[args.destinationChain].push(
            new Command(
                commandId,
                'mintToken',
                [destinationTokenSymbol, args.destinationAddress, amountOut],
                ['string', 'address', 'uint256']
            )
        );
    }
};

const updateCallContractEVM = async (from: Network, blockNumber: number, relayData: RelayData, commands: { [key: string]: Command[] }) => {
    const filter = from.gateway.filters.ContractCall();
    const logsFrom = await from.gateway.queryFilter(filter, from.lastRelayedBlock + 1, blockNumber);
    for (const log of logsFrom) {
        const args: any = log.args;
        if (commands[args.destinationChain] == null) continue;
        const commandId = getEVMLogID(from.name, log);
        const contractCallArgs: CallContractArgs = {
            from: from.name,
            to: args.destinationChain,
            sourceAddress: args.sender,
            destinationContractAddress: args.destinationContractAddress,
            payload: args.payload,
            payloadHash: args.payloadHash,
        };
        relayData.callContract[commandId] = contractCallArgs;
        const command = Command.createContractCallCommand(commandId, relayData, contractCallArgs);
        commands[args.destinationChain].push(command);
    }
};

const updateCallContractAptos = async (relayData: RelayData, commands: { [key: string]: Command[] }) => {
    const events = await aptosNetwork.queryContractCallEvents();

    console.log('gatewayEvents', events);
    for (const event of events) {
        const commandId = getAptosLogID('aptos', event);
        const contractCallArgs: CallContractArgs = {
            from: 'aptos',
            to: event.data.destination_chain,
            sourceAddress: event.data.sender,
            destinationContractAddress: event.data.destination_contract_address,
            payload: event.data.payload,
            payloadHash: event.data.payloadHash,
        };
        relayData.callContract[commandId] = contractCallArgs;
        const command = Command.createContractCallCommand(commandId, relayData, contractCallArgs);
        commands[event.data.destination_chain].push(command);
    }
};

const updateCallContractWithToken = async (
    from: Network,
    blockNumber: number,
    relayData: RelayData,
    commands: { [key: string]: Command[] }
) => {
    const filter = from.gateway.filters.ContractCallWithToken();
    const logsFrom = await from.gateway.queryFilter(filter, from.lastRelayedBlock + 1, blockNumber);
    for (const log of logsFrom) {
        const args: any = log.args;
        const alias = getAliasFromSymbol(from.tokens, args.symbol);
        const fee = getFee(from, args.destinationChain, alias);
        if (args.amount < fee) continue;
        const amountOut = args.amount.sub(fee);
        if (amountOut < 0) continue;
        const commandId = getEVMLogID(from.name, log);

        const to = networks.find((chain: Network) => chain.name == args.destinationChain);
        const destinationTokenSymbol = to!.tokens[alias];

        relayData.callContractWithToken[commandId] = {
            from: from.name,
            to: args.destinationChain,
            sourceAddress: args.sender,
            destinationContractAddress: args.destinationContractAddress,
            payload: args.payload,
            payloadHash: args.payloadHash,
            alias: alias,
            amountIn: args.amount,
            fee: fee,
            amountOut: amountOut,
        };
        commands[args.destinationChain].push(
            new Command(
                commandId,
                'approveContractCallWithMint',
                [from.name, args.sender, args.destinationContractAddress, args.payloadHash, destinationTokenSymbol, amountOut],
                ['string', 'string', 'address', 'bytes32', 'string', 'uint256'],
                async (options: any) => {
                    const to = networks.find((chain) => chain.name == args.destinationChain);
                    const contract = new Contract(args.destinationContractAddress, IAxelarExecutable.abi, to!.relayerWallet);
                    relayData.callContractWithToken[commandId].execution = (
                        await (
                            await contract.executeWithToken(
                                commandId,
                                from.name,
                                args.sender,
                                args.payload,
                                destinationTokenSymbol,
                                amountOut,
                                options
                            )
                        ).wait()
                    ).transactionHash;
                }
            )
        );
    }
};

const executeCommands = async (to: Network, commands: Command[]) => {
    const data = arrayify(
        defaultAbiCoder.encode(
            ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [to.chainId, commands.map((com) => com.commandId), commands.map((com) => com.name), commands.map((com) => com.encodedData)]
        )
    );
    const signedData = await getSignedExecuteInput(data, to.operatorWallet);
    return await (await to.gateway.connect(to.ownerWallet).execute(signedData, { gasLimit: BigInt(8e6) })).wait();
};
const postExecute = async (to: Network, commands: Command[], execution: any) => {
    for (const command of commands) {
        if (command.post == null) continue;

        if (
            !execution.events.find((event: any) => {
                return event.event == 'Executed' && event.args[0] == command.commandId;
            })
        )
            continue;
        const fromName = command.data[0];
        const from = networks.find((network) => network.name == fromName);
        const payed =
            command.name == 'approveContractCall'
                ? gasLogs.find((log: any) => {
                      if (log.sourceAddress.toLowerCase() != command.data[1].toLowerCase()) return false;
                      if (log.destinationChain.toLowerCase() != to.name.toLowerCase()) return false;
                      if (log.destinationAddress.toLowerCase() != command.data[2].toLowerCase()) return false;
                      if (log.payloadHash.toLowerCase() != command.data[3].toLowerCase()) return false;
                      return true;
                  })
                : gasLogsWithToken.find((log: any) => {
                      if (log.sourceAddress.toLowerCase() != command.data[1].toLowerCase()) return false;
                      if (log.destinationChain.toLowerCase() != to.name.toLowerCase()) return false;
                      if (log.destinationAddress.toLowerCase() != command.data[2].toLowerCase()) return false;
                      if (log.payloadHash.toLowerCase() != command.data[3].toLowerCase()) return false;
                      const alias = getAliasFromSymbol(from!.tokens, log.symbol);
                      if (to.tokens[alias] != command.data[4]) return false;
                      if (log.amount - getFee(fromName, to, command.data[4]) != command.data[5]) return false;
                      return true;
                  });

        if (!payed) continue;
        if (command.name == 'approveContractCall') {
            const index = gasLogs.indexOf(payed);
            gasLogs.splice(index, 1);
        } else {
            const index = gasLogsWithToken.indexOf(payed);
            gasLogsWithToken.splice(index, 1);
        }
        try {
            const cost = getGasPrice(fromName, to, payed.gasToken);
            const blockLimit = Number((await to.provider.getBlock('latest')).gasLimit);
            await command.post({
                gasLimit: BigInt(Math.min(blockLimit, payed.gasFeeAmount / cost)),
            });
        } catch (e) {
            logger.log(e);
        }
    }
};

//This function relays all the messages between the tracked networks.
const relayEvm = async () => {
    const relayData: RelayData = {
        depositAddress: {},
        sendToken: {},
        callContract: {},
        callContractWithToken: {},
    };
    const commands: { [key: string]: Command[] } = {};
    for (const to of networks) {
        commands[to.name] = [];
    }

    for (const from of networks) {
        const blockNumber = await from.provider.getBlockNumber();
        if (blockNumber <= from.lastRelayedBlock) continue;

        await updateGasLogs(from, blockNumber);
        await updateDepositAddresses(from, blockNumber, relayData, commands);
        await updateTokenSent(from, blockNumber, relayData, commands);
        await updateCallContractEVM(from, blockNumber, relayData, commands);
        await updateCallContractWithToken(from, blockNumber, relayData, commands);

        from.lastRelayedBlock = blockNumber;
    }

    for (const to of networks) {
        const toExecute = commands[to.name];
        if (toExecute.length == 0) continue;

        const execution = await executeCommands(to, toExecute);

        await postExecute(to, toExecute, execution);
    }
    return relayData;
};

const relayAptosToEvm = async () => {
    if (!aptosNetwork) return;
    const relayData: RelayData = {
        depositAddress: {},
        sendToken: {},
        callContract: {},
        callContractWithToken: {},
    };
    const commands: { [key: string]: Command[] } = {};

    updateGasLogsAptos();
    updateCallContractAptos(relayData, commands);

    console.log(commands);
    for (const to of networks) {
        const toExecute = commands[to.name];
        if (toExecute.length == 0) continue;

        const execution = await executeCommands(to, toExecute);

        await postExecute(to, toExecute, execution);
    }
    // Filtered only legit events
    // const validContractCallEvents = gatewayEvents.filter((contractCallEvent: any) => {
    //     return !!gasServiceEvents.find((payGasEvent: any) => {
    //         payGasEvent.version === contractCallEvent.version &&
    //             payGasEvent.destination_chain === contractCallEvent.destination_chain &&
    //             payGasEvent.destination_address === contractCallEvent.destination_contract_address &&
    //             payGasEvent.payload_hash === contractCallEvent.payload_hash &&
    //             payGasEvent.source_address === contractCallEvent.sender &&
    //             payGasEvent.gas_fee_amount &&
    //             payGasEvent.gas_fee_amount !== '0';
    //     });
    // });
    // console.log('validContractCallEvents', validContractCallEvents);
};

const relayEvmToAptos = async () => {};

export const relay = async () => {
    await relayAptosToEvm();
    await relayEvmToAptos();
    return relayEvm();
};
