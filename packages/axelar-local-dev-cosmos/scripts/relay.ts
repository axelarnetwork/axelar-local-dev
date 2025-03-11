import { relayDataToEth } from '../src/relayToEth';
import { relayDataToAgoric } from '../src/relayToAgoric';

if (process.env.TO_AGORIC) {
  console.log('calling relayDataToAgoric');
  relayDataToAgoric();
} else {
  console.log('calling relayDataToEth');
  relayDataToEth();
}
