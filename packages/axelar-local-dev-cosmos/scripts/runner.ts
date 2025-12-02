import { relayBasic } from "../src/relay";
import { relayDataToEth } from "../src/relayToEth";
import { relayDataToEth as relayTokensToEth } from "../src/relayTokensToEth";
import { startChains, stopAll } from "../src/setup";
import { testFactory } from "../src/testFactory";
import { testWallet } from "../src/testWallet";

const command = process.argv[2];

switch (command) {
  case "relay":
    relayBasic();
    break;
  case "relayToEth":
    relayDataToEth();
    break;
  case "relayWithTokens":
    relayTokensToEth();
    break;
  case "start":
    startChains();
    break;
  case "stop":
    stopAll();
    break;
  case "testFactory":
    testFactory();
    break;
  case "testWallet":
    testWallet();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    process.exit(1);
}