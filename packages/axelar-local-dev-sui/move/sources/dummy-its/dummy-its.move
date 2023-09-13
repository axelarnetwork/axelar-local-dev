module axelar_sui_sample::dummy_its {
    use std::string::{String};
    use sui::object::{Self, UID};
    use sui::address::{Self};
    use sui::transfer;
    use axelar::utils::{Self};
    use axelar::channel::{Self, Channel, ApprovedCall};
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
  
    fun init(_: DUMMY_ITS, tx: &mut TxContext) {
      transfer::share_object(ITS {
        id: object::new(tx),
        trusted_address: string::utf8(x"00"),
        channel: channel::create_channel<Empty>(Empty {}, tx),
      });
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
  
  }
  