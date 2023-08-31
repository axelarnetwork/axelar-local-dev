// Todo: remove this file once we have a proper gateway module
module axelar::gateway {
  use sui::event::emit;

  struct ContractCall has copy, drop {
    source: vector<u8>,
    destination_chain: vector<u8>,
    destination_address: vector<u8>,
    payload: vector<u8>,
  }

  public fun call_contract(destination_chain: vector<u8>, destination_address: vector<u8>, payload: vector<u8>) {
    emit(ContractCall {
      source: b"sui",
      destination_chain,
      destination_address,
      payload,
    });
  }
}
