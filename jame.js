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
   INITIALIZATION - FIXED AUTH FLOW
============================== */

document.addEventListener('DOMContentLoaded', function() {
  console.log("🎮 NFT Shooter Universe - Initializing");
  
  // Always allow avatar selection first
  if (isMobile) {
    document.getElementById('desktop-instructions').style.display = 'none';
    document.getElementById('mobile-instructions').style.display = 'block';
    setupMobileControls();
  }

  // Initialize avatar selection immediately (no auth blocking)
  setupAvatarSelection();
  
  // Check auth in background but don't block anything
  checkAuthBackground();
});

function checkAuthBackground() {
  client.auth.getSession().then(({ data }) => {
    if (data.session) {
      console.log("🔐 User is signed in (background check)");
    } else {
      console.log("🎮 User not signed in - free roam mode available");
    }
  }).catch(error => {
    console.log("Auth background check failed:", error);
  });
}

/* ==============================
   AVATAR SELECTION SYSTEM
============================== */

function setupAvatarSelection() {
  const avatarOptions = document.querySelectorAll('.avatar-option');
  const confirmButton = document.getElementById('confirm-avatar');
  
  if (avatarOptions.length === 0) {
    console.error("Avatar options not found!");
    return;
  }
  
  avatarOptions.forEach(option => {
    option.addEventListener('click', () => {
      avatarOptions.forEach(opt => opt.classList.remove('selected'));
      option.classList.add('selected');
      selectedAvatar = option.getAttribute('data-avatar');
      console.log(`Avatar selected: ${selectedAvatar}`);
    });
  });

  if (confirmButton) {
    confirmButton.addEventListener('click', () => {
      if (selectedAvatar) {
        startGame();
      } else {
        alert('Please select an avatar to continue');
      }
    });
  } else {
    console.error("Confirm avatar button not found!");
  }
}

function startGame() {
  console.log("🚀 Starting game...");
  
  // Initialize sidebar
  initSidebar();
  
  // Initialize multiplayer
  multiplayer = new WebRTCMultiplayer();
  
  // Set player name from input
  const nameInput = document.getElementById('player-name');
  if (nameInput && nameInput.value.trim()) {
    multiplayer.playerName = nameInput.value.trim();
  }
  
  multiplayer.playerColor = Math.random() * 0xFFFFFF;
  
  // Hide avatar selection
  document.getElementById('avatar-selection').style.display = 'none';
  
  // Initialize game systems
  init3DScene();
  loadNFTs();
  initTokenSystem();
  initBuildingOwnership();
  setupBulletPurchaseWithTokens();
  
  // Check authentication status AFTER game is initialized
  checkAuthenticationStatus();
  
  // Start position updates
  setInterval(() => {
    if (multiplayer) {
      multiplayer.sendPositionUpdate();
    }
  }, 100);
  
  console.log("🎯 Game started successfully!");
}

/* ==============================
   AUTHENTICATION & RESTRICTIONS
============================== */

function checkAuthenticationStatus() {
  client.auth.getSession().then(({ data }) => {
    if (data.session) {
      // User is signed in - enable full features
      document.body.classList.add('signed-in');
      enableFullFeatures();
      removeBots();
      console.log("✅ Full features enabled - welcome!");
    } else {
      // User is not signed in - free roam mode with restrictions
      document.body.classList.remove('signed-in');
      enableFreeRoamMode();
      
      // Only create bots if they don't exist yet
      if (!bots.welcome.active && !bots.assistant.active) {
        createBots();
      }
      console.log("🎮 Free roam mode - explore and have fun!");
    }
  }).catch(error => {
    // If auth check fails, default to free roam
    console.log("Auth check failed, defaulting to free roam:", error);
    document.body.classList.remove('signed-in');
    enableFreeRoamMode();
    
    if (!bots.welcome.active && !bots.assistant.active) {
      createBots();
    }
  });
}

function enableFreeRoamMode() {
  console.log("🔓 Enabling free roam mode");
  
  // Disable all purchase buttons
  disableAllPurchases();
  
  // Disable sidebar interactions
  disableSidebarAndChat();
  
  // Show free roam notification
  setTimeout(() => {
    showFreeRoamNotification();
  }, 2000);
}

function enableFullFeatures() {
  console.log("🔓 Enabling full features");
  
  // Enable all purchase buttons
  enableAllPurchases();
  
  // Enable sidebar and chat
  enableSidebarAndChat();
}

function disableAllPurchases() {
  // Disable token transfer
  const transferBtn = document.getElementById('transfer-token-btn-sidebar');
  if (transferBtn) {
    transferBtn.innerHTML = '🔒 Sign In to Transfer';
    transferBtn.style.background = '#6b7280';
    transferBtn.onclick = () => {
      alert('Please sign in to transfer tokens to NFTs');
    };
  }
  
  // Disable token purchase
  const purchaseBtn = document.getElementById('purchase-token-btn-sidebar');
  if (purchaseBtn) {
    purchaseBtn.innerHTML = '🔒 Sign In to Buy';
    purchaseBtn.style.background = '#6b7280';
    purchaseBtn.onclick = () => {
      alert('Please sign in to purchase tokens');
    };
  }
  
  // Disable bullet purchase with tokens
  const bulletTokenBtn = document.getElementById('buy-500-token');
  if (bulletTokenBtn) {
    bulletTokenBtn.innerHTML = '🔒 Sign In Required';
    bulletTokenBtn.style.background = '#6b7280';
    bulletTokenBtn.onclick = () => {
      alert('Please sign in to purchase bullets with tokens');
    };
  }
  
  // Disable ETH bullet purchase
  const bulletEthBtn = document.getElementById('buy-100');
  if (bulletEthBtn) {
    bulletEthBtn.innerHTML = '🔒 Sign In Required';
    bulletEthBtn.style.background = '#6b7280';
    bulletEthBtn.onclick = () => {
      alert('Please sign in to purchase bullets');
    };
  }
  
  // Disable building purchase
  const buildingPurchaseBtn = document.getElementById('purchase-building');
  if (buildingPurchaseBtn) {
    buildingPurchaseBtn.innerHTML = '🔒 Sign In to Purchase';
    buildingPurchaseBtn.style.background = '#6b7280';
    buildingPurchaseBtn.onclick = () => {
      alert('Please sign in to purchase buildings');
    };
  }
  
  // Disable token purchase from building modal
  const buildingTokenBtn = document.getElementById('purchase-token-cards');
  if (buildingTokenBtn) {
    buildingTokenBtn.innerHTML = '🔒 Sign In to Buy Tokens';
    buildingTokenBtn.style.background = '#6b7280';
    buildingTokenBtn.onclick = () => {
      alert('Please sign in to purchase tokens');
    };
  }
  
  // Disable NFT interactions
  const nftModalActions = document.getElementById('modal-actions');
  if (nftModalActions) {
    nftModalActions.innerHTML = '';
    const signInBtn = document.createElement('button');
    signInBtn.textContent = '🔒 Sign In to Interact with NFTs';
    signInBtn.onclick = () => {
      alert('Please sign in to buy or transfer NFTs');
    };
    nftModalActions.appendChild(signInBtn);
  }
}

function enableAllPurchases() {
  // Re-enable all purchase buttons with their original functionality
  const transferBtn = document.getElementById('transfer-token-btn-sidebar');
  if (transferBtn) {
    transferBtn.innerHTML = 'Convert Tokens → Real NFTs';
    transferBtn.style.background = '';
    transferBtn.onclick = () => openTokenTransferModal();
  }
  
  const purchaseBtn = document.getElementById('purchase-token-btn-sidebar');
  if (purchaseBtn) {
    purchaseBtn.innerHTML = 'Buy More Tokens';
    purchaseBtn.style.background = '#10b981';
    purchaseBtn.onclick = () => openTokenPurchaseModal();
  }
  
  const bulletTokenBtn = document.getElementById('buy-500-token');
  if (bulletTokenBtn) {
    bulletTokenBtn.innerHTML = 'Buy with Token';
    bulletTokenBtn.style.background = '#10b981';
    bulletTokenBtn.onclick = () => buyBulletsWithToken();
  }
  
  const bulletEthBtn = document.getElementById('buy-100');
  if (bulletEthBtn) {
    bulletEthBtn.innerHTML = 'Buy';
    bulletEthBtn.style.background = '#10b981';
    bulletEthBtn.onclick = () => buyBullets(100);
  }
  
  const buildingPurchaseBtn = document.getElementById('purchase-building');
  if (buildingPurchaseBtn) {
    buildingPurchaseBtn.innerHTML = 'Purchase for 250 Tokens';
    buildingPurchaseBtn.style.background = '';
    buildingPurchaseBtn.onclick = () => purchaseBuilding();
  }
  
  const buildingTokenBtn = document.getElementById('purchase-token-cards');
  if (buildingTokenBtn) {
    buildingTokenBtn.innerHTML = 'Buy More Tokens';
    buildingTokenBtn.style.background = '#10b981';
    buildingTokenBtn.onclick = () => openTokenPurchaseModal();
  }
}

function disableSidebarAndChat() {
  console.log("🔒 Sidebar and chat disabled for free roam");
}

function enableSidebarAndChat() {
  console.log("🔓 Sidebar and chat enabled");
}

function showFreeRoamNotification() {
  // Create a temporary notification
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20%;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.9);
    color: white;
    padding: 15px 25px;
    border-radius: 10px;
    border: 2px solid #3b82f6;
    z-index: 10000;
    font-size: 14px;
    text-align: center;
    max-width: 300px;
  `;
  notification.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 8px;">🎮 Free Roam Mode</div>
    <div>Explore and shoot freely!</div>
    <div style="font-size: 12px; margin-top: 8px; color: #93c5fd;">Sign in for buildings, NFTs, and chat</div>
  `;
  
  document.body.appendChild(notification);
  
  // Remove after 5 seconds
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transition = 'opacity 0.5s';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 500);
  }, 5000);
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
  
  console.log("🤖 Bots removed - user is signed in");
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
  if (!document.body.classList.contains('signed-in')) {
    updateWelcomeBot();
    updateAssistantBot();
    updateBotBullets();
  }
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
   TOKEN ECONOMY SYSTEM
============================== */

async function initTokenSystem() {
  await loadTokenBalance();
  setupTokenTransfer();
  setupTokenPurchase();
  setupTokenRewards();
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

async function addTokens(amount, reason = "") {
  playerStats.gameTokens += amount;
  
  if (account) {
    localStorage.setItem(`gameTokens_${account}`, playerStats.gameTokens.toString());
  }
  
  updateTokenDisplay();
  
  // Show reward notification
  if (reason) {
    showTokenRewardNotification(amount, reason);
  }
  
  console.log(`Added ${amount} tokens to player balance. New balance: ${playerStats.gameTokens}${reason ? ` - ${reason}` : ''}`);
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
  // Check if user is signed in
  if (!document.body.classList.contains('signed-in')) {
    alert("🔒 Please sign in to transfer tokens to NFTs");
    return;
  }
  
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
  
  if (!account) {
    alert("Please connect your wallet to convert tokens.");
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

// Mint real NFTs on blockchain
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
  // Check if user is signed in
  if (!document.body.classList.contains('signed-in')) {
    alert("🔒 Please sign in to purchase tokens");
    return;
  }
  
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
    
    await addTokens(tokenAmount, "Token Purchase");
    alert(`✅ Successfully purchased ${tokenAmount} game tokens!`);
    closeTokenPurchaseModal();
  } catch (err) {
    console.error("Token purchase failed:", err);
    alert(`Purchase failed: ${err.message}`);
  }
}

/* ==============================
   TOKEN REWARDS SYSTEM
============================== */

function setupTokenRewards() {
  // Set up periodic token rewards
  setInterval(() => {
    if (document.body.classList.contains('signed-in') && canMove) {
      // Small passive income for active players
      addTokens(1, "Active Play Reward");
    }
  }, 60000); // Every minute
  
  // Reward for hitting NFTs (already in bullet collision)
  // Reward for completing objectives
  setupGameplayRewards();
}

function setupGameplayRewards() {
  // These would be called from various game events
  console.log("Token reward system initialized");
}

function rewardGameplayTokens(amount, reason) {
  if (document.body.classList.contains('signed-in')) {
    addTokens(amount, reason);
  }
}

function showTokenRewardNotification(amount, reason) {
  // Create floating reward notification
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 30%;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(135deg, #10b981, #059669);
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    z-index: 10000;
    font-size: 14px;
    font-weight: bold;
    text-align: center;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    animation: floatUp 2s ease-in-out;
  `;
  
  notification.innerHTML = `
    <div>🎉 +${amount} Tokens!</div>
    <div style="font-size: 12px; opacity: 0.9;">${reason}</div>
  `;
  
  // Add CSS animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes floatUp {
      0% { transform: translateX(-50%) translateY(0); opacity: 0; }
      20% { transform: translateX(-50%) translateY(-20px); opacity: 1; }
      80% { transform: translateX(-50%) translateY(-40px); opacity: 1; }
      100% { transform: translateX(-50%) translateY(-60px); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
  
  document.body.appendChild(notification);
  
  // Remove after animation
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
    if (style.parentNode) {
      style.parentNode.removeChild(style);
    }
  }, 2000);
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
    
    // Remove existing sale indicator
    if (building.userData.saleIndicator) {
      scene.remove(building.userData.saleIndicator);
    }
    
    // Create "For Sale" floating text
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
    
    // Visual effect - pulse building color
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
    
    // Restore original color
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
  
  // Show current sale price or base cost
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
    
    // Set current sale price or base price
    const currentSalePrice = buildingData.forSale ? buildingData.salePrice : GAME_CONFIG.BUILDING_BASE_COST;
    document.getElementById('new-price').value = currentSalePrice;
    document.getElementById('new-price').min = GAME_CONFIG.BUILDING_BASE_COST;
    document.getElementById('new-price').max = GAME_CONFIG.MAX_SALE_PRICE;
    
    // Show/hide cancel sale button
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
  // Check if user is signed in
  if (!document.body.classList.contains('signed-in')) {
    alert("🔒 Please sign in to purchase buildings");
    return;
  }
  
  if (!account) {
    alert("Please connect your wallet to purchase buildings.");
    return;
  }
  
  if (!currentBuildingInteraction) return;
  
  const buildingId = currentBuildingInteraction.id;
  const buildingData = buildingOwnership.get(buildingId);
  const ownerName = document.getElementById('owner-name-input').value.trim() || 'Unknown Owner';
  
  // Determine price: player sale price or base price
  const purchasePrice = buildingData && buildingData.forSale ? 
    buildingData.salePrice : GAME_CONFIG.BUILDING_BASE_COST;
  
  if (playerStats.gameTokens < purchasePrice) {
    alert(`Insufficient tokens! You need ${purchasePrice} but only have ${playerStats.gameTokens}.`);
    return;
  }
  
  try {
    // DEDUCT tokens from buyer
    await removeTokens(purchasePrice);
    
    // If buying from another player, transfer tokens to seller
    if (buildingData && buildingData.forSale && buildingData.owner) {
      await transferTokensToSeller(buildingData.owner, purchasePrice);
    }
    
    // Update building ownership
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
      // REFUND tokens if save fails
      await addTokens(purchasePrice, "Purchase Refund");
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

// Transfer tokens to building seller
async function transferTokensToSeller(sellerAddress, amount) {
  try {
    // Get seller's current token balance
    const sellerBalance = parseInt(localStorage.getItem(`gameTokens_${sellerAddress}`) || '0');
    
    // Add tokens to seller
    const newSellerBalance = sellerBalance + amount;
    localStorage.setItem(`gameTokens_${sellerAddress}`, newSellerBalance.toString());
    
    console.log(`Transferred ${amount} tokens from buyer to seller ${sellerAddress}`);
    
    // Notify seller if they're online
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
   BULLET SYSTEM WITH TOKEN PURCHASE
============================== */

function setupBulletPurchaseWithTokens() {
  document.getElementById('buy-500-token').addEventListener('click', buyBulletsWithToken);
  document.getElementById('buy-100').addEventListener('click', () => buyBullets(100));
  document.getElementById('close-bullet-modal').addEventListener('click', closeBulletPurchaseModal);
}

async function buyBulletsWithToken() {
  // Check if user is signed in
  if (!document.body.classList.contains('signed-in')) {
    alert("🔒 Please sign in to purchase bullets with tokens");
    return;
  }
  
  if (!account) {
    alert("Please connect your wallet to purchase bullets with tokens.");
    return;
  }
  
  const tokenCost = GAME_CONFIG.BULLET_COST; // 1 token
  const bulletAmount = GAME_CONFIG.BULLET_AMOUNT; // 500 bullets
  
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
  // Check if user is signed in
  if (!document.body.classList.contains('signed-in')) {
    alert("🔒 Please sign in to purchase bullets");
    return;
  }
  
  if (!account) {
    alert("Please connect your wallet to purchase bullets.");
    return;
  }
  
  playerStats.bullets = Math.min(playerStats.bullets + amount, playerStats.maxBullets);
  updateBulletDisplay();
  closeBulletPurchaseModal();
}


/* ==============================
   MAIN ANIMATION LOOP
============================== */

function animate() {
  requestAnimationFrame(animate);
  
  const time = performance.now();
  const delta = (time - prevTime) / 1000;
  hoverTime += delta;
  
  if (((controls && controls.isLocked) || isMobile) && canMove) {
    // Player movement code (same as before)
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
  
  // Update bots only in free roam mode
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
console.log("🎮 NFT Shooter Universe - Ready!");
