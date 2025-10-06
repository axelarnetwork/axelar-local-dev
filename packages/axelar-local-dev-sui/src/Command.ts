import { ethers } from 'ethers';
import { CallContractArgs, RelayData } from '@axelar-network/axelar-local-dev';
import { SuiNetwork } from './SuiNetwork';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { BCS, getSuiMoveConfig } from '@mysten/bcs';
import { getMoveCallFromTx } from './utils';

const { defaultAbiCoder, arrayify } = ethers.utils;

export class Command {
    commandId: string;
    name: string;
    data: any[];
    encodedData: string;
    post: ((options: any) => Promise<any>) | undefined;

    constructor(
        commandId: string,
        name: string,
        data: any[],
        dataSignature: string[],
        post: ((options: any) => Promise<any>) | undefined = undefined,
        chain: string | null = null,
    ) {
        this.commandId = commandId;
        this.name = name;
        this.data = data;
        this.encodedData = chain === 'sui' && name === 'approve_contract_call' ? '' : defaultAbiCoder.encode(dataSignature, data);
        this.post = post;
    }

    static createContractCallCommand = (commandId: string, suiNetwork: SuiNetwork, relayData: RelayData, args: CallContractArgs) => {
        return new Command(
            commandId,
            'approve_contract_call',
            [args.from, args.sourceAddress, args.destinationContractAddress, args.payloadHash, args.payload],
            [],
            async () => {
                let tx = new TransactionBlock();
                tx.moveCall({
                    target: `${suiNetwork.axelarPackageId}::discovery::get_transaction`,
                    arguments: [tx.object(suiNetwork.axelarDiscoveryId), tx.pure(args.destinationContractAddress)],
                });
                let resp = (await suiNetwork.devInspect(tx)) as any;

                tx = new TransactionBlock();
                tx.moveCall(getMoveCallFromTx(tx, resp.results[0].returnValues[0][0], args.payload));
                resp = (await suiNetwork.devInspect(tx)) as any;

                tx = new TransactionBlock();

                const approvedCall = tx.moveCall({
                    target: `${suiNetwork.axelarPackageId}::gateway::take_approved_call`,
                    arguments: [
                        tx.object(suiNetwork.axelarValidators as string),
                        tx.pure(commandId),
                        tx.pure(args.from),
                        tx.pure(args.sourceAddress),
                        tx.pure(args.destinationContractAddress),
                        tx.pure(String.fromCharCode(...arrayify(args.payload))),
                    ],
                    typeArguments: [],
                });

                tx.moveCall(getMoveCallFromTx(tx, resp.results[0].returnValues[0][0], '', approvedCall));

                return suiNetwork.execute(tx);
            },
            'sui',
        );
    };
}
