import ReconnectingWebSocket from "reconnecting-websocket";
import WebSocket from "isomorphic-ws";
import { AxelarListenerEvent, CosmosChainInfo } from "../types";

export class AxelarListener {
  private wsMap: Map<string, ReconnectingWebSocket>;
  private wsOptions = {
    WebSocket, // custom WebSocket constructor
    maxRetries: Infinity,
  };

  private wsUrl: string;

  constructor(config: Pick<CosmosChainInfo, "wsUrl">) {
    this.wsMap = new Map();
    this.wsUrl = config.wsUrl || `ws://localhost/axelar-rpc/websocket`;
  }

  private getOrInit(topicId: string) {
    const _ws = this.wsMap.get(topicId);
    if (_ws) {
      return _ws;
    }
    const ws = new ReconnectingWebSocket(this.wsUrl, [], this.wsOptions);
    this.wsMap.set(topicId, ws);

    return ws;
  }

  public stop() {
    this.wsMap.forEach((ws) => {
      ws.close();
    });
  }

  public listen<T>(event: AxelarListenerEvent<T>, callback: (args: T) => void) {
    const ws = this.getOrInit(event.topicId);
    ws.addEventListener("open", () => {
      ws.send(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "subscribe",
          params: [event.topicId],
        })
      );
      console.info(`[AxelarListener] Listening to "${event.type}" event`);
    });

    ws.addEventListener("message", (ev: MessageEvent<any>) => {
      // convert buffer to json
      const _event = JSON.parse(ev.data.toString());

      // check if the event topic is matched
      if (!_event.result || _event.result.query !== event.topicId) return;

      console.debug(`[AxelarListener] Received ${event.type} event`);

      // parse the event data
      event
        .parseEvent(_event.result.events)
        .then((ev) => {
          callback(ev);
        })
        .catch((e) => {
          console.debug(
            `[AxelarListener] Failed to parse topic ${event.topicId} GMP event: ${e}`
          );
        });
    });
  }
}
