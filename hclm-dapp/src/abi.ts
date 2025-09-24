export const HCLM_ABI = [
    { type:'function', name:'balanceOf', stateMutability:'view',
      inputs:[{name:'a',type:'address'}], outputs:[{type:'uint256'}] },
    { type:'function', name:'decimals', stateMutability:'view',
      inputs:[], outputs:[{type:'uint8'}] },
    { type:'function', name:'rewardIndex', stateMutability:'view',
      inputs:[], outputs:[{type:'uint256'}] },
    { type:'function', name:'pendingRewards', stateMutability:'view',
      inputs:[{name:'a',type:'address'}], outputs:[{type:'uint256'}] },
    { type:'function', name:'approve', stateMutability:'nonpayable',
      inputs:[{name:'spender',type:'address'},{name:'amount',type:'uint256'}], outputs:[{type:'bool'}] },
    { type:'function', name:'claim', stateMutability:'nonpayable',
      inputs:[], outputs:[] },
    { type:'function', name:'addRewards', stateMutability:'nonpayable',
      inputs:[{name:'amount',type:'uint256'}], outputs:[] },
    { type:'function', name:'owner', stateMutability:'view',
      inputs:[], outputs:[{type:'address'}] },
    { type:'function', name:'totalSupply', stateMutability:'view',
      inputs:[], outputs:[{type:'uint256'}] },
    { type:'function', name:'excludedSupply', stateMutability:'view',
      inputs:[], outputs:[{type:'uint256'}] },
    { type:'function', name:'unclaimed', stateMutability:'view',
      inputs:[{name:'a',type:'address'}], outputs:[{type:'uint256'}] },
      { type: 'function', name: 'allowance', stateMutability: 'view',
        inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
        outputs: [{ type: 'uint256' }]
      },
      { type: 'function', name: 'approve', stateMutability: 'nonpayable',
        inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
        outputs: [{ type: 'bool' }]
      },
      { type: 'function', name: 'balanceOf', stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ type: 'uint256' }]
      },
      { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }]},
    
      // --- HCLM 고유 ---
      { type: 'function', name: 'pendingRewards', stateMutability: 'view',
        inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }]
      },
      { type: 'function', name: 'rewardIndex', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }]},
      { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }]},
      { type: 'function', name: 'totalSupply', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }]},
      { type: 'function', name: 'excludedSupply', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }]},
      { type: 'function', name: 'addRewards', stateMutability: 'nonpayable',
        inputs: [{ name: 'amount', type: 'uint256' }], outputs: []
      },
      { type: 'function', name: 'claim', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  ] as const
  
  export const POOL_ABI = [
    // write
    { type: 'function', name: 'depositETH', stateMutability: 'payable', inputs: [], outputs: [] },
    { type: 'function', name: 'withdrawCollateral', stateMutability: 'nonpayable',
      inputs: [{ name: 'ethWei', type: 'uint256' }], outputs: [] },
    { type: 'function', name: 'borrowHCLM', stateMutability: 'nonpayable',
      inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
    { type: 'function', name: 'repay', stateMutability: 'nonpayable',
      inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
    { type: 'function', name: 'liquidate', stateMutability: 'nonpayable',
      inputs: [{ name: 'user', type: 'address' }, { name: 'repayHclm', type: 'uint256' }], outputs: [] },
  
    // read
    { type: 'function', name: 'collateralETH', stateMutability: 'view',
      inputs: [{ name: 'user', type: 'address' }], outputs: [{ type: 'uint256' }] },
    { type: 'function', name: 'debts', stateMutability: 'view',
      inputs: [{ name: 'user', type: 'address' }],
      outputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }] }, // principal, interestAccrued, lastTs
    { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
    { type: 'function', name: 'setTestEthUsdPrice', stateMutability: 'nonpayable',
      inputs: [{ name: 'p', type: 'int256' }], outputs: [] },
  
    // events (원하면)
    { type: 'event', name: 'Waterfalled', anonymous: false,
      inputs: [{ indexed: false, name: 'toRewards', type: 'uint256' }] },
    { type: 'event', name: 'InterestPaid', anonymous: false,
      inputs: [{ indexed: true, name: 'user', type: 'address' }, { indexed: false, name: 'amount', type: 'uint256' }] },
  ] as const;
  
  
  export const VAULT_ABI = [
    { type:'function', name:'pool', stateMutability:'view',
      inputs:[], outputs:[{type:'address'}] },
    { type:'function', name:'owner', stateMutability:'view',
      inputs:[], outputs:[{type:'address'}] },
    { type:'function', name:'depositFrom', stateMutability:'nonpayable',
      inputs:[{name:'from',type:'address'},{name:'amount',type:'uint256'}], outputs:[] },
    { type:'function', name:'withdrawTo', stateMutability:'nonpayable',
      inputs:[{name:'to',type:'address'},{name:'amount',type:'uint256'}], outputs:[] },
  ] as const


    export const SALE_ABI = [
        // write
        { type: 'function', name: 'buy', stateMutability: 'payable', inputs: [], outputs: [] },
    
        // reads
        { type: 'function', name: 'active',           stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
        { type: 'function', name: 'perWalletCapETH',  stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
        { type: 'function', name: 'globalCapETH',     stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
        { type: 'function', name: 'inETHByUser',      stateMutability: 'view', inputs: [{ name: 'user', type: 'address' }], outputs: [{ type: 'uint256' }] },
        { type: 'function', name: 'totalInETH',       stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
    
        // 참고용(표시 안 해도 되지만 남겨둠)
        { type: 'function', name: 'treasury',         stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
        { type: 'function', name: 'hclm',             stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
    ] as const
  