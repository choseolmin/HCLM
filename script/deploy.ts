import "dotenv/config";
import "@nomicfoundation/hardhat-toolbox-viem"; // (타입 보강용, 선택)
import { network } from "hardhat";
import { parseUnits } from "viem";

const { TREASURY, RESERVE, ORACLE } = process.env;

async function main() {
  if (!TREASURY || !RESERVE) throw new Error("Set TREASURY/RESERVE in .env");

  const { viem } = await network.connect(); // ✅ HH3 정석

  const initialSupply = parseUnits("100000", 18);
  const hclm = await viem.deployContract("HCLM", [TREASURY, RESERVE, initialSupply]);
  console.log("HCLM:", hclm.address);

  const vault = await viem.deployContract("Vault", [hclm.address, TREASURY]);
  console.log("Vault(HCLM):", vault.address);

  const sale = await viem.deployContract("Sale", [hclm.address, TREASURY, TREASURY]);
  console.log("Sale:", sale.address);

  const rPerSecRay = 10n ** 27n / 60000n;
  const em = await viem.deployContract("EmissionController", [hclm.address, rPerSecRay, TREASURY]);
  console.log("EmissionController:", em.address);

  const oracleAddr = ORACLE && ORACLE !== "" ? ORACLE : "0x0000000000000000000000000000000000000000";
  const pool = await viem.deployContract("LendingPool", [hclm.address, vault.address, TREASURY, oracleAddr]);
  console.log("LendingPool:", pool.address);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
