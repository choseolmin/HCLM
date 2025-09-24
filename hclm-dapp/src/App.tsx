// src/App.tsx

import { useAccount, useConnect, useDisconnect, useSwitchChain, usePublicClient, useReadContract, useWriteContract } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { formatEther, parseEther, parseUnits, zeroAddress } from 'viem'
import { ADDR } from './addresses'
import { parseAbiItem } from 'viem';
import { useState, useEffect } from 'react'
import { formatUnits } from 'viem'
import { HCLM_ABI, VAULT_ABI, POOL_ABI, SALE_ABI } from './abi'
import './index.css'

function format18(n?: bigint) {
  if (n === undefined) return '-'
  try { return Number(formatEther(n)).toLocaleString() } catch { return n.toString() }
}

export default function App() {
  const { address, chainId, isConnected } = useAccount()
  const { connect, connectors, isPending: isConnectPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain } = useSwitchChain()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const SALE_RATE = 1000n;   // 1 ETH -> 1000 HCLM
  const LTV_BPS   = 5000n;   // 50%




  // ─────────────────────────────────────────────────────────
  // Reads (즉시 새로고침 원하면 React Query 설정에서 refetch 간격 조절)
  // ─────────────────────────────────────────────────────────
  const who = address ?? zeroAddress

  const { data: hclmBal } = useReadContract({
    address: ADDR.HCLM,
    abi: HCLM_ABI,
    functionName: 'balanceOf',
    args: [who],
    query: { enabled: !!address },
  })
  const { data: claimable } = useReadContract({
    address: ADDR.HCLM,
    abi: HCLM_ABI,
    functionName: 'pendingRewards',
    args: [who],
    query: { enabled: !!address },
  })
  const { data: debtTuple } = useReadContract({
    address: ADDR.POOL,
    abi: POOL_ABI,
    functionName: 'debts',
    args: [who],
    query: { enabled: !!address },
  })
  const principal = debtTuple?.[0] ?? 0n
  const interest  = debtTuple?.[1] ?? 0n
  const { data: collateralEth } = useReadContract({
    address: ADDR.POOL,
    abi: POOL_ABI,
    functionName: 'collateralETH',
    args: [who],
    query: { enabled: !!address },
  })
  const { data: rewardIndex } = useReadContract({
    address: ADDR.HCLM,
    abi: HCLM_ABI,
    functionName: 'rewardIndex',
  })

  const needSepolia = isConnected && chainId !== ADDR.CHAIN_ID

  const { data: saleActive } = useReadContract({
    address: ADDR.SALE,
    abi: SALE_ABI,
    functionName: 'active',
  })
  const { data: salePerCap } = useReadContract({
    address: ADDR.SALE,
    abi: SALE_ABI,
    functionName: 'perWalletCapETH',
  })
  const { data: saleGlobalCap } = useReadContract({
    address: ADDR.SALE,
    abi: SALE_ABI,
    functionName: 'globalCapETH',
  })
  const { data: saleMineIn } = useReadContract({
    address: ADDR.SALE,
    abi: SALE_ABI,
    functionName: 'inETHByUser',
    args: [who],
  })
  const { data: saleTotalIn } = useReadContract({
    address: ADDR.SALE,
    abi: SALE_ABI,
    functionName: 'totalInETH',
  })

  // ─────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────

  const maxBorrowTotal =
  ((collateralEth ?? 0n) * SALE_RATE * LTV_BPS) / 10000n;  // 담보 * 1000 * 0.5 
  const headroom = maxBorrowTotal > (principal ?? 0n)
  ? maxBorrowTotal - (principal ?? 0n)
  : 0n;


  async function ensureApproveVault(minAmount: bigint) {
    // allowance 체크 → 부족하면 approve 크게
    const alw = await publicClient!.readContract({
      address: ADDR.HCLM,
      abi: HCLM_ABI,
      functionName: 'allowance',
      args: [address as `0x${string}`, ADDR.VAULT],
    })
    if (alw < minAmount) {
      const tx = await writeContractAsync({
        address: ADDR.HCLM,
        abi: HCLM_ABI,
        functionName: 'approve',
        args: [ADDR.VAULT, parseUnits('1000000', 18)], // 넉넉하게
      })
      await publicClient!.waitForTransactionReceipt({ hash: tx })
    }
  }
  async function waitAndRefresh(txHash: `0x${string}`) {
    if (!publicClient) return
    await publicClient.waitForTransactionReceipt({ hash: txHash })
    await refreshAll()
  }

  async function getDebtsNow(user: `0x${string}`) {
    const [p, i] = await publicClient!.readContract({
      address: ADDR.POOL, abi: POOL_ABI, functionName: 'debts', args: [user],
    }) as readonly [bigint, bigint, bigint] as unknown as [bigint, bigint]
    return { principal: p, interest: i, total: p + i }
  }
  async function repayExact(amount: bigint) {
    if (amount <= 0n) return
    await ensureApproveVault(amount)
    const tx = await writeContractAsync({
      address: ADDR.POOL, abi: POOL_ABI, functionName: 'repay', args: [amount],
    })
    await publicClient!.waitForTransactionReceipt({ hash: tx })
  }
  
  


  // ─────────────────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────────────────

  async function onDepositCollateral(amountEthStr: string) {
    if (!address) return
    if (needSepolia) { switchChain({ chainId: ADDR.CHAIN_ID }); return }
  
    const val = parseEther(amountEthStr || '0.01')
    const tx = await writeContractAsync({
      address: ADDR.POOL,
      abi: POOL_ABI,
      functionName: 'depositETH',
      args: [],
      value: val,                // ✅ 반드시 value에 ETH 넣기
    })
    await publicClient!.waitForTransactionReceipt({ hash: tx })
    // (선택) 즉시 새로고침
    // await refreshAll?.()
  }
  

  // 2) 토큰 대출(= 원하는 수량 차입만)
  async function onBorrow(amountStr: string) {
    if (!address) return
    if (needSepolia) { switchChain({ chainId: ADDR.CHAIN_ID }); return }
    const amt = parseUnits(amountStr || '0.1', 18)
    const tx = await writeContractAsync({
      address: ADDR.POOL, abi: POOL_ABI, functionName: 'borrowHCLM', args: [amt],
    })
    await publicClient!.waitForTransactionReceipt({ hash: tx })
    await waitAndRefresh(tx)  
  }

  // 3) 인덱스 증가(워터폴 로그 합산 → addRewards)
// 3) 인덱스 증가(워터폴 로그 합산 → addRewards) — 마지막 RewardsAdded 이후만 합산
async function onBumpIndex() {
  if (!address) return
  if (needSepolia) { switchChain({ chainId: ADDR.CHAIN_ID }); return }

  // 1) 오너 체크
  const owner = await publicClient!.readContract({
    address: ADDR.HCLM, abi: HCLM_ABI, functionName: 'owner',
  }) as `0x${string}`
  if (owner.toLowerCase() !== (address as string).toLowerCase()) {
    alert('HCLM 오너만 수행 가능. 운영 계정으로 실행하세요.')
    return
  }

  const latest = await publicClient!.getBlockNumber()

  // 2) 마지막 RewardsAdded 이벤트 블록 찾기 (가까운 범위 먼저 검색)
  const RewardsAddedEvt = parseAbiItem(
    'event RewardsAdded(uint256 amount,uint256 indexDelta,uint256 newRewardIndex)'
  )
  // 최근 100k 블록에서 검색, 없으면 0부터 재시도해도 됨(테스트넷이면 부담 적음)
  const searchFrom = latest > 100_000n ? latest - 100_000n : 0n
  let raLogs = await publicClient!.getLogs({
    address: ADDR.HCLM as `0x${string}`,
    event: RewardsAddedEvt,
    fromBlock: searchFrom,
    toBlock: latest,
  })
  // 최근 100k에서 못 찾았으면 전체 스캔(필요시)
  if (raLogs.length === 0 && searchFrom !== 0n) {
    raLogs = await publicClient!.getLogs({
      address: ADDR.HCLM as `0x${string}`,
      event: RewardsAddedEvt,
      fromBlock: 0n,
      toBlock: latest,
    })
  }
  const lastRewardsBlock =
    raLogs.length > 0 ? raLogs[raLogs.length - 1]!.blockNumber : 0n

  // 3) 마지막 RewardsAdded 블록 이후의 Waterfalled 합산
  const WaterfalledEvt = parseAbiItem('event Waterfalled(uint256 toRewards)')
  const wfLogs = await publicClient!.getLogs({
    address: ADDR.POOL as `0x${string}`,
    event: WaterfalledEvt,
    fromBlock: lastRewardsBlock === 0n ? 0n : (lastRewardsBlock + 1n),
    toBlock: latest,
  })
  const total = wfLogs.reduce((acc, l) => acc + (l.args.toRewards as bigint), 0n)

  if (total === 0n) {
    alert('최근 RewardsAdded 이후의 Waterfalled 누적이 0 입니다.')
    return
  }

  // (보너스) 현재 컨트랙트 잔고가 부족하면 리버트 → 사전에 체크해서 메시지 주기
  const hclmBal = await publicClient!.readContract({
    address: ADDR.HCLM as `0x${string}`,
    abi: HCLM_ABI,
    functionName: 'balanceOf',
    args: [ADDR.HCLM as `0x${string}`], // 컨트랙트 자신 잔고
  }) as bigint
  if (hclmBal < total) {
    alert(`컨트랙트 보유분(${hclmBal}) < 누적 워터폴(${total}) 이라 실패합니다. 이미 과거분이 반영됐거나 토큰이 지출되었습니다. 범위를 좁혀 호출하세요.`)
    return
  }

  // 4) addRewards 실행
  try {
    const tx = await writeContractAsync({
      address: ADDR.HCLM, abi: HCLM_ABI, functionName: 'addRewards', args: [total],
    })
    await publicClient!.waitForTransactionReceipt({ hash: tx })
    // 선택: 갱신 트리거
    refreshAll()
    alert('addRewards 반영 완료')
  } catch (e: any) {
    console.error(e)
    alert(`addRewards 실패: ${e?.shortMessage ?? e?.message ?? 'unknown error'}`)
  }
}


  // 4) 상태 조회는 위의 reads 훅으로 실시간 반영 (버튼 불필요)

  // 5) “대출 청산”(내 계정) = 전액 상환 후 담보 전액 인출
  // 추천: 매우 작은 패드 (1e-9 HCLM) — 테스트 전용
const DUST_PAD = 10n ** 9n; // 0.000000001 HCLM in wei (1e-9)

// “전액 상환 + 담보 전액 인출(소량 먼지 용서)” 버전
async function onClosePosition() {
  if (!address) return
  if (needSepolia) { switchChain({ chainId: ADDR.CHAIN_ID }); return }

  // 0) 이자 깨우기(정산 트리거): 1 wei 상환
  await ensureApproveVault(1n)
  try {
    const txPoke = await writeContractAsync({
      address: ADDR.POOL, abi: POOL_ABI, functionName: 'repay', args: [1n],
    })
    await publicClient!.waitForTransactionReceipt({ hash: txPoke })
  } catch { /* 이미 0이면 실패해도 무시 */ }

  // 1) 최신 부채 읽기
  const d = await publicClient!.readContract({
    address: ADDR.POOL, abi: POOL_ABI, functionName: 'debts', args: [address as `0x${string}`],
  }) as readonly [bigint, bigint, bigint]
  const totalDebt = d[0] + d[1]

  // 2) 부채가 남아 있으면 “부채 + 아주 작은 패드” 상환
  if (totalDebt > 0n) {
    const toRepay = totalDebt + DUST_PAD
    await ensureApproveVault(toRepay)
    const txR = await writeContractAsync({
      address: ADDR.POOL, abi: POOL_ABI, functionName: 'repay', args: [toRepay],
    })
    await publicClient!.waitForTransactionReceipt({ hash: txR })
  }

  // 3) 다시 확인 — 정말 0인지 체크(남아있으면 한 번 더 아주 작게 패드 상환해서 밀어냄)
  const d2 = await publicClient!.readContract({
    address: ADDR.POOL, abi: POOL_ABI, functionName: 'debts', args: [address as `0x${string}`],
  }) as readonly [bigint, bigint, bigint]
  const stillDebt = d2[0] + d2[1]
  if (stillDebt > 0n) {
    // 마지막 마무리 패드 (더 작게)
    const finalPad = 10n ** 6n // 1e-12 HCLM
    await ensureApproveVault(finalPad)
    try {
      const txR2 = await writeContractAsync({
        address: ADDR.POOL, abi: POOL_ABI, functionName: 'repay', args: [finalPad],
      })
      await publicClient!.waitForTransactionReceipt({ hash: txR2 })
    } catch {}
  }

  // 4) 담보 전액 인출 시도
  const coll = await publicClient!.readContract({
    address: ADDR.POOL, abi: POOL_ABI, functionName: 'collateralETH', args: [address as `0x${string}`],
  }) as bigint

  if (coll > 0n) {
    const txW = await writeContractAsync({
      address: ADDR.POOL, abi: POOL_ABI, functionName: 'withdrawCollateral', args: [coll],
    })
    await publicClient!.waitForTransactionReceipt({ hash: txW })
    alert('담보 전액 인출 완료')
  } else {
    alert('담보가 없습니다. 부채는 모두 상환된 상태일 수 있습니다.')
  }
}

  

  // 추가: 이자만 상환 / 원금 일부 상환 / 이자 깨우기 / 보상 클레임
  async function onRepayInterestOnly() {
    if (!address) return
    const d = await publicClient!.readContract({ address: ADDR.POOL, abi: POOL_ABI, functionName: 'debts', args: [address] }) as readonly [bigint, bigint, bigint]
    const toInterest = d[1]
    if (toInterest === 0n) { alert('상환할 이자 없음'); return }
    await ensureApproveVault(toInterest)
    const tx = await writeContractAsync({ address: ADDR.POOL, abi: POOL_ABI, functionName: 'repay', args: [toInterest] })
    await waitAndRefresh(tx)  
    await publicClient!.waitForTransactionReceipt({ hash: tx })
  }
  async function onRepayPrincipalSome(amountStr: string) {
    if (!address) return
    const amt = parseUnits(amountStr || '0.1', 18)
    await ensureApproveVault(amt)
    const tx = await writeContractAsync({ address: ADDR.POOL, abi: POOL_ABI, functionName: 'repay', args: [amt] })
    await waitAndRefresh(tx)  
    await publicClient!.waitForTransactionReceipt({ hash: tx })
  }
  async function onPokeAccrue() {
    if (!address) return
    await ensureApproveVault(1n)
    const tx = await writeContractAsync({ address: ADDR.POOL, abi: POOL_ABI, functionName: 'repay', args: [1n] })
    await waitAndRefresh(tx)  
    await publicClient!.waitForTransactionReceipt({ hash: tx })
  }
  async function onClaim() {
    if (!address) return
    const tx = await writeContractAsync({ address: ADDR.HCLM, abi: HCLM_ABI, functionName: 'claim', args: [] })
    await waitAndRefresh(tx)  
    await publicClient!.waitForTransactionReceipt({ hash: tx })
  }
  type Snap = {
    hclm: bigint         // 내 HCLM 잔액
    pending: bigint      // 받을 보상(클레임 가능)
    principal: bigint    // 대출 원금
    interest: bigint     // 누적 이자 (poke 전이면 0일 수 있음)
    collEth: bigint      // 담보 ETH(wei)
    rewardIdx: bigint    // 보상 인덱스
  }
  
  const [snap, setSnap] = useState<Snap | null>(null)
  const fmt18 = (x?: bigint) => formatUnits(x ?? 0n, 18)
  
  // ---- [추가] 한 번에 모든 값 읽는 갱신 함수 ----
  async function refreshAll() {
    try {
      if (!publicClient || !address) return
  
      const [hclmBal, pending, debts, collEth, rewardIdx] =
        await Promise.all([
          publicClient.readContract({
            address: ADDR.HCLM as `0x${string}`,
            abi: HCLM_ABI,
            functionName: 'balanceOf',            // ✅ 허용된 view 함수
            args: [address as `0x${string}`],
          }),
          publicClient.readContract({
            address: ADDR.HCLM as `0x${string}`,
            abi: HCLM_ABI,
            functionName: 'pendingRewards',       // ✅ 허용된 view 함수
            args: [address as `0x${string}`],
          }),
          publicClient.readContract({
            address: ADDR.POOL as `0x${string}`,
            abi: POOL_ABI,
            functionName: 'debts',                // returns [principal, interest, lastTs]
            args: [address as `0x${string}`],
          }),
          publicClient.readContract({
            address: ADDR.POOL as `0x${string}`,
            abi: POOL_ABI,
            functionName: 'collateralETH',        // ✅ view
            args: [address as `0x${string}`],
          }),
          publicClient.readContract({
            address: ADDR.HCLM as `0x${string}`,
            abi: HCLM_ABI,
            functionName: 'rewardIndex',          // ✅ view
          }),
        ]) as [
          bigint,
          bigint,
          readonly [bigint, bigint, bigint],
          bigint,
          bigint
        ]
  
      setSnap({
        hclm: hclmBal,
        pending,
        principal: debts[0],
        interest: debts[1],
        collEth,
        rewardIdx,
      })
    } catch (e) {
      console.error('refreshAll failed:', e)
    }
  }
  
  // ---- [추가] 주소/클라이언트 바뀌면 자동 1회 갱신 ----
  useEffect(() => {
    refreshAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, publicClient])


// Sale에서 ETH로 HCLM 구매 (컨트랙트가 충분한 HCLM을 보유하고 있어야 함)
async function onSaleBuy(ethStr: string) {
  if (!address) return
  if (needSepolia) { switchChain({ chainId: ADDR.CHAIN_ID }); return }
  const ethIn = parseEther(ethStr || '0.001')
  if (ethIn <= 0n) { alert('ETH 금액을 입력하세요'); return }

  // 활성화 확인(옵션)
  try {
    const active = await publicClient!.readContract({
      address: ADDR.SALE, abi: SALE_ABI, functionName: 'active',
    }) as boolean
    if (!active) { alert('세일이 비활성화 상태입니다.'); return }
  } catch {}

  const tx = await writeContractAsync({
    address: ADDR.SALE,
    abi: SALE_ABI,
    functionName: 'buy',
    args: [],
    value: ethIn,
  })
  await publicClient!.waitForTransactionReceipt({ hash: tx })
  await refreshAll()
  alert('구매 완료!')
}




  // ─────────────────────────────────────────────────────────
  // UI
  // ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-4xl mx-auto p-6 space-y-8">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">HCLM dApp (Sepolia)</h1>
          <div className="flex items-center gap-3">
            {!isConnected ? (
              <button
                className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500"
                onClick={() => connect({ connector: injected() })}
                disabled={isConnectPending}
              >
                메타마스크 연결
              </button>
            ) : (
              <>
                <span className="text-xs opacity-80">{address?.slice(0,6)}…{address?.slice(-4)}</span>
                {needSepolia ? (
                  <button className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500" onClick={() => switchChain({ chainId: ADDR.CHAIN_ID })}>
                    Switch to Sepolia
                  </button>
                ) : null}
                <button className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600" onClick={() => disconnect()}>
                  연결 해제
                </button>
              </>
            )}
          </div>
          
        </header>

        {/* 대시보드 */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl p-4 bg-slate-900/60 shadow">
            <div className="text-sm opacity-70 mb-1">HCLM 잔액</div>
            <div className="text-2xl font-medium">{format18(hclmBal)} HCLM</div>
          </div>
          <div className="rounded-2xl p-4 bg-slate-900/60 shadow">
            <div className="text-sm opacity-70 mb-1">받을 이자(보상)</div>
            <div className="text-2xl font-medium">{format18(claimable)} HCLM</div>
          </div>
          <div className="rounded-2xl p-4 bg-slate-900/60 shadow">
            <div className="text-sm opacity-70 mb-1">부채(원금)</div>
            <div className="text-2xl font-medium">{format18(principal)} HCLM</div>
          </div>
          <div className="rounded-2xl p-4 bg-slate-900/60 shadow">
            <div className="text-sm opacity-70 mb-1">부채(이자)</div>
            <div className="text-2xl font-medium">{format18(interest)} HCLM</div>
          </div>
          <div className="rounded-2xl p-4 bg-slate-900/60 shadow">
            <div className="text-sm opacity-70 mb-1">담보 ETH</div>
            <div className="text-2xl font-medium">{format18(collateralEth)} ETH</div>
          </div>
          <div className="rounded-2xl p-4 bg-slate-900/60 shadow">
            <div className="text-sm opacity-70 mb-1">rewardIndex</div>
            <div className="text-2xl font-medium">{rewardIndex?.toString() ?? '-'}</div>
          </div>
        </section>

        {/* 액션들 */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* 세일 구매(ETH→HCLM) */}
          <div className="rounded-2xl p-4 bg-slate-900/60 shadow space-y-3">
            <div className="font-medium mb-1">세일 구매 (ETH → HCLM)</div>
            <div className="text-xs opacity-70 mb-2">
              상태: {saleActive ? '진행중' : '중지'} ·
              지갑 캡: {format18(salePerCap)} ETH ·
              내 구매 누적: {format18(saleMineIn)} ETH ·
              전체 누적: {format18(saleTotalIn)} ETH
            </div>
            <div className="flex gap-2">
              <input id="saleEth" className="input" placeholder="ETH 예: 0.01" defaultValue="0.01" />
              <button
                className="btn"
                disabled={saleActive === false}
                onClick={() => {
                  const v = (document.getElementById('saleEth') as HTMLInputElement).value
                  onSaleBuy(v)
                }}
              >
                구매
              </button>
            </div>
            <div className="text-xs opacity-60">
              고정가: 1 ETH = 1000 HCLM (테스트넷). 컨트랙트 잔고에 HCLM이 충분해야 합니다.
            </div>
          </div>

          {/* 담보 예치 */}
<div className="rounded-2xl p-4 bg-slate-900/60 shadow space-y-3">
  <div className="font-medium mb-1">담보 예치 (ETH)</div>
  <div className="flex gap-2 items-center">
    <input id="depositEth" className="input" placeholder="예: 0.05" defaultValue="0.05" />
    <button
      className="btn"
      onClick={() => {
        const v = (document.getElementById('depositEth') as HTMLInputElement).value
        onDepositCollateral(v)
      }}
    >
      예치
    </button>
  </div>

  <div className="text-sm opacity-75 mt-2">
    현재 담보: <b>{format18(collateralEth)} ETH</b><br/>
    총 대출 한도(원금+이자 포함): <b>{format18(maxBorrowTotal)} HCLM</b><br/>
    <span className="opacity-80">
      (지금 추가로 빌릴 수 있는 최대치 ≈ <b>{format18(headroom)} HCLM</b>)
    </span>
  </div>
</div>


          <div className="rounded-2xl p-4 bg-slate-900/60 shadow space-y-3">
            <div className="font-medium mb-1">토큰 대출</div>
            <div className="flex gap-2">
              <input id="borrowAmt" className="input" placeholder="예: 0.2" defaultValue="0.2" />
              <button className="btn" onClick={() => {
                const v = (document.getElementById('borrowAmt') as HTMLInputElement).value
                onBorrow(v)
              }}>차입</button>
            </div>
          </div>

          <div className="rounded-2xl p-4 bg-slate-900/60 shadow space-y-3">
            <div className="font-medium mb-1">인덱스 증가(오너 전용)</div>
            <button className="btn" onClick={onBumpIndex}>Waterfalled→addRewards</button>
            <div className="text-xs opacity-70">최근 3000블록의 Waterfalled 합계를 addRewards로 반영</div>
          </div>

          <div className="rounded-2xl p-4 bg-slate-900/60 shadow space-y-3">
            <div className="font-medium mb-1">대출 청산(내 계정)</div>
            <button className="btn" onClick={onClosePosition}>전액 상환 + 담보 전액 인출</button>
          </div>

          <div className="rounded-2xl p-4 bg-slate-900/60 shadow space-y-3">
            <div className="font-medium mb-1">이자 관련</div>
            <div className="flex flex-wrap gap-2">
              <button className="btn" onClick={onPokeAccrue}>이자 깨우기(1 wei)</button>
              <button className="btn" onClick={onRepayInterestOnly}>이자만 상환</button>
              <div className="flex gap-2">
                <input id="repaySome" className="input" placeholder="원금 일부 예: 0.1" defaultValue="0.1" />
                <button className="btn" onClick={() => {
                  const v = (document.getElementById('repaySome') as HTMLInputElement).value
                  onRepayPrincipalSome(v)
                }}>일부 상환</button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl p-4 bg-slate-900/60 shadow space-y-3">
            <div className="font-medium mb-1">보상</div>
            <button className="btn" onClick={onClaim}>보상 클레임</button>
          </div>
        </section>
      </div>
    </div>
  )
}

/* ─── util styles (Tailwind + 소량의 @apply) ───
   index.css 에 다음 유틸이 존재해야 합니다.
   .btn   { @apply px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60; }
   .input { @apply px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 outline-none w-40; }
*/
