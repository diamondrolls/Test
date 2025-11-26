/* ==============================
   CONFIGURATION & GLOBAL VARIABLES
============================== */
const supabaseUrl = "https://fjtzodjudyctqacunlqp.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqdHpvZGp1ZHljdHFhY3VubHFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgwNjA2OTQsImV4cCI6MjA3MzYzNjY5NH0.qR9RBsecfGUfKnbWgscmxloM-oEClJs_bo5YWoxFoE4";
const client = supabase.createClient(supabaseUrl, supabaseKey);

const NFT_CONTRACT_ADDRESS = "0x3ed4474a942d885d5651c8c56b238f3f4f524a5c";
const NFT_ABI = [
  { "constant":true,"inputs":[{"name":"tokenId","type":"uint256"}],"name":"ownerOf","outputs":[{"name":"","type":"address"}],"type":"function" },
  { "constant":false,"inputs":[{"name":"from","type":"address"},{"name":"to","type":"address"},{"name":"tokenId","type":"uint256"}],"name":"safeTransferFrom","outputs":[],"type":"function" }
];
const RECEIVER_ADDRESS = "0xaE0C180e071eE288B2F2f6ff6edaeF014678fFB7";

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
let raycaster, mouse;
let currentIntersected = null;
let miniMapScene, miniMapCamera, miniMapRenderer;
let playerAvatar;
let clock = new THREE.Clock();
let prevTime = 0;

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

// Multiplayer
let multiplayer;
let selectedAvatar = null;

// Assistant Bots
let botManager;

/* ==============================
   OPTIMIZED NFT LOADING SYSTEM
============================== */
const nftCache = new Map();
const textureLoader = new THREE.TextureLoader();
const nftLoadingQueue = [];
let isProcessingQueue = false;
const MAX_CONCURRENT_LOADS = 3;
let activeLoads = 0;

/* ==============================
   ASSISTANT BOT ROAMING SYSTEM
============================== */

class AssistantBot {
  constructor(scene, multiplayer, config = {}) {
    this.scene = scene;
    this.multiplayer = multiplayer;
    this.botId = 'assistant-bot-' + Date.now();
    this.group = null;
    this.targetPosition = new THREE.Vector3();
    this.currentPosition = new THREE.Vector3();
    this.moveSpeed = config.moveSpeed || 3.0;
    this.roamRadius = config.roamRadius || worldBoundary * 0.8;
    this.roamCenter = new THREE.Vector3(0, 3, 0);
    this.state = 'roaming';
    this.lastStateChange = 0;
    this.stateDuration = config.stateDuration || 5000;
    this.detectionRange = config.detectionRange || 80;
    this.interactionRange = config.interactionRange || 20;
    
    this.init();
  }

  init() {
    this.createBot();
    this.setRandomTarget();
    this.startRoaming();
  }

  createBot() {
    const group = new THREE.Group();
    
    // Bot body (flying drone style)
    const bodyGeometry = new THREE.SphereGeometry(3, 8, 8);
    const bodyMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x00FF00,
      metalness: 0.7,
      roughness: 0.3
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    group.add(body);

    // Antenna
    const antennaGeometry = new THREE.CylinderGeometry(0.2, 0.2, 4, 8);
    const antennaMaterial = new THREE.MeshStandardMaterial({ color: 0xFF6B6B });
    const antenna = new THREE.Mesh(antennaGeometry, antennaMaterial);
    antenna.position.y = 5;
    group.add(antenna);

    // Glowing core
    const coreGeometry = new THREE.SphereGeometry(1, 6, 6);
    const coreMaterial = new THREE.MeshBasicMaterial({ 
      color: 0x00FFFF,
      transparent: true,
      opacity: 0.8
    });
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    group.add(core);

    // Energy field
    const fieldGeometry = new THREE.SphereGeometry(5, 8, 8);
    const fieldMaterial = new THREE.MeshBasicMaterial({ 
      color: 0x00FF00,
      transparent: true,
      opacity: 0.2,
      wireframe: true
    });
    const field = new THREE.Mesh(fieldGeometry, fieldMaterial);
    group.add(field);

    group.castShadow = true;
    group.position.set(
      (Math.random() - 0.5) * this.roamRadius,
      10 + Math.random() * 20,
      (Math.random() - 0.5) * this.roamRadius
    );
    
    this.scene.add(group);
    this.group = group;
    this.currentPosition.copy(group.position);

    // Add name tag
    this.createNameTag();
  }

  createNameTag() {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 64;
    
    context.fillStyle = '#10B981';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    context.font = 'bold 20px Arial';
    context.fillStyle = '#FFFFFF';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('Assistant Bot', canvas.width / 2, canvas.height / 2);
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(material);
    
    sprite.position.y = 8;
    sprite.scale.set(12, 3, 1);
    this.group.add(sprite);
  }

  setRandomTarget() {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * this.roamRadius;
    
    this.targetPosition.set(
      Math.cos(angle) * distance,
      10 + Math.random() * 50, // Increased height variation
      Math.sin(angle) * distance
    );
    
    // Ensure target is within world boundaries
    this.targetPosition.x = Math.max(-worldBoundary + 20, Math.min(worldBoundary - 20, this.targetPosition.x));
    this.targetPosition.z = Math.max(-worldBoundary + 20, Math.min(worldBoundary - 20, this.targetPosition.z));
  }

  startRoaming() {
    this.roamInterval = setInterval(() => {
      this.updateBot();
    }, 1000 / 60); // 60 FPS
  }

  updateBot() {
    if (!this.group) return;

    const now = Date.now();
    
    // State transitions
    if (now - this.lastStateChange > this.stateDuration) {
      this.changeState();
    }

    switch (this.state) {
      case 'roaming':
        this.updateRoaming();
        break;
      case 'chasing':
        this.updateChasing();
        break;
      case 'interacting':
        this.updateInteracting();
        break;
    }

    // Smooth movement
    this.group.position.lerp(this.currentPosition, 0.1);
    
    // Gentle floating animation
    this.group.position.y += Math.sin(now * 0.002) * 0.1;
    
    // Rotate slowly
    this.group.rotation.y += 0.01;

    // Check for player proximity
    this.checkPlayerProximity();
  }

  updateRoaming() {
    // Move towards target
    const direction = new THREE.Vector3()
      .subVectors(this.targetPosition, this.currentPosition)
      .normalize();
    
    this.currentPosition.add(direction.multiplyScalar(this.moveSpeed));

    // If close to target, set new random target
    if (this.currentPosition.distanceTo(this.targetPosition) < 5) {
      this.setRandomTarget();
    }
  }

  updateChasing() {
    if (!this.multiplayer || !window.playerAvatar) return;

    const playerPos = window.playerAvatar.position.clone();
    const direction = new THREE.Vector3()
      .subVectors(playerPos, this.currentPosition)
      .normalize();
    
    // Maintain some distance from player
    const desiredDistance = 8;
    const targetPos = playerPos.clone().sub(direction.multiplyScalar(desiredDistance));
    targetPos.y = Math.max(5, playerPos.y + 3); // Fly slightly above player

    const moveDirection = new THREE.Vector3()
      .subVectors(targetPos, this.currentPosition)
      .normalize();
    
    this.currentPosition.add(moveDirection.multiplyScalar(this.moveSpeed * 1.5));
  }

  updateInteracting() {
    // Hover in place with more pronounced bobbing
    this.group.position.y += Math.sin(Date.now() * 0.005) * 0.3;
  }

  checkPlayerProximity() {
    if (!this.multiplayer || !window.playerAvatar) return;

    const playerPos = window.playerAvatar.position;
    const distance = this.currentPosition.distanceTo(playerPos);

    if (distance < this.interactionRange && this.state !== 'interacting') {
      this.state = 'interacting';
      this.lastStateChange = Date.now();
      this.showInteractionMessage();
    } else if (distance < this.detectionRange && this.state === 'roaming') {
      this.state = 'chasing';
      this.lastStateChange = Date.now();
    }
  }

  changeState() {
    const states = ['roaming', 'chasing'];
    const newState = states[Math.floor(Math.random() * states.length)];
    
    if (newState !== this.state) {
      this.state = newState;
      this.lastStateChange = Date.now();
      
      if (this.state === 'roaming') {
        this.setRandomTarget();
      }
    }
  }

  showInteractionMessage() {
    const messages = [
      "Hello! Need help with NFTs?",
      "I can assist you with building purchases!",
      "Looking for rare NFTs? Check the column!",
      "Press B to buy more bullets!",
      "Earn tokens by shooting NFTs!",
      "Visit buildings to purchase them!"
    ];
    
    const message = messages[Math.floor(Math.random() * messages.length)];
    
    // Create chat bubble
    createChatMessageBubble(this.botId, 'Assistant Bot', message, false);
    
    // Also add to chat panel
    if (this.multiplayer) {
      this.multiplayer.addChatMessage('Assistant Bot', message, false);
    }
  }

  dispose() {
    if (this.roamInterval) {
      clearInterval(this.roamInterval);
    }
    if (this.group && this.scene) {
      this.scene.remove(this.group);
    }
  }
}

/* ==============================
   BOT MANAGEMENT SYSTEM
============================== */

class BotManager {
  constructor(scene, multiplayer, config = {}) {
    this.scene = scene;
    this.multiplayer = multiplayer;
    this.maxBots = config.maxBots || 5;
    this.botConfig = {
      roamRadius: config.roamRadius || worldBoundary * 0.8,
      moveSpeed: config.moveSpeed || 3.0,
      detectionRange: config.detectionRange || 80,
      interactionRange: config.interactionRange || 20,
      stateDuration: config.stateDuration || 5000
    };
    this.bots = new Map();
    
    this.init();
  }

  init() {
    this.spawnBots();
    
    // Respawn bots periodically
    setInterval(() => {
      this.maintainBotCount();
    }, 30000); // Check every 30 seconds
  }

  spawnBots() {
    for (let i = 0; i < this.maxBots; i++) {
      this.spawnBot();
    }
  }

  spawnBot() {
    const bot = new AssistantBot(this.scene, this.multiplayer, this.botConfig);
    this.bots.set(bot.botId, bot);
    
    console.log(`Spawned assistant bot: ${bot.botId}`);
  }

  maintainBotCount() {
    const currentCount = this.bots.size;
    
    if (currentCount < this.maxBots) {
      const needed = this.maxBots - currentCount;
      for (let i = 0; i < needed; i++) {
        this.spawnBot();
      }
    }
  }

  removeBot(botId) {
    const bot = this.bots.get(botId);
    if (bot) {
      bot.dispose();
      this.bots.delete(botId);
    }
  }

  update() {
    this.bots.forEach(bot => {
      if (bot.update) bot.update();
    });
  }

  dispose() {
    this.bots.forEach(bot => bot.dispose());
    this.bots.clear();
  }
}

/* ==============================
   INITIALIZATION
============================== */

document.addEventListener('DOMContentLoaded', function() {
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

  setupAvatarSelection();
});

/* ==============================
   AVATAR SELECTION SYSTEM
============================== */

function setupAvatarSelection() {
  const avatarOptions = document.querySelectorAll('.avatar-option');
  const confirmButton = document.getElementById('confirm-avatar');
  
  avatarOptions.forEach(option => {
    option.addEventListener('click', () => {
      avatarOptions.forEach(opt => opt.classList.remove('selected'));
      option.classList.add('selected');
      selectedAvatar = option.getAttribute('data-avatar');
    });
  });

  confirmButton.addEventListener('click', () => {
    if (selectedAvatar) {
      startGame();
    } else {
      alert('Please select an avatar to continue');
    }
  });
}

function startGame() {
  initSidebar();
  multiplayer = new WebRTCMultiplayer();
  
  const nameInput = document.getElementById('player-name');
  if (nameInput && nameInput.value.trim()) {
    multiplayer.playerName = nameInput.value.trim();
  }
  
  multiplayer.playerColor = Math.random() * 0xFFFFFF;
  document.getElementById('avatar-selection').style.display = 'none';
  
  init3DScene();
  
  // Initialize bot manager with expanded roaming
  botManager = new BotManager(scene, multiplayer, {
    maxBots: 8, // More bots for larger area
    roamRadius: worldBoundary * 0.9, // Almost entire world
    moveSpeed: 4.0, // Faster movement
    detectionRange: 100, // Can detect players from farther
    interactionRange: 25, // Larger interaction radius
    stateDuration: 8000 // Longer states for more exploration
  });
  
  loadNFTs();
  initTokenSystem();
  initBuildingOwnership();
  setupBulletPurchaseWithTokens();
  
  setInterval(() => {
    if (multiplayer) {
      multiplayer.sendPositionUpdate();
    }
  }, 100);
}

/* ==============================
   OPTIMIZED NFT LOADING FUNCTIONS
============================== */

async function loadNFTs() {
  try {
    console.time('NFT Loading');
    clearNFTs();
    
    const { data, error } = await client.from("nfts").select("*").order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading NFTs:", error);
      return;
    }
    
    if (!data || data.length === 0) {
      console.log("No NFTs found in database");
      return;
    }

    console.log(`Loading ${data.length} NFTs with optimized system`);
    createNFTPlaceholders(data);
    await loadNFTTexturesProgressive(data);
    console.timeEnd('NFT Loading');
    
  } catch (err) {
    console.error("Failed to load NFTs:", err);
  }
}

function clearNFTs() {
  const removeBatch = (objects) => {
    objects.forEach(obj => {
      scene.remove(obj);
      if (obj.userData?.glow) scene.remove(obj.userData.glow);
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
      }
      if (obj.geometry) obj.geometry.dispose();
    });
  };

  const batchSize = 10;
  for (let i = 0; i < nftObjects.length; i += batchSize) {
    const batch = nftObjects.slice(i, i + batchSize);
    setTimeout(() => removeBatch(batch), 0);
  }
  
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
      isPlaceholder: true,
      originalEmissive: 0x000000
    };
    
    placeholder.castShadow = true;
    placeholder.receiveShadow = true;
    scene.add(placeholder);
    nftObjects.push(placeholder);
    
    nftLoadingQueue.push({
      nft,
      placeholder,
      position
    });
  });

  processLoadingQueue();
}

function calculateNFTPosition(index, total) {
  const columnHeight = 500;
  const baseX = 0;
  const baseZ = 0;
  const maxRadius = 40;
  
  const height = (index / total) * columnHeight;
  const radius = (index % 2 === 0 ? 0.3 : 0.7) * maxRadius;
  const angle = (index * 137.5) % 360 * (Math.PI / 180);
  
  return {
    x: baseX + Math.cos(angle) * radius,
    y: height + 10,
    z: baseZ + Math.sin(angle) * radius
  };
}

async function processLoadingQueue() {
  if (isProcessingQueue || nftLoadingQueue.length === 0) return;
  
  isProcessingQueue = true;
  
  while (nftLoadingQueue.length > 0) {
    while (activeLoads >= MAX_CONCURRENT_LOADS) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    const item = nftLoadingQueue.shift();
    if (item) {
      activeLoads++;
      loadNFTTexture(item).finally(() => {
        activeLoads--;
      });
    }
    
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  isProcessingQueue = false;
}

function loadNFTTexture({ nft, placeholder, position }) {
  return new Promise((resolve) => {
    const imageUrl = nft.image_url || 'https://via.placeholder.com/400x400?text=NFT+Image';
    
    if (nftCache.has(imageUrl)) {
      applyTextureToNFT(placeholder, nftCache.get(imageUrl), nft);
      resolve();
      return;
    }
    
    const loadTimeout = setTimeout(() => {
      console.warn(`Timeout loading NFT: ${nft.name || nft.token_id}`);
      resolve();
    }, 10000);
    
    textureLoader.load(
      imageUrl,
      (texture) => {
        clearTimeout(loadTimeout);
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        nftCache.set(imageUrl, texture);
        applyTextureToNFT(placeholder, texture, nft);
        resolve();
      },
      (progress) => {
        if (progress.lengthComputable) {
          const percent = (progress.loaded / progress.total) * 100;
        }
      },
      (error) => {
        clearTimeout(loadTimeout);
        console.error('Error loading NFT image:', error, imageUrl);
        resolve();
      }
    );
  });
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
  placeholder.userData.nftData = nftData;
}

async function loadNFTTexturesProgressive(nfts) {
  const priorities = [];
  
  nfts.forEach((nft, index) => {
    const position = calculateNFTPosition(index, nfts.length);
    const distance = playerAvatar ? position.distanceTo(playerAvatar.position) : 1000;
    priorities.push({
      nft,
      index,
      distance,
      priority: distance < 200 ? 0 : distance < 500 ? 1 : 2
    });
  });
  
  priorities.sort((a, b) => a.priority - b.priority);
  
  for (const item of priorities) {
    while (activeLoads >= MAX_CONCURRENT_LOADS) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    activeLoads++;
    const nftObj = nftObjects[item.index];
    if (nftObj && nftObj.userData.isPlaceholder) {
      loadNFTTexture({
        nft: item.nft,
        placeholder: nftObj,
        position: nftObj.position
      }).finally(() => {
        activeLoads--;
      });
    } else {
      activeLoads--;
    }
    
    await new Promise(resolve => setTimeout(resolve, 30));
  }
}

function updateNFTLOD() {
  if (!playerAvatar) return;
  
  nftObjects.forEach((nft, index) => {
    const distance = nft.position.distanceTo(playerAvatar.position);
    
    if (distance > 500 && nft.userData.isPlaceholder === false) {
      nft.material.opacity = 0.7;
    } else if (distance <= 500 && nft.userData.isPlaceholder === false) {
      nft.material.opacity = 0.9;
    }
    
    if (distance < 200 && nft.userData.isPlaceholder) {
      const queueItem = nftLoadingQueue.find(item => item.placeholder === nft);
      if (!queueItem) {
        loadNFTTexture({
          nft: nft.userData.nftData,
          placeholder: nft,
          position: nft.position
        });
      }
    }
  });
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

/* ==============================
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
    
    await web3.eth.sendTransaction({
      from: account,
      to: RECEIVER_ADDRESS,
      value: web3.utils.toWei(ethPrice.toString(), 'ether')
    });
    
    await addTokens(tokenAmount);
    alert(`✅ Successfully purchased ${tokenAmount} game tokens!`);
    closeTokenPurchaseModal();
  } catch (err) {
    console.error("Token purchase failed:", err);
    alert(`Purchase failed: ${err.message}`);
  }
}

/* ==============================
   BUILDING OWNERSHIP SYSTEM
============================== */

async function initBuildingOwnership() {
  await loadBuildingOwnership();
  setupBuildingInteraction();
}

async function loadBuildingOwnership() {
  try {
    const { data, error } = await client.from("building_ownership").select("*");
    
    if (error) {
      console.error("Error loading building ownership:", error);
      return;
    }
    
    if (data && data.length > 0) {
      data.forEach(building => {
        buildingOwnership.set(building.building_id, {
          owner: building.owner,
          ownerName: building.owner_name,
          purchasePrice: building.purchase_price || GAME_CONFIG.BUILDING_BASE_COST,
          salePrice: building.sale_price || null,
          forSale: building.for_sale || false,
          previousOwner: building.previous_owner || null
        });
        
        if (building.owner_name) {
          addOwnerTagToBuilding(building.building_id, building.owner_name);
        }
        
        if (building.for_sale && building.sale_price) {
          updateBuildingSaleIndicator(building.building_id, building.sale_price);
        }
      });
    }
    
    if (account) {
      updateOwnedBuildings();
    }
    
  } catch (err) {
    console.error("Failed to load building ownership:", err);
  }
}

function setupBuildingInteraction() {
  setInterval(() => {
    if (canMove && playerAvatar) {
      checkBuildingInteraction();
    }
  }, 500);
  
  document.getElementById('purchase-building').addEventListener('click', purchaseBuilding);
  document.getElementById('update-building').addEventListener('click', updateBuildingInfo);
  document.getElementById('sell-building').addEventListener('click', sellBuilding);
  document.getElementById('cancel-sale').addEventListener('click', cancelSale);
  document.getElementById('close-building-modal').addEventListener('click', closeBuildingModal);
}

function checkBuildingInteraction() {
  buildingObjects.forEach(building => {
    if (building.userData.originalEmissive !== undefined) {
      building.material.emissive.setHex(building.userData.originalEmissive);
    }
  });
  
  let closestBuilding = null;
  let closestDistance = Infinity;
  
  buildingObjects.forEach((building, index) => {
    const distance = building.position.distanceTo(playerAvatar.position);
    
    if (distance < 30 && distance < closestDistance) {
      closestDistance = distance;
      closestBuilding = { building, index, id: `building-${index}` };
    }
  });
  
  if (closestBuilding) {
    closestBuilding.building.userData.originalEmissive = closestBuilding.building.material.emissive.getHex();
    closestBuilding.building.material.emissive.setHex(0xf59e0b);
    
    const instructions = document.getElementById('instructions');
    const originalContent = instructions.innerHTML;
    instructions.innerHTML = '<div>Press E to interact with building</div>' + originalContent;
    
    const interactKeyHandler = (e) => {
      if ((e.key === 'e' || e.key === 'E') && canMove) {
        openBuildingModal(closestBuilding.id, closestBuilding.index);
        document.removeEventListener('keydown', interactKeyHandler);
        
        setTimeout(() => {
          instructions.innerHTML = originalContent;
        }, 100);
      }
    };
    
    document.addEventListener('keydown', interactKeyHandler);
    
    setTimeout(() => {
      document.removeEventListener('keydown', interactKeyHandler);
      instructions.innerHTML = originalContent;
    }, 2000);
  }
}

function addOwnerTagToBuilding(buildingId, ownerName) {
  const buildingIndex = parseInt(buildingId.split('-')[1]);
  if (buildingIndex >= 0 && buildingIndex < buildingObjects.length) {
    const building = buildingObjects[buildingIndex];
    
    if (building.userData.ownerTag) {
      scene.remove(building.userData.ownerTag);
    }
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 64;
    
    context.fillStyle = '#3b82f6';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    context.font = 'bold 20px Arial';
    context.fillStyle = '#FFFFFF';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(ownerName, canvas.width / 2, canvas.height / 2);
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(material);
    
    const buildingHeight = building.geometry.parameters.height;
    sprite.position.set(
      building.position.x,
      building.position.y + buildingHeight + 5,
      building.position.z
    );
    sprite.scale.set(15, 3.75, 1);
    
    scene.add(sprite);
    building.userData.ownerTag = sprite;
  }
}

function updateBuildingSaleIndicator(buildingId, price) {
  const buildingIndex = parseInt(buildingId.split('-')[1]);
  if (buildingIndex >= 0 && buildingIndex < buildingObjects.length) {
    const building = buildingObjects[buildingIndex];
    
    if (building.userData.saleIndicator) {
      scene.remove(building.userData.saleIndicator);
    }
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 128;
    
    context.fillStyle = '#10B981';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    context.font = 'bold 20px Arial';
    context.fillStyle = '#FFFFFF';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('FOR SALE', canvas.width / 2, canvas.height / 2 - 15);
    
    context.font = 'bold 16px Arial';
    context.fillText(`${price} Tokens`, canvas.width / 2, canvas.height / 2 + 15);
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(material);
    
    const buildingHeight = building.geometry.parameters.height;
    sprite.position.set(
      building.position.x,
      building.position.y + buildingHeight + 8,
      building.position.z
    );
    sprite.scale.set(20, 10, 1);
    
    scene.add(sprite);
    building.userData.saleIndicator = sprite;
    
    building.userData.originalColor = building.material.color.getHex();
    building.material.color.set(0x10B981);
  }
}

function removeSaleIndicator(buildingId) {
  const buildingIndex = parseInt(buildingId.split('-')[1]);
  if (buildingIndex >= 0 && buildingIndex < buildingObjects.length) {
    const building = buildingObjects[buildingIndex];
    
    if (building.userData.saleIndicator) {
      scene.remove(building.userData.saleIndicator);
      building.userData.saleIndicator = null;
    }
    
    if (building.userData.originalColor) {
      building.material.color.setHex(building.userData.originalColor);
    }
  }
}

function openBuildingModal(buildingId, buildingIndex) {
  currentBuildingInteraction = { id: buildingId, index: buildingIndex };
  
  const buildingData = buildingOwnership.get(buildingId) || {
    owner: null,
    ownerName: null,
    purchasePrice: GAME_CONFIG.BUILDING_BASE_COST,
    salePrice: null,
    forSale: false
  };
  
  document.getElementById('building-id').textContent = buildingId;
  document.getElementById('building-owner').textContent = buildingData.owner ? 
    `${buildingData.owner.slice(0, 6)}...${buildingData.owner.slice(-4)}` : 'None (Available for Purchase)';
  
  const displayPrice = buildingData.forSale ? 
    `${buildingData.salePrice} Tokens` : 
    `${GAME_CONFIG.BUILDING_BASE_COST} Tokens`;
    
  document.getElementById('building-price').textContent = displayPrice;
  document.getElementById('building-owner-name').textContent = buildingData.ownerName || '-';
  document.getElementById('building-cost-display').textContent = buildingData.forSale ? buildingData.salePrice : GAME_CONFIG.BUILDING_BASE_COST;
  
  updateTokenDisplay();
  
  const isOwner = buildingData.owner && buildingData.owner.toLowerCase() === account?.toLowerCase();
  
  if (isOwner) {
    document.getElementById('purchase-section').style.display = 'none';
    document.getElementById('owner-section').style.display = 'block';
    
    document.getElementById('new-owner-name').value = buildingData.ownerName || '';
    const currentSalePrice = buildingData.forSale ? buildingData.salePrice : GAME_CONFIG.BUILDING_BASE_COST;
    document.getElementById('new-price').value = currentSalePrice;
    document.getElementById('new-price').min = GAME_CONFIG.BUILDING_BASE_COST;
    document.getElementById('new-price').max = GAME_CONFIG.MAX_SALE_PRICE;
    document.getElementById('cancel-sale').style.display = buildingData.forSale ? 'block' : 'none';
    
  } else {
    document.getElementById('purchase-section').style.display = 'block';
    document.getElementById('owner-section').style.display = 'none';
    
    const purchaseBtn = document.getElementById('purchase-building');
    const purchasePrice = buildingData.forSale ? buildingData.salePrice : GAME_CONFIG.BUILDING_BASE_COST;
    
    if (buildingData.forSale && buildingData.owner) {
      purchaseBtn.textContent = `Purchase for ${purchasePrice} Tokens`;
      purchaseBtn.disabled = playerStats.gameTokens < purchasePrice;
    } else if (buildingData.owner) {
      purchaseBtn.textContent = 'Not for Sale';
      purchaseBtn.disabled = true;
    } else {
      purchaseBtn.textContent = `Purchase for ${purchasePrice} Tokens`;
      purchaseBtn.disabled = playerStats.gameTokens < purchasePrice;
    }
  }
  
  updateOwnedBuildingsUI();
  document.getElementById('building-modal').style.display = 'block';
}

function closeBuildingModal() {
  document.getElementById('building-modal').style.display = 'none';
  currentBuildingInteraction = null;
}

async function purchaseBuilding() {
  if (!account) {
    alert("Please connect your wallet to purchase buildings.");
    return;
  }
  
  if (!currentBuildingInteraction) return;
  
  const buildingId = currentBuildingInteraction.id;
  const buildingData = buildingOwnership.get(buildingId);
  const ownerName = document.getElementById('owner-name-input').value.trim() || 'Unknown Owner';
  const purchasePrice = buildingData && buildingData.forSale ? 
    buildingData.salePrice : GAME_CONFIG.BUILDING_BASE_COST;
  
  if (playerStats.gameTokens < purchasePrice) {
    alert(`Insufficient tokens! You need ${purchasePrice} but only have ${playerStats.gameTokens}.`);
    return;
  }
  
  try {
    playerStats.gameTokens -= purchasePrice;
    localStorage.setItem(`gameTokens_${account}`, playerStats.gameTokens.toString());
    
    if (buildingData && buildingData.forSale && buildingData.owner) {
      await transferTokensToSeller(buildingData.owner, purchasePrice);
    }
    
    const { error } = await client.from("building_ownership").upsert({
      building_id: buildingId,
      owner: account,
      owner_name: ownerName,
      purchase_price: purchasePrice,
      for_sale: false,
      sale_price: null,
      previous_owner: buildingData?.owner || null,
      updated_at: new Date().toISOString()
    });
    
    if (error) {
      playerStats.gameTokens += purchasePrice;
      localStorage.setItem(`gameTokens_${account}`, playerStats.gameTokens.toString());
      throw new Error(`Database error: ${error.message}`);
    }
    
    buildingOwnership.set(buildingId, {
      owner: account,
      ownerName: ownerName,
      purchasePrice: purchasePrice,
      salePrice: null,
      forSale: false,
      previousOwner: buildingData?.owner || null
    });
    
    addOwnerTagToBuilding(buildingId, ownerName);
    removeSaleIndicator(buildingId);
    updateOwnedBuildings();
    
    const sellerInfo = buildingData && buildingData.owner ? 
      ` (purchased from ${buildingData.ownerName || 'previous owner'})` : '';
    
    alert(`✅ Building purchased for ${purchasePrice} tokens${sellerInfo}!`);
    updateTokenDisplay();
    closeBuildingModal();
    
  } catch (err) {
    console.error("Building purchase failed:", err);
    alert(`Purchase failed: ${err.message}`);
  }
}

async function transferTokensToSeller(sellerAddress, amount) {
  try {
    const sellerBalance = parseInt(localStorage.getItem(`gameTokens_${sellerAddress}`) || '0');
    const newSellerBalance = sellerBalance + amount;
    localStorage.setItem(`gameTokens_${sellerAddress}`, newSellerBalance.toString());
    console.log(`Transferred ${amount} tokens from buyer to seller ${sellerAddress}`);
    
    if (multiplayer && multiplayer.otherPlayers.has(sellerAddress)) {
      console.log(`Seller ${sellerAddress} received ${amount} tokens from building sale`);
    }
    
  } catch (err) {
    console.error("Token transfer to seller failed:", err);
  }
}

async function updateBuildingInfo() {
  if (!account || !currentBuildingInteraction) return;
  
  const buildingId = currentBuildingInteraction.id;
  const newOwnerName = document.getElementById('new-owner-name').value.trim();
  const newPrice = parseInt(document.getElementById('new-price').value);
  
  if (!newOwnerName) {
    alert("Please enter a display name for your building.");
    return;
  }
  
  if (newPrice < GAME_CONFIG.BUILDING_BASE_COST) {
    alert(`Minimum sale price is ${GAME_CONFIG.BUILDING_BASE_COST} tokens.`);
    return;
  }
  
  if (newPrice > GAME_CONFIG.MAX_SALE_PRICE) {
    alert(`Maximum sale price is ${GAME_CONFIG.MAX_SALE_PRICE} tokens.`);
    return;
  }
  
  try {
    const { error } = await client.from("building_ownership").update({
      owner_name: newOwnerName,
      sale_price: newPrice,
      updated_at: new Date().toISOString()
    }).eq('building_id', buildingId);
    
    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }
    
    const buildingData = buildingOwnership.get(buildingId);
    if (buildingData) {
      buildingData.ownerName = newOwnerName;
      buildingData.salePrice = newPrice;
      buildingOwnership.set(buildingId, buildingData);
    }
    
    addOwnerTagToBuilding(buildingId, newOwnerName);
    alert("✅ Building information updated successfully!");
    
  } catch (err) {
    console.error("Building update failed:", err);
    alert(`Update failed: ${err.message}`);
  }
}

async function sellBuilding() {
  if (!account || !currentBuildingInteraction) return;
  
  const buildingId = currentBuildingInteraction.id;
  const salePrice = parseInt(document.getElementById('new-price').value);
  
  if (!salePrice || salePrice < GAME_CONFIG.BUILDING_BASE_COST) {
    alert(`Minimum sale price is ${GAME_CONFIG.BUILDING_BASE_COST} tokens.`);
    return;
  }
  
  if (salePrice > GAME_CONFIG.MAX_SALE_PRICE) {
    alert(`Maximum sale price is ${GAME_CONFIG.MAX_SALE_PRICE} tokens.`);
    return;
  }
  
  try {
    const { error } = await client.from("building_ownership").update({
      for_sale: true,
      sale_price: salePrice,
      updated_at: new Date().toISOString()
    }).eq('building_id', buildingId);
    
    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }
    
    const buildingData = buildingOwnership.get(buildingId);
    if (buildingData) {
      buildingData.forSale = true;
      buildingData.salePrice = salePrice;
      buildingOwnership.set(buildingId, buildingData);
    }
    
    updateBuildingSaleIndicator(buildingId, salePrice);
    alert(`✅ Building listed for sale for ${salePrice} tokens!`);
    updateOwnedBuildingsUI();
    
  } catch (err) {
    console.error("Building sale listing failed:", err);
    alert(`Sale listing failed: ${err.message}`);
  }
}

async function cancelSale() {
  if (!account || !currentBuildingInteraction) return;
  
  const buildingId = currentBuildingInteraction.id;
  
  try {
    const { error } = await client.from("building_ownership").update({
      for_sale: false,
      sale_price: null,
      updated_at: new Date().toISOString()
    }).eq('building_id', buildingId);
    
    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }
    
    const buildingData = buildingOwnership.get(buildingId);
    if (buildingData) {
      buildingData.forSale = false;
      buildingData.salePrice = null;
      buildingOwnership.set(buildingId, buildingData);
    }
    
    removeSaleIndicator(buildingId);
    alert("✅ Building sale cancelled!");
    updateOwnedBuildingsUI();
    
  } catch (err) {
    console.error("Building sale cancellation failed:", err);
    alert(`Cancellation failed: ${err.message}`);
  }
}

function updateOwnedBuildings() {
  if (!account) return;
  
  ownedBuildings = [];
  buildingOwnership.forEach((data, buildingId) => {
    if (data.owner && data.owner.toLowerCase() === account.toLowerCase()) {
      ownedBuildings.push(buildingId);
    }
  });
  
  document.getElementById('owned-buildings-count').textContent = ownedBuildings.length;
  updateOwnedBuildingsUI();
}

function updateOwnedBuildingsUI() {
  const container = document.getElementById('owned-buildings-container');
  container.innerHTML = '';
  
  if (ownedBuildings.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: #6b7280; padding: 10px;">You don\'t own any buildings yet</div>';
    return;
  }
  
  ownedBuildings.forEach(buildingId => {
    const buildingData = buildingOwnership.get(buildingId);
    if (buildingData) {
      const item = document.createElement('div');
      item.className = 'owned-building-item';
      
      const status = buildingData.forSale ? 
        `<span style="color: #10B981; font-weight: bold;">For Sale: ${buildingData.salePrice} tokens</span>` :
        '<span style="color: #6B7280;">Not for Sale</span>';
      
      item.innerHTML = `
        <div>
          <strong>${buildingId}</strong><br>
          <span>${buildingData.ownerName || 'Unnamed'}</span>
        </div>
        <div style="text-align: right;">
          <div>Paid: ${buildingData.purchasePrice} tokens</div>
          <small>${status}</small>
        </div>
      `;
      container.appendChild(item);
    }
  });
}

/* ==============================
   BULLET SYSTEM
============================== */

function setupBulletPurchaseWithTokens() {
  document.getElementById('buy-500-token').addEventListener('click', buyBulletsWithToken);
  document.getElementById('buy-100').addEventListener('click', () => buyBullets(100));
  document.getElementById('close-bullet-modal').addEventListener('click', closeBulletPurchaseModal);
}

async function buyBulletsWithToken() {
  if (!account) {
    alert("Please connect your wallet to purchase bullets with tokens.");
    return;
  }
  
  const tokenCost = GAME_CONFIG.BULLET_COST;
  const bulletAmount = GAME_CONFIG.BULLET_AMOUNT;
  
  if (playerStats.gameTokens < tokenCost) {
    alert(`Insufficient tokens. You need ${tokenCost} token but only have ${playerStats.gameTokens}.`);
    return;
  }
  
  try {
    await removeTokens(tokenCost);
    playerStats.bullets = Math.min(playerStats.bullets + bulletAmount, playerStats.maxBullets);
    updateBulletDisplay();
    alert(`✅ Successfully purchased ${bulletAmount} bullets for ${tokenCost} token!`);
    closeBulletPurchaseModal();
  } catch (err) {
    console.error("Bullet purchase with token failed:", err);
    alert(`Purchase failed: ${err.message}`);
  }
}

function showBulletPurchaseModal() {
  if (!canMove) return;
  document.getElementById('bullet-token-balance').textContent = playerStats.gameTokens;
  document.getElementById('bullet-modal').style.display = 'block';
}

function closeBulletPurchaseModal() {
  document.getElementById('bullet-modal').style.display = 'none';
}

function buyBullets(amount) {
  if (!account) {
    alert("Please connect your wallet to purchase bullets.");
    return;
  }
  
  playerStats.bullets = Math.min(playerStats.bullets + amount, playerStats.maxBullets);
  updateBulletDisplay();
  closeBulletPurchaseModal();
}

function shootBullet() {
  if (!canMove) {
    console.log("Cannot shoot - movement locked");
    return;
  }
  
  const currentTime = Date.now();
  if (currentTime - lastShotTime < shotCooldown) {
    return;
  }
  
  if (playerStats.bullets <= 0) {
    showBulletPurchaseModal();
    return;
  }
  
  playerStats.bullets--;
  updateBulletDisplay();
  
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  
  const startPosition = playerAvatar.position.clone().add(
    new THREE.Vector3(0, 2, 0)
  ).add(direction.clone().multiplyScalar(5));
  
  const bullet = {
    position: startPosition,
    direction: direction.clone(),
    velocity: direction.clone().multiplyScalar(bulletSpeed),
    owner: 'player',
    active: true,
    distanceTraveled: 0,
    maxDistance: 2000
  };
  
  bullets.push(bullet);
  createBulletVisual(bullet);
  lastShotTime = currentTime;
  
  if (hoverBoard) {
    const originalColor = hoverBoard.material.color.getHex();
    hoverBoard.material.color.set(0xff6b6b);
    setTimeout(() => {
      hoverBoard.material.color.set(originalColor);
    }, 100);
  }
}

function createBulletVisual(bullet) {
  const bulletSize = 1.2;
  const bulletGeometry = new THREE.SphereGeometry(bulletSize, 8, 8);
  const bulletMaterial = new THREE.MeshBasicMaterial({ 
    color: 0xff0000,
    transparent: true,
    opacity: 0.9
  });
  
  const bulletMesh = new THREE.Mesh(bulletGeometry, bulletMaterial);
  bulletMesh.position.copy(bullet.position);
  bulletMesh.scale.set(1.5, 1, 1);
  bulletMesh.userData = { bulletData: bullet };
  scene.add(bulletMesh);
  bullet.mesh = bulletMesh;

  const glowGeometry = new THREE.SphereGeometry(bulletSize * 1.2, 8, 8);
  const glowMaterial = new THREE.MeshBasicMaterial({ 
    color: 0xff4444,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide
  });
  
  const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
  glowMesh.position.copy(bullet.position);
  glowMesh.scale.set(1.5, 1, 1);
  scene.add(glowMesh);
  bullet.glowMesh = glowMesh;
}

function updateBullets() {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    
    if (!bullet.active) {
      if (bullet.mesh) scene.remove(bullet.mesh);
      if (bullet.glowMesh) scene.remove(bullet.glowMesh);
      bullets.splice(i, 1);
      continue;
    }
    
    const velocityStep = bullet.velocity.clone().multiplyScalar(0.1);
    bullet.position.add(velocityStep);
    bullet.distanceTraveled += velocityStep.length();
    
    if (bullet.mesh) bullet.mesh.position.copy(bullet.position);
    if (bullet.glowMesh) bullet.glowMesh.position.copy(bullet.position);
    
    checkBulletCollisions(bullet, i);
    
    if (bullet.distanceTraveled > bullet.maxDistance) {
      bullet.active = false;
    }
  }
}

function checkBulletCollisions(bullet, bulletIndex) {
  for (let i = 0; i < buildingObjects.length; i++) {
    const building = buildingObjects[i];
    const buildingBox = new THREE.Box3().setFromObject(building);
    
    if (buildingBox.containsPoint(bullet.position)) {
      createBulletImpact(bullet.position);
      bullet.active = false;
      return;
    }
  }
  
  for (let i = 0; i < nftObjects.length; i++) {
    const nft = nftObjects[i];
    const nftBox = new THREE.Box3().setFromObject(nft);
    
    if (nftBox.containsPoint(bullet.position)) {
      createBulletImpact(bullet.position);
      bullet.active = false;
      playerStats.bullets = Math.min(playerStats.bullets + 50, playerStats.maxBullets);
      playerStats.score += 50;
      updateBulletDisplay();
      updateScoreDisplay();
      return;
    }
  }
  
  if (multiplayer && bullet.owner === 'player') {
    multiplayer.otherPlayers.forEach((otherPlayer, playerId) => {
      if (otherPlayer.group) {
        const playerBox = new THREE.Box3().setFromObject(otherPlayer.group);
        
        if (playerBox.containsPoint(bullet.position)) {
          createBulletImpact(bullet.position);
          bullet.active = false;
          playerStats.bullets = Math.min(playerStats.bullets + 300, playerStats.maxBullets);
          updateBulletDisplay();
          playerStats.score += 100;
          updateScoreDisplay();
          
          if (otherPlayer.group) {
            const originalColor = otherPlayer.group.children[0].material.color.getHex();
            otherPlayer.group.children[0].material.color.set(0xff0000);
            
            setTimeout(() => {
              if (otherPlayer.group) {
                otherPlayer.group.children[0].material.color.set(originalColor);
              }
            }, 1000);
          }
        }
      }
    });
  }
}

function createBulletImpact(position) {
  const particleCount = 5;
  for (let i = 0; i < particleCount; i++) {
    setTimeout(() => {
      const particleGeometry = new THREE.SphereGeometry(0.5, 4, 4);
      const particleMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xff6b6b,
        transparent: true,
        opacity: 0.8
      });
      const particle = new THREE.Mesh(particleGeometry, particleMaterial);
      particle.position.copy(position);
      
      const direction = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2
      ).normalize();
      
      scene.add(particle);
      
      let life = 1.0;
      const animateParticle = () => {
        life -= 0.05;
        particle.position.add(direction.clone().multiplyScalar(2));
        particle.material.opacity = life;
        
        if (life <= 0) {
          scene.remove(particle);
        } else {
          requestAnimationFrame(animateParticle);
        }
      };
      animateParticle();
    }, i * 50);
  }
}

function updateBulletDisplay() {
  document.getElementById('bullet-count').textContent = playerStats.bullets;
}

function updateHealthDisplay() {
  document.getElementById('health-value').textContent = playerStats.health;
}

function updateScoreDisplay() {
  document.getElementById('score-value').textContent = playerStats.score;
}

function playerHit() {
  playerStats.health -= 10;
  playerStats.hitCount++;
  updateHealthDisplay();
  
  if (playerAvatar) {
    const originalColor = hoverBoard.material.color.getHex();
    hoverBoard.material.color.set(0xff0000);
    
    setTimeout(() => {
      hoverBoard.material.color.set(originalColor);
    }, 1000);
  }
  
  if (playerStats.hitCount >= playerStats.maxHitCount || playerStats.health <= 0) {
    resetPlayer();
  }
}

function resetPlayer() {
  playerStats.health = playerStats.maxHealth;
  playerStats.bullets = 100;
  playerStats.hitCount = 0;
  updateHealthDisplay();
  updateBulletDisplay();
  
  if (playerAvatar) {
    playerAvatar.position.set(-150, hoverHeight, -150);
  }
  
  alert("Your avatar has been reset! Health and bullets restored.");
}

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
   3D SCENE SETUP
============================== */

function init3DScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000033);
  scene.fog = new THREE.Fog(0x000033, 100, 2000);
  
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 5000);
  
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('canvas-container').appendChild(renderer.domElement);
  
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(100, 200, 100);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 2048;
  directionalLight.shadow.mapSize.height = 2048;
  directionalLight.shadow.camera.near = 0.5;
  directionalLight.shadow.camera.far = 2000;
  directionalLight.shadow.camera.left = -500;
  directionalLight.shadow.camera.right = 500;
  directionalLight.shadow.camera.top = 500;
  directionalLight.shadow.camera.bottom = -500;
  scene.add(directionalLight);
  
  createWorld();
  createPlayerAvatar();
  updateThirdPersonCamera();
  
  if (!isMobile) {
    controls = new THREE.PointerLockControls(camera, document.body);
    
    document.addEventListener('click', function() {
      if (!controls.isLocked && canMove) {
        controls.lock();
      }
    });
    
    controls.addEventListener('lock', function() {
      document.getElementById('instructions').style.display = 'none';
    });
    
    controls.addEventListener('unlock', function() {
      document.getElementById('instructions').style.display = 'block';
    });
    
    const onKeyDown = function (event) {
      if (!canMove) return;
      
      switch (event.code) {
        case 'ArrowUp':
        case 'KeyW':
          moveForward = true;
          break;
        case 'ArrowLeft':
        case 'KeyA':
          moveLeft = true;
          break;
        case 'ArrowDown':
        case 'KeyS':
          moveBackward = true;
          break;
        case 'ArrowRight':
        case 'KeyD':
          moveRight = true;
          break;
        case 'Space':
          shootBullet();
          break;
        case 'KeyB':
          showBulletPurchaseModal();
          break;
      }
    };
    
    const onKeyUp = function (event) {
      switch (event.code) {
        case 'ArrowUp':
        case 'KeyW':
          moveForward = false;
          break;
        case 'ArrowLeft':
        case 'KeyA':
          moveLeft = false;
          break;
        case 'ArrowDown':
        case 'KeyS':
          moveBackward = false;
          break;
        case 'ArrowRight':
        case 'KeyD':
          moveRight = false;
          break;
      }
    };
    
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    
    document.addEventListener('mousemove', (event) => {
      if (controls && controls.isLocked && canMove) {
        targetCameraAngle -= event.movementX * 0.002;
      }
    });
  }
  
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  
  window.addEventListener('resize', onWindowResize);
  initMiniMap();
  animate();
}

function updateThirdPersonCamera() {
  if (!playerAvatar) return;
  
  cameraAngle += (targetCameraAngle - cameraAngle) * 0.1;
  
  const playerPosition = playerAvatar.position.clone();
  const offset = new THREE.Vector3(
    Math.sin(cameraAngle) * cameraDistance,
    cameraHeight,
    Math.cos(cameraAngle) * cameraDistance
  );
  
  camera.position.copy(playerPosition).add(offset);
  
  const lookAtPosition = playerPosition.clone();
  lookAtPosition.y += 3;
  camera.lookAt(lookAtPosition);
}

function createWorld() {
  const groundGeometry = new THREE.PlaneGeometry(worldSize, worldSize, 100, 100);
  const groundMaterial = new THREE.MeshLambertMaterial({ 
    color: 0x4ADE80,
    side: THREE.DoubleSide
  });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  
  createCity();
  createMoonBridge();
  createUpperPlatform();
  createBoundaryWalls();
  createForSaleSign();
}

function createForSaleSign() {
  const signGroup = new THREE.Group();
  
  const postGeometry = new THREE.CylinderGeometry(0.5, 0.5, 20, 8);
  const postMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
  const post = new THREE.Mesh(postGeometry, postMaterial);
  post.position.y = 10;
  signGroup.add(post);
  
  const signGeometry = new THREE.PlaneGeometry(15, 8);
  const signMaterial = new THREE.MeshLambertMaterial({ 
    color: 0xFFD700,
    side: THREE.DoubleSide
  });
  const sign = new THREE.Mesh(signGeometry, signMaterial);
  sign.position.set(0, 20, 0);
  sign.rotation.y = Math.PI / 4;
  signGroup.add(sign);
  
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.width = 256;
  canvas.height = 128;
  
  context.fillStyle = '#FFD700';
  context.fillRect(0, 0, canvas.width, canvas.height);
  
  context.strokeStyle = '#8B4513';
  context.lineWidth = 8;
  context.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
  
  context.fillStyle = '#8B4513';
  context.font = 'bold 40px Arial';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('FOR SALE', canvas.width / 2, canvas.height / 2 - 15);
  
  context.font = 'bold 24px Arial';
  context.fillText('$20,000', canvas.width / 2, canvas.height / 2 + 20);
  
  const texture = new THREE.CanvasTexture(canvas);
  const textMaterial = new THREE.MeshBasicMaterial({ 
    map: texture,
    side: THREE.DoubleSide
  });
  const textMesh = new THREE.Mesh(signGeometry, textMaterial);
  textMesh.position.set(0, 20, 0.1);
  textMesh.rotation.y = Math.PI / 4;
  signGroup.add(textMesh);
  
  const cornerX = worldBoundary - 50;
  const cornerZ = worldBoundary - 50;
  signGroup.position.set(cornerX, 0, cornerZ);
  scene.add(signGroup);
  
  const signBox = new THREE.Box3().setFromObject(signGroup);
  collisionObjects.push(signBox);
}

function createMoonBridge() {
  const bridgeGroup = new THREE.Group();
  const bridgeMaterial = new THREE.MeshLambertMaterial({ 
    color: 0x00FFFF,
    transparent: true,
    opacity: 0.7
  });
  
  const bridgeWidth = 20;
  const bridgeHeight = 5;
  const segments = 200;
  bridgeSegments = [];
  
  for (let i = 0; i < segments; i++) {
    const t = i / segments;
    const nextT = (i + 1) / segments;
    
    const spiralTurns = 4;
    const startRadius = 350;
    const endRadius = 50;
    const totalHeight = 750;
    const radius = startRadius - (t * (startRadius - endRadius));
    const angle = t * Math.PI * 2 * spiralTurns;
    
    const x1 = Math.cos(angle) * radius;
    const z1 = Math.sin(angle) * radius;
    const y1 = 0 + t * totalHeight;
    
    const nextAngle = nextT * Math.PI * 2 * spiralTurns;
    const nextRadius = startRadius - (nextT * (startRadius - endRadius));
    const x2 = Math.cos(nextAngle) * nextRadius;
    const z2 = Math.sin(nextAngle) * nextRadius;
    const y2 = 0 + nextT * totalHeight;
    
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dz = z2 - z1;
    const segmentLength = Math.sqrt(dx*dx + dy*dy + dz*dz);
    
    const segmentGeometry = new THREE.BoxGeometry(bridgeWidth, bridgeHeight, segmentLength);
    const segment = new THREE.Mesh(segmentGeometry, bridgeMaterial);
    
    segment.position.set(
      (x1 + x2) / 2,
      (y1 + y2) / 2,
      (z1 + z2) / 2
    );
    
    segment.rotation.y = Math.atan2(dx, dz);
    segment.rotation.x = -Math.atan2(dy, Math.sqrt(dx*dx + dz*dz));
    segment.castShadow = true;
    segment.receiveShadow = true;
    bridgeGroup.add(segment);
    bridgeSegments.push(segment);
    
    createBridgeGuardrails(bridgeGroup, x1, y1, z1, x2, y2, z2, segmentLength);
  }
  
  scene.add(bridgeGroup);
}

function createBridgeGuardrails(bridgeGroup, x1, y1, z1, x2, y2, z2, segmentLength) {
  const railGeometry = new THREE.BoxGeometry(1, 10, segmentLength);
  const railMaterial = new THREE.MeshLambertMaterial({ color: 0x4B5563 });
  
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dz = z2 - z1;
  const length = Math.sqrt(dx*dx + dz*dz);
  const perpX = -dz / length * 10.5;
  const perpZ = dx / length * 10.5;
  
  const leftRail = new THREE.Mesh(railGeometry, railMaterial);
  leftRail.position.set(
    (x1 + x2) / 2 + perpX,
    (y1 + y2) / 2 + 5,
    (z1 + z2) / 2 + perpZ
  );
  leftRail.rotation.y = Math.atan2(dx, dz);
  leftRail.rotation.x = -Math.atan2(dy, Math.sqrt(dx*dx + dz*dz));
  leftRail.castShadow = true;
  bridgeGroup.add(leftRail);
  
  const rightRail = new THREE.Mesh(railGeometry, railMaterial);
  rightRail.position.set(
    (x1 + x2) / 2 - perpX,
    (y1 + y2) / 2 + 5,
    (z1 + z2) / 2 - perpZ
  );
  rightRail.rotation.y = Math.atan2(dx, dz);
  rightRail.rotation.x = -Math.atan2(dy, Math.sqrt(dx*dx + dz*dz));
  rightRail.castShadow = true;
  bridgeGroup.add(rightRail);
  
  const leftRailBox = new THREE.Box3().setFromObject(leftRail);
  const rightRailBox = new THREE.Box3().setFromObject(rightRail);
  collisionObjects.push(leftRailBox);
  collisionObjects.push(rightRailBox);
}

function createBoundaryWalls() {
  const wallHeight = 100;
  const wallMaterial = new THREE.MeshLambertMaterial({ 
    color: 0x374151,
    transparent: true,
    opacity: 0.7
  });
  
  const wallGeometry = new THREE.PlaneGeometry(worldSize, wallHeight);
  
  const northWall = new THREE.Mesh(wallGeometry, wallMaterial);
  northWall.position.set(0, wallHeight/2, -worldBoundary);
  northWall.rotation.x = Math.PI / 2;
  scene.add(northWall);
  
  const southWall = new THREE.Mesh(wallGeometry, wallMaterial);
  southWall.position.set(0, wallHeight/2, worldBoundary);
  southWall.rotation.x = -Math.PI / 2;
  scene.add(southWall);
  
  const eastWall = new THREE.Mesh(wallGeometry, wallMaterial);
  eastWall.position.set(worldBoundary, wallHeight/2, 0);
  eastWall.rotation.x = Math.PI / 2;
  eastWall.rotation.y = Math.PI / 2;
  scene.add(eastWall);
  
  const westWall = new THREE.Mesh(wallGeometry, wallMaterial);
  westWall.position.set(-worldBoundary, wallHeight/2, 0);
  westWall.rotation.x = Math.PI / 2;
  westWall.rotation.y = -Math.PI / 2;
  scene.add(westWall);
}

function createCity() {
  const cityGroup = new THREE.Group();
  const buildingColors = [0x3B82F6, 0xEF4444, 0x10B981, 0xF59E0B, 0x8B5CF6];
  const gridSize = 8;
  const spacing = 150;

  for (let x = 0; x < gridSize; x++) {
    for (let z = 0; z < gridSize; z++) {
      const width = 40 + Math.random() * 30;
      const depth = 40 + Math.random() * 30;
      const height = 20 + Math.random() * 40;

      const buildingGeometry = new THREE.BoxGeometry(width, height, depth);

      // NEW: Glass-like material with reflection & 60% transparency
      const buildingMaterial = new THREE.MeshPhysicalMaterial({
        color: buildingColors[Math.floor(Math.random() * buildingColors.length)],
        roughness: 0.1,
        metalness: 0.3,
        transmission: 0.9,        // makes light pass through like real glass
        thickness: 2.0,            // affects refraction depth
        clearcoat: 1.0,
        clearcoatRoughness: 0.0,
        transparent: true,
        opacity: 0.6,              // ← your requested 60% see-through
        side: THREE.DoubleSide,
        depthWrite: false          // critical for correct transparency sorting
      });

      const building = new THREE.Mesh(buildingGeometry, buildingMaterial);
      building.position.set(
        (x - gridSize/2) * spacing,
        height / 2,
        (z - gridSize/2) * spacing - 100
      );

      building.castShadow = true;
      building.receiveShadow = true;
      cityGroup.add(building);
      buildingObjects.push(building);

      const buildingBox = new THREE.Box3().setFromObject(building);
      collisionObjects.push(buildingBox);
      createBuildingRoof(building.position.x, building.position.y + height/2, building.position.z, width, depth);
    }
  }
  scene.add(cityGroup);
}

function createUpperPlatform() {
  const upperGroundGeometry = new THREE.PlaneGeometry(500, 500);
  const upperGroundMaterial = new THREE.MeshPhysicalMaterial({
  color: 0x88ffaa, 
  transparent: true,
  opacity: 0.55,
  transmission: 0.9,      // makes it actually refract light (very cool)
  roughness: 0,
  metalness: 0,
  clearcoat: 1,
  clearcoatRoughness: 0,
  side: THREE.DoubleSide,
  depthWrite: false
});
  const upperGround = new THREE.Mesh(upperGroundGeometry, upperGroundMaterial);
  upperGround.rotation.x = -Math.PI / 2;
  upperGround.position.set(50, 750, 0);
  upperGround.receiveShadow = true;
  scene.add(upperGround);

  const upperCityGroup = new THREE.Group();
  const buildingColors = [0x3B82F6, 0xEF4444, 0x10B981, 0xF59E0B, 0x8B5CF6];
  const gridSize = 4;
  const spacing = 100;

  for (let x = 0; x < gridSize; x++) {
    for (let z = 0; z < gridSize; z++) {
      const width = 30 + Math.random() * 20;
      const depth = 30 + Math.random() * 20;
      const height = 15 + Math.random() * 30;

      const buildingGeometry = new THREE.BoxGeometry(width, height, depth);

      const buildingMaterial = new THREE.MeshPhysicalMaterial({
        color: buildingColors[Math.floor(Math.random() * buildingColors.length)],
        roughness: 0.1,
        metalness: 0.4,
        transmission: 0.92,
        thickness: 2.5,
        clearcoat: 1.0,
        clearcoatRoughness: 0.0,
        transparent: true,
        opacity: 0.6,           // ← 60% transparent
        side: THREE.DoubleSide,
        depthWrite: false
      });

      const building = new THREE.Mesh(buildingGeometry, buildingMaterial);
      building.position.set(
        50 + (x - gridSize/2) * spacing,
        750 + height / 2,
        0 + (z - gridSize/2) * spacing
      );

      building.castShadow = true;
      building.receiveShadow = true;
      upperCityGroup.add(building);
      buildingObjects.push(building);

      const buildingBox = new THREE.Box3().setFromObject(building);
      collisionObjects.push(buildingBox);
      createBuildingRoof(building.position.x, building.position.y + height/2, building.position.z, width, depth);
    }
  }
  scene.add(upperCityGroup);
}

function createBuildingRoof(x, y, z, width, depth) {
  const roofGeometry = new THREE.PlaneGeometry(width, depth);
  const roofMaterial = new THREE.MeshLambertMaterial({ 
    color: 0x1F2937,
    side: THREE.DoubleSide
  });
  
  const roof = new THREE.Mesh(roofGeometry, roofMaterial);
  roof.position.set(x, y + 0.1, z);
  roof.rotation.x = Math.PI / 2;
  roof.receiveShadow = true;
  roof.castShadow = true;
  scene.add(roof);
  
  const roofBox = new THREE.Box3().setFromCenterAndSize(
    new THREE.Vector3(x, y + 0.1, z),
    new THREE.Vector3(width, 0.2, depth)
  );
  roofObjects.push({
    box: roofBox,
    position: new THREE.Vector3(x, y + 0.1, z),
    width: width,
    depth: depth
  });
  collisionObjects.push(roofBox);
}

function createPlayerAvatar() {
  const group = new THREE.Group();
  
  const boardGeometry = new THREE.PlaneGeometry(10, 10);
  const boardMaterial = new THREE.MeshStandardMaterial({ 
    color: multiplayer ? multiplayer.playerColor : 0xC0C0C0,
    metalness: 0.8,
    roughness: 0.2,
    side: THREE.DoubleSide
  });
  hoverBoard = new THREE.Mesh(boardGeometry, boardMaterial);
  hoverBoard.rotation.x = -Math.PI / 2;
  hoverBoard.castShadow = true;
  hoverBoard.receiveShadow = true;
  group.add(hoverBoard);
  
  const underglowGeometry = new THREE.PlaneGeometry(10.5, 10.5);
  const underglowMaterial = new THREE.MeshBasicMaterial({ 
    color: 0x00FF00,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide
  });
  const underglow = new THREE.Mesh(underglowGeometry, underglowMaterial);
  underglow.rotation.x = -Math.PI / 2;
  underglow.position.y = -0.1;
  group.add(underglow);
  
  let avatar;
  if (selectedAvatar === 'boy') {
    const bodyGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1.5, 8);
    const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0x3B82F6 });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 1.5;
    
    const headGeometry = new THREE.SphereGeometry(0.6, 8, 8);
    const headMaterial = new THREE.MeshLambertMaterial({ color: 0xFCD34D });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 2.8;
    
    avatar = new THREE.Group();
    avatar.add(body);
    avatar.add(head);
  } else if (selectedAvatar === 'girl') {
    const bodyGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1.5, 8);
    const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0xEC4899 });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 1.5;
    
    const headGeometry = new THREE.SphereGeometry(0.6, 8, 8);
    const headMaterial = new THREE.MeshLambertMaterial({ color: 0xFCD34D });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 2.8;
    
    avatar = new THREE.Group();
    avatar.add(body);
    avatar.add(head);
  }
  
  if (avatar) {
    avatar.position.y = 0.1;
    avatar.castShadow = true;
    group.add(avatar);
  }
  
  group.position.set(-150, hoverHeight, -150);
  group.castShadow = true;
  scene.add(group);
  playerAvatar = group;
}

function createNFTPlatform(x, y, z) {
  const platformGeometry = new THREE.CylinderGeometry(6, 6, 0.5, 16);
  const platformMaterial = new THREE.MeshLambertMaterial({ 
    color: 0x2a2a5a,
    transparent: true,
    opacity: 0.8
  });
  
  const platform = new THREE.Mesh(platformGeometry, platformMaterial);
  platform.position.set(x, y - 4, z);
  platform.receiveShadow = true;
  scene.add(platform);
  
  const platformBox = new THREE.Box3().setFromObject(platform);
  collisionObjects.push(platformBox);
  nftPlatforms.push(platform);
  return platform;
}

function initMiniMap() {
  miniMapScene = new THREE.Scene();
  miniMapCamera = new THREE.OrthographicCamera(-worldSize/2, worldSize/2, worldSize/2, -worldSize/2, 0.1, 2000);
  miniMapCamera.position.y = 500;
  miniMapCamera.lookAt(0, 0, 0);
  
  const miniMapCanvas = document.createElement('canvas');
  miniMapCanvas.width = 120;
  miniMapCanvas.height = 120;
  document.getElementById('mini-map').appendChild(miniMapCanvas);
  
  miniMapRenderer = new THREE.WebGLRenderer({ 
    canvas: miniMapCanvas,
    antialias: false 
  });
  miniMapRenderer.setSize(120, 120);
  miniMapRenderer.setClearColor(0x000000, 0.5);
  
  const groundGeometry = new THREE.PlaneGeometry(worldSize, worldSize);
  const groundMaterial = new THREE.MeshBasicMaterial({ color: 0x4ADE80 });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  miniMapScene.add(ground);
  
  const playerGeometry = new THREE.CircleGeometry(10, 8);
  const playerMaterial = new THREE.MeshBasicMaterial({ 
    color: multiplayer ? multiplayer.playerColor : 0xFF0000 
  });
  const playerIndicator = new THREE.Mesh(playerGeometry, playerMaterial);
  playerIndicator.rotation.x = -Math.PI / 2;
  miniMapScene.add(playerIndicator);
  
  const otherPlayerGeometry = new THREE.CircleGeometry(8, 6);
  const otherPlayerMaterial = new THREE.MeshBasicMaterial({ color: 0xFF6B6B });
  
  window.updateMiniMap = function() {
    playerIndicator.position.x = playerAvatar.position.x;
    playerIndicator.position.z = playerAvatar.position.z;
    
    if (playerAvatar) {
      playerAvatar.rotation.y = cameraAngle + Math.PI;
    }
    
    updateLocationInfo();
    
    miniMapScene.children.forEach((child, index) => {
      if (child.userData && child.userData.isNFTIndicator) {
        miniMapScene.children.splice(index, 1);
      }
    });
    
    nftObjects.forEach(nft => {
      const indicator = new THREE.Mesh(otherPlayerGeometry, otherPlayerMaterial);
      indicator.position.x = nft.position.x;
      indicator.position.z = nft.position.z;
      indicator.rotation.x = -Math.PI / 2;
      indicator.userData = { isNFTIndicator: true };
      miniMapScene.add(indicator);
    });
    
    miniMapRenderer.render(miniMapScene, miniMapCamera);
  };
}

function updateLocationInfo() {
  const locationDisplay = document.getElementById('location-display');
  const x = playerAvatar.position.x;
  const z = playerAvatar.position.z;
  const y = playerAvatar.position.y;
  const isOnBridge = checkIfOnBridge(playerAvatar.position);
  
  if (isOnBridge) {
    locationDisplay.textContent = "Spiral Bridge (Floating)";
  } else if (x > -200 && x < 200 && z > -200 && z < 200) {
    locationDisplay.textContent = "City Center (Floating)";
  } else if (y > 100 && y < 700) {
    locationDisplay.textContent = "NFT Column (Floating)";
  } else if (y >= 700) {
    locationDisplay.textContent = "Upper City (Floating)";
  } else if (x < -100 && z < -100) {
    locationDisplay.textContent = "Starting Area (Floating)";
  } else if (x > worldBoundary - 100 && z > worldBoundary - 100) {
    locationDisplay.textContent = "For Sale Corner (Floating)";
  } else {
    locationDisplay.textContent = "Grass Fields (Floating)";
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function checkIfOnBridge(position) {
  for (let i = 0; i < bridgeSegments.length; i++) {
    const segment = bridgeSegments[i];
    const distance = position.distanceTo(segment.position);
    if (distance < 30 && Math.abs(position.y - segment.position.y) < 15) {
      return true;
    }
  }
  return false;
}

function checkIfOnUpper(position) {
  const upperXMin = 50 - 250;
  const upperXMax = 50 + 250;
  const upperZMin = -250;
  const upperZMax = 250;
  return position.x >= upperXMin && position.x <= upperXMax &&
         position.z >= upperZMin && position.z <= upperZMax &&
         Math.abs(position.y - 750) < 50;
}

function checkCollisions(newPosition) {
  playerCollider.setFromCenterAndSize(
    new THREE.Vector3(newPosition.x, newPosition.y, newPosition.z),
    playerSize
  );
  
  const isOnBridge = checkIfOnBridge(newPosition);
  if (isOnBridge) return false;
  
  for (let i = 0; i < collisionObjects.length; i++) {
    if (playerCollider.intersectsBox(collisionObjects[i])) {
      return true;
    }
  }
  return false;
}

function animate() {
  requestAnimationFrame(animate);
  
  const time = performance.now();
  const delta = (time - prevTime) / 1000;
  hoverTime += delta;
  
  if (((controls && controls.isLocked) || isMobile) && canMove) {
    const moveSpeed = 200.0 * delta;
    const currentPosition = playerAvatar.position.clone();
    const newPosition = currentPosition.clone();
    
    const forward = new THREE.Vector3(
      Math.sin(cameraAngle),
      0,
      Math.cos(cameraAngle)
    );
    const right = new THREE.Vector3(
      Math.sin(cameraAngle + Math.PI/2),
      0,
      Math.cos(cameraAngle + Math.PI/2)
    );
    
    if (moveForward) newPosition.add(forward.clone().multiplyScalar(moveSpeed));
    if (moveBackward) newPosition.sub(forward.clone().multiplyScalar(moveSpeed));
    if (moveLeft) newPosition.sub(right.clone().multiplyScalar(moveSpeed));
    if (moveRight) newPosition.add(right.clone().multiplyScalar(moveSpeed));
    
    const isOnBridge = checkIfOnBridge(newPosition);
    const isOnUpperPlatform = checkIfOnUpper(newPosition);
    
    if (isOnBridge) {
      let bridgeHeight = 0;
      for (let i = 0; i < bridgeSegments.length; i++) {
        const segment = bridgeSegments[i];
        const distance = newPosition.distanceTo(segment.position);
        if (distance < 30) {
          bridgeHeight = segment.position.y;
          break;
        }
      }
      newPosition.y = bridgeHeight + hoverHeight + (Math.sin(hoverTime * hoverBobSpeed) * hoverBobAmount);
    } else if (isOnUpperPlatform) {
      newPosition.y = 750 + hoverHeight + (Math.sin(hoverTime * hoverBobSpeed) * hoverBobAmount);
    } else {
      const hoverBob = Math.sin(hoverTime * hoverBobSpeed) * hoverBobAmount;
      newPosition.y = hoverHeight + hoverBob;
    }
    
    if (velocity.y !== 0) {
      velocity.y -= 9.8 * 100.0 * delta;
      newPosition.y += (velocity.y * delta);
      
      if (newPosition.y <= hoverHeight + (Math.sin(hoverTime * hoverBobSpeed) * hoverBobAmount) && velocity.y < 0 && !isOnBridge) {
        velocity.y = 0;
        canJump = true;
      }
    }
    
    if (!checkCollisions(newPosition)) {
      playerAvatar.position.copy(newPosition);
    } else {
      playerAvatar.position.copy(currentPosition);
    }
    
    if (playerAvatar.position.x > worldBoundary) playerAvatar.position.x = worldBoundary;
    if (playerAvatar.position.x < -worldBoundary) playerAvatar.position.x = -worldBoundary;
    if (playerAvatar.position.z > worldBoundary) playerAvatar.position.z = worldBoundary;
    if (playerAvatar.position.z < -worldBoundary) playerAvatar.position.z = -worldBoundary;
  }
  
  if (isMobile && (lookX !== 0 || lookY !== 0) && canMove) {
    targetCameraAngle -= lookX * 0.01;
    cameraHeight = Math.max(5, Math.min(20, cameraHeight - lookY * 0.1));
  }
  
  updateThirdPersonCamera();
  updateBullets();
  checkNFTInteraction();
  updateNFTLOD();
  
  // Update bots
  if (botManager) {
    botManager.update();
  }
  
  if (window.updateMiniMap) {
    window.updateMiniMap();
  }
  
  prevTime = time;
  renderer.render(scene, camera);
}

/* ==============================
   NFT INTERACTION
============================== */

let lastInteractionCheck = 0;
const INTERACTION_CHECK_INTERVAL = 100;

function checkNFTInteraction() {
  const now = Date.now();
  if (now - lastInteractionCheck < INTERACTION_CHECK_INTERVAL) return;
  lastInteractionCheck = now;
  
  if (currentIntersected && currentIntersected.userData.originalEmissive !== undefined) {
    currentIntersected.material.emissive.setHex(currentIntersected.userData.originalEmissive);
  }
  
  currentIntersected = null;
  let closestNFT = null;
  let closestDistance = Infinity;
  
  const maxInteractionDistance = 200;
  
  for (let i = 0; i < nftObjects.length; i++) {
    const nft = nftObjects[i];
    const distance = nft.position.distanceTo(camera.position);
    
    if (distance > maxInteractionDistance) continue;
    if (isNFTBlockedByBuilding(nft)) continue;
    
    const position = nft.position.clone();
    position.project(camera);
    
    if (position.x >= -1 && position.x <= 1 && 
        position.y >= -1 && position.y <= 1 && 
        position.z >= -1 && position.z <= 1) {
      
      if (distance < closestDistance) {
        closestDistance = distance;
        closestNFT = nft;
      }
    }
  }
  
  if (closestNFT) {
    currentIntersected = closestNFT;
    closestNFT.userData.originalEmissive = closestNFT.material.emissive.getHex();
    closestNFT.material.emissive.setHex(0x3b82f6);
    
    if (!isMobile) document.body.style.cursor = 'pointer';
  } else {
    if (!isMobile) document.body.style.cursor = 'auto';
  }
}

function isNFTBlockedByBuilding(nft) {
  const raycaster = new THREE.Raycaster();
  const direction = new THREE.Vector3();
  direction.subVectors(nft.position, camera.position).normalize();
  raycaster.set(camera.position, direction);
  const buildingIntersections = raycaster.intersectObjects(buildingObjects);
  
  if (buildingIntersections.length > 0) {
    const distanceToNFT = camera.position.distanceTo(nft.position);
    const distanceToBuilding = buildingIntersections[0].distance;
    if (distanceToBuilding < distanceToNFT) {
      return true;
    }
  }
  return false;
}

function openNFTModal(nftData) {
  if (!canMove) return;
  
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
  
  document.getElementById('nft-modal').style.display = 'block';
}

document.getElementById('close-modal').addEventListener('click', function() {
  document.getElementById('nft-modal').style.display = 'none';
});

document.addEventListener('click', function onClick(event) {
  if (!canMove) return;
  
  if (((!isMobile && controls && controls.isLocked) || (isMobile && currentIntersected)) && currentIntersected) {
    const nftData = currentIntersected.userData.nftData;
    openNFTModal(nftData);
  }
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

/* ==============================
   SIDEBAR & UI CONTROLS
============================== */

function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggleButton = document.getElementById('sidebar-toggle');
  const modalOverlay = document.querySelector('.modal-overlay');
  
  toggleButton.addEventListener('click', (e) => {
    e.stopPropagation();
    const isActive = sidebar.classList.toggle('active');
    canMove = !isActive;
    modalOverlay.classList.toggle('active', isActive);
    
    if (isActive && controls && controls.isLocked) {
      controls.unlock();
    }
  });
  
  document.addEventListener('click', (e) => {
    if (sidebar.classList.contains('active') && 
        !sidebar.contains(e.target) && 
        e.target !== toggleButton) {
      sidebar.classList.remove('active');
      canMove = true;
      modalOverlay.classList.remove('active');
    }
  });
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.classList.contains('active')) {
      sidebar.classList.remove('active');
      canMove = true;
      modalOverlay.classList.remove('active');
    }
  });
  
  initStatsTracking();
}

function initStatsTracking() {
  let playTime = 0;
  let distanceTraveled = 0;
  let lastPosition = null;
  
  setInterval(() => {
    playTime++;
    document.getElementById('play-time').textContent = `${playTime}m`;
  }, 60000);
  
  setInterval(() => {
    if (window.playerAvatar && lastPosition && canMove) {
      const currentPosition = window.playerAvatar.position.clone();
      const distance = currentPosition.distanceTo(lastPosition);
      distanceTraveled += distance;
      document.getElementById('distance-traveled').textContent = `${Math.round(distanceTraveled)}m`;
    }
    if (window.playerAvatar) lastPosition = window.playerAvatar.position.clone();
  }, 1000);
}

function setupMobileControls() {
  document.getElementById('forward-btn').addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (canMove) moveForward = true;
  });
  document.getElementById('forward-btn').addEventListener('touchend', (e) => {
    e.preventDefault();
    moveForward = false;
  });
  
  document.getElementById('backward-btn').addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (canMove) moveBackward = true;
  });
  document.getElementById('backward-btn').addEventListener('touchend', (e) => {
    e.preventDefault();
    moveBackward = false;
  });
  
  document.getElementById('left-btn').addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (canMove) moveLeft = true;
  });
  document.getElementById('left-btn').addEventListener('touchend', (e) => {
    e.preventDefault();
    moveLeft = false;
  });
  
  document.getElementById('right-btn').addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (canMove) moveRight = true;
  });
  document.getElementById('right-btn').addEventListener('touchend', (e) => {
    e.preventDefault();
    moveRight = false;
  });
  
  document.getElementById('shoot-btn').addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (canMove) shootBullet();
  });
  
  const lookControls = document.getElementById('look-controls');
  lookControls.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (!canMove) return;
    
    if (lookTouchId === null) {
      const touch = e.touches[0];
      lookTouchId = touch.identifier;
      lookStartX = touch.clientX;
      lookStartY = touch.clientY;
    }
  });
  
  lookControls.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!canMove) return;
    
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === lookTouchId) {
        const deltaX = touch.clientX - lookStartX;
        const deltaY = touch.clientY - lookStartY;
        lookX = deltaX * 0.5;
        lookY = deltaY * 0.5;
        lookStartX = touch.clientX;
        lookStartY = touch.clientY;
        break;
      }
    }
  });
  
  lookControls.addEventListener('touchend', (e) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === lookTouchId) {
        lookTouchId = null;
        lookX = 0;
        lookY = 0;
        break;
      }
    }
  });
}
      
/* ==============================
   CHAT SYSTEM
============================== */

function createChatMessageBubble(playerId, playerName, message, isOwn = false) {
    removeChatMessage(playerId);
    
    const chatBubble = document.createElement('div');
    chatBubble.className = `chat-bubble ${isOwn ? 'own-message' : ''}`;
    chatBubble.innerHTML = `
        <div class="chat-bubble-sender">${playerName}</div>
        <div class="chat-bubble-text">${message}</div>
    `;
    
    document.body.appendChild(chatBubble);
    
    let playerPosition;
    if (playerId === multiplayer.playerId) {
        playerPosition = window.playerAvatar ? window.playerAvatar.position.clone() : new THREE.Vector3(-150, 3, -150);
    } else {
        const otherPlayer = multiplayer.otherPlayers.get(playerId);
        playerPosition = otherPlayer && otherPlayer.group ? 
            otherPlayer.group.position.clone() : 
            new THREE.Vector3(0, 0, 0);
    }
    
    const screenPosition = playerPosition.clone();
    screenPosition.project(camera);
    
    const x = (screenPosition.x * 0.5 + 0.5) * window.innerWidth;
    const y = -(screenPosition.y * 0.5 - 0.5) * window.innerHeight;
    
    chatBubble.style.left = `${x}px`;
    chatBubble.style.top = `${y - 50}px`;
    
    const timer = setTimeout(() => {
        removeChatMessage(playerId);
    }, 10000);
    
    activeChatMessages.set(playerId, {
        element: chatBubble,
        timer: timer,
        position: playerPosition
    });
    
    setTimeout(() => chatBubble.style.opacity = '1', 10);
    return chatBubble;
}

function removeChatMessage(playerId) {
    if (activeChatMessages.has(playerId)) {
        const { element, timer } = activeChatMessages.get(playerId);
        clearTimeout(timer);
        element.style.opacity = '0';
        setTimeout(() => {
            if (element.parentNode) element.parentNode.removeChild(element);
        }, 300);
        activeChatMessages.delete(playerId);
    }
}

/* ==============================
   MULTIPLAYER SYSTEM - UPDATED CHAT HANDLING
============================== */

class WebRTCMultiplayer {
  constructor() {
    this.peers = new Map();
    this.otherPlayers = new Map();
    this.roomId = 'nft-universe-main';
    this.playerId = this.generatePlayerId();
    this.playerName = 'Explorer';
    this.playerColor = 0x3B82F6;
    this.signalingChannel = null;
    this.dataChannels = new Map();
    
    this.init();
  }

  generatePlayerId() {
    if (!localStorage.getItem('playerId')) {
      localStorage.setItem('playerId', 'player-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9));
    }
    return localStorage.getItem('playerId');
  }

  async init() {
    this.setupSignaling();
    this.setupChat();
    
    const nameInput = document.getElementById('player-name');
    if (nameInput) {
      nameInput.addEventListener('input', (e) => {
        this.playerName = e.target.value.trim() || 'Explorer';
      });
    }
  }

  setupSignaling() {
    try {
      this.signalingChannel = new BroadcastChannel('nft-universe-webrtc');
      
      this.signalingChannel.addEventListener('message', async (event) => {
        const message = event.data;
        
        if (message.roomId !== this.roomId || message.playerId === this.playerId) return;
        
        switch (message.type) {
          case 'player-join':
            await this.handlePlayerJoin(message);
            break;
          case 'offer':
            await this.handleOffer(message);
            break;
          case 'answer':
            await this.handleAnswer(message);
            break;
          case 'ice-candidate':
            await this.handleIceCandidate(message);
            break;
          case 'player-data':
            this.handlePlayerData(message);
            break;
          case 'player-left':
            this.handlePlayerLeft(message);
            break;
          case 'chat-message':
            this.handleChatMessage(message);
            break;
        }
      });

      this.broadcastSignal({
        type: 'player-join',
        playerId: this.playerId,
        playerData: this.getPlayerData()
      });

    } catch (error) {
      console.log('BroadcastChannel not supported, using localStorage fallback');
      this.setupLocalStorageSignaling();
    }
  }

  setupLocalStorageSignaling() {
    setInterval(() => {
      const signals = JSON.parse(localStorage.getItem('nft-universe-signals') || '[]');
      const newSignals = [];
      
      signals.forEach(signal => {
        if (signal.roomId === this.roomId && signal.playerId !== this.playerId) {
          this.handleSignalingMessage(signal);
        } else {
          newSignals.push(signal);
        }
      });
      
      localStorage.setItem('nft-universe-signals', JSON.stringify(newSignals));
    }, 1000);
  }

  broadcastSignal(message) {
    message.roomId = this.roomId;
    message.playerId = this.playerId;
    message.timestamp = Date.now();
    
    if (this.signalingChannel) {
      this.signalingChannel.postMessage(message);
    } else {
      const signals = JSON.parse(localStorage.getItem('nft-universe-signals') || '[]');
      signals.push(message);
      localStorage.setItem('nft-universe-signals', JSON.stringify(signals));
    }
  }

  async handlePlayerJoin(message) {
    console.log('Player joined:', message.playerId);
    await this.createPeerConnection(message.playerId);
  }

  async createPeerConnection(peerId) {
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    const peerConnection = new RTCPeerConnection(configuration);
    const dataChannel = peerConnection.createDataChannel('nft-universe', {
      ordered: true
    });

    this.setupDataChannel(dataChannel, peerId);

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.broadcastSignal({
          type: 'ice-candidate',
          to: peerId,
          candidate: event.candidate
        });
      }
    };

    peerConnection.ondatachannel = (event) => {
      this.setupDataChannel(event.channel, peerId);
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    this.broadcastSignal({
      type: 'offer',
      to: peerId,
      offer: offer
    });

    this.peers.set(peerId, peerConnection);
    this.dataChannels.set(peerId, dataChannel);
  }

  async handleOffer(message) {
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    const peerConnection = new RTCPeerConnection(configuration);

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.broadcastSignal({
          type: 'ice-candidate',
          to: message.playerId,
          candidate: event.candidate
        });
      }
    };

    peerConnection.ondatachannel = (event) => {
      this.setupDataChannel(event.channel, message.playerId);
    };

    await peerConnection.setRemoteDescription(message.offer);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    this.broadcastSignal({
      type: 'answer',
      to: message.playerId,
      answer: answer
    });

    this.peers.set(message.playerId, peerConnection);
  }

  async handleAnswer(message) {
    const peerConnection = this.peers.get(message.playerId);
    if (peerConnection) {
      await peerConnection.setRemoteDescription(message.answer);
    }
  }

  async handleIceCandidate(message) {
    const peerConnection = this.peers.get(message.playerId);
    if (peerConnection && message.candidate) {
      await peerConnection.addIceCandidate(message.candidate);
    }
  }

  setupDataChannel(dataChannel, peerId) {
    dataChannel.onopen = () => {
      console.log('Data channel connected to', peerId);
      this.sendPlayerData(peerId);
    };

    dataChannel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handlePlayerData(data);
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    };

    dataChannel.onclose = () => {
      console.log('Data channel closed with', peerId);
      this.handlePlayerLeft({ playerId: peerId });
    };

    this.dataChannels.set(peerId, dataChannel);
  }

  getPlayerData() {
    return {
      name: this.playerName,
      color: this.playerColor,
      avatar: window.selectedAvatar,
      position: window.playerAvatar ? {
        x: window.playerAvatar.position.x,
        y: window.playerAvatar.position.y,
        z: window.playerAvatar.position.z,
        rotation: window.playerAvatar.rotation.y
      } : { x: -150, y: 3, z: -150, rotation: 0 }
    };
  }

  sendPlayerData(toPeerId = null) {
    const playerData = {
      type: 'player-data',
      playerId: this.playerId,
      data: this.getPlayerData()
    };

    if (toPeerId) {
      const dataChannel = this.dataChannels.get(toPeerId);
      if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify(playerData));
      }
    } else {
      this.dataChannels.forEach((dataChannel, peerId) => {
        if (dataChannel.readyState === 'open') {
          dataChannel.send(JSON.stringify(playerData));
        }
      });
    }
  }

  handlePlayerData(message) {
    if (message.type === 'player-data') {
      this.handlePlayerData(message);
    } else if (message.type === 'chat-message') {
      this.handleChatMessage(message);
    }
  }

  handleChatMessage(message) {
    this.addChatMessage(message.sender, message.text, false);
    createChatMessageBubble(message.playerId, message.sender, message.text, false);
  }

  handlePlayerLeft(message) {
    this.removeOtherPlayer(message.playerId);
    removeChatMessage(message.playerId);
  }

  createOrUpdateOtherPlayer(playerId, playerData) {
    if (this.otherPlayers.has(playerId)) {
      this.updateOtherPlayerPosition(playerId, playerData.position);
    } else {
      this.createOtherPlayer(playerId, playerData);
    }
  }

  createOtherPlayer(playerId, playerData) {
    if (window.scene && playerData.position) {
      const playerGroup = new THREE.Group();
      
      const boardGeometry = new THREE.PlaneGeometry(10, 10);
      const boardMaterial = new THREE.MeshStandardMaterial({ 
        color: playerData.color || 0x3B82F6,
        metalness: 0.8,
        roughness: 0.2,
        side: THREE.DoubleSide
      });
      const board = new THREE.Mesh(boardGeometry, boardMaterial);
      board.rotation.x = -Math.PI / 2;
      board.castShadow = true;
      board.receiveShadow = true;
      playerGroup.add(board);

      let avatar;
      if (playerData.avatar === 'boy') {
        const bodyGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1.5, 8);
        const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0x3B82F6 });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 1.5;
        
        const headGeometry = new THREE.SphereGeometry(0.6, 8, 8);
        const headMaterial = new THREE.MeshLambertMaterial({ color: 0xFCD34D });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 2.8;
        
        avatar = new THREE.Group();
        avatar.add(body);
        avatar.add(head);
      } else {
        const bodyGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1.5, 8);
        const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0xEC4899 });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 1.5;
        
        const headGeometry = new THREE.SphereGeometry(0.6, 8, 8);
        const headMaterial = new THREE.MeshLambertMaterial({ color: 0xFCD34D });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 2.8;
        
        avatar = new THREE.Group();
        avatar.add(body);
        avatar.add(head);
      }

      avatar.position.y = 0.1;
      avatar.castShadow = true;
      playerGroup.add(avatar);

      playerGroup.position.set(
        playerData.position.x,
        playerData.position.y,
        playerData.position.z
      );
      playerGroup.rotation.y = playerData.position.rotation;
      playerGroup.castShadow = true;
      
      window.scene.add(playerGroup);

      const nameTag = this.createNameTag(playerData.name, playerData.color);
      playerGroup.add(nameTag);

      this.otherPlayers.set(playerId, {
        group: playerGroup,
        name: playerData.name,
        color: playerData.color,
        avatar: playerData.avatar
      });

      this.updatePlayersPanel();
      console.log('Created other player:', playerId, playerData.name);
    }
  }

  createNameTag(name, color) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 64;
    
    context.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    context.font = '24px Arial';
    context.fillStyle = '#FFFFFF';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(name, canvas.width / 2, canvas.height / 2);
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(material);
    sprite.position.y = 5;
    sprite.scale.set(10, 2.5, 1);
    return sprite;
  }

  updateOtherPlayerPosition(playerId, position) {
    const otherPlayer = this.otherPlayers.get(playerId);
    if (otherPlayer && otherPlayer.group) {
      otherPlayer.group.position.set(position.x, position.y, position.z);
      otherPlayer.group.rotation.y = position.rotation;
    }
  }

  removeOtherPlayer(playerId) {
    const otherPlayer = this.otherPlayers.get(playerId);
    if (otherPlayer && otherPlayer.group && window.scene) {
      window.scene.remove(otherPlayer.group);
      this.otherPlayers.delete(playerId);
      this.updatePlayersPanel();
    }
  }

  updatePlayersPanel() {
    const playersList = document.getElementById('players-list');
    const playerCount = document.getElementById('player-count');
    
    if (playersList && playerCount) {
      playersList.innerHTML = '';
      playerCount.textContent = this.otherPlayers.size + 1;
      
      const currentPlayerItem = document.createElement('div');
      currentPlayerItem.className = 'player-item';
      currentPlayerItem.innerHTML = `
        <div class="player-color" style="background-color: #${this.playerColor.toString(16).padStart(6, '0')};"></div>
        <div class="player-name">${this.playerName} (You)</div>
      `;
      playersList.appendChild(currentPlayerItem);
      
      this.otherPlayers.forEach((player, playerId) => {
        const playerItem = document.createElement('div');
        playerItem.className = 'player-item';
        playerItem.innerHTML = `
          <div class="player-color" style="background-color: #${player.color.toString(16).padStart(6, '0')};"></div>
          <div class="player-name">${player.name}</div>
        `;
        playersList.appendChild(playerItem);
      });
    }
  }

  sendPositionUpdate() {
    if (window.playerAvatar) {
      this.sendPlayerData();
    }
  }

  setupChat() {
    const chatInput = document.getElementById('chat-input');
    const chatSend = document.getElementById('chat-send');
    
    if (chatSend) {
      chatSend.addEventListener('click', () => this.sendChatMessage());
    }
    
    if (chatInput) {
      chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.sendChatMessage();
          // Close sidebar and reset camera when Enter is pressed
          this.closeChatInterface();
        }
      });

      if (!window.isMobile) {
        document.addEventListener('keydown', (e) => {
          if (e.key === 't' || e.key === 'T') {
            document.getElementById('sidebar').classList.add('active');
            canMove = false;
            document.querySelector('.modal-overlay').classList.add('active');
            setTimeout(() => chatInput.focus(), 100);
          }
        });
      }
    }
  }

  sendChatMessage() {
    const chatInput = document.getElementById('chat-input');
    const message = chatInput.value.trim();
    
    if (message) {
      const chatData = {
        type: 'chat-message',
        playerId: this.playerId,
        sender: this.playerName,
        text: message
      };
      
      this.dataChannels.forEach((dataChannel, peerId) => {
        if (dataChannel.readyState === 'open') {
          dataChannel.send(JSON.stringify(chatData));
        }
      });
      
      this.addChatMessage(this.playerName, message, true);
      createChatMessageBubble(this.playerId, this.playerName, message, true);
      chatInput.value = '';
    }
  }

  closeChatInterface() {
    // Close sidebar
    const sidebar = document.getElementById('sidebar');
    const modalOverlay = document.querySelector('.modal-overlay');
    
    sidebar.classList.remove('active');
    canMove = true;
    modalOverlay.classList.remove('active');
    
    // Reset camera angle to current player direction
    if (playerAvatar) {
      targetCameraAngle = playerAvatar.rotation.y - Math.PI;
    }
    
    // Re-lock controls if they were locked before
    if (controls && !isMobile) {
      setTimeout(() => {
        if (canMove && !controls.isLocked) {
          controls.lock();
        }
      }, 100);
    }
  }

  addChatMessage(sender, message, isOwn) {
    const chatMessages = document.getElementById('chat-messages');
    if (chatMessages) {
      const messageElement = document.createElement('div');
      messageElement.className = 'chat-message';
      
      if (isOwn) {
        messageElement.innerHTML = `<span class="chat-sender">You:</span> ${message}`;
      } else {
        messageElement.innerHTML = `<span class="chat-sender">${sender}:</span> ${message}`;
      }
      
      chatMessages.appendChild(messageElement);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }

  disconnect() {
    this.broadcastSignal({
      type: 'player-left',
      playerId: this.playerId
    });
    
    this.peers.forEach((peerConnection, peerId) => peerConnection.close());
    this.otherPlayers.forEach((player, playerId) => this.removeOtherPlayer(playerId));
    if (this.signalingChannel) this.signalingChannel.close();
  }
}

// Clean up bots when leaving
window.addEventListener('beforeunload', () => {
  if (multiplayer) {
    multiplayer.disconnect();
  }
  if (botManager) {
    botManager.dispose();
  }
});

console.log("NFT Shooter Universe initialized successfully!");
