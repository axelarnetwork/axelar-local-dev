module axelar_framework::executable_registry {
    use std::signer;

    struct ExecuteCapability has store {
        address: address
    }

    public fun register_executable(account: &signer): ExecuteCapability {
        ExecuteCapability{ address: signer::address_of(account) }
    }

    public fun destroy_execute_capability(contract: ExecuteCapability) {
        ExecuteCapability {address: _} = contract;
    }

    public fun address_of(contract: &mut ExecuteCapability): address {
        contract.address
    }
}
