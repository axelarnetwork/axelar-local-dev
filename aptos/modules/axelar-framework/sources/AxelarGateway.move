module axelar_framework::gateway {
    use std::error;
    use std::signer;
    use std::bcs;
    use std::vector;
    use aptos_std::table::{Self, Table};
    use aptos_std::string::{String, sub_string, bytes, utf8};
    use aptos_std::aptos_hash::keccak256;
    use aptos_std::debug;
    use aptos_framework::util;
    use axelar_framework::executable_registry::{Self, ExecuteCapability};
    use aptos_framework::account;
    use aptos_framework::event::{Self, EventHandle};

    const TO_EXECUTE: u8 = 0;
    const EXECUTED: u8 = 1;

    struct OutgoingContractCall has copy, drop, store {
        sourceAddress: address,
        destinationChain: String,
        destinationAddress: String,
        payload: vector<u8>,
        payloadHash: vector<u8>
    }
    struct OutgoingContractCallsState has key {
        events: EventHandle<OutgoingContractCall>,
    }

    struct IncomingContractCall has store, drop, copy {
        sourceChain: String,
        sourceAddress: String,
        destinationAddress: String,
        payloadHash: vector<u8>,
        status: u8,
    }

    struct IncomingContractCallsState has key {
        table: Table<vector<u8>, IncomingContractCall>,
    }

    /// There is no message present
    const ENO_MESSAGE: u64 = 0;

    fun init_module(account: &signer) {
        move_to(account, IncomingContractCallsState {
            table: table::new<vector<u8>, IncomingContractCall>(),
        });

        move_to(account, OutgoingContractCallsState {
            events: account::new_event_handle<OutgoingContractCall>(account),
        });
    }

    public fun register_executable(account: &signer): ExecuteCapability {
        executable_registry::register_executable(account)
    }

    public entry fun call_contract_as_contract(
        contract: &mut ExecuteCapability,
        destinationChain: String,
        destinationAddress: String,
        payload: vector<u8>,
    ) acquires OutgoingContractCallsState {
        call_contract(executable_registry::address_of(contract), destinationChain, destinationAddress, payload);
    }

    public entry fun call_contract_as_signer(
        signer: &signer,
        destinationChain: String,
        destinationAddress: String,
        payload: vector<u8>,
    ) acquires OutgoingContractCallsState {
        call_contract(signer::address_of(signer), destinationChain, destinationAddress, payload);
    }

    fun call_contract(
        sourceAddress: address,
        destinationChain: String,
        destinationAddress: String,
        payload: vector<u8>,
    ) acquires OutgoingContractCallsState {
        let state = borrow_global_mut<OutgoingContractCallsState>(@axelar_framework);
        event::emit_event(
            &mut state.events,
            OutgoingContractCall {
                sourceAddress,
                destinationChain,
                destinationAddress,
                payload,
                payloadHash: keccak256(payload),
            }
        )
    }

    public entry fun approve_contract_call(
        commandId: vector<u8>,
        sourceChain: String,
        sourceAddress: String,
        destinationAddress: String,
        payloadHash: vector<u8>,
    ) acquires IncomingContractCallsState {
        let contract_calls = borrow_global_mut<IncomingContractCallsState>(@axelar_framework);
        table::add<vector<u8>, IncomingContractCall>(&mut contract_calls.table, commandId, IncomingContractCall{
            sourceChain,
            sourceAddress,
            destinationAddress,
            payloadHash,
            status: TO_EXECUTE,
        });
    }

    public fun validate_contract_call(
        executable: &mut ExecuteCapability,
        commandId: vector<u8>,
    ): IncomingContractCall acquires IncomingContractCallsState {
        let contract_calls = borrow_global_mut<IncomingContractCallsState>(@axelar_framework);
        assert!(table::contains<vector<u8>, IncomingContractCall>(&contract_calls.table, commandId), error::not_found(ENO_MESSAGE));
        let contractCall = table::borrow_mut<vector<u8>, IncomingContractCall>(&mut contract_calls.table, commandId);
        let destAddress = sub_string(&contractCall.destinationAddress, 2, 66);
        let executableAddress = addressToString(executable_registry::address_of(executable));
        assert!(*bytes(&destAddress) == *bytes(&executableAddress), error::not_found(ENO_MESSAGE));
        assert!(contractCall.status == TO_EXECUTE, error::not_found(ENO_MESSAGE));
        contractCall.status = EXECUTED;
        *contractCall
    }

    fun addressToString(input: address): String {
      let bytes = bcs::to_bytes<address>(&input);
      let i = 0;
      let result = vector::empty<u8>();
      while (i < vector::length<u8>(&bytes)) {
        vector::append(&mut result, u8toHexStringu8(*vector::borrow<u8>(&bytes, i)));
        i = i + 1;
      };
      utf8(result)
    }

    fun u8toHexStringu8(input: u8): vector<u8> {
      let result = vector::empty<u8>();
      vector::push_back(&mut result, u4toHexStringu8(input / 16));
      vector::push_back(&mut result, u4toHexStringu8(input % 16));
      //string::utf8(result)
      result
    }

    fun u4toHexStringu8(input: u8): u8 {
      assert!(input<=15, 2);
      if (input<=9) (48 + input) // 0 - 9 => ASCII 48 to 57
      else (55 +  32 + input) //10 - 15 => ASCII 65 to 70
    }

    #[test(axelar_framework = @axelar_framework)]
    public entry fun test() {
        let destinationAddress = utf8(b"0x8ac1b8ff9583ac8e661c7f0ee462698c57bb7fc454f587e3fa25a57f9406acc0::hello_world");
        let destAddress = sub_string(&destinationAddress, 2, 66);
        debug::print<vector<u8>>(bytes(&addressToString(@axelar_framework)));
        debug::print<vector<u8>>(bytes(&destAddress));
        assert!(*bytes(&destAddress) == *bytes(&addressToString(@axelar_framework)), 1);
    }
}
