import { Relayer, RelayerType } from './Relayer';
import { CallContractArgs, CallContractWithTokenArgs, RelayCommand, RelayData } from './types';
import { ContractReceipt, ethers, Wallet } from 'ethers';
import { getEVMLogID, getRandomID, getSignedExecuteInput, logger } from '../utils';
import { Command } from './Command';
import { arrayify, defaultAbiCoder } from 'ethers/lib/utils';
import { depositAddresses } from '../networkUtils';
import { Network, networks } from '../Network';
import { getFee, getGasPrice } from '../networkUtils';
import {
    ContractCallEventObject,
    ContractCallWithTokenEventObject,
} from '../types/@axelar-network/axelar-cgp-solidity/contracts/AxelarGateway';
import { AxelarExpressExecutable__factory as AxelarExpressExecutableFactory } from '../types/factories/@axelar-network/axelar-gmp-sdk-solidity/contracts/express/AxelarExpressExecutable__factory';

const AddressZero = ethers.constants.AddressZero;

interface EvmRelayerOptions {
    nearRelayer?: Relayer;
    aptosRelayer?: Relayer;
    suiRelayer?: Relayer;
    wasmRelayer?: Relayer;
    multiversXRelayer?: Relayer;
}

export class EvmRelayer extends Relayer {
    eventSubscribers: ethers.Contract[] = [];

    constructor(options: EvmRelayerOptions = {}) {
        super();
        this.otherRelayers.near = options.nearRelayer;
        this.otherRelayers.aptos = options.aptosRelayer;
        this.otherRelayers.sui = options.suiRelayer;
        this.otherRelayers.wasm = options.wasmRelayer;
        this.otherRelayers.multiversx = options.multiversXRelayer;
    }

    setRelayer(type: RelayerType, relayer: Relayer) {
        this.otherRelayers[type] = relayer;
    }

    async updateEvents(): Promise<void> {
        for (const from of networks) {
            const blockNumber = await from.provider.getBlockNumber();
            if (blockNumber <= from.lastRelayedBlock) continue;

            await this.updateGasEvents(from, blockNumber);
            await this.updateExpressGasEvents(from, blockNumber);
            await this.updateDepositAddresses(from, blockNumber);
            await this.updateTokenSentEvent(from, blockNumber);
            await this.updateCallContractEvents(from, blockNumber);
            await this.updateCallContractWithTokensEvents(from, blockNumber);

            from.lastRelayedBlock = blockNumber;
        }
    }

    async execute(commands: RelayCommand) {
        await this.executeEvm(commands);

        for (const relayerType in this.otherRelayers) {
            await this.otherRelayers[relayerType]?.execute(commands);
        }
    }

    override async subscribeExpressCall() {
        for (const chain of networks) {
            if (!this.commands[chain.name]) {
                this.commands[chain.name] = [];
            }
        }
        for (const chain of networks) {
            const subscriber = chain.gasService.on(
                'NativeGasPaidForExpressCallWithToken',
                async (_sourceAddress: string, destinationChain: string) => {
                    const blockNumber = await chain.provider.getBlockNumber();
                    await this.updateExpressGasEvents(chain, blockNumber);
                    await this.updateCallContractWithTokensEvents(chain, blockNumber, chain.lastExpressedBlock + 1);
                    const destChain = networks.find((network) => network.name === destinationChain);
                    if (!destChain) return;
                    const commands = this.commands[destinationChain];
                    if (!commands || commands?.length === 0) return;
                    await this.executeEvmExpress(destChain, commands).catch((e) => {
                        logger.log(e);
                    });
                    chain.lastExpressedBlock = blockNumber;
                }
            );

            this.eventSubscribers.push(subscriber);
        }
    }

    override unsubscribe() {
        this.eventSubscribers.forEach((subscriber) => {
            subscriber.removeAllListeners();
        });
    }

    private async executeEvm(commandList: RelayCommand) {
        for (const to of networks) {
            const commands = commandList[to.name];
            if (!commands || commands?.length === 0) continue;

            await this.executeEvmGateway(to, commands);

            await this.executeEvmExecutable(to, commands);
        }
    }

    private async executeEvmGateway(to: Network, commands: Command[]): Promise<void> {
        const data = arrayify(
            defaultAbiCoder.encode(
                ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
                [to.chainId, commands.map((com) => com.commandId), commands.map((com) => com.name), commands.map((com) => com.encodedData)]
            )
        );
        const signedData = await getSignedExecuteInput(data, to.operatorWallet);

        return to.gateway
            .connect(to.ownerWallet)
            .execute(signedData, { gasLimit: BigInt(8e6) })
            .then((tx: any) => tx.wait());
    }

    private async executeEvmExpress(to: Network, commands: Command[]): Promise<void> {
        for (const command of commands) {
            if (command.post === null) continue;

            const executed = await this.isExecuted(to, command);
            // If the command has already been approved, skip it.
            if (executed) continue;

            const fromName = command.data[0];
            const from = networks.find((network) => network.name === fromName);
            if (!from) continue;

            const payed = this.expressContractCallWithTokenGasEvents.find((log: any) => {
                if (log.sourceAddress.toLowerCase() !== command.data[1].toLowerCase()) return false;
                if (log.destinationChain.toLowerCase() !== to.name.toLowerCase()) return false;
                if (log.destinationAddress.toLowerCase() !== command.data[2].toLowerCase()) return false;
                if (log.payloadHash.toLowerCase() !== command.data[3].toLowerCase()) return false;
                const alias = this.getAliasFromSymbol(from.tokens, log.symbol);
                if (to.tokens[alias] !== command.data[4]) return false;
                if (!command.data[5].eq(log.amount)) return false;
                return true;
            });

            if (!payed) continue;

            const cost = getGasPrice();
            const blockLimit = Number((await to.provider.getBlock('latest')).gasLimit);
            const gasLimit = BigInt(Math.min(blockLimit, payed.gasFeeAmount / cost));
            const { payload } = this.relayData.callContractWithToken[command.commandId];

            const expressExecutorContract = AxelarExpressExecutableFactory.connect(payed.destinationAddress, to.relayerWallet);

            const tokenAddress = await to.gateway.tokenAddresses(to.tokens[payed.symbol]);
            const tokenContract = new ethers.Contract(
                tokenAddress,
                [
                    'function allowance(address,address) view returns (uint256)',
                    'function approve(address,uint256)',
                    'function balanceOf(address) view returns (uint256)',
                ],
                to.relayerWallet
            );

            // fund relayer wallet with token
            const balance = await tokenContract.balanceOf(to.relayerWallet.address);
            if (balance.lt(payed.amount)) {
                const fundAmount = ethers.BigNumber.from(1e10);
                await to.giveToken(
                    to.relayerWallet.address,
                    payed.symbol,
                    fundAmount.gt(payed.amount) ? fundAmount.toBigInt() : payed.amount
                );
            }

            const allowance = await tokenContract.allowance(to.relayerWallet.address, expressExecutorContract.address);

            // If the allowance is insufficient, approve the contract
            if (allowance.lt(payed.amount)) {
                await tokenContract.approve(expressExecutorContract.address, ethers.constants.MaxUint256).then((tx: any) => tx.wait());
            }

            await expressExecutorContract
                .expressExecuteWithToken(command.commandId, fromName, payed.sourceAddress, payload, payed.symbol, payed.amount, {
                    gasLimit,
                })
                .then((tx) => tx.wait())
                .catch(() => undefined);
        }
    }

    private async executeEvmExecutable(to: Network, commands: Command[]): Promise<void> {
        for (const command of commands) {
            // If the command doesn't have post execution, skip it
            if (command.post === null) continue;

            // If the command has not approved yet, skip it
            const executed = await this.isExecuted(to, command);
            if (!executed) continue;

            // Find the network that the command is executed on
            const fromName = command.data[0];
            const from = networks.find((network) => network.name === fromName);

            // If the network is not found, skip it
            if (!from) continue;

            // Find the gas event that matches the command
            const { event: gasPaidEvent, gasEventIndex } = this.findMatchedGasEvent(command, from, to);

            // If the gas event is not found, skip it
            if (!gasPaidEvent || gasEventIndex === -1) continue;

            try {
                const cost = getGasPrice();

                // Get the block gas limit
                const blockGasLimit = await from.provider.getBlock('latest').then((block) => block.gasLimit);

                const filterUnmatchedGasEvents = (_: any, index: number) => {
                    return index !== gasEventIndex;
                };
                if (command.name === 'approveContractCall') {
                    this.contractCallGasEvents = this.contractCallGasEvents.filter(filterUnmatchedGasEvents);
                } else {
                    this.contractCallWithTokenGasEvents = this.contractCallWithTokenGasEvents.filter(filterUnmatchedGasEvents);
                    this.expressContractCallWithTokenGasEvents =
                        this.expressContractCallWithTokenGasEvents.filter(filterUnmatchedGasEvents);
                }

                // Execute the command
                const paidGasLimit = gasPaidEvent.gasFeeAmount.div(cost);

                const receipt: ContractReceipt = await command.post?.({
                    gasLimit: blockGasLimit.lt(paidGasLimit) ? blockGasLimit : paidGasLimit,
                });

                // check two-ways contract call
                if (receipt?.events) {
                    const contractCallEventTopic = to.gateway.filters.ContractCall()?.topics?.[0];
                    const contractCallWithTokenEventTopic = to.gateway.filters.ContractCallWithToken()?.topics?.[0];

                    const contractInterface = to.gateway.interface;

                    for (const _event of receipt.events) {
                        if (_event.topics?.[0] === contractCallEventTopic) {
                            // Note: cast to any as workaround for the opened issue in typechain https://github.com/dethcrypto/TypeChain/issues/736
                            const contractCallEvent: ContractCallEventObject = contractInterface.decodeEventLog(
                                'ContractCall',
                                _event.data,
                                _event.topics
                            ) as any;

                            const _newGasPaidEvent = {
                                ...gasPaidEvent,
                                sourceAddress: contractCallEvent.sender,
                                destinationAddress: contractCallEvent.destinationContractAddress,
                                destinationChain: contractCallEvent.destinationChain,
                                payloadHash: contractCallEvent.payloadHash,
                                gasFeeAmount: gasPaidEvent.gasFeeAmount.sub(receipt.gasUsed.mul(cost)),
                            };

                            this.contractCallGasEvents.push(_newGasPaidEvent);
                        } else if (_event.topics?.[0] === contractCallWithTokenEventTopic) {
                            // Note: cast to any as workaround for the opened issue in typechain https://github.com/dethcrypto/TypeChain/issues/736
                            const contractCallWithTokenEvent: ContractCallWithTokenEventObject = contractInterface.decodeEventLog(
                                'ContractCallWithToken',
                                _event.data,
                                _event.topics
                            ) as any;

                            const _newGasWithTokenPaidEvent = {
                                ...gasPaidEvent,
                                sourceAddress: contractCallWithTokenEvent.sender,
                                destinationAddress: contractCallWithTokenEvent.destinationContractAddress,
                                destinationChain: contractCallWithTokenEvent.destinationChain,
                                payloadHash: contractCallWithTokenEvent.payloadHash,
                                symbol: contractCallWithTokenEvent.symbol,
                                amount: contractCallWithTokenEvent.amount,
                                gasFeeAmount: gasPaidEvent.gasFeeAmount.sub(receipt.gasUsed.mul(cost)),
                            };

                            this.contractCallWithTokenGasEvents.push(_newGasWithTokenPaidEvent);
                        }
                    }
                }
            } catch (e: any) {
                logger.log(e);
            }
        }
    }

    private isExecuted(to: Network, command: Command) {
        return to.gateway.isCommandExecuted(command.commandId);
    }

    private findMatchedGasEvent(command: Command, from: Network, to: Network): any {
        if (command.name === 'approveContractCall') {
            const event = this.contractCallGasEvents.find((event) => {
                if (event.sourceAddress.toLowerCase() !== command.data[1].toLowerCase()) return false;
                if (event.destinationChain.toLowerCase() !== to.name.toLowerCase()) return false;
                if (event.destinationAddress.toLowerCase() !== command.data[2].toLowerCase()) return false;
                if (event.payloadHash.toLowerCase() !== command.data[3].toLowerCase()) return false;
                return true;
            });
            return { event, eventIndex: this.contractCallGasEvents.indexOf(event) };
        } else {
            const gmpGasEvent = this.contractCallWithTokenGasEvents.find((event) => {
                if (event.sourceAddress.toLowerCase() !== command.data[1].toLowerCase()) return false;
                if (event.destinationChain.toLowerCase() !== to.name.toLowerCase()) return false;
                if (event.destinationAddress.toLowerCase() !== command.data[2].toLowerCase()) return false;
                if (event.payloadHash.toLowerCase() !== command.data[3].toLowerCase()) return false;
                const alias = this.getAliasFromSymbol(from.tokens, event.symbol);
                if (to.tokens[alias] !== command.data[4]) return false;
                if (!event.amount.eq(command.data[5])) return false;
                return true;
            });

            const expressGmpGasEvent = this.expressContractCallWithTokenGasEvents.find((log: any) => {
                if (log.sourceAddress.toLowerCase() !== command.data[1].toLowerCase()) return false;
                if (log.destinationChain.toLowerCase() !== to.name.toLowerCase()) return false;
                if (log.destinationAddress.toLowerCase() !== command.data[2].toLowerCase()) return false;
                if (log.payloadHash.toLowerCase() !== command.data[3].toLowerCase()) return false;
                const alias = this.getAliasFromSymbol(from.tokens, log.symbol);
                if (to.tokens[alias] !== command.data[4]) return false;
                if (!command.data[5].eq(log.amount)) return false;
                return true;
            });

            return gmpGasEvent
                ? {
                      event: gmpGasEvent,
                      eventIndex: this.contractCallWithTokenGasEvents.indexOf(gmpGasEvent),
                  }
                : {
                      event: expressGmpGasEvent,
                      eventIndex: this.expressContractCallWithTokenGasEvents.indexOf(expressGmpGasEvent),
                  };
        }
    }

    private async updateGasEvents(from: Network, blockNumber: number) {
        const gasPaidForContractCallFilter = from.gasService.filters.GasPaidForContractCall();
        const gasPaidForContractCallLogs = (
            await from.gasService.queryFilter(gasPaidForContractCallFilter, from.lastRelayedBlock + 1, blockNumber)
        ).map((log) => log.args);
        for (const gasLog of gasPaidForContractCallLogs) {
            this.contractCallGasEvents.push(gasLog);
        }

        const nativeGasPaidForContractCallFilter = from.gasService.filters.NativeGasPaidForContractCall();
        const nativeGasPaidForContractCallLogs = (
            await from.gasService.queryFilter(nativeGasPaidForContractCallFilter, from.lastRelayedBlock + 1, blockNumber)
        ).map((log) => {
            return { ...log.args, gasToken: AddressZero };
        });
        for (const gasLog of nativeGasPaidForContractCallLogs) {
            this.contractCallGasEvents.push(gasLog);
        }

        const gasPaidForContractCallWithTokenFilter = from.gasService.filters.GasPaidForContractCallWithToken();
        const gasPaidForContractCallWithToken = (
            await from.gasService.queryFilter(gasPaidForContractCallWithTokenFilter, from.lastRelayedBlock + 1, blockNumber)
        ).map((log) => log.args);
        for (const gasLog of gasPaidForContractCallWithToken) {
            this.contractCallWithTokenGasEvents.push(gasLog);
        }
        const nativeGasPaidForContractCallWithTokenFilter = from.gasService.filters.NativeGasPaidForContractCallWithToken();
        const nativeGasPaidForContractCallWithToken = (
            await from.gasService.queryFilter(nativeGasPaidForContractCallWithTokenFilter, from.lastRelayedBlock + 1, blockNumber)
        ).map((log) => {
            return { ...log.args, gasToken: AddressZero };
        });
        for (const gasLog of nativeGasPaidForContractCallWithToken) {
            this.contractCallWithTokenGasEvents.push(gasLog);
        }
    }

    private async updateExpressGasEvents(from: Network, blockNumber: number) {
        let filter = from.gasService.filters.GasPaidForExpressCallWithToken();
        let newGasLogs: any = (await from.gasService.queryFilter(filter, from.lastExpressedBlock + 1, blockNumber)).map((log) => log.args);
        for (const gasLog of newGasLogs) {
            this.expressContractCallWithTokenGasEvents.push(gasLog);
        }
        filter = from.gasService.filters.NativeGasPaidForExpressCallWithToken();
        newGasLogs = (await from.gasService.queryFilter(filter, from.lastExpressedBlock + 1, blockNumber)).map((log) => {
            return { ...log.args, gasToken: AddressZero };
        });
        for (const gasLog of newGasLogs) {
            this.expressContractCallWithTokenGasEvents.push(gasLog);
        }
    }

    private async updateCallContractEvents(from: Network, blockNumber: number) {
        const filter = from.gateway.filters.ContractCall();
        const logsFrom = await from.gateway.queryFilter(filter, from.lastRelayedBlock + 1, blockNumber);
        for (const log of logsFrom) {
            const tx = await log.getTransaction();
            const transactionHash = tx.hash;
            const sourceEventIndex = log.logIndex;

            const args: any = log.args;
            if (this.commands[args.destinationChain] === null) continue;
            const commandId = getEVMLogID(from.name, log);
            const contractCallArgs: CallContractArgs = {
                from: from.name,
                to: args.destinationChain,
                sourceAddress: args.sender,
                destinationContractAddress: args.destinationContractAddress,
                payload: args.payload,
                payloadHash: args.payloadHash,
                transactionHash,
                sourceEventIndex,
            };
            this.relayData.callContract[commandId] = contractCallArgs;
            let command;
            if (args.destinationChain.toLowerCase() === 'multiversx') {
                command = this.otherRelayers?.multiversx?.createCallContractCommand(commandId, this.relayData, contractCallArgs);
            } else if (args.destinationChain.toLowerCase() === 'aptos') {
                command = this.otherRelayers?.aptos?.createCallContractCommand(commandId, this.relayData, contractCallArgs);
            } else if (args.destinationChain.toLowerCase() === 'near') {
                command = this.otherRelayers?.near?.createCallContractCommand(commandId, this.relayData, contractCallArgs);
            } else if (args.destinationChain.toLowerCase() === 'sui') {
                command = this.otherRelayers?.sui?.createCallContractCommand(commandId, this.relayData, contractCallArgs);
            } else if (args.destinationChain.toLowerCase() === 'agoric') {
                command = this.otherRelayers?.agoric?.createCallContractCommand(commandId, this.relayData, contractCallArgs);
            } else {
                command = this.createCallContractCommand(commandId, this.relayData, contractCallArgs);
            }

            if (command) {
                this.commands[args.destinationChain].push(command);
            }
        }
    }

    createCallContractCommand(commandId: string, relayData: RelayData, contractCallArgs: CallContractArgs): Command {
        return Command.createEVMContractCallCommand(commandId, relayData, contractCallArgs);
    }

    createCallContractWithTokenCommand(
        commandId: string,
        relayData: RelayData,
        callContractWithTokenArgs: CallContractWithTokenArgs
    ): Command {
        return Command.createEVMContractCallWithTokenCommand(commandId, relayData, callContractWithTokenArgs);
    }

    private async updateTokenSentEvent(from: Network, blockNumber: number) {
        const filter = from.gateway.filters.TokenSent();
        const logsFrom = await from.gateway.queryFilter(filter, from.lastRelayedBlock + 1, blockNumber);
        for (const log of logsFrom) {
            const args: any = log.args;
            const alias = this.getAliasFromSymbol(from.tokens, args.symbol);
            const fee = getFee();
            if (args.amount <= fee) continue;
            const amountOut = args.amount.sub(fee);
            const commandId = getEVMLogID(from.name, log);
            const to = networks.find((chain: Network) => chain.name === args.destinationChain);
            if (!to) return;
            const destinationTokenSymbol = to.tokens[alias];

            this.relayData.sendToken[commandId] = {
                from: from.name,
                to: args.destinationChain,
                amountIn: args.amount,
                fee: fee,
                alias: alias,
                amountOut: amountOut,
            };
            this.commands[args.destinationChain].push(
                new Command(
                    commandId,
                    'mintToken',
                    [destinationTokenSymbol, args.destinationAddress, amountOut],
                    ['string', 'address', 'uint256'],
                    args.destinationChain
                )
            );
        }
    }

    private async updateCallContractWithTokensEvents(from: Network, toBlock: number, fromBlock = from.lastRelayedBlock + 1) {
        const filter = from.gateway.filters.ContractCallWithToken();
        const logsFrom = await from.gateway.queryFilter(filter, fromBlock, toBlock);
        for (const log of logsFrom) {
            const args: any = log.args;
            if (!this.commands[args.destinationChain]) continue;
            const alias = this.getAliasFromSymbol(from.tokens, args.symbol);
            const amountOut = args.amount;
            const commandId = getEVMLogID(from.name, log);

            const to = networks.find((chain: Network) => chain.name === args.destinationChain);
            if (!to) return;
            const destinationTokenSymbol = to.tokens[alias];

            const callContractWithTokenArgs: CallContractWithTokenArgs = {
                from: from.name,
                to: args.destinationChain,
                sourceAddress: args.sender,
                destinationContractAddress: args.destinationContractAddress,
                payload: args.payload,
                payloadHash: args.payloadHash,
                alias: alias,
                destinationTokenSymbol,
                amountIn: args.amount,
                amountOut: amountOut,
            };

            this.relayData.callContractWithToken[commandId] = callContractWithTokenArgs;
            const command = this.createCallContractWithTokenCommand(commandId, this.relayData, callContractWithTokenArgs);
            this.commands[args.destinationChain].push(command);
        }
    }

    private async updateDepositAddresses(from: Network, blockNumber: number) {
        for (const address in depositAddresses[from.name]) {
            const data = depositAddresses[from.name][address];
            const tokenSymbol = from.tokens[data.alias];
            const token = await from.getTokenContract(tokenSymbol);
            const fee = getFee();
            const balance = await token.balanceOf(address);
            const to = networks.find((chain: Network) => chain.name === data.destinationChain);
            if (!to) continue;
            const destinationTokenSymbol = to.tokens[data.alias];
            if (balance > fee) {
                const commandId = getRandomID();
                this.relayData.depositAddress[commandId] = {
                    from: from.name,
                    to: data.destinationChain,
                    amountIn: balance,
                    fee: fee,
                    amountOut: balance - fee,
                };
                this.commands[data.destinationChain].push(
                    new Command(
                        commandId,
                        'mintToken',
                        [destinationTokenSymbol, data.destinationAddress, balance - fee],
                        ['string', 'address', 'uint256']
                    )
                );
                const wallet = new Wallet(data.privateKey, from.provider);
                if (Number(await from.provider.getBalance(address)) === 0) {
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
    }

    private getAliasFromSymbol(tokens: { [key: string]: string }, symbol: string) {
        for (const alias in tokens) {
            if (tokens[alias] === symbol) return alias;
        }
        return '';
    }
}
