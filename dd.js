/* Pillar Protocol - Sonic Testnet (Updated Wallet Connection & Dynamic Chart) */
(function () {
  'use strict';

  // ---------- 유틸리티 함수 ----------
  function el(tag, attrs = {}, children = []) {
    const element = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (key === 'onclick') {
        element.onclick = value;
      } else {
        element.setAttribute(key, value);
      }
    });
    children.forEach(child => {
      if (typeof child === 'string') {
        element.appendChild(document.createTextNode(child));
      } else if (child instanceof Node) {
        element.appendChild(child);
      }
    });
    return element;
  }

  function nice(num) {
    const n = parseFloat(num);
    if (isNaN(n)) return '0';
    return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // ---------- 네트워크 설정 ----------
  const SONIC_BLAZE_TESTNET = {
    chainId: 666888,
    chainName: 'Sonic Blaze Testnet',
    nativeCurrency: { name: 'SONIC', symbol: 'S', decimals: 18 },
    rpcUrls: ['https://rpc.sonic.build/'],
    blockExplorerUrls: ['https://explorer.sonic.build/']
  };

  const HARDHAT_LOCALNET = {
    chainId: 31337,
    chainName: 'Hardhat Localhost',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['http://127.0.0.1:8545/']
  };

  // <<<<<<< 중요: 최종 타겟 네트워크를 Sonic Blaze 테스트넷으로 설정 >>>>>>>
  const CURRENT_NETWORK = SONIC_BLAZE_TESTNET;

  // Sonic Client Mock (기본적인 네트워크 정보 반환)
  const sonicClient = {
    async getNetwork() {
      if (window.ethereum) {
        try {
          const chainId = await window.ethereum.request({ method: 'eth_chainId' });
          return { chainId: parseInt(chainId, 16) };
        } catch (error) {
          console.warn('Network detection failed:', error);
          return { chainId: CURRENT_NETWORK.chainId };
        }
      }
      return { chainId: CURRENT_NETWORK.chainId };
    }
  };

  // ---------- 컨트랙트 주소 및 ABI ----------
  const CONTRACTS = {
    // TODO: Sonic Blaze 테스트넷에 배포 후 실제 컨트랙트 주소로 업데이트해야 합니다.
    dynamicVault: "0x0000000000000000000000000000000000000000",
    usdc: "0x0000000000000000000000000000000000000000",
    weth: "0x0000000000000000000000000000000000000000"
  };
  
  const DYNAMIC_VAULT_ABI = [
      "function openPosition(uint256 collateralAmount, uint256 leverageBps, uint256 rangeBps, uint8 marginType) external",
      "function closePosition(uint256 positionId) external",
      "function getPosition(uint256 positionId) view returns (address owner, uint256 collateral, uint256 entryPrice)",
      "function getNormalRange() view returns (uint256 lower, uint256 upper)" // 예시 함수
  ];

  const USDC_ABI = [
      "function approve(address spender, uint256 amount) external returns (bool)",
      "function balanceOf(address account) view returns (uint256)"
  ];

  // ---------- 상태 관리 ----------
  const state = {
    provider: null,
    signer: null,
    userAddress: null,
    chainId: null,
    isConnected: false,
    balances: { native: '0', usdc: '0', weth: '0' },
    currentPrice: 2435.80,
    priceChange24h: 2.4,
    leverage: 20000,
    selectedRange: 0,
    marginType: 1,
    positions: [],
    allowedRangeBps: 2500, // 스마트 컨트랙트에서 가져올 기본값
  };

  // ---------- CSS 스타일 ----------
  function injectStyles() {
    const css = `
      * { box-sizing: border-box; }
      body { 
        margin: 0; padding: 0; 
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
        background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%);
        color: #e2e8f0; min-height: 100vh;
      }
      .nav { 
        display: flex; justify-content: space-between; align-items: center;
        padding: 15px 30px; background: rgba(16, 24, 54, 0.9);
        backdrop-filter: blur(10px); border-bottom: 1px solid rgba(255,255,255,0.1);
      }
      .nav .logo { font-size: 20px; font-weight: 700; color: #60a5fa; }
      .nav .right { display: flex; align-items: center; gap: 15px; }
      .btn {
        padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer;
        font-size: 14px; font-weight: 500; transition: all 0.2s;
        text-decoration: none; display: inline-block; text-align: center;
      }
      .btn.primary { background: #3b82f6; color: white; }
      .btn.primary:hover { background: #2563eb; }
      .btn.ghost { background: rgba(255,255,255,0.1); color: #e2e8f0; }
      .btn.ghost:hover { background: rgba(255,255,255,0.2); }
      .btn.danger { background: #ef4444; color: white; }
      .btn.danger:hover { background: #dc2626; }
      .btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .pill {
        padding: 4px 10px; border-radius: 12px; font-size: 12px;
        background: rgba(255,255,255,0.1); color: #cbd5e1;
      }
      .pill.active { background: #22c55e; color: white; }
      .pill.ok { color: #22c55e; }
      .pill.warn { color: #f59e0b; }
      .pill.err { color: #ef4444; }
      .wrap { 
        display: grid; grid-template-columns: 300px 1fr 350px;
        gap: 20px; padding: 20px; max-width: 1400px; margin: 0 auto;
        min-height: calc(100vh - 80px);
      }
      .card { 
        background: rgba(16, 24, 54, 0.6); border-radius: 12px; 
        padding: 20px; border: 1px solid rgba(255,255,255,0.1);
        backdrop-filter: blur(10px);
      }
      .h { font-size: 16px; font-weight: 600; margin-bottom: 15px; color: #f1f5f9; }
      .hr { height: 1px; background: rgba(255,255,255,0.1); margin: 20px 0; }
      .kv { 
        display: flex; justify-content: space-between; align-items: center;
        padding: 8px 0; font-size: 14px;
      }
      .kv > div:first-child { color: #94a3b8; }
      .badge { 
        padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 500;
        background: rgba(255,255,255,0.1); color: #e2e8f0;
      }
      .badge.ok { background: rgba(34, 197, 94, 0.2); color: #22c55e; }
      .badge.warn { background: rgba(245, 158, 11, 0.2); color: #f59e0b; }
      .badge.err { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
      .label { 
        font-size: 13px; font-weight: 500; color: #cbd5e1; 
        margin: 15px 0 8px 0; 
      }
      .label:first-child { margin-top: 0; }
      input, select {
        width: 100%; padding: 10px; border: 1px solid rgba(255,255,255,0.2);
        border-radius: 6px; background: rgba(0,0,0,0.3); color: white;
        font-size: 14px;
      }
      input:focus, select:focus { 
        outline: none; border-color: #3b82f6; 
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
      }
      .rangeControl { 
        display: flex; align-items: center; gap: 10px; margin: 10px 0;
      }
      .rangeSlider { 
        flex: 1; height: 4px; background: rgba(255,255,255,0.2);
        border-radius: 2px; outline: none; cursor: pointer;
      }
      .leverageGrid {
        display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 10px 0;
      }
      .leverageGrid .btn { padding: 8px 4px; font-size: 13px; }
      .marginTypeSelect {
        display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 10px 0;
      }
      .row { display: flex; gap: 10px; align-items: center; }
      .canvasWrap { 
        position: relative; width: 100%; background: rgba(0,0,0,0.3); 
        border-radius: 8px; overflow: hidden; margin-bottom: 20px;
      }
      .canvasWrap.range-chart { height: 280px; }
      .canvasWrap.volume-chart { height: 200px; }
      #rangeChart, #volumeFeeChart { width: 100%; height: 100%; display: block; }
      .chartInfo { 
        display: flex; flex-wrap: wrap; gap: 8px; margin-top: 15px; 
        font-size: 12px;
      }
      .notifications {
        position: fixed; top: 80px; right: 20px; z-index: 1000;
        width: 320px; pointer-events: none;
      }
      .notification {
        background: rgba(16, 24, 54, 0.95); border-radius: 8px; padding: 12px 16px;
        margin-bottom: 10px; border-left: 4px solid #3b82f6;
        backdrop-filter: blur(10px); animation: slideIn 0.3s ease;
        font-size: 14px; box-shadow: 0 10px 25px rgba(0,0,0,0.3);
      }
      @keyframes slideIn {
        from { opacity: 0; transform: translateX(100%); }
        to { opacity: 1; transform: translateX(0); }
      }
      @media (max-width: 1200px) {
        .wrap { 
          grid-template-columns: 1fr; 
          grid-template-rows: auto auto auto;
        }
      }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ---------- HTML 생성 ----------
  function createUI() {
    const nav = el('nav', { class: 'nav' }, [ el('div', { class: 'logo' }, ['🏛️ Pillar Protocol']), el('div', { class: 'right' }, [ el('div', { class: 'pill', id: 'networkBadge' }, ['네트워크 확인 중...']), el('button', { class: 'btn primary', id: 'connectBtn', onclick: connectWallet, disabled: true }, ['라이브러리 로딩 중...']) ]) ]);
    const leftPanel = el('div', { class: 'card' }, [ el('div', { class: 'h' }, ['포트폴리오']), el('div', { class: 'kv' }, [ el('div', {}, ['지갑 주소']), el('div', { id: 'walletAddr', class: 'badge' }, ['연결되지 않음']) ]), el('div', { class: 'kv' }, [ el('div', {}, ['네트워크']), el('div', { id: 'chainInfo', class: 'badge' }, ['-']) ]), el('div', { class: 'hr' }), el('div', { class: 'h' }, ['자산 잔액']), el('div', { class: 'kv' }, [ el('div', {}, ['S (네이티브)']), el('div', { id: 'nativeBalance', class: 'badge' }, ['0.0000']) ]), el('div', { class: 'kv' }, [ el('div', {}, ['USDC']), el('div', { id: 'usdcBalance', class: 'badge' }, ['0.00']) ]), el('div', { class: 'kv' }, [ el('div', {}, ['WETH']), el('div', { id: 'wethBalance', class: 'badge' }, ['0.0000']) ]), el('div', { class: 'hr' }), el('div', { class: 'h' }, ['내 포지션']), el('div', { id: 'positionsList' }, [ el('div', { class: 'badge', style: 'text-align:center; padding:20px;' }, ['포지션이 없습니다']) ]), el('div', { class: 'hr' }), el('div', { class: 'h' }, ['LP 수익']), el('div', { class: 'kv' }, [ el('div', {}, ['총 수수료']), el('div', { id: 'totalFees', class: 'badge ok' }, ['0.00 USDC']) ]), el('div', { class: 'kv' }, [ el('div', {}, ['실현 P&L']), el('div', { id: 'realizedPnl', class: 'badge' }, ['0.00 USDC']) ]) ]);
    
    // 중앙 패널: 차트를 2개로 분리
    const centerPanel = el('div', { class: 'card' }, [ 
      el('div', { class: 'h' }, ['가격 범위 차트 (Price Range)']),
      el('div', { class: 'canvasWrap range-chart' }, [ el('canvas', { id: 'rangeChart' }) ]),
      el('div', { class: 'h', style: 'margin-top: 20px;' }, ['거래량 및 수수료 차트']),
      el('div', { class: 'canvasWrap volume-chart' }, [ el('canvas', { id: 'volumeFeeChart' }) ]),
      el('div', { class: 'chartInfo' }, [ el('div', { class: 'pill active' }, [ '현재가: ', el('span', { id: 'currentPrice' }, [`\$${nice(state.currentPrice)}`]) ]), el('div', { class: 'pill' }, [ '24h 변동: ', el('span', { id: 'priceChange24h', style: 'margin-left:4px' }, [`+${state.priceChange24h}%`]) ]), el('div', { class: 'pill warn' }, [ '정규 범위: ±', el('span', { id: 'allowedRangeBps' }, [state.allowedRangeBps]), ' bps' ]), el('div', { class: 'pill' }, [ '설정 범위: ±', el('span', { id: 'selectedRangeBps' }, [state.selectedRange]), ' bps' ]) ]) 
    ]);

    const rightPanel = el('div', { class: 'card' }, [ el('div', { class: 'h' }, ['레버리지 LP 포지션']), el('div', { class: 'label' }, ['자산 페어']), el('select', { id: 'assetPair' }, [ el('option', { value: 'ETH/USDC' }, ['ETH/USDC']) ]), el('div', { class: 'label' }, ['담보 금액 (USDC)']), el('input', { id: 'collateralAmount', type: 'number', min: '100', placeholder: '1000', step: '0.01' }), el('div', { class: 'label' }, ['레버리지']), el('div', { class: 'rangeControl' }, [ el('div', {}, ['1x']), el('input', { id: 'leverageSlider', class: 'rangeSlider', type: 'range', min: '10000', max: '50000', step: '5000', value: '20000' }), el('div', { id: 'leverageValue' }, ['2.0x']) ]), el('div', { class: 'leverageGrid' }, [ el('button', { class: 'btn ghost lev-btn', 'data-lev': '10000' }, ['1x']), el('button', { class: 'btn ghost lev-btn active', 'data-lev': '20000' }, ['2x']), el('button', { class: 'btn ghost lev-btn', 'data-lev': '30000' }, ['3x']), el('button', { class: 'btn ghost lev-btn', 'data-lev': '50000' }, ['5x']) ]), el('div', { class: 'label' }, ['가격 범위 (자동 ↔ 수동)']), el('div', { class: 'rangeControl' }, [ el('div', {}, ['좁음']), el('input', { id: 'rangeSlider', class: 'rangeSlider', type: 'range', min: '0', max: '5000', step: '50', value: '0' }), el('div', {}, ['넓음']) ]), el('div', { class: 'badge', style: 'text-align:center; font-size:11px;' }, ['0 = 자동 최적화, 값 설정 = 수동 조정']), el('div', { class: 'label' }, ['마진 타입']), el('div', { class: 'marginTypeSelect' }, [ el('button', { class: 'btn ghost margin-btn', 'data-type': '0' }, ['CROSS']), el('button', { class: 'btn ghost margin-btn active', 'data-type': '1' }, ['ISOLATED']) ]), el('div', { class: 'hr' }), el('div', { class: 'label' }, ['포지션 미리보기']), el('div', { class: 'kv' }, [ el('div', {}, ['차입 금액']), el('div', { id: 'borrowAmount', class: 'badge' }, ['-']) ]), el('div', { class: 'kv' }, [ el('div', {}, ['실질 레버리지']), el('div', { id: 'effectiveLeverage', class: 'badge' }, ['2.0x']) ]), el('div', { class: 'kv' }, [ el('div', {}, ['예상 수익률']), el('div', { id: 'expectedApr', class: 'badge ok' }, ['8.5% APR']) ]), el('div', { class: 'kv' }, [ el('div', {}, ['리스크 레벨']), el('div', { id: 'riskLevel', class: 'badge warn' }, ['중간']) ]), el('div', { class: 'row', style: 'margin-top:20px;' }, [ el('button', { class: 'btn primary', id: 'openPositionBtn', style: 'flex:1;', onclick: openPosition }, ['포지션 오픈']) ]) ]);
    const notifications = el('div', { class: 'notifications', id: 'notifications' });
    const wrap = el('div', { class: 'wrap' }, [leftPanel, centerPanel, rightPanel]);
    document.body.appendChild(nav);
    document.body.appendChild(wrap);
    document.body.appendChild(notifications);
  }

  // ---------- 지갑 연결 로직 ----------
  function connectWalletState(address, chain, networkId) { state.userAddress = address; state.chainId = networkId; state.isConnected = true; localStorage.setItem('sonic_wallet_address', address); localStorage.setItem('sonic_wallet_network', networkId.toString()); }
  function disconnectWalletState() { state.provider = null; state.signer = null; state.userAddress = null; state.chainId = null; state.isConnected = false; localStorage.removeItem('sonic_wallet_address'); localStorage.removeItem('sonic_wallet_network'); }
  function waitForEthers(maxAttempts = 10) { return new Promise((resolve, reject) => { let attempts = 0; function check() { attempts++; if (window.ethers && window.ethers.BrowserProvider) { console.log('ethers.js 로드 완료'); resolve(true); } else if (attempts >= maxAttempts) { reject(new Error('ethers.js 로드 타임아웃')); } else { setTimeout(check, 500); } } check(); }); }
  async function checkWalletConnection() { try { await waitForEthers(); if (typeof window !== 'undefined' && window.ethereum) { const accounts = await window.ethereum.request({ method: 'eth_accounts' }); if (accounts && accounts.length > 0) { const account = accounts[0]; try { const network = await sonicClient.getNetwork(); const networkId = Number(network.chainId); connectWalletState(account, 'EVM', networkId); state.provider = new window.ethers.BrowserProvider(window.ethereum); state.signer = await state.provider.getSigner(); } catch (networkError) { const storedNetwork = localStorage.getItem('sonic_wallet_network'); const networkId = storedNetwork ? parseInt(storedNetwork) : CURRENT_NETWORK.chainId; connectWalletState(account, 'EVM', networkId); state.provider = new window.ethers.BrowserProvider(window.ethereum); state.signer = await state.provider.getSigner(); } } else { disconnectWalletState(); } } else { disconnectWalletState(); } } catch (error) { console.warn('Wallet connection check failed:', error); disconnectWalletState(); } }
  function handleAccountsChanged(accounts) { if (accounts.length === 0) { showNotification('지갑 연결이 해제되었습니다.', 'warn'); disconnectWalletState(); updateWalletUI(); } else { const account = accounts[0]; const storedNetwork = localStorage.getItem('sonic_wallet_network'); const networkId = storedNetwork ? parseInt(storedNetwork) : CURRENT_NETWORK.chainId; connectWalletState(account, 'EVM', networkId); localStorage.setItem('sonic_wallet_address', account); updateWalletUI(); showNotification('지갑 계정이 변경되었습니다.', 'info'); } }
  function handleChainChanged(chainId) { const networkId = parseInt(chainId, 16); localStorage.setItem('sonic_wallet_network', networkId.toString()); if (state.userAddress) { connectWalletState(state.userAddress, 'EVM', networkId); } showNotification('네트워크가 변경되었습니다. 페이지를 새로고침합니다.', 'info'); setTimeout(() => window.location.reload(), 1500); }
  function setupWalletListeners() { if (typeof window !== 'undefined' && window.ethereum) { if (window.ethereum.removeListener) { window.ethereum.removeListener('accountsChanged', handleAccountsChanged); window.ethereum.removeListener('chainChanged', handleChainChanged); } window.ethereum.on('accountsChanged', handleAccountsChanged); window.ethereum.on('chainChanged', handleChainChanged); } }
  async function connectWallet() { if (typeof window.ethereum === 'undefined') { return showNotification('MetaMask와 같은 EVM 지갑을 찾을 수 없습니다.', 'error'); } try { showNotification('지갑 연결 중...', 'info'); await waitForEthers(); state.provider = new window.ethers.BrowserProvider(window.ethereum); const accounts = await state.provider.send("eth_requestAccounts", []); if (!accounts || accounts.length === 0) throw new Error("계정을 찾을 수 없습니다."); const account = accounts[0]; const network = await state.provider.getNetwork(); const networkId = Number(network.chainId); if (networkId !== CURRENT_NETWORK.chainId) { await switchToCurrentNetwork(window.ethereum); setTimeout(() => window.location.reload(), 1000); return; } state.signer = await state.provider.getSigner(); connectWalletState(account, 'EVM', networkId); updateWalletUI(); loadInitialData(); showNotification('지갑 연결 성공!', 'success'); } catch (error) { console.error('지갑 연결 오류:', error); if (error.code === 4001) { showNotification('지갑 연결이 사용자에 의해 거부되었습니다.', 'warn'); } else { showNotification(error.message || '지갑 연결에 실패했습니다.', 'error'); } disconnectWalletState(); updateWalletUI(); } }
  async function switchToCurrentNetwork(provider) { if (!provider) return showNotification('지갑 공급자를 찾을 수 없습니다.', 'error'); try { showNotification(`${CURRENT_NETWORK.chainName}으로 전환합니다...`, 'info'); await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${CURRENT_NETWORK.chainId.toString(16)}` }], }); } catch (switchError) { if (switchError.code === 4902) { try { await provider.request({ method: 'wallet_addEthereumChain', params: [CURRENT_NETWORK], }); } catch (addError) { showNotification('네트워크 추가에 실패했습니다.', 'error'); } } else { showNotification('네트워크 전환에 실패했습니다.', 'error'); } } }
  async function initializeWalletConnection() { const storedAddress = localStorage.getItem('sonic_wallet_address'); const storedNetwork = localStorage.getItem('sonic_wallet_network'); if (storedAddress && !state.userAddress) { const networkId = storedNetwork ? parseInt(storedNetwork) : CURRENT_NETWORK.chainId; connectWalletState(storedAddress, 'EVM', networkId); } await checkWalletConnection(); setupWalletListeners(); updateWalletUI(); }
  function updateWalletUI() { const connectBtn = document.getElementById('connectBtn'); if (state.isConnected && state.userAddress) { const shortAddr = `${state.userAddress.slice(0, 6)}...${state.userAddress.slice(-4)}`; document.getElementById('walletAddr').textContent = shortAddr; document.getElementById('chainInfo').textContent = CURRENT_NETWORK.chainName; document.getElementById('networkBadge').textContent = CURRENT_NETWORK.chainName; document.getElementById('networkBadge').className = 'pill active'; connectBtn.textContent = shortAddr; connectBtn.className = 'btn ghost'; connectBtn.onclick = null; } else { document.getElementById('walletAddr').textContent = '연결되지 않음'; document.getElementById('chainInfo').textContent = '-'; document.getElementById('networkBadge').textContent = '연결 필요'; document.getElementById('networkBadge').className = 'pill warn'; connectBtn.textContent = '지갑 연결'; connectBtn.className = 'btn primary'; connectBtn.onclick = connectWallet; } }

  // ---------- 차트 관리 ----------
  let volumeFeeChartInstance = null;
  let rangeChartInstance = null;
  const chartState = { labels: [], volumeData: [], feeData: [] };

  function initializeCharts() {
    for (let i = 0; i < 30; i++) {
      chartState.labels.push(`T-${30 - i}`);
      chartState.volumeData.push(Math.random() * 1000 + 500);
      chartState.feeData.push(Math.random() * 5 + (i * 0.2));
    }
    initializeRangeChart();
    initializeVolumeFeeChart();
    setInterval(simulateWashTrade, 5000);
  }

  function initializeRangeChart() {
    const ctx = document.getElementById('rangeChart').getContext('2d');
    rangeChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: chartState.labels,
        datasets: [{
            label: 'Current Price',
            data: Array(30).fill(state.currentPrice),
            borderColor: 'rgba(255, 255, 255, 0.2)',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.1
        }]
      },
      options: {
        maintainAspectRatio: false,
        scales: {
            x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.1)' } },
            y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.1)' }, title: { display: true, text: '가격 (USDC)', color: '#cbd5e1' } }
        },
        plugins: {
          legend: { display: false },
          annotation: { annotations: {} }
        }
      }
    });
    updateRangeChartAnnotations();
  }
  
  function initializeVolumeFeeChart() {
    const ctx = document.getElementById('volumeFeeChart').getContext('2d');
    volumeFeeChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: chartState.labels,
        datasets: [{
          label: '거래량 (Volume)',
          data: chartState.volumeData,
          backgroundColor: 'rgba(59, 130, 246, 0.6)',
        }, {
          label: '누적 수수료 (Fees)',
          data: chartState.feeData,
          backgroundColor: 'rgba(34, 197, 94, 0.6)',
          yAxisID: 'y1'
        }]
      },
      options: {
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.1)' } },
          y: { beginAtZero: true, position: 'left', ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.1)' }, title: { display: true, text: '거래량', color: '#cbd5e1' } },
          y1: { beginAtZero: true, position: 'right', ticks: { color: '#22c55e' }, grid: { drawOnChartArea: false }, title: { display: true, text: '수수료 (USDC)', color: '#22c55e' } }
        },
        plugins: {
          legend: { labels: { color: '#e2e8f0' } }
        }
      }
    });
  }

  function simulateWashTrade() {
    if (!volumeFeeChartInstance) return;
    chartState.labels.shift(); chartState.labels.push(`T-${new Date().getSeconds()}`);
    chartState.volumeData.shift(); chartState.volumeData.push(Math.random() * 1000 + 500);
    const newFee = chartState.feeData[chartState.feeData.length - 1] + (Math.random() * 2);
    chartState.feeData.shift(); chartState.feeData.push(newFee);
    
    volumeFeeChartInstance.data.labels = chartState.labels;
    volumeFeeChartInstance.data.datasets[0].data = chartState.volumeData;
    volumeFeeChartInstance.data.datasets[1].data = chartState.feeData;
    volumeFeeChartInstance.update('none');
    
    document.getElementById('totalFees').textContent = `${nice(newFee)} USDC`;
  }
  
  function updateRangeChartAnnotations() {
    if (!rangeChartInstance) return;
    const { currentPrice, allowedRangeBps, selectedRange } = state;
    const normalLower = currentPrice * (1 - allowedRangeBps / 10000);
    const normalUpper = currentPrice * (1 + allowedRangeBps / 10000);
    const effectiveRangeBps = selectedRange === 0 ? allowedRangeBps : selectedRange;
    const selectedLower = currentPrice * (1 - effectiveRangeBps / 10000);
    const selectedUpper = currentPrice * (1 + effectiveRangeBps / 10000);
    rangeChartInstance.options.plugins.annotation.annotations = {
      normalRange: { type: 'box', yMin: normalLower, yMax: normalUpper, backgroundColor: 'rgba(245, 158, 11, 0.2)', borderColor: 'rgba(245, 158, 11, 0.5)', borderWidth: 1 },
      selectedRange: { type: 'box', yMin: selectedLower, yMax: selectedUpper, backgroundColor: 'rgba(255, 255, 255, 0.15)', borderColor: 'rgba(255, 255, 255, 0.8)', borderWidth: 2, borderDash: [6, 6] }
    };
    rangeChartInstance.update();
  }

  // ---------- 핵심 로직 (트랜잭션 및 데이터 로드) ----------
  async function openPosition() {
    if (!state.isConnected || !state.signer) {
      return showNotification('먼저 지갑을 연결해주세요', 'warn');
    }
    const collateralAmountStr = document.getElementById('collateralAmount').value;
    if (!collateralAmountStr || parseFloat(collateralAmountStr) < 100) {
      return showNotification('최소 100 USDC 담보가 필요합니다', 'warn');
    }
    const collateralAmount = window.ethers.parseUnits(collateralAmountStr, 6);

    try {
      showNotification('트랜잭션 준비 중...', 'info');
      document.getElementById('openPositionBtn').disabled = true;

      const usdcContract = new window.ethers.Contract(CONTRACTS.usdc, USDC_ABI, state.signer);
      const vaultContract = new window.ethers.Contract(CONTRACTS.dynamicVault, DYNAMIC_VAULT_ABI, state.signer);
      
      showNotification('USDC 사용 승인을 요청합니다...', 'info');
      const approveTx = await usdcContract.approve(CONTRACTS.dynamicVault, collateralAmount);
      await approveTx.wait();
      showNotification('USDC 사용 승인 완료!', 'success');

      showNotification('포지션 오픈 트랜잭션을 요청합니다...', 'info');
      const tx = await vaultContract.openPosition(
        collateralAmount, state.leverage, state.selectedRange, state.marginType
      );
      showNotification(`트랜잭션 제출됨: ${tx.hash.slice(0,10)}...`, 'info');
      
      const receipt = await tx.wait();
      
      if (receipt.status === 1) {
        showNotification('포지션 오픈 성공!', 'success');
        document.getElementById('collateralAmount').value = '';
        loadInitialData();
      } else {
        throw new Error("트랜잭션이 실패했습니다.");
      }
    } catch (error) {
      console.error('포지션 오픈 오류:', error);
      showNotification(`오류: ${error.reason || error.message}`, 'error');
    } finally {
      document.getElementById('openPositionBtn').disabled = false;
    }
  }

  async function loadInitialData() {
    await loadBalances();
    updatePreview();
  }

  async function loadBalances() {
    if (!state.provider || !state.userAddress) return;
    try {
      await waitForEthers();
      const nativeBalance = await state.provider.getBalance(state.userAddress);
      state.balances.native = window.ethers.formatEther(nativeBalance);
      document.getElementById('nativeBalance').textContent = parseFloat(state.balances.native).toFixed(4);
      
      state.balances.usdc = '1000000';
      document.getElementById('usdcBalance').textContent = nice(state.balances.usdc);
      
      state.balances.weth = '0.0000';
      document.getElementById('wethBalance').textContent = parseFloat(state.balances.weth).toFixed(4);
      
    } catch (error) {
      console.error('잔액 로드 오류:', error);
    }
  }

  function updatePreview() {
    document.getElementById('effectiveLeverage').textContent = `${(state.leverage / 10000).toFixed(1)}x`;
    const collateral = parseFloat(document.getElementById('collateralAmount').value || '0');
    if (collateral > 0) {
      const borrowAmount = collateral * (state.leverage / 10000 - 1);
      document.getElementById('borrowAmount').textContent = `${nice(borrowAmount)} USDC`;
    } else {
      document.getElementById('borrowAmount').textContent = '-';
    }
    const selectedRangeText = state.selectedRange === 0 ? 'auto' : state.selectedRange.toString();
    document.getElementById('selectedRangeBps').textContent = selectedRangeText;
    const baseApr = 5.2;
    const leverageMultiplier = state.leverage / 10000;
    const expectedApr = (baseApr * leverageMultiplier).toFixed(1);
    document.getElementById('expectedApr').textContent = `${expectedApr}% APR`;
    let riskLevel = '낮음'; let riskClass = 'ok';
    if (state.leverage >= 30000) { riskLevel = '높음'; riskClass = 'err'; } 
    else if (state.leverage >= 20000) { riskLevel = '중간'; riskClass = 'warn'; }
    const riskEl = document.getElementById('riskLevel');
    riskEl.textContent = riskLevel;
    riskEl.className = `badge ${riskClass}`;
  }

  // ---------- 이벤트 리스너 설정 ----------
  function setupEventListeners() {
    document.getElementById('leverageSlider').addEventListener('input', (e) => {
      state.leverage = parseInt(e.target.value);
      document.getElementById('leverageValue').textContent = `${(state.leverage / 10000).toFixed(1)}x`;
      document.querySelectorAll('.lev-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.lev === e.target.value));
      updatePreview();
    });
    document.querySelectorAll('.lev-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const value = btn.dataset.lev;
        document.getElementById('leverageSlider').value = value;
        state.leverage = parseInt(value);
        document.getElementById('leverageValue').textContent = `${(state.leverage / 10000).toFixed(1)}x`;
        document.querySelectorAll('.lev-btn').forEach(b => b.classList.toggle('active', b === btn));
        updatePreview();
      });
    });
    document.getElementById('rangeSlider').addEventListener('input', (e) => {
      state.selectedRange = parseInt(e.target.value);
      updatePreview();
      updateRangeChartAnnotations();
    });
    document.querySelectorAll('.margin-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.marginType = parseInt(btn.dataset.type);
        document.querySelectorAll('.margin-btn').forEach(b => b.classList.toggle('active', b === btn));
        updatePreview();
      });
    });
    document.getElementById('collateralAmount').addEventListener('input', updatePreview);
  }

  // ---------- 알림 시스템 ----------
  function showNotification(message, type = 'info') {
    const container = document.getElementById('notifications');
    if (!container) return;
    const notification = el('div', { class: 'notification' }, [message]);
    if (type === 'error') notification.style.borderLeftColor = '#ef4444';
    else if (type === 'warn') notification.style.borderLeftColor = '#f59e0b';
    else if (type === 'success') notification.style.borderLeftColor = '#22c55e';
    container.appendChild(notification);
    setTimeout(() => {
      if (container.contains(notification)) {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => { if (container.contains(notification)) container.removeChild(notification); }, 300);
      }
    }, 5000);
  }

  // ---------- 부트스트랩 ----------
  async function bootstrap() {
    try {
      console.log('Pillar Protocol 부트스트랩 시작...');
      injectStyles();
      createUI();

      await Promise.all([
        import('https://cdn.jsdelivr.net/npm/ethers@6.13.2/dist/ethers.min.js'),
        loadScript('https://cdn.jsdelivr.net/npm/chart.js'),
        loadScript('https://cdn.jsdelivr.net/npm/chartjs-plugin-annotation@3.0.1/dist/chartjs-plugin-annotation.min.js')
      ]).then(([ethersModule]) => {
          window.ethers = ethersModule;
          console.log('ethers.js 및 Chart.js 라이브러리 로드 완료');
      });

      await waitForEthers();
      
      const connectBtn = document.getElementById('connectBtn');
      if (connectBtn) {
        connectBtn.disabled = false;
        connectBtn.textContent = '지갑 연결';
      }
      
      setupEventListeners();
      updatePreview();
      initializeCharts();
      await initializeWalletConnection();
      
      console.log('Pillar Protocol 준비 완료!');
      
      if (window.ethereum && !state.isConnected) {
        setTimeout(() => showNotification('지갑을 연결하여 Pillar Protocol을 시작하세요', 'info'), 1000);
      }
      
    } catch (error) {
      console.error('부트스트랩 오류:', error);
      let errorMessage = `초기화 실패: ${error.message}`;
      document.body.innerHTML = `<div style="color: #ef4444; padding: 40px; text-align: center; background: #0a0a0a; min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, sans-serif;"><h1 style="color: #60a5fa; margin-bottom: 20px;">🏛️ Pillar Protocol</h1><h2>초기화 오류</h2><p style="margin: 20px 0; color: #94a3b8;">${errorMessage}</p><button onclick="window.location.reload()" style="background: #3b82f6; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">페이지 새로고침</button></div>`;
    }
  }

  window.pillarDebug = {
    state: () => state,
    connectWallet,
    showNotification,
    checkConnection: checkWalletConnection
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();


