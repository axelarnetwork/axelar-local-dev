module axelar_sui_sample::dummy_its {
  use std::string::{String};
  use sui::object::{Self, UID};
  use sui::address::{Self};
  use sui::transfer;
  use axelar::utils::{Self};
  use axelar::channel::{Self, Channel, ApprovedCall};
  use axelar::validators::{Self, AxelarValidators};
  use axelar::gateway::{Self};
  use sui::tx_context::{TxContext};
  use sui::coin::{Self, TreasuryCap, Coin};
  use sui::dynamic_field as df;
  use std::string;

  const SELECTOR_SEND_TOKEN: u256 = 1;
  const SELECTOR_SEND_TOKEN_WITH_DATA: u256 = 2;
  const SELECTOR_DEPLOY_TOKEN_MANAGER: u256 = 3;
  const SELECTOR_DEPLOY_AND_REGISTER_STANDARDIZED_TOKEN: u256 = 4;


  struct Empty has store {

  }

  struct CoinChannel has store {
    id: UID,
  }

  struct ITS has key {
      id: UID,
      //coins: Table<address, TreasuryCap>,
      channel: Channel<Empty>,
      trusted_address: String,
  }

  struct DUMMY_ITS has drop {

  }

  fun init(_: DUMMY_ITS, ctx: &mut TxContext) {
    transfer::share_object(get_singleton_its(ctx));
  }

  fun get_singleton_its(tx: &mut TxContext) : ITS {
    ITS {
      id: object::new(ctx),
      trusted_address: string::utf8(x"00"),
      channel: channel::create_channel<Empty>(Empty {}, tx),
    }
  }

  public fun create_coin_channel(ctx: &mut TxContext): CoinChannel {
    CoinChannel {
        id: object::new(ctx),
    }
  }

  public fun registerCoin<T>(approved_call: ApprovedCall, its: &mut ITS, cap: TreasuryCap<T>) {
    //let data: &mut Empty;
    //let source_chain: String;
    let source_address: String;
    let payload: vector<u8>;
    (
        _,
        _,
        source_address,
        payload,
    ) = channel::consume_approved_call<Empty>(
        &mut its.channel,
        approved_call,
    );
    assert!(&source_address == &its.trusted_address, 1);
    let selector = utils::abi_decode_fixed(payload, 0);
    
    assert!(selector == SELECTOR_DEPLOY_AND_REGISTER_STANDARDIZED_TOKEN, 1);
    let tokenId = address::from_u256(utils::abi_decode_fixed(payload, 1));
      
    df::add(&mut its.id, tokenId, cap);
  }

  fun convert_value(value: u256): u64 {
    (value as u64)
  }

  public fun receiveCoin<T>(approved_call: ApprovedCall, its: &mut ITS, ctx: &mut TxContext) {
    //let data: &mut Empty;
    //let source_chain: String;
    let source_address: String;
    let payload: vector<u8>;
    (
        _,
        _,
        source_address,
        payload,
    ) = channel::consume_approved_call<Empty>(
        &mut its.channel,
        approved_call,
    );
    assert!(&source_address == &its.trusted_address, 1);
    let selector = utils::abi_decode_fixed(payload, 0);
    
    assert!(selector == SELECTOR_SEND_TOKEN, 1);
    let tokenId = address::from_u256(utils::abi_decode_fixed(payload, 1));
      
    let cap = df::borrow_mut<address, TreasuryCap<T>>(&mut its.id, tokenId);
    let destination_address = address::from_u256(utils::abi_decode_fixed(payload, 2));
    let value = convert_value(utils::abi_decode_fixed(payload, 3));
    coin::mint_and_transfer<T>(cap, value, destination_address, ctx);
  }

  public fun receiveCoinWithData<T>(approved_call: ApprovedCall, its: &mut ITS, channel: &CoinChannel, ctx: &mut TxContext): (Coin<T>, String, vector<u8>, vector<u8>) {
    //let data: &mut Empty;
    let source_chain: String;
    let source_address: String;
    let payload: vector<u8>;
    (
        _,
        source_chain,
        source_address,
        payload,
    ) = channel::consume_approved_call<Empty>(
        &mut its.channel,
        approved_call,
    );
    assert!(&source_address == &its.trusted_address, 1);
    let selector = utils::abi_decode_fixed(payload, 0);
    
    assert!(selector == SELECTOR_SEND_TOKEN, 2);
    let tokenId = address::from_u256(utils::abi_decode_fixed(payload, 1));
      
    let cap = df::borrow_mut<address, TreasuryCap<T>>(&mut its.id, tokenId);
    let destination_address = address::from_u256(utils::abi_decode_fixed(payload, 2));

    assert!(object::uid_to_address(&channel.id) == destination_address, 3);

    let value = convert_value(utils::abi_decode_fixed(payload, 3));
    let coin_source_address = utils::abi_decode_variable(payload, 4);
    let data = utils::abi_decode_variable(payload, 5);
    let coin = coin::mint<T>(cap, value, ctx);
    (
      coin,
      source_chain,
      coin_source_address,
      data,
    )
  }

  #[test_only]
  use sui::bcs::{Self};
  #[test_only]
  use std::debug::{Self};
  #[test_only]
  const TEST_SENDER_ADDR: address = @0xA11CE;
  #[test_only]
  use axelar::utils::operators_hash;
  #[test_only]
  use sui::vec_map;

  #[test_only]
  const COMMAND_ID: address = @0xabcd;
  #[test]
  /// Tests execution with a set of validators.
  /// Samples for this test are generated with the `presets/` application.
  fun test_execute() {   
    use sui::test_scenario::{Self as ts, ctx};
    use sui::test_utils::{Self as tu};
    use sui::hash::{Self};

    let source_chain: String = string::utf8(b"Ethereum");
    let source_address: String = string::utf8(b"0x1234");

    // public keys of `operators`
    let epoch = 1;
    let operators = vector[
        x"037286a4f1177bea06c8e15cf6ec3df0b7747a01ac2329ca2999dfd74eff599028"
    ];

    let epoch_for_hash = vec_map::empty();
    vec_map::insert(&mut epoch_for_hash, operators_hash(&operators, &vector[100u128], 10u128), epoch);

    let test = ts::begin(@0x0);

    // create validators for testing
    let validators = validators::new(
        epoch,
        epoch_for_hash,
        ctx(&mut test)
    );

    let payload = utils::abi_encode_start(1);
    utils::abi_encode_fixed(&mut payload, 0, SELECTOR_DEPLOY_AND_REGISTER_STANDARDIZED_TOKEN);

    ts::next_tx(&mut test, @0x0);
    let its = get_singleton_its(ctx(&mut test));
    let channelId = bcs::peel_address(&mut bcs::new(channel::source_id(&its.channel)));
    validators::add_approval_for_testing(
      &mut validators, 
      COMMAND_ID,
      source_chain,
      source_address,
      channelId,
      hash::keccak256(&payload),
    );

    let call = gateway::take_approved_call(
      &mut validators,
      COMMAND_ID,
      source_chain,
      source_address,
      channelId,
      payload,
    );

    ts::next_tx(&mut test, @0x0);
    axelar_sui_sample::coin_registry::init_for_testing(ctx(&mut test));
    let singleton = ts::take_shared<axelar_sui_sample::coin_registry::Singleton>(&mut test);
    let (treasuryCap, coinMetadata) = axelar_sui_sample::coin_registry::decodeSingleton(singleton);
    registerCoin<axelar_sui_sample::coin_registry::COIN_REGISTRY>(call, &mut its, treasuryCap);

    //validators::remove_approval_for_test(&mut validators, COMMAND_ID);
    validators::drop_for_test(validators);
    tu::destroy(its);
    tu::destroy(coinMetadata);
    ts::end(test);
  }
}

#[test_only]
module axelar_sui_sample::coin_registry {
  use sui::transfer;
  use sui::coin::{Self, TreasuryCap, CoinMetadata};
  use sui::tx_context::TxContext;
  use sui::object::{Self, UID};

  struct Singleton has key{
    id: UID,
    treasuryCap: TreasuryCap<COIN_REGISTRY>,
    coinMetadata: CoinMetadata<COIN_REGISTRY>,
  }

  /// Type is named after the module but uppercased
  struct COIN_REGISTRY has drop {}

  fun init(witness: COIN_REGISTRY, ctx: &mut TxContext) {
    let (treasuryCap, coinMetadata) = coin::create_currency(
      witness,
      18,
      b"TEST",
      b"Test Token",
      b"This is for testing",
      std::option::some(sui::url::new_unsafe_from_bytes(b"a url")),
      ctx,
    );

    std::debug::print<u64>(&1);
    transfer::share_object(Singleton {
      id: object::new(ctx),
      treasuryCap: treasuryCap,
      coinMetadata: coinMetadata,
    });
  }

  #[test_only]
  public fun init_for_testing(ctx: &mut TxContext) {
    init(COIN_REGISTRY {}, ctx);
  }

  public fun decodeSingleton(singleton: Singleton): (TreasuryCap<COIN_REGISTRY>, CoinMetadata<COIN_REGISTRY>) {
    let Singleton{ id, treasuryCap, coinMetadata } = singleton;
    object::delete(id);
    ( treasuryCap, coinMetadata )
  }
}