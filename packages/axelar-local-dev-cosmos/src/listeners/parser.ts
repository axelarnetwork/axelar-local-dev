import {
  ContractCallSubmitted,
  IBCEvent,
} from "../types";

const decodeBase64 = (str: string) => {
  return Buffer.from(str, "base64").toString("hex");
};

const removeQuote = (str: string) => {
  return str.replace(/['"]+/g, "");
};

export function parseContractCallSubmittedEvent(
  event: any
): Promise<IBCEvent<ContractCallSubmitted>> {
  const key = "axelar.axelarnet.v1beta1.ContractCallSubmitted";
  const data = {
    messageId: removeQuote(event[`${key}.message_id`][0]),
    sender: removeQuote(event[`${key}.sender`][0]),
    sourceChain: removeQuote(event[`${key}.source_chain`][0]),
    destinationChain: removeQuote(event[`${key}.destination_chain`][0]),
    contractAddress: removeQuote(event[`${key}.contract_address`][0]),
    payload: `0x${decodeBase64(removeQuote(event[`${key}.payload`][0]))}`,
    payloadHash: `0x${decodeBase64(
      removeQuote(event[`${key}.payload_hash`][0])
    )}`,
  };

  return Promise.resolve({
    hash: event["tx.hash"][0],
    srcChannel: event?.["write_acknowledgement.packet_src_channel"]?.[0],
    destChannel: event?.["write_acknowledgement.packet_dst_channel"]?.[0],
    args: data,
  });
}
