// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {HCLM} from "./HCLM.sol";
import {Vault} from "./Vault.sol";
import {Constants} from "./libs/Constants.sol";
import {Errors} from "./libs/Errors.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IAggregatorV3 {
    function latestRoundData()
        external
        view
        returns (uint80, int256, uint256, uint256, uint80);
    function decimals() external view returns (uint8);
}

/// @title 단일 담보(ETH) / 단일 대출통화(HCLM) 렌딩 풀 (단리 시뮬)
contract LendingPool is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    HCLM  public immutable hclm;      // 대출/상환/이자 납부 통화
    Vault public immutable hclmVault; // HCLM 보관 금고

    mapping(address => uint256) public collateralETH; // 담보 잔액(ETH)

    struct Debt {
        uint256 principal;       // 대출 원금(HCLM, 18)
        uint256 interestAccrued; // 누적 이자(HCLM, 18)
        uint256 lastTs;          // 마지막 정산 시각
    }
    mapping(address => Debt) public debts;

    uint256 public constant LTV_TARGET_BPS    = Constants.LTV_TARGET_BPS;    // 50%
    uint256 public constant LIQ_THRESHOLD_BPS = Constants.LIQ_THRESHOLD_BPS; // 80%
    uint256 public constant LIQ_BONUS_BPS     = Constants.LIQ_BONUS_BPS;     // 5%

    IAggregatorV3 public oracle;            // ETH/USD
    uint256 public maxStale = 3600;         // 1h
    int256  public testEthUsdPrice = 2000e8; // 8 decimals (테스트 모드)

    event Deposited(address indexed user, uint256 ethIn);
    event Withdrew(address indexed user, uint256 ethOut);
    event Borrowed(address indexed user, uint256 hclmOut);
    event Repaid(address indexed user, uint256 amount, uint256 toInterest, uint256 toPrincipal);
    event InterestPaid(address indexed user, uint256 amount);
    event Liquidated(address indexed user, address indexed liquidator, uint256 repayHclm, uint256 seizedEth);
    event Waterfalled(uint256 toRewards); // HCLM 컨트랙트로 옮겨진 이자총액(인덱싱은 별도)

    constructor(HCLM _hclm, Vault _hclmVault, address _owner, IAggregatorV3 _oracle)
        Ownable(_owner) // OZ v5 패턴
    {
        hclm = _hclm;
        hclmVault = _hclmVault;
        oracle = _oracle;
    }

    // ======== 오라클 ========
    function _ethUsd() internal view returns (uint256 price8) {
        if (address(oracle) == address(0)) {
            return uint256(int256(testEthUsdPrice));
        }
        (, int256 answer, , uint256 updatedAt, ) = oracle.latestRoundData();
        if (answer <= 0) revert Errors.PriceInvalid();
        if (block.timestamp - updatedAt > maxStale) revert Errors.StaleOracle();
        return uint256(answer); // 8 decimals 기대
    }

    function setTestEthUsdPrice(int256 p) external onlyOwner {
        testEthUsdPrice = p;
    }

    // ======== 담보 입출금(ETH) ========
    function depositETH() external payable nonReentrant {
        if (msg.value == 0) revert Errors.ZeroAmount();
        collateralETH[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    function _maxBorrowableHCLM(uint256 collateralEthWei, uint256 /*priceEthUsd8*/) internal pure returns (uint256) {
        // ETH(18) * SALE_RATE(무차원) * LTV
        return collateralEthWei * Constants.SALE_RATE * LTV_TARGET_BPS / 10_000;
    }

    function withdrawCollateral(uint256 ethWei) external nonReentrant {
        if (ethWei == 0) revert Errors.ZeroAmount();
        _accrueInterest(msg.sender);

        uint256 newColl = collateralETH[msg.sender] - ethWei;
        collateralETH[msg.sender] = newColl; // optimistic
        if (_healthFactor(msg.sender) < 1e18) {
            collateralETH[msg.sender] += ethWei; // rollback
            revert Errors.CollateralTooLow();
        }

        (bool ok, ) = msg.sender.call{value: ethWei}("");
        require(ok, "eth send fail");
        emit Withdrew(msg.sender, ethWei);
    }

    // ======== 차입/상환/이자납부 ========
    function borrowHCLM(uint256 amount) external nonReentrant {
        if (amount == 0) revert Errors.ZeroAmount();
        _accrueInterest(msg.sender);

        _ethUsd(); // 스테일 체크만 (현재 차입한도는 SALE_RATE 기준)
        uint256 maxBorrow = _maxBorrowableHCLM(collateralETH[msg.sender], 0);
        require(debts[msg.sender].principal + amount <= maxBorrow, "exceeds LTV target");

        debts[msg.sender].principal += amount;
        hclmVault.withdrawTo(msg.sender, amount); // Vault -> user
        emit Borrowed(msg.sender, amount);
    }

    function repay(uint256 amount) external nonReentrant {
        if (amount == 0) revert Errors.ZeroAmount();
        _accrueInterest(msg.sender);

        // user -> Vault
        hclmVault.depositFrom(msg.sender, amount);

        uint256 toInterest = amount > debts[msg.sender].interestAccrued
            ? debts[msg.sender].interestAccrued
            : amount;
        debts[msg.sender].interestAccrued -= toInterest;

        uint256 remaining = amount - toInterest;
        uint256 toPrincipal = remaining > debts[msg.sender].principal ? debts[msg.sender].principal : remaining;
        debts[msg.sender].principal -= toPrincipal;

        // 🔁 이자 수취분은 HCLM 컨트랙트로 이동만 (인덱스 갱신은 오너가 별도로 addRewards 호출)
    if (toInterest > 0) {
    hclmVault.withdrawTo(address(hclm), toInterest);

    // ★ 추가: 풀에 rewarder 권한이 있으면 바로 인덱스 상승
    try hclm.addRewards(toInterest) {
        // ok
    } catch {
        // 권한 없거나 실패 → 워터폴 이벤트만 남기고 넘어감(상환은 계속 진행)
    }

    emit InterestPaid(msg.sender, toInterest);
    emit Waterfalled(toInterest);
    }
        emit Repaid(msg.sender, amount, toInterest, toPrincipal);
    }

    function payInterest(uint256 amount) external nonReentrant {
        if (amount == 0) revert Errors.ZeroAmount();
        _accrueInterest(msg.sender);

        uint256 payAmt = amount > debts[msg.sender].interestAccrued ? debts[msg.sender].interestAccrued : amount;
        hclmVault.depositFrom(msg.sender, payAmt);
        debts[msg.sender].interestAccrued -= payAmt;

        // 🔁 보상 워터폴: HCLM 컨트랙트로 이동만
        hclmVault.withdrawTo(address(hclm), payAmt);

        try hclm.addRewards(payAmt) { } catch { }

        emit InterestPaid(msg.sender, payAmt);
        emit Waterfalled(payAmt);
    }

    // ======== 이자 누적(단리) ========
    function _accrueInterest(address user) internal {
        Debt storage d = debts[user];
        uint256 dt = block.timestamp - d.lastTs;
        if (dt == 0) { d.lastTs = block.timestamp; return; }
        d.lastTs = block.timestamp;
        if (d.principal == 0) return;

        uint256 add = (d.principal * Constants.R_PER_SEC_RAY * dt) / Constants.RAY;
        d.interestAccrued += add;
    }

    // ======== 건강도(HF) 및 청산 ========
    function _healthFactor(address user) public view returns (uint256) {
        Debt memory d = debts[user];

        uint256 debtHclm = d.principal + d.interestAccrued; // 18
        if (debtHclm == 0) return type(uint256).max;

        uint256 debtEth18 = debtHclm / Constants.SALE_RATE; // HCLM->ETH (둘 다 18dec)
        uint256 collEth18 = collateralETH[user];            // 담보 ETH(18)

        // HF = (coll * liq_threshold) / debt   (1e18 스케일 반환)
        uint256 hf = (collEth18 * LIQ_THRESHOLD_BPS / 10_000) * 1e18 / debtEth18;
        return hf;
    }

    function liquidate(address user, uint256 repayHclm) external nonReentrant {
        _accrueInterest(user);

        bool trigger1 = _healthFactor(user) < 1e18;

        Debt memory d = debts[user];
        uint256 interestEth18 = d.interestAccrued / Constants.SALE_RATE;
        bool trigger2 = interestEth18 >= collateralETH[user];

        require(trigger1 || trigger2, "not liquidatable");

        uint256 maxDebt = d.principal + d.interestAccrued;
        if (repayHclm > maxDebt) repayHclm = maxDebt;

        // liquidator -> Vault
        hclmVault.depositFrom(msg.sender, repayHclm);

        uint256 toInterest = repayHclm > d.interestAccrued ? d.interestAccrued : repayHclm;
        debts[user].interestAccrued -= toInterest;
        uint256 remain = repayHclm - toInterest;
        uint256 toPrincipal = remain > debts[user].principal ? debts[user].principal : remain;
        debts[user].principal -= toPrincipal;

        // seize collateral (ETH): HCLM→ETH 환산 후 보너스
        uint256 ethBase = repayHclm / Constants.SALE_RATE;
        uint256 seizedEth = ethBase * (10_000 + LIQ_BONUS_BPS) / 10_000;
        if (seizedEth > collateralETH[user]) seizedEth = collateralETH[user];
        collateralETH[user] -= seizedEth;

        (bool ok, ) = msg.sender.call{value: seizedEth}("");
        require(ok, "eth xfer fail");

        // 🔁 이자 상환분은 HCLM 컨트랙트로 이동만
        if (toInterest > 0) {
            hclmVault.withdrawTo(address(hclm), toInterest);

            try hclm.addRewards(toInterest) { } catch { }

            emit Waterfalled(toInterest);
        }

        emit Liquidated(user, msg.sender, repayHclm, seizedEth);
    }

    receive() external payable {}
}
