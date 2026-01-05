import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { config } from "dotenv";

config();

const { GATEWAY_CONTRACT, GAS_SERVICE_CONTRACT, PERMIT2_CONTRACT } =
  process.env;

console.log("Deploying FactoryFactory with Gateway:", GATEWAY_CONTRACT);
console.log("Deploying FactoryFactory with Gas Service:", GAS_SERVICE_CONTRACT);
console.log("Deploying FactoryFactory with Permit2:", PERMIT2_CONTRACT);

if (!GATEWAY_CONTRACT || !GAS_SERVICE_CONTRACT || !PERMIT2_CONTRACT) {
  throw new Error(
    "Missing env vars: GATEWAY_CONTRACT, GAS_SERVICE_CONTRACT, or PERMIT2_CONTRACT",
  );
}

export default buildModule("FactoryFactoryModule", (m) => {
  const gateway = m.getParameter("gateway_", GATEWAY_CONTRACT);
  const gasService = m.getParameter("gasReceiver_", GAS_SERVICE_CONTRACT);
  const permit2 = m.getParameter("permit2_", PERMIT2_CONTRACT);

  const FactoryFactory = m.contract("FactoryFactory", [
    gateway,
    gasService,
    permit2,
  ]);

  return { FactoryFactory };
});
