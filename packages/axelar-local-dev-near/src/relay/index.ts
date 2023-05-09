import { nearNetwork } from '../near';
import { NearRelayer } from './NearRelayer';

export const nearRelayer = new NearRelayer();

export const relay = async () => {
    if (nearNetwork) await nearRelayer.relay();
};
