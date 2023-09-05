# Developing the Sui Module

To develop a module that is compatible with `axelar-local-dev-sui`, follow the guidelines outlined in this document. We will walk you through creating a module similar to the `HelloWorld` module illustrated here.

Before you begin, ensure that your `Move.toml` file is correctly configured. Here is a template that you might find useful:

```toml
[package]
name = "sui-example"
version = "0.0.1"

[dependencies]
Sui = { git = "https://github.com/MystenLabs/sui.git", subdir = "crates/sui-framework/packages/sui-framework", rev = "77a9e0d"}
axelar = { git = "https://github.com/axelarnetwork/axelar-local-dev.git", subdir = "packages/axelar-local-dev-sui/move/axelar", rev = "ae68c9c" }

[addresses]
sui_example = "0x0"
sui = "0x2"
```

With your `Move.toml` set up, you can proceed with the module development which primarily involves two key steps:

1. **Sending Messages from Sui to the EVM Chain:** Implement the `call` function to facilitate this. The function should invoke `gateway::call_contract`. Reference the gateway module's implementation [here](../move/axelar/sources/gateway.move) for details.

2. **Receiving Messages from the EVM Chain:** Implement the `execute` function to enable message reception. It should have parameters arranged in the following order:

```
_command_id: vector<u8>, _source_chain: String, _source_address: String, payload: vector<u8>, ctx: &mut TxContext
```

Below, you'll find a sample module, `axelar_sui_sample::hello_world`, which showcases the implementation of these requirements:

```move
module axelar_sui_sample::hello_world {
use std::string::{utf8, String};
use sui::object::{Self, ID, UID};
use sui::transfer;
use sui::hex::{decode};
use sui::event::emit;
use axelar::gateway;
use sui::tx_context::{TxContext};

struct MessageChangeEvent has copy, drop {
 id: ID,
 updated_message: String,
}

struct MessageHolder has key {
 id: UID,
 message: String,
}

fun init(tx: &mut TxContext) {
 transfer::share_object(MessageHolder {
   id: object::new(tx),
   message: utf8(b"init"),
 });
}

public fun get_message(messageHolder: &MessageHolder): String {
 messageHolder.message
}

// The "call" entry function is essential, and it must invoke `gateway::call_contract` with the parameters specified below:
public entry fun call(destination_chain: vector<u8>, destination_address: vector<u8>, payload: vector<u8>, _fee_amount: u64) {
 gateway::call_contract(destination_chain, destination_address, payload);
}

// Implement the "execute" entry function with the following exact parameters:
public entry fun execute(_command_id: vector<u8>, _source_chain: String, _source_address: String, payload: vector<u8>, ctx: &mut TxContext) {
 // TODO: Bypass command_id verification with the gateway module for now

 let message = utf8(decode(payload));
 let event = MessageHolder {
   id: object::new(ctx),
   message
 };

 emit(MessageChangeEvent {
   id: object::uid_to_inner(&event.id),
   updated_message: event.message,
 });

 transfer::share_object(event);
}
}
```

Feel free to refer to the HelloWorld module and adapt this template according to your specific needs and functionalities.
