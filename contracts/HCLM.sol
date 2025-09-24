// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Constants} from "./libs/Constants.sol";
import {Errors} from "./libs/Errors.sol";

/// @title HodlClaim (HCLM) - 인덱스 기반 배당(보상) 토큰
/// @notice rewardIndex는 addRewards(amount)로만 증가. 자동 시간 가산 금지.
contract HCLM is ERC20, Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ======== 보상 인덱스 상태 ========
    uint256 public rewardIndex;                          // 글로벌 인덱스 (RAY 스케일)
    mapping(address => uint256) public userIndex;        // 계정별 마지막 정산 인덱스
    mapping(address => uint256) public unclaimed;        // 아직 클레임하지 않은 누적 보상
    mapping(address => bool)    public isExcluded;       // 보상 대상 제외 여부
    uint256 public excludedSupply;                       // 제외 지갑들의 잔액 합계

    // 수수료 파라미터 / 분배 지갑
    address public treasury;
    address public reserve;
    uint16  public claimFeeBps = Constants.DEFAULT_CLAIM_FEE_BPS; // 1% 기본

    // ⭐ 변경: Rewarder 화이트리스트 (풀 등에게 addRewards 권한 위임)
    mapping(address => bool) public rewarders;
    event RewarderSet(address indexed account, bool allowed);

    // ======== 이벤트 ========
    event RewardsAdded(uint256 amount, uint256 indexDelta, uint256 newRewardIndex);
    event Claimed(address indexed account, uint256 gross, uint256 fee, uint256 net);
    event Excluded(address indexed account, bool excluded);
    event FeeParamsUpdated(uint16 feeBps, address treasury, address reserve);

    constructor(address _treasury, address _reserve, uint256 initialSupply)
        ERC20("HodlClaim", "HCLM")
        Ownable(msg.sender)
    {
        require(_treasury != address(0) && _reserve != address(0), "bad addr");
        treasury = _treasury;
        reserve = _reserve;

        // 초기 발행: DEPLOYER에게 민트
        _mint(msg.sender, initialSupply);

        // 자체 컨트랙트 주소는 보상 제외(eligibleSupply 산정에서 제외)
        isExcluded[address(this)] = true;
        excludedSupply = balanceOf(address(this));
        emit Excluded(address(this), true);
    }

    // ======== 내부 정산 도우미 ========
    function _eligibleBalance(address a) internal view returns (uint256) {
        if (isExcluded[a]) return 0;
        return balanceOf(a);
    }

    function pendingRewards(address a) public view returns (uint256) {
        uint256 bal = _eligibleBalance(a);
        uint256 idx = rewardIndex;
        uint256 uidx = userIndex[a];
        uint256 acc = unclaimed[a];
        if (idx > uidx && bal > 0) {
            uint256 delta = idx - uidx;
            acc += (bal * delta) / Constants.RAY; // 내림
        }
        return acc;
    }

    function _settle(address a) internal {
        uint256 p = pendingRewards(a);
        if (p != unclaimed[a]) {
            unclaimed[a] = p; // 갱신
        }
        userIndex[a] = rewardIndex;
    }

    // 전송 훅: from -> settle, to -> settle -> 잔액 이동
    function _update(address from, address to, uint256 amount) internal override {
        if (from != address(0)) _settle(from);
        if (to   != address(0)) _settle(to);
        super._update(from, to, amount);

        // excludedSupply는 exclude 토글 시점 잔액 기준으로만 관리 (전송으로는 변경 없음)
    }

    // ======== 보상 주입 ========
    /// @notice 컨트랙트가 실제 HCLM 토큰을 보유하고 있어야 함
    /// ⭐ 변경: onlyOwner 제거 → 오너 또는 rewarder만 호출 허용
    function addRewards(uint256 amount) external nonReentrant {
        // 오너 또는 화이트리스트된 리워더만 허용
        if (msg.sender != owner() && !rewarders[msg.sender]) {
            revert OwnableUnauthorizedAccount(msg.sender);
        }
        if (amount == 0) revert Errors.ZeroAmount();

        uint256 bal = balanceOf(address(this));
        if (bal < amount) revert Errors.InsufficientRewardBalance();

        uint256 eligibleSupply = totalSupply() - excludedSupply;
        if (eligibleSupply == 0) revert Errors.IneligibleSupplyZero();

        uint256 indexDelta = (amount * Constants.RAY) / eligibleSupply; // 내림
        rewardIndex += indexDelta;

        emit RewardsAdded(amount, indexDelta, rewardIndex);
        // 실제 토큰은 그대로 컨트랙트에 보관되며, claim 시점에 지급
    }

    // ⭐ 변경: 리워더 세팅 함수
    function setRewarder(address account, bool allowed) external onlyOwner {
        rewarders[account] = allowed;
        emit RewarderSet(account, allowed);
    }

    // ======== 보상 제외 토글 ========
    function excludeFromRewards(address a, bool flag) external onlyOwner {
        if (flag) {
            if (isExcluded[a]) revert Errors.AlreadyExcluded();
            _settle(a);
            isExcluded[a] = true;
            excludedSupply += balanceOf(a);
        } else {
            if (!isExcluded[a]) revert Errors.NotExcluded();
            _settle(a);
            isExcluded[a] = false;
            excludedSupply -= balanceOf(a);
        }
        emit Excluded(a, flag);
    }

    // ======== 클레임 ========
    function claim() external nonReentrant {
        _claimTo(msg.sender, msg.sender);
    }

    function claimTo(address to) external nonReentrant {
        _claimTo(msg.sender, to);
    }

    function _claimTo(address from, address to) internal {
        _settle(from);
        uint256 gross = unclaimed[from];
        if (gross == 0) revert Errors.ZeroAmount();
        unclaimed[from] = 0;

        // 수수료: 1% (기본) — 0.75% Treasury / 0.25% Reserve
        uint256 fee = (gross * claimFeeBps) / Constants.BPS;
        uint256 reserveShare = (fee * 25) / 100; // 0.25%
        uint256 treasuryShare = fee - reserveShare; // 잔여분은 Treasury 귀속

        uint256 net = gross - fee;

        // 컨트랙트 보유분에서 지급
        _update(address(this), to, net);
        if (fee > 0) {
            if (treasuryShare > 0) _update(address(this), treasury, treasuryShare);
            if (reserveShare > 0)  _update(address(this), reserve,  reserveShare);
        }
        emit Claimed(from, gross, fee, net);
    }

    // ======== 파라미터 세팅 ========
    function setFeeParams(uint16 _bps, address _treasury, address _reserve) external onlyOwner {
        require(_treasury != address(0) && _reserve != address(0), "bad addr");
        claimFeeBps = _bps;
        treasury = _treasury;
        reserve = _reserve;
        emit FeeParamsUpdated(_bps, _treasury, _reserve);
    }
}
