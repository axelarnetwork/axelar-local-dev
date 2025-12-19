import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { config } from "dotenv";

config();

const { GATEWAY_CONTRACT, GAS_SERVICE_CONTRACT } = process.env;

console.log("Deploying with Gateway:", GATEWAY_CONTRACT);
console.log("Deploying with Gas Service:", GAS_SERVICE_CONTRACT);

if (!GATEWAY_CONTRACT || !GAS_SERVICE_CONTRACT) {
  throw new Error("Missing env vars");
}

export default buildModule("FactoryModule", (m) => {
  const gateway = m.getParameter("gateway_", GATEWAY_CONTRACT);
  const gasService = m.getParameter("gasReceiver_", GAS_SERVICE_CONTRACT);
  // Address on Eth Sepolia - should be configurable for all networks
  const permit2 = m.getParameter(
    "permit2_",
    "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  );

  const Factory = m.contract("Factory", [gateway, gasService, permit2, "agoric1rwwley550k9mmk6uq6mm6z4udrg8kyuyvfszjk"]);

  return { Factory };
});
