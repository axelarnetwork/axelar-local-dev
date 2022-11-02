module axelar_framework::gateway {
    use std::error;
    use std::signer;
    use aptos_std::table::{Self, Table};
    use aptos_std::string::String;
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
    }
    struct OutgoingContractCallsState has key {
        events: EventHandle<OutgoingContractCall>,
    }

    struct IncomingContractCall has store, drop, copy {
        sourceChain: String,
        sourceAddress: String,
        destinationAddress: address,
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
                payload
            }
        )
    }

    public fun approve_contract_call(
        commandId: &vector<u8>,
        sourceChain: &String,
        sourceAddress: &String,
        destinationAddress: &address,
        payloadHash: &vector<u8>,
    ) acquires IncomingContractCallsState {
        let contract_calls = borrow_global_mut<IncomingContractCallsState>(@axelar_framework);
        table::add<vector<u8>, IncomingContractCall>(&mut contract_calls.table, *commandId, IncomingContractCall{
            sourceChain: *sourceChain,
            sourceAddress: *sourceAddress,
            destinationAddress: *destinationAddress,
            payloadHash: *payloadHash,
            status: TO_EXECUTE,
        });
    }

    public fun validate_contract_call(
        executable: &mut ExecuteCapability,
        commandId: &vector<u8>,
    ): IncomingContractCall acquires IncomingContractCallsState {
        let contract_calls = borrow_global_mut<IncomingContractCallsState>(@axelar_framework);
        assert!(table::contains<vector<u8>, IncomingContractCall>(&contract_calls.table, *commandId), error::not_found(ENO_MESSAGE));
        let contractCall = table::borrow_mut<vector<u8>, IncomingContractCall>(&mut contract_calls.table, *commandId);
        assert!(contractCall.destinationAddress == executable_registry::address_of(executable), error::not_found(ENO_MESSAGE));
        assert!(contractCall.status == TO_EXECUTE, error::not_found(ENO_MESSAGE));
        contractCall.status = EXECUTED;
        *contractCall
    }
}
