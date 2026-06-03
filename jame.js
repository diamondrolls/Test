/* ============================================
   GAME INITIALIZATION & SETUP
============================================ */

const GAME_CONFIG = {
  GAME_DURATION: 300,
  INITIAL_HEALTH: 50,
  INITIAL_BULLETS: 100,
  INITIAL_SPEED: 0.1,
  INITIAL_ROT_SPEED: 0.005,
  BASE_DAMAGE: 10,
  RESPAWN_TIME: 3,
  SPAWN_RANGE: 50,
  BUILDING_BASE_COST: 100,
};

let account = null;
let web3;
let client;
const RECEIVER_ADDRESS = "0x742d35Cc6634C0532925a3b844Bc2e7595f42bE3";

// Scene, camera, renderer
let scene, camera, renderer;
let playerObject, playerModel;
let controls;
let canMove = false;
let isGameActive = false;

// Game objects and mechanics
let otherPlayers = {};
let bullets = [];
let enemies = [];
let buildings = [];
let gameItems = [];
let nftListByCreatedAt = [];
let currentModalNftIndex = -1;

// Player stats
const playerStats = {
  health: GAME_CONFIG.INITIAL_HEALTH,
  bullets: GAME_CONFIG.INITIAL_BULLETS,
  score: 0,
  kills: 0,
  deaths: 0,
  gameTokens: 0,
};

// Game state
let isPointerLocked = false;
let chatMessages = [];
let playerName = "";
let selectedAvatar = "boy";
let isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let startTime;

// Socket for multiplayer
let socket;
let playerId = generatePlayerId();
let roomId = getRoomId();
let playersOnline = 0;

/* ============================================
   SUPABASE CLIENT & AUTHENTICATION
============================================ */

async function initSupabase() {
  const SUPABASE_URL = 'https://fjtzodjudyctqacunlqp.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqdHpvZGp1ZHljdHFhY3VubHFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDU4NzE1NTksImV4cCI6MTk5MjQ0NzU1OX0.YmvuDxCDxWUxN5Lrqm4p_a7C9oKHWDBqLhvqhzSbjqQ';

  client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log("✓ Supabase initialized");
}

/* ============================================
   WALLET CONNECTION
============================================ */

async function connectWallet() {
  try {
    if (!window.ethereum) {
      alert("MetaMask not detected. Install it to play!");
      return;
    }

    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    account = accounts[0];
    console.log('Wallet connected:', account);

    web3 = new Web3(window.ethereum);
    
    document.getElementById('walletStatus').textContent = `Connected: ${account.substring(0, 6)}...${account.substring(38)}`;
    document.getElementById('connectBtn').textContent = 'Disconnect';
    document.getElementById('connectBtn').onclick = disconnectWallet;
    
    // Load player data
    await loadPlayerData();
    await loadPlayerNFTs();
    await initTokenSystem();
    
    // Update modal if open
    const modal = document.getElementById('nft-modal');
    if (modal && modal.style.display === 'block') {
      const currentNft = nftListByCreatedAt[currentModalNftIndex];
      if (currentNft) openNFTModal(currentNft);
    }
    
  } catch (error) {
    console.error('Wallet connection failed:', error);
    alert('Wallet connection failed: ' + error.message);
  }
}

function disconnectWallet() {
  account = null;
  web3 = null;
  
  document.getElementById('walletStatus').textContent = 'Not connected';
  document.getElementById('connectBtn').textContent = 'Connect Wallet';
  document.getElementById('connectBtn').onclick = connectWallet;
  
  playerStats.gameTokens = 0;
  document.getElementById('nft-balance').textContent = '0';
  
  console.log('Wallet disconnected');
}

/* ============================================
   PLAYER & ROOM MANAGEMENT
============================================ */

function generatePlayerId() {
  return 'player_' + Math.random().toString(36).substr(2, 9);
}

function getRoomId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('room') || 'default-room';
}

async function loadPlayerData() {
  if (!account) return;

  try {
    const { data, error } = await client
      .from('players')
      .select('*')
      .eq('wallet_address', account)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error loading player:', error);
      return;
    }

    if (data) {
      console.log('Player data loaded:', data);
    }
  } catch (err) {
    console.error('Failed to load player data:', err);
  }
}

/* ============================================
   NFT SYSTEM
============================================ */

async function loadNFTs() {
  try {
    const { data, error } = await client
      .from('nfts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading NFTs:', error);
      return;
    }

    nftListByCreatedAt = data || [];
    console.log('NFTs loaded:', nftListByCreatedAt.length);
    updateNFTDisplay();
  } catch (err) {
    console.error('Failed to load NFTs:', err);
  }
}

async function loadPlayerNFTs() {
  if (!account) {
    document.getElementById('nft-balance').textContent = '0';
    return;
  }

  try {
    const { data, error } = await client
      .from('nfts')
      .select('*')
      .eq('owner', account);

    if (error) {
      console.error('Error loading player NFTs:', error);
      document.getElementById('nft-balance').textContent = '0';
      return;
    }

    const nftCount = (data || []).length;
    document.getElementById('nft-balance').textContent = nftCount;
    console.log('Player owns', nftCount, 'NFTs');
  } catch (err) {
    console.error('Failed to load player NFTs:', err);
    document.getElementById('nft-balance').textContent = '0';
  }
}

function updateNFTDisplay() {
  // Update display if modal is open
  if (nftListByCreatedAt.length > 0 && currentModalNftIndex === -1) {
    currentModalNftIndex = 0;
  }
}

function getNftIndexInCreatedAtList(nftData) {
  return nftListByCreatedAt.findIndex(nft => nft.token_id === nftData.token_id);
}

function updateNftModalNavButtons() {
  const prevBtn = document.getElementById('prev-nft-btn');
  const nextBtn = document.getElementById('next-nft-btn');
  
  if (!prevBtn || !nextBtn) return;
  
  prevBtn.disabled = nftListByCreatedAt.length <= 1;
  nextBtn.disabled = nftListByCreatedAt.length <= 1;
}

function showPrevNftInModal() {
  if (!nftListByCreatedAt.length) return;
  if (currentModalNftIndex < 0) return;

  currentModalNftIndex = (currentModalNftIndex - 1 + nftListByCreatedAt.length) % nftListByCreatedAt.length;
  openNFTModal(nftListByCreatedAt[currentModalNftIndex], { fromNav: true });
}

function showNextNftInModal() {
  if (!nftListByCreatedAt.length) return;
  if (currentModalNftIndex < 0) return;

  currentModalNftIndex = (currentModalNftIndex + 1) % nftListByCreatedAt.length;
  openNFTModal(nftListByCreatedAt[currentModalNftIndex], { fromNav: true });
}

function initNftModalNavigation() {
  const prevBtn = document.getElementById('prev-nft-btn');
  const nextBtn = document.getElementById('next-nft-btn');

  if (prevBtn) prevBtn.addEventListener('click', (e) => { e.stopPropagation(); showPrevNftInModal(); });
  if (nextBtn) nextBtn.addEventListener('click', (e) => { e.stopPropagation(); showNextNftInModal(); });

  // Keyboard arrows when modal is open (desktop)
  document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('nft-modal');
    if (!modal || modal.style.display !== 'block') return;

    if (e.key === 'ArrowLeft') showPrevNftInModal();
    if (e.key === 'ArrowRight') showNextNftInModal();
  });
}

function openNFTModal(nftData, opts = {}) {
  if (!canMove) return;
    // Track current modal NFT index (created_at order)
  const idx = getNftIndexInCreatedAtList(nftData);
  if (idx !== -1) currentModalNftIndex = idx;

  updateNftModalNavButtons();
  document.getElementById('modal-image').src = nftData.image_url || 'https://via.placeholder.com/400x400?text=NFT+Image';
  document.getElementById('modal-title').textContent = nftData.name || `${nftData.collection || 'Untitled'} #${nftData.token_id || ''}`;
  document.getElementById('modal-description').textContent = nftData.description || 'No description available';
  document.getElementById('modal-price').textContent = nftData.price_eth || 'N/A';
  
  const actions = document.getElementById('modal-actions');
  actions.innerHTML = '';
  
  if (account) {
    const buyBtn = document.createElement('button');
    buyBtn.textContent = 'Buy NFT';
    buyBtn.onclick = () => buyNFT(nftData);
    actions.appendChild(buyBtn);
    
    const transferBtn = document.createElement('button');
    transferBtn.textContent = 'Transfer NFT';
    transferBtn.onclick = () => transferNFT(nftData);
    actions.appendChild(transferBtn);
  }
   const paypal = document.getElementById('paypal-nft-modal');
if (paypal) paypal.classList.add('active');
  // After successful connectWallet()

  document.getElementById('nft-modal').style.display = 'block';
}

document.getElementById('close-modal').addEventListener('click', function() {
  document.getElementById('nft-modal').style.display = 'none';
});

async function buyNFT(nftData) {
  if (!account) return alert("Connect wallet first.");
  try {
    const priceEth = nftData.price_eth || 0.1;
    const totalEth = web3.utils.toWei((Number(priceEth) + 6/1000).toString(), 'ether');
    await web3.eth.sendTransaction({ from: account, to: RECEIVER_ADDRESS, value: totalEth });

    await client.from("nfts").update({ owner: account, sold: true }).eq("token_id", nftData.token_id);
    alert("✅ NFT purchased! Payment sent.");
    loadNFTs();
    document.getElementById('nft-modal').style.display = 'none';
  } catch(err) { 
    console.error(err); 
    alert("Buy failed: " + err.message); 
  }
}

async function transferNFT(nftData) {
  if (!account) return alert("Connect wallet first");
  const to = prompt("Enter recipient wallet address:");
  if (!to) return;

  try {
    await client.from("nfts").update({ owner: to }).eq("token_id", nftData.token_id);
    alert("✅ NFT transferred!");
    loadNFTs();
    document.getElementById('nft-modal').style.display = 'none';
  } catch(err) {
    console.error(err);
    alert("Transfer failed: " + err.message);
  }
}

/* ============================================
   TOKEN ECONOMY SYSTEM
============================== */

async function initTokenSystem() {
  await loadTokenBalance();
  setupTokenTransfer();
  setupTokenPurchase();
}

async function loadTokenBalance() {
  try {
    if (!account) {
      playerStats.gameTokens = 0;
      updateTokenDisplay();
      return;
    }
    
    const storedBalance = localStorage.getItem(`gameTokens_${account}`);
    if (storedBalance) {
      playerStats.gameTokens = parseInt(storedBalance);
    } else {
      playerStats.gameTokens = 0;
      localStorage.setItem(`gameTokens_${account}`, '0');
    }
    
    updateTokenDisplay();
    
  } catch (err) {
    console.error("Failed to load token balance:", err);
    playerStats.gameTokens = 0;
    updateTokenDisplay();
  }
}

function updateTokenDisplay() {
  document.getElementById('token-balance').textContent = playerStats.gameTokens;
  document.getElementById('building-token-balance').textContent = playerStats.gameTokens;
  document.getElementById('bullet-token-balance').textContent = playerStats.gameTokens;
  document.getElementById('transfer-token-balance').textContent = playerStats.gameTokens;
  
  const transferAmountInput = document.getElementById('transfer-amount');
  if (transferAmountInput) {
    transferAmountInput.max = playerStats.gameTokens;
  }
  
  const purchaseBtn = document.getElementById('purchase-building');
  const balanceCheck = document.getElementById('token-balance-check');
  
  if (purchaseBtn && balanceCheck) {
    if (playerStats.gameTokens >= GAME_CONFIG.BUILDING_BASE_COST) {
      purchaseBtn.disabled = false;
      purchaseBtn.textContent = `Purchase for ${GAME_CONFIG.BUILDING_BASE_COST} Tokens`;
      balanceCheck.className = 'token-balance-check sufficient';
      balanceCheck.innerHTML = `Your Token Balance: <span id="building-token-balance">${playerStats.gameTokens}</span> - <span style="color: #10b981;">Sufficient</span>`;
    } else {
      purchaseBtn.disabled = true;
      purchaseBtn.textContent = `Need ${GAME_CONFIG.BUILDING_BASE_COST - playerStats.gameTokens} More Tokens`;
      balanceCheck.className = 'token-balance-check insufficient';
      balanceCheck.innerHTML = `Your Token Balance: <span id="building-token-balance">${playerStats.gameTokens}</span> - <span style="color: #ef4444;">Insufficient</span>`;
    }
  }
}

async function addTokens(amount) {
  playerStats.gameTokens += amount;
  if (account) {
    localStorage.setItem(`gameTokens_${account}`, playerStats.gameTokens.toString());
  }
  updateTokenDisplay();
  console.log(`Added ${amount} tokens to player balance. New balance: ${playerStats.gameTokens}`);
}

async function removeTokens(amount) {
  if (playerStats.gameTokens < amount) {
    throw new Error(`Insufficient token balance. Required: ${amount}, Available: ${playerStats.gameTokens}`);
  }
  
  playerStats.gameTokens -= amount;
  if (account) {
    localStorage.setItem(`gameTokens_${account}`, playerStats.gameTokens.toString());
  }
  updateTokenDisplay();
  console.log(`Removed ${amount} tokens from player balance. New balance: ${playerStats.gameTokens}`);
}

/* ==============================
   TOKEN TRANSFER SYSTEM
============================== */

function setupTokenTransfer() {
  document.getElementById('transfer-token-btn-sidebar').addEventListener('click', openTokenTransferModal);
  document.getElementById('transfer-token-confirm').addEventListener('click', transferTokensToWallet);
  document.getElementById('close-transfer-modal').addEventListener('click', closeTokenTransferModal);
}

function openTokenTransferModal() {
  if (!account) {
    alert("Please connect your wallet to convert tokens to NFTs.");
    return;
  }
  
  if (playerStats.gameTokens <= 0) {
    alert("You don't have any tokens to convert.");
    return;
  }
  
  document.getElementById('transfer-wallet-address').textContent = account;
  document.getElementById('transfer-amount').value = '';
  document.getElementById('transfer-amount').max = playerStats.gameTokens;
  document.getElementById('token-transfer-modal').style.display = 'block';
}

function closeTokenTransferModal() {
  document.getElementById('token-transfer-modal').style.display = 'none';
}

async function transferTokensToWallet() {
  const amount = parseInt(document.getElementById('transfer-amount').value);
  
  if (!amount || amount <= 0) {
    alert("Please enter a valid amount to convert.");
    return;
  }
  
  if (amount > playerStats.gameTokens) {
    alert(`Insufficient tokens. You have ${playerStats.gameTokens} but tried to convert ${amount}.`);
    return;
  }
  
  try {
    await removeTokens(amount);
    await mintNFTs(account, amount);
    alert(`✅ Successfully converted ${amount} tokens to real NFTs in your wallet!`);
    closeTokenTransferModal();
  } catch (err) {
    console.error("Token transfer failed:", err);
    alert(`Conversion failed: ${err.message}`);
  }
}

async function mintNFTs(toAddress, amount) {
  const mintCost = web3.utils.toWei((0.01 * amount).toString(), 'ether');
  
  try {
    await web3.eth.sendTransaction({
      from: account,
      to: RECEIVER_ADDRESS,
      value: mintCost,
      data: web3.eth.abi.encodeFunctionCall({
        name: 'mint',
        type: 'function',
        inputs: [{
          type: 'address',
          name: 'to'
        }, {
          type: 'uint256',
          name: 'amount'
        }]
      }, [toAddress, amount])
    });
    
    console.log(`Minted ${amount} NFTs for ${toAddress}`);
    
  } catch (err) {
    console.error("NFT minting failed:", err);
    throw new Error("Failed to mint NFTs on blockchain");
  }
}

/* ==============================
   TOKEN PURCHASE SYSTEM
============================== */

function setupTokenPurchase() {
  document.getElementById('purchase-token-btn-sidebar').addEventListener('click', openTokenPurchaseModal);
  document.getElementById('purchase-token-cards').addEventListener('click', openTokenPurchaseModal);
  document.getElementById('buy-250-token').addEventListener('click', purchaseTokens);
  document.getElementById('close-token-purchase-modal').addEventListener('click', closeTokenPurchaseModal);
}

function openTokenPurchaseModal() {
  if (!account) {
    alert("Please connect your wallet to purchase tokens.");
    return;
  }
  
  document.getElementById('token-purchase-modal').style.display = 'block';
}

function closeTokenPurchaseModal() {
  document.getElementById('token-purchase-modal').style.display = 'none';
}

async function purchaseTokens() {
  if (!account) {
    alert("Please connect your wallet to purchase tokens.");
    return;
  }
  
  try {
    const tokenAmount = 250;
    const ethPrice = 0.1;
    
    const tx = await web3.eth.sendTransaction({
      from: account,
      to: RECEIVER_ADDRESS,
      value: web3.utils.toWei(ethPrice.toString(), 'ether')
    });
    
    await addTokens(tokenAmount);
    alert(`✅ Purchased ${tokenAmount} tokens! Check your balance in the sidebar.`);
    closeTokenPurchaseModal();
    
  } catch (err) {
    console.error("Token purchase failed:", err);
    alert(`Purchase failed: ${err.message}`);
  }
}

/* ============================================
   THREE.JS SCENE & GRAPHICS
============================================ */

function initThreeJS() {
  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb); // Sky blue
  scene.fog = new THREE.Fog(0x87ceeb, 500, 2000);

  // Camera
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
  camera.position.set(0, 2, 5);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowShadowMap;
  document.getElementById('canvas-container').appendChild(renderer.domElement);

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(100, 100, 100);
  directionalLight.castShadow = true;
  directionalLight.shadow.camera.left = -500;
  directionalLight.shadow.camera.right = 500;
  directionalLight.shadow.camera.top = 500;
  directionalLight.shadow.camera.bottom = -500;
  scene.add(directionalLight);

  // Ground
  const groundGeometry = new THREE.PlaneGeometry(1000, 1000);
  const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x2d5016 });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Player model
  const geometry = new THREE.CapsuleGeometry(0.4, 1.5, 16, 100);
  const material = new THREE.MeshStandardMaterial({ color: 0x3b82f6 });
  playerObject = new THREE.Mesh(geometry, material);
  playerObject.castShadow = true;
  playerObject.receiveShadow = true;
  playerObject.position.y = 1;
  scene.add(playerObject);

  // Camera control
  controls = new PointerLockControls(camera, renderer.domElement);
  renderer.domElement.addEventListener('click', () => {
    if (canMove) controls.lock();
  });

  document.addEventListener('pointerlockchange', () => {
    isPointerLocked = document.pointerLockElement === renderer.domElement;
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  console.log('✓ Three.js scene initialized');
}

/* ============================================
   MULTIPLAYER & SOCKET.IO
============================================ */

function initSocket() {
  socket = io('https://nft-universe-server.onrender.com', {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5
  });

  socket.on('connect', () => {
    console.log('Connected to server');
    socket.emit('join-room', { playerId, roomId, playerName, avatar: selectedAvatar });
  });

  socket.on('players-online', (count) => {
    playersOnline = count;
    document.getElementById('player-count').textContent = count;
  });

  socket.on('player-joined', (data) => {
    console.log('Player joined:', data);
  });

  socket.on('player-moved', (data) => {
    if (data.playerId === playerId) return;
    updateOtherPlayer(data);
  });

  socket.on('player-left', (data) => {
    if (otherPlayers[data.playerId]) {
      scene.remove(otherPlayers[data.playerId].mesh);
      delete otherPlayers[data.playerId];
    }
  });

  socket.on('chat-message', (data) => {
    displayChatMessage(data);
  });

  socket.on('disconnect', () => {
    console.log('Disconnected from server');
  });
}

function updateOtherPlayer(data) {
  if (!otherPlayers[data.playerId]) {
    const geometry = new THREE.CapsuleGeometry(0.4, 1.5, 16, 100);
    const material = new THREE.MeshStandardMaterial({ 
      color: data.avatar === 'girl' ? 0xff69b4 : 0x3b82f6 
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    otherPlayers[data.playerId] = {
      mesh,
      lastUpdate: Date.now()
    };
  }

  const player = otherPlayers[data.playerId];
  player.mesh.position.copy(new THREE.Vector3(data.position.x, data.position.y, data.position.z));
  player.lastUpdate = Date.now();
}

/* ============================================
   GAME MECHANICS
============================================ */

function setupGameControls() {
  const keys = {};

  document.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;

    if (e.key === ' ') shoot();
    if (e.key.toLowerCase() === 'b') buyBullets();
    if (e.key.toLowerCase() === 'e') interact();
    if (e.key.toLowerCase() === 't') {
      document.getElementById('chat-input').focus();
      e.preventDefault();
    }
  });

  document.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
  });

  // Mobile controls
  if (isMobile) {
    document.getElementById('forward-btn').addEventListener('touchstart', () => { keys['w'] = true; });
    document.getElementById('forward-btn').addEventListener('touchend', () => { keys['w'] = false; });
    document.getElementById('left-btn').addEventListener('touchstart', () => { keys['a'] = true; });
    document.getElementById('left-btn').addEventListener('touchend', () => { keys['a'] = false; });
    document.getElementById('backward-btn').addEventListener('touchstart', () => { keys['s'] = true; });
    document.getElementById('backward-btn').addEventListener('touchend', () => { keys['s'] = false; });
    document.getElementById('right-btn').addEventListener('touchstart', () => { keys['d'] = true; });
    document.getElementById('right-btn').addEventListener('touchend', () => { keys['d'] = false; });
    document.getElementById('shoot-btn').addEventListener('touchstart', shoot);
  }

  function update() {
    if (!canMove || !controls.isLocked) return;

    const speed = GAME_CONFIG.INITIAL_SPEED;
    const direction = new THREE.Vector3();

    if (keys['w']) direction.z -= speed;
    if (keys['s']) direction.z += speed;
    if (keys['a']) direction.x -= speed;
    if (keys['d']) direction.x += speed;

    direction.applyQuaternion(camera.quaternion);
    playerObject.position.add(direction);
    camera.position.copy(playerObject.position);
    camera.position.y += 0.6;

    socket.emit('player-moved', {
      playerId,
      position: playerObject.position,
      rotation: camera.rotation
    });

    // Update distance traveled
    const distance = playerStats.distance || 0;
    playerStats.distance = distance + direction.length();
    document.getElementById('distance-traveled').textContent = Math.round(playerStats.distance) + 'm';
  }

  setInterval(update, 1000 / 60);
}

function shoot() {
  if (!canMove || playerStats.bullets <= 0) return;

  playerStats.bullets--;
  document.getElementById('bullet-count').textContent = playerStats.bullets;

  const bulletGeometry = new THREE.SphereGeometry(0.1);
  const bulletMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
  const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);

  bullet.position.copy(camera.position);
  const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  bullet.velocity = direction.multiplyScalar(0.5);

  scene.add(bullet);
  bullets.push(bullet);

  setTimeout(() => {
    scene.remove(bullet);
    bullets = bullets.filter(b => b !== bullet);
  }, 5000);
}

function buyBullets() {
  if (!account) {
    alert("Connect wallet to buy bullets");
    return;
  }
  playerStats.bullets += 50;
  playerStats.score -= 10;
  document.getElementById('bullet-count').textContent = playerStats.bullets;
  document.getElementById('score-value').textContent = playerStats.score;
}

function interact() {
  if (!canMove) return;
  console.log('Interacting with world...');
}

/* ============================================
   GAME LOOP
============================================ */

function gameLoop() {
  requestAnimationFrame(gameLoop);

  // Update bullets
  bullets.forEach(bullet => {
    bullet.position.add(bullet.velocity);
  });

  // Update time
  if (isGameActive) {
    const elapsed = (Date.now() - startTime) / 1000;
    document.getElementById('play-time').textContent = Math.round(elapsed) + 's';
  }

  renderer.render(scene, camera);
}

/* ============================================
   UI & CHAT
============================================ */

function setupChat() {
  document.getElementById('chat-send').addEventListener('click', sendChatMessage);
  document.getElementById('chat-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChatMessage();
  });
}

function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();

  if (!message) return;

  socket.emit('chat-message', {
    playerId,
    playerName: playerName || 'Anonymous',
    message,
    avatar: selectedAvatar
  });

  input.value = '';
}

function displayChatMessage(data) {
  const messagesDiv = document.getElementById('chat-messages');
  const messageEl = document.createElement('div');
  messageEl.className = 'chat-message';
  messageEl.innerHTML = `<span class="chat-sender">${data.playerName}:</span> ${data.message}`;
  messagesDiv.appendChild(messageEl);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function setupSidebar() {
  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('active');
  });

  document.getElementById('room-link').addEventListener('click', () => {
    const link = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    navigator.clipboard.writeText(link);
    alert('Room link copied to clipboard!');
  });

  document.getElementById('room-info').textContent = roomId;
}

/* ============================================
   AVATAR SELECTION
============================================ */

function setupAvatarSelection() {
  const avatarOptions = document.querySelectorAll('.avatar-option');

  avatarOptions.forEach(option => {
    option.addEventListener('click', () => {
      avatarOptions.forEach(o => o.classList.remove('selected'));
      option.classList.add('selected');
      selectedAvatar = option.getAttribute('data-avatar');
    });
  });

  document.getElementById('confirm-avatar').addEventListener('click', startGame);
}

function startGame() {
  playerName = document.getElementById('player-name').value || 'Anonymous Player';
  document.getElementById('avatar-selection').style.display = 'none';

  canMove = true;
  isGameActive = true;
  startTime = Date.now();

  gameLoop();
  setupGameControls();
  console.log('Game started!');
}

/* ============================================
   INITIALIZATION
============================================ */

async function init() {
  await initSupabase();
  initThreeJS();
  initSocket();
  setupChat();
  setupSidebar();
  setupAvatarSelection();
  initNftModalNavigation();
  
  // Connect wallet button
  document.getElementById('connectBtn').addEventListener('click', connectWallet);

  // Load NFTs
  await loadNFTs();

  // UI
  document.getElementById('health-value').textContent = playerStats.health;
  document.getElementById('bullet-count').textContent = playerStats.bullets;
  document.getElementById('score-value').textContent = playerStats.score;

  // Mobile setup
  if (isMobile) {
    document.getElementById('desktop-instructions').style.display = 'none';
    document.getElementById('mobile-instructions').style.display = 'block';
  }

  console.log('✓ Game initialized');
}

// Start the game when page loads
window.addEventListener('load', init);
