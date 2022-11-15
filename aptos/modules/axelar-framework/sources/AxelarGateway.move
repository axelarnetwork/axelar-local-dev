module axelar_framework::gateway {
    use std::error;
    use std::signer;
    use aptos_std::table::{Self, Table};
    use aptos_std::string::{String, sub_string, bytes};
    use aptos_std::aptos_hash::keccak256;
    use axelar_framework::address_utils::{addressToString};
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

    /// Command Id does not exist.
    const MISSING_COMMAND_ID_MESSAGE: u64 = 0;

    /// Command Id already executed.
    const ALREADY_EXECUTED_MESSAGE: u64 = 1;

    /// Invalid destination address.
    const INVALID_DESTINATION_MESSAGE: u64 = 2;

    fun init_module(account: &signer) {
        move_to(account, IncomingContractCallsState {
            table: table::new<vector<u8>, IncomingContractCall>(),
        });

        move_to(account, OutgoingContractCallsState {
            events: account::new_event_handle<OutgoingContractCall>(account),
        });
    }

    public entry fun call_contract(
        signer: &signer,
        destinationChain: String,
        destinationAddress: String,
        payload: vector<u8>,
    ) acquires OutgoingContractCallsState {
        let state = borrow_global_mut<OutgoingContractCallsState>(@axelar_framework);
        let sourceAddress = signer::address_of(signer);
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
        contract: &signer,
        commandId: vector<u8>,
    ): (String, String, vector<u8>) acquires IncomingContractCallsState {
        let contract_calls = borrow_global_mut<IncomingContractCallsState>(@axelar_framework);
        assert!(table::contains<vector<u8>, IncomingContractCall>(&contract_calls.table, commandId), error::not_found(MISSING_COMMAND_ID_MESSAGE));
        let contractCall = table::borrow_mut<vector<u8>, IncomingContractCall>(&mut contract_calls.table, commandId);
        let destAddress = sub_string(&contractCall.destinationAddress, 2, 66);
        let executableAddress = addressToString(signer::address_of(contract));
        assert!(*bytes(&destAddress) == *bytes(&executableAddress), error::permission_denied(INVALID_DESTINATION_MESSAGE));
        assert!(contractCall.status == TO_EXECUTE, error::already_exists(ALREADY_EXECUTED_MESSAGE));
        contractCall.status = EXECUTED;
        (contractCall.sourceChain, contractCall.sourceAddress, contractCall.payloadHash)
    }
}
