// import path from "path";
// import fetch from "node-fetch";
// import { v2 as compose, ps } from "docker-compose";


// export async function start() {

// }

// async function waitForCosmos() {
//   const start = Date.now();
//   const timeout = 60000;
//   const interval = 3000;
//   const url = "http://localhost:1317/cosmos/base/node/v1beta1/status";
//   let status = 0;
//   while (Date.now() - start < timeout) {
//     try {
//       status = await fetch(url).then((res: any) => res.status);
//       if (status === 200) {
//         break;
//       }
//     } catch (e) {
//       // do nothing
//     }
//     await new Promise((resolve) => setTimeout(resolve, interval));
//   }
//   if (status !== 200) {
//     throw new Error(`Cosmos failed to start in ${timeout}ms`);
//   }
// }

// export async function stop() {
//   console.log("Stopping Cosmos...");
//   try {
//     await compose.down({
//       cwd: path.join(__dirname, "../docker"),
//     });
//   } catch (e: any) {
//     console.log(e);
//   }
//   console.log("Cosmos stopped");
// }
