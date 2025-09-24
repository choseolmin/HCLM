// hardhat.config.ts
import "dotenv/config";
import { HardhatUserConfig, configVariable } from "hardhat/config";

// ✅ 핵심 viem 플러그인 + 기타
import hardhatViem from "@nomicfoundation/hardhat-viem";              // ← 추가
import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";
import hardhatVerify from "@nomicfoundation/hardhat-verify";
import hardhatMocha from "@nomicfoundation/hardhat-mocha";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.26",
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "paris" },
  },
  networks: {
    hardhat: { type: "edr-simulated", chainId: 31337 },
    sepolia: {
      type: "http",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("PRIVATE_KEY")],
    },
  },
  verify: {
    etherscan: { apiKey: configVariable("ETHERSCAN_API_KEY") },
  },
  test: {
    mocha: { timeout: 120_000 },
  },
  // ✅ 여기 반드시 포함
  plugins: [hardhatViem, hardhatToolboxViem, hardhatVerify, hardhatMocha],
};

export default config;
