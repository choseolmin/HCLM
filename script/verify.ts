// script/verify.ts
import "dotenv/config";
import hre from "hardhat";
import { verifyContract } from "@nomicfoundation/hardhat-verify/verify"; // ✅ 프로그램틱 API

async function main() {
  const {
    HCLM_ADDR,
    VAULT_ADDR,
    SALE_ADDR,
    EM_ADDR,
    LENDING_ADDR,
    TREASURY,
    RESERVE,
    ORACLE,
  } = process.env;

  // constructor 인자 준비
  const initialSupply = (100000n * (10n ** 18n)).toString();        // 100,000e18
  const rPerSecRay = ((10n ** 27n) / 60000n).toString();            // 예시: RAY/60000

  // HCLM: constructor(address treasury, address reserve, uint256 initialSupply)
  if (HCLM_ADDR && TREASURY && RESERVE) {
    try {
      await verifyContract(
        {
          address: HCLM_ADDR,
          constructorArgs: [TREASURY, RESERVE, initialSupply],
          provider: "etherscan", // Etherscan 대상으로 검증
        },
        hre
      );
      console.log("HCLM verified.");
    } catch (e: unknown) {
      console.error("HCLM verify failed:", e instanceof Error ? e.message : e);
    }
  }

  // Vault: constructor(IERC20 asset, address owner)
  if (VAULT_ADDR && HCLM_ADDR && TREASURY) {
    try {
      await verifyContract(
        {
          address: VAULT_ADDR,
          constructorArgs: [HCLM_ADDR, TREASURY],
          provider: "etherscan",
        },
        hre
      );
      console.log("Vault verified.");
    } catch (e: unknown) {
      console.error("Vault verify failed:", e instanceof Error ? e.message : e);
    }
  }

  // Sale: constructor(IERC20 hclm, address treasury, address owner)
  if (SALE_ADDR && HCLM_ADDR && TREASURY) {
    try {
      await verifyContract(
        {
          address: SALE_ADDR,
          constructorArgs: [HCLM_ADDR, TREASURY, TREASURY],
          provider: "etherscan",
        },
        hre
      );
      console.log("Sale verified.");
    } catch (e: unknown) {
      console.error("Sale verify failed:", e instanceof Error ? e.message : e);
    }
  }

  // EmissionController: constructor(HCLM hclm, uint256 rPerSecRay, address owner)
  if (EM_ADDR && HCLM_ADDR && TREASURY) {
    try {
      await verifyContract(
        {
          address: EM_ADDR,
          constructorArgs: [HCLM_ADDR, rPerSecRay, TREASURY],
          provider: "etherscan",
        },
        hre
      );
      console.log("EmissionController verified.");
    } catch (e: unknown) {
      console.error("EmissionController verify failed:", e instanceof Error ? e.message : e);
    }
  }

  // LendingPool: constructor(HCLM hclm, Vault vault, address owner, IAggregatorV3 oracle)
  if (LENDING_ADDR && HCLM_ADDR && VAULT_ADDR && TREASURY && ORACLE) {
    try {
      await verifyContract(
        {
          address: LENDING_ADDR,
          constructorArgs: [HCLM_ADDR, VAULT_ADDR, TREASURY, ORACLE],
          provider: "etherscan",
        },
        hre
      );
      console.log("LendingPool verified.");
    } catch (e: unknown) {
      console.error("LendingPool verify failed:", e instanceof Error ? e.message : e);
    }
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
