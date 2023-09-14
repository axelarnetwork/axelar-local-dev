import child_process from "child_process";
import path from "path";
import { v2 as compose } from "docker-compose";

export async function start() {
  console.log("Waiting for Cosmos to start...");
  // child_process.execSync("docker-compose up");
  const result = await compose.upOne("simapp", {
    cwd: path.join(__dirname, "../docker"),
    log: true,
  });

  console.log(result);

  await waitForCosmos();

  console.log("Cosmos started");
}

async function waitForCosmos() {
  const start = Date.now();
  const timeout = 60000;
  const interval = 1000;
  const url = "http://localhost:1317/swagger";
  let status = 0;
  while (Date.now() - start < timeout) {
    try {
      status = await fetch(url).then((res) => res.status);
      console.log(status)
      if (status === 200) {
        break;
      }
    } catch (e) {
      // do nothing
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  if (status !== 200) {
    throw new Error(`Cosmos failed to start in ${timeout}ms`);
  }
}

export function stop() {
  console.log("Stopping Cosmos...");
  child_process.execSync("docker-compose down", { stdio: "inherit" });
  console.log("Cosmos stopped");
}
