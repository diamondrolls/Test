/* ==============================
   CONFIGURATION & GLOBAL VARIABLES
============================== */
const SUPABASE_URL = "https://fjtzodjudyctqacunlqp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqdHpvZGp1ZHljdHFhY3VubHFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgwNjA2OTQsImV4cCI6MjA3MzYzNjY5NH0.qR9RB";

const TOKEN_FUNCTION_URL = "https://fjtzodjudyctqacunlqp.supabase.co/functions/v1/game-tokens";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const NFT_CONTRACT_ADDRESS = "0x3ed4474a942d885d5651c8c56b238f3f4f524a5c";

const NFT_ABI = [
  {
    constant: true,
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "ownerOf",
    outputs: [{ name: "", type: "address" }],
    type: "function"
  },
  {
    constant: false,
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "tokenId", type: "uint256" }
    ],
    name: "safeTransferFrom",
    outputs: [],
    type: "function"
  }
];

const RECEIVER_ADDRESS = "0xaE0C180e071eE288B2F2f6ff6edaeF014678fFB7";

/**
 * Updates the player count and list UI from Supabase Realtime Presence state.
 *
 * @param {Object} state - Presence state from Supabase.
 *                         Format: { [sessionId]: [{ name: string, ... }[]] }
 */
function updatePlayerCountAndList(state) {
  const playerCountElement = document.querySelector('#player-count');
  const playerListElement = document.querySelector('#player-list');

  if (!playerCountElement || !playerListElement) {
    console.warn('Player count/list DOM elements missing (#player-count or #player-list)');
    return;
  }

  // Extract unique player names safely
  const playerNames = new Set();

  Object.values(state).forEach((presences) => {
    presences.forEach((presence) => {
      if (presence.name && typeof presence.name === 'string') {
        playerNames.add(presence.name.trim());
      }
    });
  });

  const playerCount = playerNames.size;

  playerCountElement.textContent = `Players: ${playerCount}`;

  // Rebuild list
  playerListElement.innerHTML = '';

  if (playerCount === 0) {
    const li = document.createElement('li');
    li.textContent = 'No players online';
    li.style.color = '#888';
    playerListElement.appendChild(li);
  } else {
    [...playerNames].sort().forEach((name) => {
      const li = document.createElement('li');
      li.textContent = name;
      playerListElement.appendChild(li);
    });
  }
}

/**
 * Updates room info UI with current room ID and shareable link.
 * The game uses dynamic rooms via URL param ?room=...
 */
function updateRoomInfoUI() {
  const roomInfoElement = document.querySelector('#room-info');
  const roomLinkElement = document.querySelector('#room-link');

  if (!roomInfoElement || !roomLinkElement) {
    console.warn("Missing room info DOM elements (#room-info or #room-link)");
    return;
  }

  const roomId = multiplayer?.currentRoomId || 'default-world';
  const joinLink = window.location.href.split('?')[0] + (roomId !== 'default-world' ? `?room=${roomId}` : '');

  roomInfoElement.textContent = `Room ID: ${roomId}`;
  roomLinkElement.textContent = joinLink;
  roomLinkElement.href = joinLink;
  roomLinkElement.target = '_blank';
  roomLinkElement.rel = 'noopener noreferrer';
}

/* ==============================
   GLOBAL GAME STATE & VARIABLES
============================== */
let web3, account, nftContract;

// Game economy configuration
const GAME_CONFIG = {
  BUILDING_BASE_COST: 250,
  BULLET_COST: 1,
  BULLET_AMOUNT: 500,
  TRANSFER_RATE: 1,
  MIN_TRANSFER: 1,
  MAX_SALE_PRICE: 1000000
};

// Player stats
let playerStats = {
  health: 50,
  maxHealth: 50,
  bullets: 100,
  maxBullets: 500,
  score: 0,
  hitCount: 0,
  maxHitCount: 50,
  gameTokens: 0
};

// Game systems
let nftCards = [];
let bullets = [];
let bulletSpeed = 50;
let lastShotTime = 0;
let shotCooldown = 150;
let activeChatMessages = new Map();
let canMove = true;
let buildingOwnership = new Map();
let ownedBuildings = [];
let currentBuildingInteraction = null;

// World settings
let worldSize = 1500;
let worldBoundary = worldSize / 2 - 50;

// 3D scene variables
let scene, camera, renderer, controls;
let nftObjects = [], environmentObjects = [], buildingObjects = [];
// --- NFT modal navigation (created_at order) ---
let nftListByCreatedAt = [];     // array of nft rows returned by Supabase (newest first)
let currentModalNftIndex = -1;   // index into nftListByCreatedAt
let raycaster, mouse;
let currentIntersected = null;
let miniMapScene, miniMapCamera, miniMapRenderer;
let playerAvatar;
let clock = new THREE.Clock();
let prevTime = 0;
let lastSendTime = 0;

// Camera controls
let cameraDistance = 25;
let cameraHeight = 10;
let cameraAngle = 0;
let targetCameraAngle = 0;

// Player avatar
let hoverBoard;
let hoverHeight = 3;
let hoverBobSpeed = 2;
let hoverBobAmount = 0.3;
let hoverTime = 0;

// Collision detection
let collisionObjects = [];
let roofObjects = [];
let playerCollider = new THREE.Box3();
let playerSize = new THREE.Vector3(10, 2, 10);
let playerOnRoof = false;
let currentRoof = null;

// Environment
let nftPlatforms = [];
let bridgeSegments = [];

// Mobile controls
let isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let lookTouchId = null;
let lookStartX = 0, lookStartY = 0;
let lookX = 0, lookY = 0;
let velocity = new THREE.Vector3();
let canJump = true;

// Multiplayer state
let multiplayer = {
  playerId: null,
  playerName: null,
  playerColor: null,
  otherPlayers: new Map(),
  gameChannel: null,
  currentRoomId: null
};

// Helper: generate unique player ID
function generatePlayerId() {
  return 'player-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

// Assistant bots manager
let botManager;

/* ==============================
   NFT LOADING GLOBALS
============================== */
const nftLoadingQueue = [];
let activeLoads = 0;
const MAX_CONCURRENT_LOADS = 3;
const nftCache = new Map();
const textureLoader = new THREE.TextureLoader(); // ← THIS WAS MISSING!

/* ==============================
   INITIALIZATION
============================== */

document.addEventListener('DOMContentLoaded', function() {
   document.getElementById("connectBtn").addEventListener("click", connectWallet);
  client.auth.getSession().then(({ data }) => {
    if (!data.session) {
      window.location.href = 'https://diamondrolls.github.io/play/';
    }
  });

  if (isMobile) {
  document.getElementById('desktop-instructions').style.display = 'none';
  document.getElementById('mobile-instructions').style.display = 'block';
  setupMobileControls();
}

setupAvatarSelectionAndGameStart();
initNftModalNavigation();

// PayPal custom + auth UUID
wirePaypalCustom();
});

/* ==============================
   WALLET CONNECTION
============================== */

async function connectWallet() {
  try {
    if (window.ethereum) {
      web3 = new Web3(window.ethereum);
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      account = accounts[0];
    } else {
      const provider = new WalletConnectProvider.default({
        rpc: { 1: "https://mainnet.infura.io/v3/d71dd33696d449e488a88bdc02a6093c" },
      });
      await provider.enable();
      web3 = new Web3(provider);
      const accounts = await web3.eth.getAccounts();
      account = accounts[0];
    }

    document.getElementById("walletStatus").innerText =
      `✅ Connected: ${account.slice(0, 6)}...${account.slice(-4)}`;

    nftContract = new web3.eth.Contract(NFT_ABI, NFT_CONTRACT_ADDRESS);
    await loadTokenBalance();
    updateOwnedBuildings();
    
    if (document.getElementById('avatar-selection').style.display === 'none') {
      loadNFTs();
    }

  } catch (err) {
    console.error(err);
    alert("Failed to connect wallet.");
  }
}

document.getElementById("connectBtn").addEventListener("click", connectWallet);

/* ==============================
   NFT MODAL FUNCTIONS
============================== */

function getNftIndexInCreatedAtList(nftData) {
  if (!nftData || !nftListByCreatedAt || nftListByCreatedAt.length === 0) return -1;

  // Prefer token_id match (best unique key in your data)
  if (nftData.token_id !== undefined && nftData.token_id !== null) {
    const idx = nftListByCreatedAt.findIndex(n => String(n.token_id) === String(nftData.token_id));
    if (idx !== -1) return idx;
  }

  // Fallback: image_url match (less ideal but works if token_id is missing)
  if (nftData.image_url) {
    const idx = nftListByCreatedAt.findIndex(n => n.image_url === nftData.image_url);
    if (idx !== -1) return idx;
  }

  return -1;
}

function updateNftModalNavButtons() {
  const prevBtn = document.getElementById('prev-nft-btn');
  const nextBtn = document.getElementById('next-nft-btn');
  if (!prevBtn || !nextBtn) return;

  const hasList = Array.isArray(nftListByCreatedAt) && nftListByCreatedAt.length > 0;
  const validIndex = currentModalNftIndex >= 0 && currentModalNftIndex < nftListByCreatedAt.length;

  // Hide/disable if list isn't ready
  if (!hasList || !validIndex) {
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    return;
  }

  // Wrap-around behavior (so you can keep tapping forever)
  prevBtn.disabled = false;
  nextBtn.disabled = false;
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
  
  if (!account) {
    const connectBtn = document.createElement('button');
    connectBtn.textContent = 'Connect Wallet to Interact';
    connectBtn.onclick = connectWallet;
    actions.appendChild(connectBtn);
  } else {
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
  if (!account) return alert("Connect wallet first.");
  const recipient = prompt("Enter recipient wallet address:");
  if (!recipient) return;
  try {
    const feeEth = web3.utils.toWei((6/1000).toString(), 'ether');
    await web3.eth.sendTransaction({ from: account, to: RECEIVER_ADDRESS, value: feeEth });

    await nftContract.methods.safeTransferFrom(account, recipient, nftData.token_id).send({ from: account });

    await client.from("nfts").update({ owner: recipient }).eq("token_id", nftData.token_id);
    alert("✅ NFT transferred! Fee sent.");
    loadNFTs();
    document.getElementById('nft-modal').style.display = 'none';
  } catch(err) { 
    console.error(err); 
    alert("Transfer failed: " + err.message); 
  }
}

// PayPal custom wiring: attaches Supabase Auth UUID into PayPal "custom"
function wirePaypalCustom() {
  // Use event delegation so it still works even if the modal is opened later
  document.addEventListener('submit', async (e) => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;

    // Only handle the PayPal form inside the NFT modal
    if (!form.closest('#paypal-nft-modal')) return;

    const customInput = document.getElementById('paypal-custom');
    if (!customInput) return;

    // Get logged-in user id (Supabase Auth UUID)
    const { data, error } = await client.auth.getUser();
    const userId = data?.user?.id;

    if (error || !userId) {
      e.preventDefault();
      alert('You must be logged in before purchasing.');
      return;
    }

    const qty = form.querySelector('select[name="os0"]')?.value || '1';
    const nonce = (crypto?.randomUUID?.() ?? String(Date.now()));

    customInput.value = `${userId}|nft_cards|${qty}|${nonce}`;
  }, true); // capture=true ensures we run before the browser navigates away
}

/* ==============================
   OPTIMIZED NFT LOADING FUNCTIONS (CLEAN & WORKING)
============================== */

async function loadNFTs() {
  try {
    console.time('NFT Loading');
    clearNFTs();
    
    const { data, error } = await client.from("nfts").select("*").order("created_at", { ascending: false }).limit(100); // Optional: limit for testing

    if (error) {
      console.error("Error loading NFTs:", error);
      return;
    }
    
    if (!data || data.length === 0) {
      console.log("No NFTs found in database");
      return;
    }

    console.log(`Loading ${data.length} NFTs`);

// keep the modal navigation list in the same order as created_at (already ordered desc)
nftListByCreatedAt = data.slice();

createNFTPlaceholders(data);
    processLoadingQueue(); // Start the queue — no await needed here
    console.timeEnd('NFT Loading');
    
  } catch (err) {
    console.error("Failed to load NFTs:", err);
  }
}

function clearNFTs() {
  nftObjects.forEach(obj => {
    scene.remove(obj);
    if (obj.userData?.glow) scene.remove(obj.userData.glow);
    if (obj.material?.map) obj.material.map.dispose();
    obj.material?.dispose();
    obj.geometry?.dispose();
  });
  
  nftObjects = [];
  
  nftPlatforms.forEach(platform => scene.remove(platform));
  nftPlatforms = [];
}

function createNFTPlaceholders(nfts) {
  const placeholderGeometry = new THREE.PlaneGeometry(10, 10);
  const placeholderMaterial = new THREE.MeshBasicMaterial({ 
    color: 0x2a2a5a,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.7
  });

  nfts.forEach((nft, index) => {
    const position = calculateNFTPosition(index, nfts.length);
    createNFTPlatform(position.x, position.y, position.z);
    
    const placeholder = new THREE.Mesh(placeholderGeometry, placeholderMaterial.clone());
    placeholder.position.set(position.x, position.y, position.z);
    placeholder.rotation.y = Math.random() * Math.PI * 2;
    placeholder.userData = {
      nftData: nft,
      isNFT: true,
      isPlaceholder: true
    };
    
    scene.add(placeholder);
    nftObjects.push(placeholder);
    
    nftLoadingQueue.push({ nft, placeholder, position });
  });
}

function calculateNFTPosition(index, total) {
  const columnHeight = 500;
  const maxRadius = 40;
  
  const height = (index / total) * columnHeight;
  const radius = (index % 2 === 0 ? 0.3 : 0.7) * maxRadius;
  const angle = (index * 137.5) * (Math.PI / 180);
  
  return {
    x: Math.cos(angle) * radius,
    y: height + 10,
    z: Math.sin(angle) * radius
  };
}

async function processLoadingQueue() {
  if (nftLoadingQueue.length === 0 || activeLoads >= MAX_CONCURRENT_LOADS) {
    // Queue empty or at limit — wait a frame and try again
    if (nftLoadingQueue.length > 0) requestAnimationFrame(processLoadingQueue);
    return;
  }

  const item = nftLoadingQueue.shift();
  activeLoads++;

  loadNFTTexture(item)
    .finally(() => {
      activeLoads--;
      processLoadingQueue(); // Continue processing
    });
}

async function loadNFTTexture({ nft, placeholder }) {
  try {
    // Use cache if available
    if (nftCache.has(nft.image_url)) {
      applyTextureToNFT(placeholder, nftCache.get(nft.image_url), nft);
      return;
    }

    const texture = await textureLoader.loadAsync(nft.image_url);
    texture.colorSpace = THREE.SRGBColorSpace;

    nftCache.set(nft.image_url, texture);
    manageNFTCache();

    applyTextureToNFT(placeholder, texture, nft);
  } catch (err) {
    console.error(`Failed to load texture for NFT: ${nft.image_url}`, err);
    // Optional: show error placeholder
  }
}

function applyTextureToNFT(placeholder, texture, nftData) {
  const finalMaterial = new THREE.MeshStandardMaterial({ 
    map: texture,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9
  });
  
  placeholder.material.dispose();
  placeholder.material = finalMaterial;
  placeholder.userData.isPlaceholder = false;
  placeholder.userData.nftData = nftData;

  // Glow effect
  const glowGeometry = new THREE.PlaneGeometry(10.5, 10.5);
  const glowMaterial = new THREE.MeshBasicMaterial({ 
    color: 0x3b82f6,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide
  });
  
  const glow = new THREE.Mesh(glowGeometry, glowMaterial);
  glow.position.copy(placeholder.position);
  glow.rotation.copy(placeholder.rotation);
  scene.add(glow);
  
  placeholder.userData.glow = glow;
}

function manageNFTCache() {
  const maxCacheSize = 50;
  if (nftCache.size > maxCacheSize) {
    const entries = Array.from(nftCache.entries());
    const toRemove = entries.slice(0, nftCache.size - maxCacheSize);
    toRemove.forEach(([key, texture]) => {
      texture.dispose();
      nftCache.delete(key);
    });
  }
}

setInterval(manageNFTCache, 30000);

console.log("NFT Shooter Universe initialized successfully!");
