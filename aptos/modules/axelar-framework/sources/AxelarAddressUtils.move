module axelar_framework::address_utils {
  use std::bcs;
  use std::vector;
  use aptos_std::string::{String, utf8, bytes, sub_string};

  public fun addressToString(input: address): String {
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
    result
  }

  fun u4toHexStringu8(input: u8): u8 {
    assert!(input<=15, 2);
    if (input<=9) (48 + input)
    else (55 +  32 + input)
  }

  #[test(axelar_framework = @axelar_framework)]
  public entry fun address_should_be_able_to_equal_to_given_string_after_conversion() {
      let destinationAddress = utf8(b"0x8ac1b8ff9583ac8e661c7f0ee462698c57bb7fc454f587e3fa25a57f9406acc0::hello_world");
      let destAddress = sub_string(&destinationAddress, 2, 66);
      assert!(*bytes(&destAddress) == *bytes(&addressToString(@axelar_framework)), 1);
  }
}
