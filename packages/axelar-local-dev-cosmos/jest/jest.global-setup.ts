async function waitForRpc(chain: string, timeout = 120000): Promise<void> {
  const start = Date.now();
  const interval = 3000;
  const url = `http://localhost/${chain}-rpc/health`;
  let status = 0;
  while (Date.now() - start < timeout) {
    try {
      status = await fetch(url).then((res: any) => res.status);
      if (status === 200) {
        break;
      }
    } catch (e) {
      // do nothing
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  if (status !== 200) {
    throw new Error(`${chain} rpc server failed to start in ${timeout}ms`);
  }
}

export default async () => {
  try {
    await waitForRpc("axelar", 5000);
    await waitForRpc("wasm", 5000);
  } catch (e) {
    console.error(
      "\nPlease make sure you have started the docker containers by running `npm start` before running tests"
    );
    throw e;
  }
};
