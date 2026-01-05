import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { config } from "dotenv";

config();

const {
  GATEWAY_CONTRACT,
  GAS_SERVICE_CONTRACT,
  PERMIT2_CONTRACT,
  FACTORY_OWNER,
} = process.env;

console.log("Deploying with Gateway:", GATEWAY_CONTRACT);
console.log("Deploying with Gas Service:", GAS_SERVICE_CONTRACT);
console.log("Deploying with Permit2:", PERMIT2_CONTRACT);

if (!GATEWAY_CONTRACT || !GAS_SERVICE_CONTRACT || !PERMIT2_CONTRACT) {
  throw new Error(
    "Missing env vars: GATEWAY_CONTRACT, GAS_SERVICE_CONTRACT, or PERMIT2_CONTRACT",
  );
}

export default buildModule("FactoryModule", (m) => {
  const gateway = m.getParameter("gateway_", GATEWAY_CONTRACT);
  const gasService = m.getParameter("gasReceiver_", GAS_SERVICE_CONTRACT);
  const permit2 = m.getParameter("permit2_", PERMIT2_CONTRACT);
  const owner =
    FACTORY_OWNER || "agoric1rwwley550k9mmk6uq6mm6z4udrg8kyuyvfszjk";
  const Factory = m.contract("Factory", [gateway, gasService, permit2, owner]);

  return { Factory };
});
