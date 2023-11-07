export async function retry(fn: () => void, maxAttempts = 5, interval = 3000) {
  let attempts = 0;
  while (attempts < maxAttempts) {
    try {
      return await fn();
    } catch (e) {
      attempts++;
      if (attempts === maxAttempts) {
        throw e;
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }
}
