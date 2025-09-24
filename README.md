# HCLM Protocol (Testnet)

**요약**  
- 토큰: **HCLM** (ERC-20, 18dec) — 인덱스 기반 배당(보상).  
- 보상 인덱스: `rewardIndex` (RAY=1e27 스케일). `addRewards(amount)`로만 증가(자동 시간 가산 금지).  
- 렌딩: 담보=ETH, 대출/이자/보상=HCLM. 이자 단리(테스트), 청산 두 트리거(HF<1 || 누적이자≥담보가치).  
- 세일: 테스트넷 고정가 `1 ETH = 1000 HCLM`.  
- 네트워크: Sepolia. (테스트는 Hardhat 로컬)

---

## 아키텍처(ASCII)

[ User ] --ETH--> [ Sale ] --HCLM--> User
_ETH_/→ Treasury

[ User ] --ETH--> [ LendingPool ] --record collateral(ETH)
borrow HCLM <-- [ Vault(HCLM) ]
repay/payInterest HCLM --> [ Vault(HCLM) ] --> (to HCLM) addRewards()

pending(a) = unclaimed[a] + balance[a] * (rewardIndex - userIndex[a]) / RAY
_update(from,to,amt): settle(from), settle(to), move
addRewards(amount): require(this.balance >= amount)
claim(): 1% fee (0.75% Treasury / 0.25% Reserve)
excludeFromRewards(addr,bool) with excludedSupply

[ EmissionController ] (테스트 전용):
tick(): eligible * r_per_sec * dt / RAY 계산 → HCLM로 addRewards()


---

## 인덱스/정산 수식

- `RAY = 1e27`  
- `pending(a) = unclaimed[a] + balance[a] * (rewardIndex - userIndex[a]) / RAY`  
  - 단, `isExcluded[a]==true`면 `balance[a]=0` 취급.  
- `addRewards(amount)`:
  - `indexDelta = amount * RAY / eligibleSupply`, 여기서 `eligibleSupply = totalSupply - excludedSupply`.  
  - `rewardIndex += indexDelta` (내림).  
  - **유의**: `amount`만큼의 **실제 HCLM**이 HCLM 컨트랙트에 사전 입금되어 있어야 함.

---

## 사용법

### 설치/컴파일/테스트
```bash
pnpm i    # or npm i / yarn
npx hardhat compile
npx hardhat test