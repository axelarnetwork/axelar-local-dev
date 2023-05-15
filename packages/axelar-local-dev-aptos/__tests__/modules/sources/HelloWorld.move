module hello_world::hello_world {
  use std::string;
  use axelar_framework::gateway;
  use axelar_framework::axelar_gas_service;
  use aptos_framework::account;
  use aptos_framework::event::{Self};
  use std::signer;
  use std::error;
  use aptos_std::aptos_hash::keccak256;

  struct MessageHolder has key {
    message: string::String,
    message_change_events: event::EventHandle<MessageChangeEvent>,
  }

  struct MessageChangeEvent has drop, store {
    from_message: string::String,
    to_message: string::String,
  }

  fun init_module(account: &signer) {
    move_to(account, MessageHolder { message: string::utf8(b"hello"), message_change_events: account::new_event_handle<MessageChangeEvent>(account) });
  }

  public entry fun call(sender: &signer, destination_chain: string::String, contract_address: string::String, payload: vector<u8>, fee_amount: u64) {
    axelar_gas_service::payNativeGasForContractCall(sender, @hello_world, destination_chain, contract_address, keccak256(payload), fee_amount, @hello_world);
    gateway::call_contract(sender, destination_chain, contract_address, payload);
  }

  public entry fun execute(owner: &signer, command_id: vector<u8>, payload: vector<u8>) acquires MessageHolder {
    assert!(signer::address_of(owner) == @hello_world, error::not_found(0));
    let (_, _, payloadHash) = gateway::validate_contract_call(owner, command_id);
    assert!(keccak256(payload) == payloadHash, error::not_found(1));
    // convert
    let message = string::utf8(payload);
    let old_message_holder = borrow_global_mut<MessageHolder>(@hello_world);
    let from_message = *&old_message_holder.message;
    event::emit_event(&mut old_message_holder.message_change_events, MessageChangeEvent {
        from_message,
        to_message: copy message,
    });
    old_message_holder.message = message;
  }
}
