#![no_std]

multiversx_sc::imports!();
multiversx_sc::derive_imports!();

use core::ops::Deref;

mod gas_service_proxy {
    multiversx_sc::imports!();

    #[multiversx_sc::proxy]
    pub trait GasService {
        #[payable("EGLD")]
        #[endpoint(payNativeGasForContractCall)]
        fn pay_native_gas_for_contract_call(
            &self,
            destination_chain: &ManagedBuffer,
            destination_address: &ManagedBuffer,
            payload: &ManagedBuffer,
            refund_address: ManagedAddress,
        );
    }
}

mod gateway_proxy {
    multiversx_sc::imports!();

    #[multiversx_sc::proxy]
    pub trait Gateway {
        #[endpoint(callContract)]
        fn call_contract(
            &self,
            destination_chain: &ManagedBuffer,
            destination_contract_address: &ManagedBuffer,
            payload: &ManagedBuffer,
        );
    }
}

#[derive(TypeAbi, TopEncode, TopDecode)]
pub struct ReceivedValue<M: ManagedTypeApi> {
    pub source_chain: ManagedBuffer<M>,
    pub source_address: ManagedBuffer<M>,
    pub payload: ManagedBuffer<M>,
}

#[multiversx_sc::contract]
pub trait HelloWorldContract {
    #[init]
    fn init(&self, gateway_address: ManagedAddress, gas_receiver: ManagedAddress) {
        self.gateway_address().set(&gateway_address);
        self.gas_receiver_address().set(&gas_receiver);
    }

    #[payable("EGLD")]
    #[endpoint(setRemoteValue)]
    fn set_remote_value(
        &self,
        destination_chain: &ManagedBuffer,
        destination_address: &ManagedBuffer,
        payload: &ManagedBuffer,
    ) {
        let value = self.call_value().egld_value();

        require!(value.deref() > &BigUint::zero(), "Gas payment is required");

        self.gas_receiver_proxy(self.gas_receiver_address().get())
            .pay_native_gas_for_contract_call(
                destination_chain,
                destination_address,
                payload,
                self.blockchain().get_caller()
            )
            .execute_on_dest_context::<()>();

        self.gateway_proxy(self.gateway_address().get())
            .call_contract(
                destination_chain,
                destination_address,
                payload
            )
            .execute_on_dest_context::<()>();
    }

    #[endpoint]
    fn execute(
        &self,
        source_chain: ManagedBuffer,
        source_address: ManagedBuffer,
        payload: ManagedBuffer
    ) {
        self.received_value().set(&ReceivedValue {
            source_chain,
            source_address,
            payload
        });
    }

    #[view]
    #[storage_mapper("received_value")]
    fn received_value(&self) -> SingleValueMapper<ReceivedValue<Self::Api>>;

    #[storage_mapper("gateway_address")]
    fn gateway_address(&self) -> SingleValueMapper<ManagedAddress>;

    #[storage_mapper("gas_receiver_address")]
    fn gas_receiver_address(&self) -> SingleValueMapper<ManagedAddress>;

    #[proxy]
    fn gas_receiver_proxy(&self, sc_address: ManagedAddress) -> gas_service_proxy::Proxy<Self::Api>;

    #[proxy]
    fn gateway_proxy(&self, sc_address: ManagedAddress) -> gateway_proxy::Proxy<Self::Api>;
}
