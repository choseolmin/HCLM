// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title Constants used across HCLM protocol
library Constants {
    // RAY 스케일 = 1e27 (인덱스/금리 연산용)
    uint256 public constant RAY = 1e27;
    // Basis Points
    uint256 public constant BPS = 10_000;

    // 테스트용 단리 시뮬: 10분마다 1% => 초당 0.01/600 = 1/60000
    // R_PER_SEC_RAY = RAY / 60000 (내림)
    uint256 public constant R_PER_SEC_RAY = RAY / 6000;

    // 기본 파라미터 (요구사항)
    uint16  public constant DEFAULT_CLAIM_FEE_BPS = 100; // 1%
    uint256 public constant LIQ_BONUS_BPS = 500; // 5%
    uint256 public constant LTV_TARGET_BPS = 5000; // 50%
    uint256 public constant LIQ_THRESHOLD_BPS = 8000; // 80%

    // 테스트넷 고정 세일 레이트 (1 ETH = 1000 HCLM)
    uint256 public constant SALE_RATE = 1000;
}
