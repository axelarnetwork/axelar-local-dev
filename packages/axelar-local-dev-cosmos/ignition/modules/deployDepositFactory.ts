import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { config } from "dotenv";

config();

const {
  GATEWAY_CONTRACT,
  GAS_SERVICE_CONTRACT,
  PERMIT2_CONTRACT,
  FACTORY_CONTRACT,
  OWNER_ADDRESS,
} = process.env;

console.log("Deploying with Gateway:", GATEWAY_CONTRACT);
console.log("Deploying with Gas Service:", GAS_SERVICE_CONTRACT);
console.log("Deploying with Permit2:", PERMIT2_CONTRACT);
console.log("Deploying with Factory:", FACTORY_CONTRACT);
console.log("Deploying with Owner:", OWNER_ADDRESS);

if (
  !GATEWAY_CONTRACT ||
  !GAS_SERVICE_CONTRACT ||
  !PERMIT2_CONTRACT ||
  !FACTORY_CONTRACT ||
  !OWNER_ADDRESS
) {
  throw new Error(
    "Missing required env vars: GATEWAY_CONTRACT, GAS_SERVICE_CONTRACT, PERMIT2_CONTRACT, FACTORY_CONTRACT, or OWNER_ADDRESS",
  );
}

export default buildModule("DepositFactoryModule", (m) => {
  const gateway = m.getParameter("gateway_", GATEWAY_CONTRACT);
  const gasService = m.getParameter("gasReceiver_", GAS_SERVICE_CONTRACT);
  const permit2 = m.getParameter("permit2_", PERMIT2_CONTRACT);
  const factory = m.getParameter("factory_", FACTORY_CONTRACT);
  const owner = m.getParameter("owner_", OWNER_ADDRESS);

  const DepositFactory = m.contract("DepositFactory", [
    gateway,
    gasService,
    permit2,
    factory,
    owner,
  ]);

  return { DepositFactory };
});
