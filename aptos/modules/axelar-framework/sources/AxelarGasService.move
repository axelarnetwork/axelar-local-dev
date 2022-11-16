module axelar_framework::axelar_gas_service {
  use std::string;
  use std::signer;
  use aptos_framework::account;
  use aptos_framework::event;
  use aptos_framework::aptos_coin::AptosCoin;
  use aptos_framework::coin;

  struct GasServiceEventStore has key {
    native_gas_paid_for_contract_call_events: event::EventHandle<NativeGasPaidForContractCallEvent>,
  }

  struct NativeGasPaidForContractCallEvent has store, drop{
    source_address: address,
    destination_chain: string::String,
    destination_address: string::String,
    payload_hash: vector<u8>,
    gas_fee_amount: u64,
    refund_address: address
  }

  fun init_module(account: &signer) {
    move_to<GasServiceEventStore>(account, GasServiceEventStore {
      native_gas_paid_for_contract_call_events: account::new_event_handle<NativeGasPaidForContractCallEvent>(account),
    });
    coin::register<AptosCoin>(account);
  }

  public entry fun payNativeGasForContractCall(sender: &signer, destination_chain: string::String, destination_address: string::String, payload_hash: vector<u8>, fee_amount: u64, refund_address: address) acquires GasServiceEventStore {
    let event_store = borrow_global_mut<GasServiceEventStore>(@axelar_framework);

    let source_address = signer::address_of(sender);

    // transfer the fee to the gas service account
    coin::transfer<AptosCoin>(sender, @axelar_framework, fee_amount);

    event::emit_event<NativeGasPaidForContractCallEvent>(&mut event_store.native_gas_paid_for_contract_call_events, NativeGasPaidForContractCallEvent {
      source_address: source_address,
      destination_chain: destination_chain,
      destination_address: destination_address,
      payload_hash: payload_hash,
      gas_fee_amount: fee_amount,
      refund_address: refund_address
    });
  }
}
