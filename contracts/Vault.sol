// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";              // ✅ 별도 임포트
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title 단순 자산 보관 금고 (WETH/HCLM 등 ERC20 자산 전담)
/// @notice 입금/출금은 onlyPool 권한으로만 수행 (프로토콜 보안상)
contract Vault is Ownable2Step {
    using SafeERC20 for IERC20;

    IERC20  public immutable asset;
    address public pool; // LendingPool 등

    event Deposited(address indexed asset, address indexed from, uint256 amount);
    event Withdrawn(address indexed asset, address indexed to, uint256 amount);
    event PoolUpdated(address indexed newPool);


    modifier onlyPool() {
        require(msg.sender == pool, "onlyPool");
        _;
    }

    constructor(IERC20 _asset, address _owner) Ownable(_owner) {
        require(address(_asset) != address(0), "asset=0"); 
        asset = _asset;
    }

    function setPool(address _pool) external onlyOwner {
        require(_pool != address(0), "pool=0");
        pool = _pool;
        emit PoolUpdated(_pool);
    }   

    /// @notice 풀(프로토콜)이 사용자로부터 끌어오는 입금 (transferFrom)
    function depositFrom(address from, uint256 amount) external onlyPool {
        asset.safeTransferFrom(from, address(this), amount);
        emit Deposited(address(asset), from, amount);
    }

    /// @notice 풀(프로토콜)이 보관 자산을 지정 주소로 출금
    function withdrawTo(address to, uint256 amount) external onlyPool {
        asset.safeTransfer(to, amount);
        emit Withdrawn(address(asset), to, amount);
    }

    function balance() external view returns (uint256) {
        return asset.balanceOf(address(this));
    }
}
