import { OutgoingHttpHeaders, IncomingHttpHeaders, Server, ServerResponse, IncomingMessage, createServer } from 'http';
import { Network } from './Network';
import { getDepositAddress } from './networkUtils';
import { relay } from './relay';
const hasOwnProperty = Object.prototype.hasOwnProperty;

function createCORSResponseHeaders(method: string, requestHeaders: IncomingHttpHeaders) {
    // https://fetch.spec.whatwg.org/#http-requests
    const headers: OutgoingHttpHeaders = {};
    const isCORSRequest = hasOwnProperty.call(requestHeaders, 'origin');
    if (isCORSRequest) {
        // OPTIONS preflight requests need a little extra treatment
        if (method === 'OPTIONS') {
            // we only allow POST requests, so it doesn't matter which method the request is asking for
            headers['Access-Control-Allow-Methods'] = 'POST';
            // echo all requested access-control-request-headers back to the response
            if (hasOwnProperty.call(requestHeaders, 'access-control-request-headers')) {
                headers['Access-Control-Allow-Headers'] = requestHeaders['access-control-request-headers'];
            }
            // Safari needs Content-Length = 0 for a 204 response otherwise it hangs forever
            // https://github.com/expressjs/cors/pull/121#issue-130260174
            headers['Content-Length'] = 0;

            // Make browsers and compliant clients cache the OPTIONS preflight response for 10
            // minutes (this is the maximum time Chromium allows)
            headers['Access-Control-Max-Age'] = 600; // seconds
        }

        // From the spec: https://fetch.spec.whatwg.org/#http-responses
        // "For a CORS-preflight request, request’s credentials mode is always "omit",
        // but for any subsequent CORS requests it might not be. Support therefore
        // needs to be indicated as part of the HTTP response to the CORS-preflight request as well.", so this
        // header is added to all requests.
        // Additionally, https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Allow-Credentials,
        // states that there aren't any HTTP Request headers that indicate you whether or not Request.withCredentials
        // is set. Because web3@1.0.0-beta.35-? always sets `request.withCredentials = true` while Safari requires it be
        // returned even when no credentials are set in the browser this header must always be return on all requests.
        // (I've found that Chrome and Firefox don't actually require the header when credentials aren't set)
        //  Regression Commit: https://github.com/ethereum/web3.js/pull/1722
        //  Open Web3 Issue: https://github.com/ethereum/web3.js/issues/1802
        headers['Access-Control-Allow-Credentials'] = 1;

        // From the spec: "It cannot be reliably identified as participating in the CORS protocol
        // as the `Origin` header is also included for all requests whose method is neither
        // `GET` nor `HEAD`."
        // Explicitly set the origin instead of using *, since credentials
        // can't be used in conjunction with *. This will always be set
        /// for valid preflight requests.
        headers['Access-Control-Allow-Origin'] = requestHeaders.origin;
    }
    return headers;
}

function sendResponse(response: ServerResponse, statusCode: number, headers: OutgoingHttpHeaders, data: any = null) {
    response.writeHead(statusCode, headers);
    response.end(data);
}

function rpcError(id: any, code: any, msg: any) {
    return JSON.stringify({
        jsonrpc: '2.0',
        id: id,
        error: {
            code: code,
            message: msg,
        },
    });
}

export default function (networkOrList: Network | Network[], logger = { log: function (...args: any) {} }) {
    var server: Server = createServer(function (request: IncomingMessage, response: ServerResponse) {
        var method = request.method;
        var chunks: any[] = [];

        request
            .on('data', function (chunk) {
                chunks.push(chunk);
            })
            .on('end', async function () {
                var body = Buffer.concat(chunks).toString();
                // At this point, we have the headers, method, url and body, and can now
                // do whatever we need to in order to respond to this request.

                const headers = createCORSResponseHeaders(method!, request.headers);
                const badRequest = () => {
                    headers['Content-Type'] = 'text/plain';
                    sendResponse(response, 400, headers, '400 Bad Request');
                };
                var network;
                let url = request.url?.split('/');
                if (!url) return;
                url?.shift();
                if (Array.isArray(networkOrList)) {
                    if (url?.length == 0) {
                        badRequest();
                        return;
                    }
                    var first = url?.shift();
                    if (first == 'info' && method == 'GET') {
                        headers['Content-Type'] = 'application/json';
                        sendResponse(response, 200, headers, JSON.stringify(networkOrList.length));
                        return;
                    }
                    if (first == 'getDepositAddress' && method == 'GET') {
                        headers['Content-Type'] = 'application/json';
                        const from = url[0].replace('%20', ' ');
                        const to = url[1].replace('%20', ' ');
                        const destinationAddress = url[2];
                        const symbol = url[3];

                        sendResponse(response, 200, headers, JSON.stringify(getDepositAddress(from, to, destinationAddress, symbol)));
                        return;
                    }
                    var n = parseInt(first!);
                    if (n == NaN || n < 0 || n >= networkOrList.length) {
                        badRequest();
                        return;
                    }
                    network = networkOrList[n];
                } else {
                    network = networkOrList;
                }

                switch (method) {
                    case 'POST':
                        var payload;
                        try {
                            payload = JSON.parse(body);
                        } catch (e) {
                            badRequest();
                            return;
                        }

                        // Log messages that come into the TestRPC via http
                        if (payload instanceof Array) {
                            // Batch request
                            for (var i = 0; i < payload.length; i++) {
                                var item = payload[i];
                                logger.log(item.method);
                            }
                        } else {
                            logger.log(payload.method);
                        }

                        // http connections do not support subscriptions
                        if (payload.method === 'eth_subscribe' || payload.method === 'eth_unsubscribe') {
                            headers['Content-Type'] = 'application/json';
                            sendResponse(response, 400, headers, rpcError(payload.id, -32000, 'notifications not supported'));
                            break;
                        }

                        if (network == null) {
                            badRequest();
                            return;
                        }
                        network.ganacheProvider!.send(payload, function (_: any, result: any) {
                            headers['Content-Type'] = 'application/json';
                            sendResponse(response, 200, headers, JSON.stringify(result));
                        });

                        break;
                    case 'OPTIONS':
                        sendResponse(response, 204, headers);
                        break;
                    case 'GET':
                        if (url!.length == 0) {
                            badRequest();
                            break;
                        }
                        if (url![0] == 'info') {
                            headers['Content-Type'] = 'application/json';
                            sendResponse(response, 200, headers, JSON.stringify(network.getInfo()));
                        } else if (url![0] == 'relay') {
                            response.writeHead(200, { 'Content-Type': 'application/json' });
                            logger.log(`Relaying from ${network.name}.`);
                            await relay();
                            response.end(JSON.stringify('Relayed!'));
                        } else {
                            badRequest();
                        }
                        break;
                    default:
                        badRequest();
                        break;
                }
            });
    });
    return server;
}
