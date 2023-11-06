import ReconnectingWebSocket from "reconnecting-websocket";
import { CosmosChainInfo } from "../types";

export class CosmosRelayerClient {
  private wsMap: Map<string, ReconnectingWebSocket>;

  private constructor(config: Omit<CosmosChainInfo, "owner">) {
    this.wsMap = new Map();
  }

  async listenIncomingIBCEvents() {}
}
