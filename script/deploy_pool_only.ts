import "@nomicfoundation/hardhat-viem";
import hre from "hardhat";
import { zeroAddress } from "viem";

async function main() {
  const { viem } = await hre.network.connect();
  const pub = await viem.getPublicClient();

  // 필요하면 .env에서 읽으세요. (여기선 네가 쓰는 기본값을 넣어둠)
  const HCLM_ADDR  = (process.env.HCLM_ADDR  ?? "0x40f200fb867f6707dea6fe7a0600032910c2c4e6") as `0x${string}`;
  const VAULT_ADDR = (process.env.VAULT_ADDR ?? "0x1d28d6e972249310768d4247ad46723fe0b6aa82") as `0x${string}`;
  const ORACLE     = (process.env.ORACLE_ADDR ?? zeroAddress) as `0x${string}`;

  const hclm  = await viem.getContractAt("HCLM",  HCLM_ADDR);
  const vault = await viem.getContractAt("Vault", VAULT_ADDR);

  // 1) 새 풀 배포
  const [deployer] = await viem.getWalletClients();
  const pool = await viem.deployContract("LendingPool", [HCLM_ADDR, VAULT_ADDR, deployer.account.address, ORACLE]);
  console.log("New LendingPool:", pool.address);

  // 2) Vault.setPool(newPool)
  {
    const tx = await vault.write.setPool([pool.address]);
    await pub.waitForTransactionReceipt({ hash: tx });
    console.log("Vault.setPool ->", pool.address);
  }

  // 3) HCLM.excludeFromRewards(newPool, true)
  try {
    const ex = await hclm.read.isExcluded([pool.address]);
    if (!ex) {
      const tx = await hclm.write.excludeFromRewards([pool.address, true]);
      await pub.waitForTransactionReceipt({ hash: tx });
      console.log("HCLM.excludeFromRewards(pool, true)");
    } else {
      console.log("HCLM: pool already excluded");
    }
  } catch (e) {
    console.log("HCLM: isExcluded/excludeFromRewards 호출 실패 — 토큰이 해당 기능을 지원하지 않거나, ABI가 다릅니다. (스킵)", e);
  }

  // 4) (옵션) 리워더 레지스트리 — 토큰이 지원하는 경우에만
  try {
    const isRewarder: boolean = await (hclm.read as any).rewarders([pool.address]);
    if (!isRewarder) {
      const tx = await (hclm.write as any).setRewarder([pool.address, true]);
      await pub.waitForTransactionReceipt({ hash: tx });
      console.log("HCLM.setRewarder(pool, true)");
    } else {
      console.log("HCLM: pool already a rewarder");
    }
  } catch {
    console.log("HCLM: rewarder 레지스트리 미지원 — 스킵");
  }

  // 5) 테스트 오라클이면 가격 세팅
  if (ORACLE === zeroAddress) {
    const TEST_PRICE = 2000n * 10n ** 8n; // 2000 * 1e8
    const tx = await pool.write.setTestEthUsdPrice([TEST_PRICE]);
    await pub.waitForTransactionReceipt({ hash: tx });
    console.log("Pool.setTestEthUsdPrice(2000e8)");
  }

  console.log("\nNext steps:");
  console.log("- HCLM.isExcluded(newPool) == true 확인");
  console.log("- (리워더 기능 있는 토큰인 경우) rewarders(newPool) == true 확인");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
