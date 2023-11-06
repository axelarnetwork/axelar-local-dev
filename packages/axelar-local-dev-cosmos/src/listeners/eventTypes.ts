import {
  ContractCallSubmitted,
  ContractCallWithTokenSubmitted,
  IBCEvent,
} from "../types";
import {
  parseContractCallSubmittedEvent,
  parseContractCallWithTokenSubmittedEvent,
  parseIBCEvent,
} from "./parser";

export interface AxelarListenerEvent<T> {
  type: string;
  topicId: string;
  parseEvent: (event: any) => Promise<T>;
}

export const AxelarIBCEvent: AxelarListenerEvent<IBCEvent<any>> = {
  type: "IBCEvent",
  topicId: `tm.event='Tx' AND message.action='/ibc.core.channel.v1.MsgRecvPacket'`,
  parseEvent: parseIBCEvent,
};

export const AxelarCosmosContractCallEvent: AxelarListenerEvent<
  IBCEvent<ContractCallSubmitted>
> = {
  type: "axelar.axelarnet.v1beta1.ContractCallSubmitted",
  topicId: `tm.event='Tx' AND axelar.axelarnet.v1beta1.ContractCallSubmitted.message_id EXISTS`,
  parseEvent: parseContractCallSubmittedEvent,
};

export const AxelarCosmosContractCallWithTokenEvent: AxelarListenerEvent<
  IBCEvent<ContractCallWithTokenSubmitted>
> = {
  type: "axelar.axelarnet.v1beta1.ContractCallWithTokenSubmitted",
  topicId: `tm.event='Tx' AND axelar.axelarnet.v1beta1.ContractCallWithTokenSubmitted.message_id EXISTS`,
  parseEvent: parseContractCallWithTokenSubmittedEvent,
};
