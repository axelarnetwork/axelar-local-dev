/// Minimal GMP app used by the local harness to prove messages cross in both
/// directions.
///
/// Deliberately not axelar-cgp-sui's `example` package: that one depends on
/// InterchainTokenService and Operators, which would take the local framework
/// from six published packages to ten - the largest of them being ITS - for
/// functionality no cross-chain call-contract example uses.
module sample::gmp {
    use axelar_gateway::{channel::{Self, Channel, ApprovedMessage}, gateway::{Self, Gateway}};
    use gas_service::gas_service::GasService;
    use relayer_discovery::{discovery::RelayerDiscovery, transaction};
    use std::ascii::{Self, String};
    use sui::{coin::Coin, event, sui::SUI};

    /// Shared object holding this package's cross-chain identity. Other chains
    /// address messages to `channel`, not to the package id.
    public struct Singleton has key {
        id: UID,
        channel: Channel,
    }

    public struct Executed has copy, drop {
        source_chain: String,
        source_address: String,
        payload: vector<u8>,
    }

    fun init(ctx: &mut TxContext) {
        transfer::share_object(Singleton {
            id: object::new(ctx),
            channel: channel::new(ctx),
        });
    }

    /// Tell the relayer which Move call consumes messages addressed to our
    /// Channel. Without this the discovery lookup returns nothing and inbound
    /// messages are undeliverable.
    ///
    /// Argument prefixes come from relayer_discovery: 2 is the ApprovedMessage
    /// hot potato the relayer injects, 0 marks an object followed by its id.
    public fun register_transaction(discovery: &mut RelayerDiscovery, singleton: &Singleton) {
        // Intentionally permissionless, and that is safe here: every value in
        // the registered transaction is derived from `singleton` itself, so any
        // caller can only re-register the one correct transaction for this
        // Channel. It accepts no caller-supplied data to substitute.
        let mut singleton_arg = vector[0u8];
        singleton_arg.append(object::id_address(singleton).to_bytes());

        let transaction = transaction::new_transaction(
            true,
            vector[
                transaction::new_move_call(
                    transaction::new_function(
                        transaction::package_id<Singleton>(),
                        ascii::string(b"gmp"),
                        ascii::string(b"execute"),
                    ),
                    vector[vector[2u8], singleton_arg],
                    vector[],
                ),
            ],
        );

        discovery.register_transaction(&singleton.channel, transaction);
    }

    /// Sui -> another chain.
    public fun send_call(
        singleton: &Singleton,
        gateway: &Gateway,
        gas_service: &mut GasService,
        destination_chain: String,
        destination_address: String,
        payload: vector<u8>,
        refund_address: address,
        coin: Coin<SUI>,
    ) {
        // Demo only - this shouldn't be used as-is in production: `Singleton` is
        // a shared object, so any Sui account can send from this Channel. The
        // destination sees source_address = this Channel's address, which proves
        // the message came from this package but not which account sent it. A
        // destination that allowlists this Channel therefore trusts every Sui
        // account equally. Gate sending behind a capability, or carry an
        // authenticated sender the destination can check.
        let message_ticket = gateway::prepare_message(
            &singleton.channel,
            destination_chain,
            destination_address,
            payload,
        );

        gas_service.pay_gas(&message_ticket, coin, refund_address, vector[]);
        gateway.send_message(message_ticket);
    }

    /// Another chain -> Sui. Invoked by the relayer via the transaction
    /// registered above.
    public fun execute(approved_message: ApprovedMessage, singleton: &mut Singleton) {
        let (source_chain, _message_id, source_address, payload) = singleton
            .channel
            .consume_approved_message(approved_message);

        // Demo only - this shouldn't be used as-is in production:
        // consume_approved_message only proves the gateway approved a message
        // addressed to THIS Channel. It does not prove who sent it. Validate
        // source_chain/source_address against a trusted sender before acting.
        event::emit(Executed { source_chain, source_address, payload });
    }
}
