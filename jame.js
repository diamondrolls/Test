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
  BULLET_COST: 1,        // 1 NFT for 500 bullets
  BULLET_AMOUNT: 500,
  TRANSFER_RATE: 1,      // 1 gameToken = 1 real NFT
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
   ASSISTANT BOTS - IMPROVED MOVEMENT
============================== */
class AssistantBot {
  constructor(id, name = "Bot") {
    this.id = id;
    this.name = name;
    this.group = new THREE.Group();

    // SIMPLIFIED BOT - no hover board
    const headGeo = new THREE.SphereGeometry(1.2, 12, 12);
    const headMat = new THREE.MeshLambertMaterial({ color: 0xff8800 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.5;
    this.group.add(head);

    // Body
    const bodyGeo = new THREE.CylinderGeometry(0.8, 0.8, 2, 8);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0;
    this.group.add(body);

    // Name tag
    const tag = this.createNameTag(name, 0xff8800);
    this.group.add(tag);

    // Spawn with wider range
    this.spawn();
    if (window.scene) {
      window.scene.add(this.group);
    }

    // IMPROVED MOVEMENT - more active
    this.velocity = new THREE.Vector3();
    this.targetPos = this.group.position.clone();
    this.shootCooldown = 0;
    this.lastShot = 0;
    this.movementSpeed = 60 + Math.random() * 40; // More variable speed
    this.directionChangeTime = 0;
    this.directionChangeInterval = 2 + Math.random() * 3; // Change direction more frequently
  }

  createNameTag(name, color) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 256; canvas.height = 64;
    ctx.fillStyle = `#${color.toString(16).padStart(6,'0')}`;
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.font = '24px Arial';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, canvas.width/2, canvas.height/2);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex });
    const sprite = new THREE.Sprite(mat);
    sprite.position.y = 4;
    sprite.scale.set(12, 3, 1);
    return sprite;
  }

  spawn() {
    // WIDER SPAWN RANGE for bots
    let x, z, attempts = 0;
    do {
      x = (Math.random() - 0.5) * (worldSize - 100); // Wider range
      z = (Math.random() - 0.5) * (worldSize - 100); // Wider range
      attempts++;
    } while (this.collides(x, hoverHeight, z) && attempts < 50);

    this.group.position.set(x, hoverHeight + 1, z);
  }

  collides(x, y, z) {
    const testBox = new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(x, y, z),
      new THREE.Vector3(8, 3, 8)
    );
    for (const box of collisionObjects) {
      if (testBox.intersectsBox(box)) return true;
    }
    return false;
  }

  update(delta) {
    if (!this.group) return;
    
    this.directionChangeTime += delta;
    
    // MORE FREQUENT DIRECTION CHANGES
    if (this.directionChangeTime >= this.directionChangeInterval || 
        this.group.position.distanceTo(this.targetPos) < 10) {
      this.pickNewTarget();
      this.directionChangeTime = 0;
      this.directionChangeInterval = 1 + Math.random() * 4; // Even more frequent changes
    }

    const dir = this.targetPos.clone().sub(this.group.position);
    dir.y = 0;
    if (dir.length() > 0) dir.normalize();

    const speed = this.movementSpeed * delta;
    this.velocity.lerp(dir.multiplyScalar(speed), 0.2); // Smoother movement
    
    const newPos = this.group.position.clone().add(this.velocity.clone().multiplyScalar(delta));

    // Collision handling with bounce
    if (this.collides(newPos.x, newPos.y, newPos.z)) {
      // Bounce off obstacles
      this.pickNewTarget();
    } else {
      this.group.position.copy(newPos);
    }

    // Look at movement direction
    if (this.velocity.length() > 0.1) {
      this.group.lookAt(this.group.position.clone().add(this.velocity));
    }

    // MORE AGGRESSIVE SHOOTING
    if (playerAvatar) {
      const distToPlayer = this.group.position.distanceTo(playerAvatar.position);
      if (distToPlayer < 200) { // Increased range
        this.shootCooldown -= delta;
        if (this.shootCooldown <= 0) {
          this.shootAtPlayer();
          this.shootCooldown = 0.8 + Math.random() * 0.6; // Much faster shooting
        }
      }
    }
  }

  pickNewTarget() {
    // WIDER MOVEMENT RANGE
    const angle = Math.random() * Math.PI * 2;
    const dist = 100 + Math.random() * 150; // Much wider movement
    this.targetPos.set(
      Math.max(-worldBoundary + 50, Math.min(worldBoundary - 50, 
        this.group.position.x + Math.cos(angle) * dist)),
      hoverHeight + 1,
      Math.max(-worldBoundary + 50, Math.min(worldBoundary - 50, 
        this.group.position.z + Math.sin(angle) * dist))
    );
    
    // Random speed changes
    this.movementSpeed = 50 + Math.random() * 60;
  }

  shootAtPlayer() {
    if (!playerAvatar) return;
    const now = Date.now();
    if (now - this.lastShot < 200) return; // Faster shooting
    this.lastShot = now;

    const dir = playerAvatar.position.clone().sub(this.group.position).normalize();
    const start = this.group.position.clone().add(new THREE.Vector3(0, 2, 0)).add(dir.clone().multiplyScalar(3));

    const bullet = {
      position: start,
      direction: dir,
      velocity: dir.clone().multiplyScalar(bulletSpeed * 1.2), // Faster bullets
      owner: 'bot',
      active: true,
      distanceTraveled: 0,
      maxDistance: 1500
    };
    bullets.push(bullet);
    createBulletVisual(bullet);
  }

  dispose() {
    if (window.scene && this.group) {
      window.scene.remove(this.group);
    }
    for (let i = bullets.length - 1; i >= 0; i--) {
      if (bullets[i].owner === 'bot' && bullets[i].botId === this.id) {
        if (bullets[i].mesh) window.scene.remove(bullets[i].mesh);
        if (bullets[i].glowMesh) window.scene.remove(bullets[i].glowMesh);
        bullets.splice(i,1);
      }
    }
  }
}

/* ==============================
   INITIALIZATION
============================== */

// Check authentication on load
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM loaded, setting up avatar selection...');
  
  client.auth.getSession().then(({ data }) => {
    if (!data.session) {
      window.location.href = 'https://diamondrolls.github.io/play/';
    }
  });

  // Set up mobile UI
  if (isMobile) {
    document.getElementById('desktop-instructions').style.display = 'none';
    document.getElementById('mobile-instructions').style.display = 'block';
    setupMobileControls();
  }

  // Initialize avatar selection
  setupAvatarSelection();
});

/* ==============================
   AVATAR SELECTION SYSTEM - FIXED
============================== */

function setupAvatarSelection() {
  console.log('Setting up avatar selection...');
  
  const avatarOptions = document.querySelectorAll('.avatar-option');
  const confirmButton = document.getElementById('confirm-avatar');
  const playerNameInput = document.getElementById('player-name');
  
  if (!confirmButton) {
    console.error('Confirm button not found!');
    return;
  }
  
  console.log('Found avatar options:', avatarOptions.length);
  console.log('Found confirm button:', confirmButton);

  avatarOptions.forEach(option => {
    option.addEventListener('click', function() {
      console.log('Avatar clicked:', this.getAttribute('data-avatar'));
      
      // Remove selected class from all options
      avatarOptions.forEach(opt => opt.classList.remove('selected'));
      // Add selected class to clicked option
      this.classList.add('selected');
      selectedAvatar = this.getAttribute('data-avatar');
      
      // Enable the confirm button
      confirmButton.disabled = false;
      console.log('Avatar selected:', selectedAvatar);
    });
  });

  // Enable confirm button when name is entered (optional)
  playerNameInput.addEventListener('input', function() {
    if (selectedAvatar) {
      confirmButton.disabled = false;
    }
  });

  confirmButton.addEventListener('click', function() {
    console.log('Enter Universe button clicked!');
    
    if (!selectedAvatar) {
      alert('Please select an avatar first!');
      return;
    }

    console.log('Starting game with avatar:', selectedAvatar);
    
    // Call the main startGame function
    startGame();
  });
  
  console.log('Avatar selection setup complete');
}

function startGame() {
  console.log('startGame() called with avatar:', selectedAvatar);
  
  // Initialize sidebar
  if (typeof initSidebar === 'function') {
    initSidebar();
  } else {
    console.log('initSidebar not found, using fallback');
    initSidebarFallback();
  }
  
  // Initialize multiplayer
  if (typeof WebRTCMultiplayer === 'function') {
    multiplayer = new WebRTCMultiplayer();
  } else {
    console.log('WebRTCMultiplayer not found, skipping multiplayer');
  }
  
  // Set player name from input
  const nameInput = document.getElementById('player-name');
  if (nameInput && nameInput.value.trim()) {
    if (multiplayer) {
      multiplayer.playerName = nameInput.value.trim();
    }
  }
  
  // Generate random color for player
  if (multiplayer) {
    multiplayer.playerColor = Math.random() * 0xFFFFFF;
  }
  
  // Hide avatar selection
  document.getElementById('avatar-selection').style.display = 'none';
  
  // Show game UI elements
  showGameUI();
  
  // Initialize game systems
  init3DScene();

  // CREATE IMPROVED ASSISTANT BOTS
  window.assistantBots = [
    new AssistantBot('bot-01', 'Assistant A'),
    new AssistantBot('bot-02', 'Assistant B'),
    new AssistantBot('bot-03', 'Assistant C') // Added third bot for more activity
  ];
  
  loadNFTs();
  initTokenSystem();
  initBuildingOwnership();
  setupBulletPurchaseWithTokens();
  
  // Start position updates
  setInterval(() => {
    if (multiplayer) {
      multiplayer.sendPositionUpdate();
    }
  }, 100);
  
  console.log('Game started successfully!');
}

function showGameUI() {
  console.log('Showing game UI elements...');
  
  // Show canvas container
  const canvasContainer = document.getElementById('canvas-container');
  if (canvasContainer) {
    canvasContainer.style.display = 'block';
    console.log('Canvas container shown');
  }
  
  // Show HUD
  const hud = document.getElementById('hud');
  if (hud) hud.style.display = 'block';
  
  // Show wallet button
  const connectWallet = document.getElementById('connect-wallet');
  if (connectWallet) connectWallet.style.display = 'block';
  
  // Show mini-map
  const miniMap = document.getElementById('mini-map');
  if (miniMap) miniMap.style.display = 'block';
  
  // Show location display
  const locationDisplay = document.getElementById('location-display');
  if (locationDisplay) locationDisplay.style.display = 'block';
  
  // Show sidebar toggle
  const sidebarToggle = document.getElementById('sidebar-toggle');
  if (sidebarToggle) sidebarToggle.style.display = 'block';
  
  // Show mobile controls if on mobile
  if (isMobile) {
    const mobileControls = document.getElementById('mobile-controls');
    const lookControls = document.getElementById('look-controls');
    if (mobileControls) mobileControls.style.display = 'grid';
    if (lookControls) lookControls.style.display = 'block';
  }
}

function initSidebarFallback() {
  console.log('Using fallback sidebar initialization');
  
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const sidebar = document.getElementById('sidebar');
  const modalOverlay = document.querySelector('.modal-overlay');
  
  if (sidebarToggle && sidebar && modalOverlay) {
    sidebarToggle.addEventListener('click', function() {
      const isActive = sidebar.classList.toggle('active');
      canMove = !isActive;
      modalOverlay.classList.toggle('active', isActive);
      
      if (isActive && controls && controls.isLocked) {
        controls.unlock();
      }
    });
    
    // Close sidebar when clicking outside
    modalOverlay.addEventListener('click', function() {
      sidebar.classList.remove('active');
      canMove = true;
      this.classList.remove('active');
    });
    
    // Close sidebar with Escape key
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && sidebar.classList.contains('active')) {
        sidebar.classList.remove('active');
        canMove = true;
        modalOverlay.classList.remove('active');
      }
    });
  }
}

// ... (rest of your existing JavaScript code continues here with all the other functions)
// Make sure to include ALL the other functions from your original code below this point

// For now, I'll include a minimal version of the other essential functions to make it work:

function init3DScene() {
  console.log('Initializing 3D scene...');
  
  try {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000033);
    scene.fog = new THREE.Fog(0x000033, 100, 2000);
    
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 5000);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    const canvasContainer = document.getElementById('canvas-container');
    if (canvasContainer) {
      canvasContainer.appendChild(renderer.domElement);
    }
    
    // Add basic lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(100, 200, 100);
    directionalLight.castShadow = true;
    scene.add(directionalLight);
    
    // Create simple ground
    const groundGeometry = new THREE.PlaneGeometry(worldSize, worldSize, 100, 100);
    const groundMaterial = new THREE.MeshLambertMaterial({ 
      color: 0x4ADE80,
      side: THREE.DoubleSide
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    
    // Create player avatar
    createPlayerAvatar();
    updateThirdPersonCamera();
    
    // Start animation loop
    animate();
    
    console.log('3D scene initialized successfully');
  } catch (error) {
    console.error('Error initializing 3D scene:', error);
  }
}

function createPlayerAvatar() {
  const group = new THREE.Group();
  
  // REMOVED HOVER BOARD - simplified avatar
  let avatar;
  if (selectedAvatar === 'boy') {
    const bodyGeometry = new THREE.CylinderGeometry(1, 1, 2, 8);
    const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0x3B82F6 });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 1;
    
    const headGeometry = new THREE.SphereGeometry(0.8, 12, 12);
    const headMaterial = new THREE.MeshLambertMaterial({ color: 0xFCD34D });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 2.5;
    
    avatar = new THREE.Group();
    avatar.add(body);
    avatar.add(head);
  } else if (selectedAvatar === 'girl') {
    const bodyGeometry = new THREE.CylinderGeometry(1, 1, 2, 8);
    const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0xEC4899 });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 1;
    
    const headGeometry = new THREE.SphereGeometry(0.8, 12, 12);
    const headMaterial = new THREE.MeshLambertMaterial({ color: 0xFCD34D });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 2.5;
    
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

function animate() {
  requestAnimationFrame(animate);
  
  const time = performance.now();
  const delta = (time - prevTime) / 1000;
  hoverTime += delta;
  
  updateThirdPersonCamera();
  
  // Update assistant bots
  if (window.assistantBots) {
    window.assistantBots.forEach(bot => {
      if (bot && typeof bot.update === 'function') {
        bot.update(delta);
      }
    });
  }
  
  prevTime = time;
  renderer.render(scene, camera);
}

// Placeholder functions for other systems
function loadNFTs() { console.log('Loading NFTs...'); }
function initTokenSystem() { console.log('Initializing token system...'); }
function initBuildingOwnership() { console.log('Initializing building ownership...'); }
function setupBulletPurchaseWithTokens() { console.log('Setting up bullet purchase...'); }
function setupMobileControls() { console.log('Setting up mobile controls...'); }

console.log('Game script loaded successfully!');
