import { ethers } from 'ethers';
import { CallContractArgs, RelayData } from '@axelar-network/axelar-local-dev';
import { SuiNetwork } from './SuiNetwork';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { BCS, getSuiMoveConfig } from '@mysten/bcs';

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
                const callInfoObject = (await suiNetwork.getObject({
                    id: args.destinationContractAddress,
                    options: { showContent: true },
                })) as any;
                const callObjectIds = callInfoObject.data.content.fields.get_call_info_object_ids as string[];

                const lastCol = callInfoObject.data.content.type.lastIndexOf(':');
                const infoTarget = (callInfoObject.data.content.type.slice(0, lastCol + 1) + 'get_call_info') as any;

                let tx = new TransactionBlock();
                tx.moveCall({
                    target: infoTarget,
                    arguments: [
                        tx.pure(String.fromCharCode(...arrayify(args.payload))),
                        ...callObjectIds.map((id: string) => tx.object(id)),
                    ],
                });
                const resp = (await suiNetwork.devInspect(tx)) as any;

                const bcs_encoded_resp = resp.results[0].returnValues[0][0];
                const bcs = new BCS(getSuiMoveConfig());
                const decoded = bcs.de(BCS.STRING, new Uint8Array(bcs_encoded_resp));
                const toCall = JSON.parse(decoded);

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

                toCall.arguments = toCall.arguments.map((arg: string) => {
                    if (arg == 'contractCall') {
                        return approvedCall;
                    }
                    if (arg.slice(0, 4) === 'obj:') {
                        return tx.object(arg.slice(4));
                    }
                    if (arg.slice(0, 5) === 'pure:') {
                        return tx.pure(arg.slice(5));
                    }
                });

                tx.moveCall(toCall);
                return suiNetwork.execute(tx);
            },
            'sui',
        );
    };
}
