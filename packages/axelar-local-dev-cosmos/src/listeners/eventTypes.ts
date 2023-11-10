import {
  ContractCallSubmitted,
  ContractCallWithTokenSubmitted,
  IBCEvent,
} from "../types";
import { parseContractCallSubmittedEvent } from "./parser";

export interface AxelarListenerEvent<T> {
  type: string;
  topicId: string;
  parseEvent: (event: any) => Promise<T>;
}

export const AxelarCosmosContractCallEvent: AxelarListenerEvent<
  IBCEvent<ContractCallSubmitted>
> = {
  type: "axelar.axelarnet.v1beta1.ContractCallSubmitted",
  topicId: `tm.event='Tx' AND axelar.axelarnet.v1beta1.ContractCallSubmitted.message_id EXISTS`,
  parseEvent: parseContractCallSubmittedEvent,
};
