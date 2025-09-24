// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";              // ✅ 별도 임포트
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Errors} from "./libs/Errors.sol";
import {Constants} from "./libs/Constants.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title 고정가 세일 (테스트넷 전용)
/// @notice 1 ETH = 1000 HCLM (SALE_RATE). 판매물량은 컨트랙트 사전 보유분에서 전송.
contract Sale is Ownable2Step {
    using SafeERC20 for IERC20;

    IERC20 public immutable hclm;
    address public treasury; // ETH 수취

    bool    public active;
    uint256 public perWalletCapETH;   // 지갑별 ETH 상한 (0이면 무제한)
    uint256 public globalCapETH;      // 전체 ETH 상한 (0이면 무제한)
    uint256 public totalInETH;        // 누적 ETH 유입
    mapping(address => uint256) public inETHByUser;

    event Purchased(address indexed buyer, uint256 ethIn, uint256 hclmOut, uint256 ts);
    event SaleParams(bool active, uint256 perWalletCap, uint256 globalCap);

    constructor(IERC20 _hclm, address _treasury, address _owner) Ownable(msg.sender) {
        require(_treasury != address(0), "bad addr");
        hclm = _hclm;
        treasury = _treasury;
        _transferOwnership(_owner);
    }

    function setSaleParams(bool _active, uint256 _perWalletCapETH, uint256 _globalCapETH) external onlyOwner {
        active = _active;
        perWalletCapETH = _perWalletCapETH;
        globalCapETH = _globalCapETH;
        emit SaleParams(_active, _perWalletCapETH, _globalCapETH);
    }

    receive() external payable {
        buy();
    }

    function buy() public payable {
        if (!active) revert Errors.SaleNotActive();
        uint256 ethIn = msg.value;
        if (ethIn == 0) revert Errors.ZeroAmount();

        // 캡 체크
        if (perWalletCapETH > 0 && inETHByUser[msg.sender] + ethIn > perWalletCapETH) revert Errors.ExceedsCaps();
        if (globalCapETH    > 0 && totalInETH + ethIn > globalCapETH) revert Errors.ExceedsCaps();

        uint256 out = ethIn * Constants.SALE_RATE; // 18dec ETH 가정, HCLM 18dec 가정 → 단순 개수 기준
        // 컨트랙트 보유분에서 전송
        hclm.safeTransfer(msg.sender, out);

        // ETH는 Treasury로 바로 전달
        (bool ok, ) = treasury.call{value: ethIn}("");
        require(ok, "eth xfer fail");

        inETHByUser[msg.sender] += ethIn;
        totalInETH += ethIn;

        emit Purchased(msg.sender, ethIn, out, block.timestamp);
    }
}
