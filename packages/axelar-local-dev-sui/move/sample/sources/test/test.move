module test::test {
    use std::ascii;
    use std::vector;
    use std::string::{String};
    use std::type_name;
    use std::option;

    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{TxContext};
    use sui::event;
    use sui::address;
    use sui::hex;

    use axelar::channel::{Self, Channel, ApprovedCall};
    use axelar::discovery::{Self, RelayerDiscovery, Transaction};

    use axelar::gateway;
  
    struct Singleton has key {
        id: UID,
        channel: Channel<ChannelType>,
    }

    struct Executed has copy, drop {
        data: vector<u8>,
    }

    struct ChannelType has store {
    }
  
    fun init(ctx: &mut TxContext) {
        let singletonId = object::new(ctx);
        let channel = channel::create_channel<ChannelType>(option::none(), ctx);
        transfer::share_object(Singleton {
            id: singletonId,
            channel,
        });
    }

    public fun register_transaction(discovery: &mut RelayerDiscovery, singleton: &Singleton) {
        let arguments = vector::empty<vector<u8>>(); 
        let arg = vector::singleton<u8>(0);
        vector::append(&mut arg, address::to_bytes(object::id_address(singleton)));
        vector::push_back(&mut arguments, arg);
        let tx = discovery::new_transaction(
            discovery::new_description(
                address::from_bytes(hex::decode(*ascii::as_bytes(&type_name::get_address(&type_name::get<Singleton>())))), 
                ascii::string(b"test"), 
                ascii::string(b"get_call_info")
            ),
            arguments,
            vector[],
        );
        discovery::register_transaction(discovery, &singleton.channel, tx);
    }

    public fun send_call(singleton: &mut Singleton, destination_chain: String, destination_address: String, payload: vector<u8>) {
        gateway::call_contract(&mut singleton.channel, destination_chain, destination_address, payload);
    }
    
    public fun get_call_info(singleton: &Singleton): Transaction {
        let arguments = vector::empty<vector<u8>>();
        let arg = vector::singleton<u8>(2);
        vector::push_back(&mut arguments, arg);
        arg = vector::singleton<u8>(0);
        vector::append(&mut arg, address::to_bytes(object::id_address(singleton)));
        vector::push_back(&mut arguments, arg);
        discovery::new_transaction(
            discovery::new_description(
                address::from_bytes(hex::decode(*ascii::as_bytes(&type_name::get_address(&type_name::get<Singleton>())))), 
                ascii::string(b"test"), 
                ascii::string(b"execute")
            ),
            arguments,
            vector[],
        )        
    }

    public fun execute(call: ApprovedCall, singleton: &mut Singleton) {
        let (
            _,
            _,
            payload,
        ) = channel::consume_approved_call<ChannelType>(
            &mut singleton.channel,
            call,
        );
        event::emit(Executed { data: payload });
    }
  }