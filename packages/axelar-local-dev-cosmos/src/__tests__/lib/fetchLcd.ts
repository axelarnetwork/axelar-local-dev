import fetch from 'node-fetch';

export function fetchAxelarLcd(endpoint?: string) {
  return fetch(`http://localhost/axelar-lcd/${endpoint}`).then((res) =>
    res.json()
  );
}
