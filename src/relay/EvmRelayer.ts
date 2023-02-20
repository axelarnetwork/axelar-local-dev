import { HexString } from 'aptos';
import { aptosNetwork } from '../aptos';
import { Relayer } from './Relayer';
import { CallContractArgs, CallContractWithTokenArgs } from './types';
import { Contract, ContractTransaction, ethers, Wallet } from 'ethers';
import { getEVMLogID, getRandomID, getSignedExecuteInput, logger } from '../utils';
import { Command } from './Command';
import { arrayify, defaultAbiCoder } from 'ethers/lib/utils';
import { depositAddresses } from '../networkUtils';
import { Network, networks } from '../Network';
import { getFee, getGasPrice } from '../networkUtils';
import { IAxelarExecutable } from '../contracts';
const AddressZero = ethers.constants.AddressZero;

export class EvmRelayer extends Relayer {
    constructor() {
        super();
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

    async execute() {
        await this.executeEvm();
        await this.executeAptos();
    }

    private async executeEvm() {
        for (const to of networks) {
            const commands = this.commands[to.name];
            if (!commands || commands?.length === 0) continue;
            await this.executeEvmExpress(to, commands);
            const execution = await this.executeEvmGateway(to, commands).catch((e: any) => {
                logger.log(e);
            });
            await this.completeEvmExpress(to, commands, execution);
            await this.executeEvmExecutable(to, commands, execution);
        }
    }

    private async executeAptos() {
        const toExecute = this.commands['aptos'];
        if (toExecute?.length === 0) return;

        await this.executeAptosGateway(toExecute);
        await this.executeAptosExecutable(toExecute);
    }

    private async executeAptosGateway(commands: Command[]) {
        if (!aptosNetwork) return;
        for (const command of commands) {
            const commandId = new HexString(command.commandId).toUint8Array();
            const payloadHash = new HexString(command.data[3]).toUint8Array();
            await aptosNetwork.approveContractCall(commandId, command.data[0], command.data[1], command.data[2], payloadHash);
        }
    }

    private async executeAptosExecutable(commands: Command[]) {
        if (!aptosNetwork) return;
        for (const command of commands) {
            if (!command.post) continue;

            await command.post({});
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
            if (command.post == null) continue;

            const fromName = command.data[0];
            const from = networks.find((network) => network.name === fromName);
            if (!from) continue;

            const payed = this.expressContractCallWithTokenGasEvents.find((log: any) => {
                // console.log(log, command);
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

            try {
                const cost = getGasPrice();
                const blockLimit = Number((await to.provider.getBlock('latest')).gasLimit);
                const gasLimit = BigInt(Math.min(blockLimit, payed.gasFeeAmount / cost));
                const { payload } = this.relayData.callContractWithToken[command.commandId];

                await to.expressService
                    .connect(to.ownerWallet)
                    .callWithToken(
                        command.commandId || ethers.constants.HashZero,
                        fromName,
                        payed.sourceAddress,
                        payed.destinationAddress,
                        payload,
                        payed.symbol,
                        payed.amount,
                        { gasLimit }
                    )
                    .then((tx: ContractTransaction) => tx.wait());
            } catch (e) {
                console.log(e);
                logger.log(e);
            }
        }
    }

    private async completeEvmExpress(to: Network, commands: Command[], execution: any): Promise<void> {
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
            if (!from) continue;

            const payed = this.expressContractCallWithTokenGasEvents.find((log: any) => {
                if (log.sourceAddress.toLowerCase() != command.data[1].toLowerCase()) return false;
                if (log.destinationChain.toLowerCase() != to.name.toLowerCase()) return false;
                if (log.destinationAddress.toLowerCase() != command.data[2].toLowerCase()) return false;
                if (log.payloadHash.toLowerCase() != command.data[3].toLowerCase()) return false;
                const alias = this.getAliasFromSymbol(from.tokens, log.symbol);
                if (to.tokens[alias] != command.data[4]) return false;
                if (!command.data[5].eq(log.amount)) return false;
                return true;
            });

            if (!payed) continue;
            if (command.name == 'approveContractCallWithMint') {
                const index = this.expressContractCallWithTokenGasEvents.indexOf(payed);
                this.expressContractCallWithTokenGasEvents.splice(index, 1);
            }

            const { sourceAddress, destinationContractAddress, payload, alias, amountIn } =
                this.relayData.callContractWithToken[command.commandId];

            try {
                await to.expressService
                    .connect(to.ownerWallet)
                    .callWithToken(command.commandId, from.name, sourceAddress, destinationContractAddress, payload, alias, amountIn)
                    .then((tx: any) => tx.wait());
            } catch (e) {
                logger.log(e);
            }
        }
    }

    private async executeEvmExecutable(to: Network, commands: Command[], execution: any): Promise<void> {
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
            if (!from) continue;
            const payed =
                command.name == 'approveContractCall'
                    ? this.contractCallGasEvents.find((log: any) => {
                          if (log.sourceAddress.toLowerCase() != command.data[1].toLowerCase()) return false;
                          if (log.destinationChain.toLowerCase() != to.name.toLowerCase()) return false;
                          if (log.destinationAddress.toLowerCase() != command.data[2].toLowerCase()) return false;
                          if (log.payloadHash.toLowerCase() != command.data[3].toLowerCase()) return false;
                          return true;
                      })
                    : this.contractCallWithTokenGasEvents.find((log: any) => {
                          if (log.sourceAddress.toLowerCase() != command.data[1].toLowerCase()) return false;
                          if (log.destinationChain.toLowerCase() != to.name.toLowerCase()) return false;
                          if (log.destinationAddress.toLowerCase() != command.data[2].toLowerCase()) return false;
                          if (log.payloadHash.toLowerCase() != command.data[3].toLowerCase()) return false;
                          const alias = this.getAliasFromSymbol(from.tokens, log.symbol);
                          if (to.tokens[alias] != command.data[4]) return false;
                          if (BigInt(log.amount) != BigInt(command.data[5])) return false;
                          return true;
                      });

            if (!payed) continue;
            if (command.name == 'approveContractCall') {
                const index = this.contractCallGasEvents.indexOf(payed);
                this.contractCallGasEvents.splice(index, 1);
            } else {
                const index = this.contractCallWithTokenGasEvents.indexOf(payed);
                this.contractCallWithTokenGasEvents.splice(index, 1);
            }
            try {
                const cost = getGasPrice();
                const blockLimit = Number((await to.provider.getBlock('latest')).gasLimit);
                await command.post({
                    gasLimit: BigInt(Math.min(blockLimit, payed.gasFeeAmount / cost)),
                });
            } catch (e) {
                logger.log(e);
            }
        }
    }

    private async updateGasEvents(from: Network, blockNumber: number) {
        let filter = from.gasService.filters.GasPaidForContractCall();
        let newGasLogs: any = (await from.gasService.queryFilter(filter, from.lastRelayedBlock + 1, blockNumber)).map((log) => log.args);
        for (const gasLog of newGasLogs) {
            this.contractCallGasEvents.push(gasLog);
        }

        filter = from.gasService.filters.NativeGasPaidForContractCall();
        newGasLogs = (await from.gasService.queryFilter(filter, from.lastRelayedBlock + 1, blockNumber)).map((log) => {
            return { ...log.args, gasToken: AddressZero };
        });
        for (const gasLog of newGasLogs) {
            this.contractCallGasEvents.push(gasLog);
        }

        filter = from.gasService.filters.GasPaidForContractCallWithToken();
        newGasLogs = (await from.gasService.queryFilter(filter, from.lastRelayedBlock + 1, blockNumber)).map((log) => log.args);
        for (const gasLog of newGasLogs) {
            this.contractCallWithTokenGasEvents.push(gasLog);
        }
        filter = from.gasService.filters.NativeGasPaidForContractCallWithToken();
        newGasLogs = (await from.gasService.queryFilter(filter, from.lastRelayedBlock + 1, blockNumber)).map((log) => {
            return { ...log.args, gasToken: AddressZero };
        });
        for (const gasLog of newGasLogs) {
            this.contractCallWithTokenGasEvents.push(gasLog);
        }
    }

    private async updateExpressGasEvents(from: Network, blockNumber: number) {
        let filter = from.gasService.filters.GasPaidForExpressCallWithToken();
        let newGasLogs: any = (await from.gasService.queryFilter(filter, from.lastRelayedBlock + 1, blockNumber)).map((log) => log.args);
        for (const gasLog of newGasLogs) {
            this.expressContractCallWithTokenGasEvents.push(gasLog);
        }
        filter = from.gasService.filters.NativeGasPaidForExpressCallWithToken();
        newGasLogs = (await from.gasService.queryFilter(filter, from.lastRelayedBlock + 1, blockNumber)).map((log) => {
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
            const args: any = log.args;
            if (this.commands[args.destinationChain] == null) continue;
            const commandId = getEVMLogID(from.name, log);
            const contractCallArgs: CallContractArgs = {
                from: from.name,
                to: args.destinationChain,
                sourceAddress: args.sender,
                destinationContractAddress: args.destinationContractAddress,
                payload: args.payload,
                payloadHash: args.payloadHash,
            };
            this.relayData.callContract[commandId] = contractCallArgs;
            let command;
            if (args.destinationChain.toLowerCase() == 'aptos') {
                command = Command.createAptosContractCallCommand(commandId, this.relayData, contractCallArgs);
            } else {
                command = Command.createEVMContractCallCommand(commandId, this.relayData, contractCallArgs);
            }
            this.commands[args.destinationChain].push(command);
        }
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
            const to = networks.find((chain: Network) => chain.name == args.destinationChain);
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
                    ['string', 'address', 'uint256']
                )
            );
        }
    }

    private async updateCallContractWithTokensEvents(from: Network, blockNumber: number) {
        const filter = from.gateway.filters.ContractCallWithToken();
        const logsFrom = await from.gateway.queryFilter(filter, from.lastRelayedBlock + 1, blockNumber);
        for (const log of logsFrom) {
            const args: any = log.args;
            const alias = this.getAliasFromSymbol(from.tokens, args.symbol);
            const amountOut = args.amount;
            const commandId = getEVMLogID(from.name, log);

            const to = networks.find((chain: Network) => chain.name == args.destinationChain);
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
            const command = Command.createEVMContractCallWithTokenCommand(commandId, this.relayData, callContractWithTokenArgs);
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
            const to = networks.find((chain: Network) => chain.name == data.destinationChain);
            const destinationTokenSymbol = to!.tokens[data.alias];
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
    }

    private getAliasFromSymbol(tokens: { [key: string]: string }, symbol: string) {
        for (const alias in tokens) {
            if (tokens[alias] === symbol) return alias;
        }
        return '';
    }
}
