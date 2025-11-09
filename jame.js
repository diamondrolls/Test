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

/* ==============================
   SPECIALIZED DUAL BOT SYSTEM
============================== */

let bots = {
  welcome: {
    mesh: null,
    position: new THREE.Vector3(0, 3, 0),
    targetPosition: new THREE.Vector3(0, 3, 0),
    speed: 3.5,
    active: false,
    messageShown: false,
    chatBubble: null,
    botGroup: null,
    bullets: [],
    lastShotTime: 0,
    shotCooldown: 800,
    searchRadius: 50,
    lastPlayerCheck: 0,
    playerCheckCooldown: 2000
  },
  assistant: {
    mesh: null,
    position: new THREE.Vector3(-200, 3, 0),
    targetPosition: new THREE.Vector3(-200, 3, 0),
    speed: 1.8,
    active: false,
    lastMessageTime: 0,
    messageCooldown: 25000,
    chatBubble: null,
    botGroup: null,
    bullets: [],
    lastShotTime: 0,
    shotCooldown: 1000,
    messages: [
      "Have fun exploring the universe! 🚀",
      "Remember, it's just a game - enjoy yourself! 😊",
      "Buy more coins to unlock awesome buildings! 🏢",
      "Don't forget to visit the spiral bridge! 🌉",
      "Explore every corner of this world! 🌎",
      "Collect tokens to upgrade your gear! 💰",
      "The city center has amazing views! 🏙️",
      "Watch out for other players! 👀",
      "Practice your shooting skills! 🎯",
      "This world is full of secrets! 🔍"
    ],
    patrolPoints: [
      new THREE.Vector3(-200, 3, 0),
      new THREE.Vector3(0, 3, -150),
      new THREE.Vector3(150, 3, 150),
      new THREE.Vector3(-100, 3, 200),
      new THREE.Vector3(200, 3, -100)
    ],
    currentPatrolIndex: 0
  }
};

// Track which players have been reminded
let remindedPlayers = new Set();

/* ==============================
   INITIALIZATION
============================== */

document.addEventListener('DOMContentLoaded', function() {
  client.auth.getSession().then(({ data }) => {
    if (!data.session) {
      console.log("Free roam mode activated");
      if (isMobile) {
        document.getElementById('desktop-instructions').style.display = 'none';
        document.getElementById('mobile-instructions').style.display = 'block';
        setupMobileControls();
      }
      setupAvatarSelection();
    } else {
      console.log("Full access granted");
      if (isMobile) {
        document.getElementById('desktop-instructions').style.display = 'none';
        document.getElementById('mobile-instructions').style.display = 'block';
        setupMobileControls();
      }
      setupAvatarSelection();
    }
  });
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
  loadNFTs();
  initTokenSystem();
  initBuildingOwnership();
  setupBulletPurchaseWithTokens();
  checkAuthenticationStatus();
  
  setInterval(() => {
    if (multiplayer) {
      multiplayer.sendPositionUpdate();
    }
  }, 100);
}

/* ==============================
   BOT SYSTEM
============================== */

function createBots() {
  createWelcomeBot();
  createAssistantBot();
}

function createWelcomeBot() {
  const bot = bots.welcome;
  const botGroup = new THREE.Group();
  
  const boardGeometry = new THREE.PlaneGeometry(7, 7);
  const boardMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x000000,
    metalness: 0.9,
    roughness: 0.1,
    side: THREE.DoubleSide
  });
  const board = new THREE.Mesh(boardGeometry, boardMaterial);
  board.rotation.x = -Math.PI / 2;
  board.castShadow = true;
  board.receiveShadow = true;
  botGroup.add(board);

  const underglowGeometry = new THREE.PlaneGeometry(7.5, 7.5);
  const underglowMaterial = new THREE.MeshBasicMaterial({ 
    color: 0xff0000,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide
  });
  const underglow = new THREE.Mesh(underglowGeometry, underglowMaterial);
  underglow.rotation.x = -Math.PI / 2;
  underglow.position.y = -0.1;
  botGroup.add(underglow);

  const bodyGeometry = new THREE.CylinderGeometry(0.8, 0.8, 1.5, 8);
  const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0x000000 });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.position.y = 1.2;
  botGroup.add(body);

  const headGeometry = new THREE.SphereGeometry(0.6, 8, 8);
  const headMaterial = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const head = new THREE.Mesh(headGeometry, headMaterial);
  head.position.y = 2.2;
  botGroup.add(head);

  const eyeGeometry = new THREE.SphereGeometry(0.15, 6, 6);
  const eyeMaterial = new THREE.MeshLambertMaterial({ color: 0xff0000 });
  
  const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
  leftEye.position.set(-0.25, 2.25, 0.4);
  botGroup.add(leftEye);
  
  const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
  rightEye.position.set(0.25, 2.25, 0.4);
  botGroup.add(rightEye);

  botGroup.position.copy(bot.position);
  botGroup.castShadow = true;
  scene.add(botGroup);
  
  bot.botGroup = botGroup;
  bot.mesh = botGroup;
  bot.active = true;
}

function createAssistantBot() {
  const bot = bots.assistant;
  const botGroup = new THREE.Group();
  
  const boardGeometry = new THREE.PlaneGeometry(8, 8);
  const boardMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x000000,
    metalness: 0.9,
    roughness: 0.1,
    side: THREE.DoubleSide
  });
  const board = new THREE.Mesh(boardGeometry, boardMaterial);
  board.rotation.x = -Math.PI / 2;
  board.castShadow = true;
  board.receiveShadow = true;
  botGroup.add(board);

  const underglowGeometry = new THREE.PlaneGeometry(8.5, 8.5);
  const underglowMaterial = new THREE.MeshBasicMaterial({ 
    color: 0xff0000,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide
  });
  const underglow = new THREE.Mesh(underglowGeometry, underglowMaterial);
  underglow.rotation.x = -Math.PI / 2;
  underglow.position.y = -0.1;
  botGroup.add(underglow);

  const bodyGeometry = new THREE.BoxGeometry(1.5, 2, 1);
  const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0x000000 });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.position.y = 1.5;
  botGroup.add(body);

  const headGeometry = new THREE.BoxGeometry(1.2, 1.2, 1.2);
  const headMaterial = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const head = new THREE.Mesh(headGeometry, headMaterial);
  head.position.y = 2.8;
  botGroup.add(head);

  const eyeGeometry = new THREE.SphereGeometry(0.15, 6, 6);
  const eyeMaterial = new THREE.MeshLambertMaterial({ color: 0xff0000 });
  
  const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
  leftEye.position.set(-0.4, 2.9, 0.5);
  botGroup.add(leftEye);
  
  const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
  rightEye.position.set(0.4, 2.9, 0.5);
  botGroup.add(rightEye);
  
  const smileGeometry = new THREE.TorusGeometry(0.3, 0.05, 8, 12, Math.PI);
  const smileMaterial = new THREE.MeshLambertMaterial({ color: 0xff0000 });
  const smile = new THREE.Mesh(smileGeometry, smileMaterial);
  smile.position.set(0, 2.5, 0.5);
  smile.rotation.x = Math.PI / 2;
  botGroup.add(smile);

  botGroup.position.copy(bot.position);
  botGroup.castShadow = true;
  scene.add(botGroup);
  
  bot.botGroup = botGroup;
  bot.mesh = botGroup;
  bot.active = true;
}

function updateBots() {
  updateWelcomeBot();
  updateAssistantBot();
  updateBotBullets();
}

function updateWelcomeBot() {
  const bot = bots.welcome;
  if (!bot.active || !bot.mesh) return;
  
  const currentTime = Date.now();
  if (currentTime - bot.lastPlayerCheck > bot.playerCheckCooldown) {
    findAndApproachUnsignedPlayer(bot);
    bot.lastPlayerCheck = currentTime;
  }
  
  const direction = new THREE.Vector3()
    .subVectors(bot.targetPosition, bot.position)
    .normalize();
  
  const distanceToTarget = bot.position.distanceTo(bot.targetPosition);
  
  if (distanceToTarget > 3) {
    bot.position.add(direction.multiplyScalar(bot.speed));
    bot.mesh.position.copy(bot.position);
    
    if (direction.length() > 0.1) {
      bot.mesh.rotation.y = Math.atan2(direction.x, direction.z);
    }
  } else {
    setRandomExplorationPoint(bot);
  }
  
  checkBotHit(bot);
}

function findAndApproachUnsignedPlayer(bot) {
  const isSignedIn = document.body.classList.contains('signed-in');
  const playerId = multiplayer ? multiplayer.playerId : 'local-player';
  
  if (!isSignedIn && !remindedPlayers.has(playerId)) {
    const distanceToPlayer = bot.position.distanceTo(playerAvatar.position);
    
    if (distanceToPlayer < bot.searchRadius) {
      bot.targetPosition.copy(playerAvatar.position);
      
      if (distanceToPlayer < 15) {
        showBotMessage('welcome', "Welcome! Please sign in to access chat, buildings, and full features!");
        remindedPlayers.add(playerId);
      }
    }
  }
}

function setRandomExplorationPoint(bot) {
  const explorationAreas = [
    new THREE.Vector3(-150, 3, -150),
    new THREE.Vector3(0, 3, 0),
    new THREE.Vector3(150, 3, 150),
    new THREE.Vector3(-200, 3, 100),
    new THREE.Vector3(100, 3, -200)
  ];
  
  const randomPoint = explorationAreas[Math.floor(Math.random() * explorationAreas.length)];
  bot.targetPosition.copy(randomPoint);
}

function updateAssistantBot() {
  const bot = bots.assistant;
  if (!bot.active || !bot.mesh) return;
  
  const currentTarget = bot.patrolPoints[bot.currentPatrolIndex];
  const direction = new THREE.Vector3()
    .subVectors(currentTarget, bot.position)
    .normalize();
  
  const distanceToTarget = bot.position.distanceTo(currentTarget);
  
  if (distanceToTarget > 5) {
    bot.position.add(direction.multiplyScalar(bot.speed));
    bot.mesh.position.copy(bot.position);
    
    if (direction.length() > 0.1) {
      bot.mesh.rotation.y = Math.atan2(direction.x, direction.z);
    }
  } else {
    bot.currentPatrolIndex = (bot.currentPatrolIndex + 1) % bot.patrolPoints.length;
  }
  
  const distanceToPlayer = bot.position.distanceTo(playerAvatar.position);
  if (distanceToPlayer < 25) {
    const currentTime = Date.now();
    if (currentTime - bot.lastMessageTime > bot.messageCooldown) {
      const randomMessage = bot.messages[Math.floor(Math.random() * bot.messages.length)];
      showBotMessage('assistant', randomMessage);
      bot.lastMessageTime = currentTime;
    }
  }
  
  checkBotHit(bot);
}

function showBotMessage(botType, message) {
  const bot = bots[botType];
  const chatBubble = document.getElementById(`${botType}-bot`);
  const messageElement = document.getElementById(botType === 'assistant' ? 'assistant-message' : null);
  
  if (messageElement) {
    messageElement.textContent = message;
  }
  
  if (chatBubble) {
    chatBubble.style.display = 'block';
    chatBubble.style.opacity = '1';
    
    if (bot.mesh) {
      const screenPosition = bot.mesh.position.clone();
      screenPosition.project(camera);
      
      const x = (screenPosition.x * 0.5 + 0.5) * window.innerWidth;
      const y = -(screenPosition.y * 0.5 - 0.5) * window.innerHeight;
      
      chatBubble.style.left = `${x}px`;
      chatBubble.style.top = `${y - 80}px`;
    }
    
    setTimeout(() => {
      chatBubble.style.opacity = '0';
      setTimeout(() => {
        chatBubble.style.display = 'none';
      }, 300);
    }, 5000);
  }
}

function checkBotHit(bot) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    if (bullet.owner === 'player' && bullet.active) {
      const distance = bullet.position.distanceTo(bot.position);
      if (distance < 10) {
        bullet.active = false;
        createBulletImpact(bullet.position);
        botShoot(bot);
        
        if (bot.mesh) {
          const originalColor = bot.mesh.children[0].material.color.getHex();
          bot.mesh.children[0].material.color.set(0xff0000);
          setTimeout(() => {
            if (bot.mesh) {
              bot.mesh.children[0].material.color.set(originalColor);
            }
          }, 200);
        }
        break;
      }
    }
  }
}

function botShoot(bot) {
  const currentTime = Date.now();
  if (currentTime - bot.lastShotTime < bot.shotCooldown) return;
  
  if (playerAvatar) {
    const direction = new THREE.Vector3()
      .subVectors(playerAvatar.position, bot.position)
      .normalize();
    
    const startPosition = bot.position.clone().add(
      new THREE.Vector3(0, 2, 0)
    ).add(direction.clone().multiplyScalar(3));
    
    const bullet = {
      position: startPosition,
      direction: direction.clone(),
      velocity: direction.clone().multiplyScalar(40),
      owner: bot === bots.welcome ? 'welcome-bot' : 'assistant-bot',
      active: true,
      distanceTraveled: 0,
      maxDistance: 1000
    };
    
    bot.bullets.push(bullet);
    createBotBulletVisual(bullet, bot);
    bot.lastShotTime = currentTime;
  }
}

function createBotBulletVisual(bullet, bot) {
  const bulletSize = 1;
  const bulletGeometry = new THREE.SphereGeometry(bulletSize, 6, 6);
  const bulletMaterial = new THREE.MeshBasicMaterial({ 
    color: 0xff0000,
    transparent: true,
    opacity: 0.9
  });
  
  const bulletMesh = new THREE.Mesh(bulletGeometry, bulletMaterial);
  bulletMesh.position.copy(bullet.position);
  bulletMesh.userData = { bulletData: bullet };
  scene.add(bulletMesh);
  
  bullet.mesh = bulletMesh;
}

function updateBotBullets() {
  updateSingleBotBullets(bots.welcome);
  updateSingleBotBullets(bots.assistant);
}

function updateSingleBotBullets(bot) {
  for (let i = bot.bullets.length - 1; i >= 0; i--) {
    const bullet = bot.bullets[i];
    
    if (!bullet.active) {
      if (bullet.mesh) scene.remove(bullet.mesh);
      bot.bullets.splice(i, 1);
      continue;
    }
    
    const velocityStep = bullet.velocity.clone().multiplyScalar(0.1);
    bullet.position.add(velocityStep);
    bullet.distanceTraveled += velocityStep.length();
    
    if (bullet.mesh) bullet.mesh.position.copy(bullet.position);
    
    if (playerAvatar && bullet.owner.includes('bot')) {
      const distance = bullet.position.distanceTo(playerAvatar.position);
      if (distance < 8) {
        createBulletImpact(bullet.position);
        bullet.active = false;
        playerHit();
      }
    }
    
    if (bullet.distanceTraveled > bullet.maxDistance) {
      bullet.active = false;
    }
  }
}

/* ==============================
   AUTHENTICATION & RESTRICTIONS
============================== */

function checkAuthenticationStatus() {
  client.auth.getSession().then(({ data }) => {
    if (data.session) {
      document.body.classList.add('signed-in');
      enableSidebarAndChat();
      removeBots();
    } else {
      document.body.classList.remove('signed-in');
      disableSidebarAndChat();
      if (!bots.welcome.active && !bots.assistant.active) {
        createBots();
      }
    }
  });
}

function disableSidebarAndChat() {
  console.log("Sidebar and chat disabled - please sign in");
}

function enableSidebarAndChat() {
  console.log("Sidebar and chat enabled - welcome!");
}

function removeBots() {
  if (bots.welcome.mesh) {
    scene.remove(bots.welcome.mesh);
    bots.welcome.active = false;
  }
  
  if (bots.assistant.mesh) {
    scene.remove(bots.assistant.mesh);
    bots.assistant.active = false;
  }
  
  bots.welcome.bullets = [];
  bots.assistant.bullets = [];
  
  console.log("Bots removed - user is signed in");
}

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
}

// ... (rest of the token transfer, purchase, building ownership, bullet systems remain the same as previous implementation)
// ... (wallet connection, 3D scene setup, NFT interaction, multiplayer systems remain the same)

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

// ... (rest of the existing code for mobile controls, chat, multiplayer, etc.)

/* ==============================
   MAIN ANIMATION LOOP
============================== */

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
  
  // Update bots in the main animation loop
  updateBots();
  
  updateThirdPersonCamera();
  updateBullets();
  checkNFTInteraction();
  
  if (window.updateMiniMap) {
    window.updateMiniMap();
  }
  
  prevTime = time;
  renderer.render(scene, camera);
}

// Initialize the game
console.log("NFT Shooter Universe initialized successfully!");
