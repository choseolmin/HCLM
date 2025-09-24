// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

library Errors {
    error ZeroAmount();
    error IneligibleSupplyZero();
    error InsufficientRewardBalance();
    error AlreadyExcluded();
    error NotExcluded();
    error NotAuthorized();
    error StaleOracle();
    error PriceInvalid();
    error HealthFactorOk();
    error ExceedsCaps();
    error SaleNotActive();
    error CollateralTooLow();
    error Underflow();
    error Overflow();
}

