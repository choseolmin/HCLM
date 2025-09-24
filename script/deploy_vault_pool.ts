// script/deploy_vault_pool.ts
import "dotenv/config";
import "@nomicfoundation/hardhat-toolbox-viem";
import { network } from "hardhat";

const { TREASURY, ORACLE } = process.env;

async function main() {
  if (!TREASURY) throw new Error("Set TREASURY in .env");
  const HCLM = process.env.HCLM_ADDR!;
  if (!HCLM) throw new Error("Set HCLM_ADDR (existing) in .env");

  const { viem } = await network.connect();

  // 새 Vault
  const vault = await viem.deployContract("Vault", [HCLM, TREASURY]);
  console.log("New Vault:", vault.address);

  // 새 Pool (Vault 주소 갱신)
  const oracleAddr =
    ORACLE && ORACLE !== "" ? ORACLE : "0x0000000000000000000000000000000000000000";
  const pool = await viem.deployContract("LendingPool", [HCLM, vault.address, TREASURY, oracleAddr]);
  console.log("New LendingPool:", pool.address);

  // Vault에 Pool 등록
  const v = await viem.getContractAt("Vault", vault.address);
  await v.write.setPool([pool.address]);
  console.log("Vault.setPool done");

  console.table([
    { key: "HCLM (old)", value: HCLM },
    { key: "Vault (new)", value: vault.address },
    { key: "LendingPool (new)", value: pool.address },
  ]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
