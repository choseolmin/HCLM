// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";              // ✅ 별도 임포트
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Constants} from "./libs/Constants.sol";
import {HCLM} from "./HCLM.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice 테스트에서만 사용. 프로덕션 배포/권한 차단 가정.
/// 예약 호출로 eligibleSupply * r_per_sec * dt / RAY 만큼 HCLM.addRewards() 수행
contract EmissionController is Ownable2Step {
    using SafeERC20 for IERC20;

    HCLM    public immutable hclm;
    uint256 public rPerSecRay;      // 외부 주입율 (RAY 스케일)
    uint256 public lastTs;

    constructor(HCLM _hclm, uint256 _rPerSecRay, address _owner) Ownable(msg.sender) {
        hclm = _hclm;
        rPerSecRay = _rPerSecRay;
        _transferOwnership(_owner);
        lastTs = block.timestamp;
    }

    function setRPerSecRay(uint256 v) external onlyOwner {
        rPerSecRay = v;
    }

    /// @dev EmissionController가 미리 보유한 HCLM을 hclm 컨트랙트로 옮긴 후 addRewards 호출
    function tick() external onlyOwner {
        uint256 dt = block.timestamp - lastTs;
        if (dt == 0) return;
        lastTs = block.timestamp;

        uint256 eligible = hclm.totalSupply() - hclm.excludedSupply();
        if (eligible == 0) return;

        uint256 amount = (eligible * rPerSecRay * dt) / Constants.RAY;
        if (amount == 0) return;

        // EmissionController → HCLM 컨트랙트로 전송 후 addRewards
        IERC20(hclm).safeTransfer(address(hclm), amount);
        hclm.addRewards(amount);
    }
}
