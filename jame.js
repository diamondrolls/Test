/* ==============================
   CONFIGURATION & GLOBAL VARIABLES
============================== */
const supabaseUrl = "https://fjtzodjudyctqacunlqp.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqdHpvZGp1ZHljdHFhY3VubHFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgwNjA2OTQsImV4cCI6MjA3MzYzNjY5NH0.qR9RBsecfGUfKnbWgscmxloM-oEClJs_bo5YWoxFoE4";
const client = supabase.createClient(supabaseUrl, supabaseKey);

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
  gameTokens: 100
};

// Game systems
let bullets = [];
let bulletSpeed = 50;
let lastShotTime = 0;
let shotCooldown = 150;
let canMove = true;
let buildingOwnership = new Map();
let ownedBuildings = [];

// Assistant Bots System
let assistantBots = new Map();
let currentBotInteraction = null;
let botResponseTimeout = null;

// 3D scene variables
let scene, camera, renderer;
let buildingObjects = [], botObjects = [];
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
let playerSize = new THREE.Vector3(8, 4, 8);

// Mobile controls
let isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let lookTouchId = null;
let lookStartX = 0, lookStartY = 0;
let lookX = 0, lookY = 0;
let velocity = new THREE.Vector3();
let canJump = true;

// World settings
let worldSize = 1000;
let worldBoundary = worldSize / 2 - 50;

// Multiplayer
let multiplayer;
let selectedAvatar = null;

/* ==============================
   INITIALIZATION
============================== */

document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM loaded - setting up game");
    
    client.auth.getSession().then(({ data }) => {
        if (!data.session) {
            console.log("User not signed in");
        } else {
            console.log("User signed in");
        }
    });

    // Set up mobile UI
    if (isMobile) {
        document.getElementById('desktop-instructions').style.display = 'none';
        document.getElementById('mobile-instructions').style.display = 'block';
        setupMobileControls();
    }

    // Initialize systems
    setupBotChatSystem();
    setupAvatarSelection();
    
    // Initialize token system early so UI updates work
    initTokenSystem();
    
    console.log("Game initialization complete");
});

/* ==============================
   AVATAR SELECTION SYSTEM
============================== */

function setupAvatarSelection() {
    const avatarOptions = document.querySelectorAll('.avatar-option');
    const confirmButton = document.getElementById('confirm-avatar');
    
    console.log("Setting up avatar selection with", avatarOptions.length, "options");
    
    avatarOptions.forEach(option => {
        option.addEventListener('click', () => {
            avatarOptions.forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
            selectedAvatar = option.getAttribute('data-avatar');
            console.log("Selected avatar:", selectedAvatar);
        });
    });

    confirmButton.addEventListener('click', () => {
        if (selectedAvatar) {
            console.log("Starting game with avatar:", selectedAvatar);
            startGame();
        } else {
            alert('Please select an avatar to continue');
        }
    });
}

function startGame() {
    console.log("=== STARTING GAME ===");
    
    // Hide avatar selection
    document.getElementById('avatar-selection').style.display = 'none';
    
    // Show the game UI
    document.getElementById('sidebar-toggle').style.display = 'flex';
    document.getElementById('instructions').style.display = 'block';
    
    if (isMobile) {
        document.getElementById('mobile-controls').style.display = 'flex';
        document.getElementById('look-controls').style.display = 'block';
    }
    
    // Initialize sidebar
    initSidebar();
    
    // Initialize simplified multiplayer
    multiplayer = {
        playerName: 'Player',
        playerColor: Math.random() * 0xFFFFFF,
        sendPositionUpdate: function() {}
    };
    
    // Set player name from input
    const nameInput = document.getElementById('player-name');
    if (nameInput && nameInput.value.trim()) {
        multiplayer.playerName = nameInput.value.trim();
    }
    
    // Initialize 3D scene FIRST
    console.log("Initializing 3D scene...");
    init3DScene();
    
    // Then initialize other systems
    console.log("Initializing assistant bots...");
    initializeAssistantBots();
    
    console.log("Initializing building ownership...");
    initBuildingOwnership();
    
    console.log("Setting up bullet system...");
    setupBulletPurchaseWithTokens();
    
    // Start game loop
    console.log("Starting game loop...");
    animate();
    
    // Start bot interaction checking
    setInterval(() => {
        if (canMove && playerAvatar) {
            checkBotInteraction();
        }
    }, 500);
    
    console.log("=== GAME STARTED SUCCESSFULLY ===");
}

/* ==============================
   3D SCENE SETUP - FIXED
============================== */

function init3DScene() {
    console.log("Initializing 3D scene...");
    
    try {
        // Create scene with visible background
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x87CEEB); // Sky blue
        scene.fog = new THREE.Fog(0x87CEEB, 100, 2000);
        
        // Create camera
        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 5000);
        camera.position.set(0, 15, 25);
        
        // Create renderer
        renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            alpha: false, // Make sure it's not transparent
            preserveDrawingBuffer: true // Helps with debugging
        });
        
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.setClearColor(0x87CEEB, 1); // Ensure background is drawn
        
        // Clear and setup canvas container
        const canvasContainer = document.getElementById('canvas-container');
        canvasContainer.innerHTML = ''; // Clear any existing content
        canvasContainer.appendChild(renderer.domElement);
        
        // Make sure canvas is behind UI
        renderer.domElement.style.position = 'absolute';
        renderer.domElement.style.top = '0';
        renderer.domElement.style.left = '0';
        renderer.domElement.style.zIndex = '1';
        
        // Add lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(50, 100, 50);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 1024;
        directionalLight.shadow.mapSize.height = 1024;
        scene.add(directionalLight);
        
        // Create world
        createWorld();
        
        // Create player avatar
        createPlayerAvatar();
        
        // Set up window resize handler
        window.addEventListener('resize', onWindowResize);
        
        // Force initial render
        renderer.render(scene, camera);
        
        console.log("3D scene initialized successfully - scene should be visible");
        
    } catch (error) {
        console.error("Error initializing 3D scene:", error);
    }
}

function createWorld() {
    console.log("Creating world...");
    
    // Create ground - make it very visible
    const groundGeometry = new THREE.PlaneGeometry(worldSize, worldSize, 10, 10);
    const groundMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x4ADE80, // Bright green
        side: THREE.DoubleSide
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.position.y = -0.1; // Slightly below origin
    scene.add(ground);
    
    // Add a grid helper to make ground more visible
    const gridHelper = new THREE.GridHelper(worldSize, 20, 0x000000, 0x000000);
    gridHelper.position.y = 0.1;
    scene.add(gridHelper);
    
    // Create simple test buildings
    createTestBuildings();
    
    console.log("World created with ground and buildings");
}

function createTestBuildings() {
    // Create a few simple, colorful buildings for testing
    const buildingPositions = [
        { x: 50, z: 50, color: 0xFF6B6B, size: 20 },
        { x: -50, z: 50, color: 0x4ECDC4, size: 25 },
        { x: 50, z: -50, color: 0x45B7D1, size: 18 },
        { x: -50, z: -50, color: 0xFFA07A, size: 22 },
        { x: 0, z: 100, color: 0x98D8C8, size: 30 }
    ];
    
    buildingPositions.forEach((pos, index) => {
        const building = createSimpleBuilding(pos.color, pos.size);
        building.position.set(pos.x, pos.size / 2, pos.z);
        building.userData = { buildingId: index, isOwnable: true };
        scene.add(building);
        buildingObjects.push(building);
        
        // Add collision
        const buildingBox = new THREE.Box3().setFromObject(building);
        collisionObjects.push(buildingBox);
    });
    
    console.log("Created", buildingPositions.length, "test buildings");
}

function createSimpleBuilding(color = 0x3B82F6, size = 20) {
    const buildingGroup = new THREE.Group();
    
    const geometry = new THREE.BoxGeometry(size, size, size);
    const material = new THREE.MeshLambertMaterial({ 
        color: color,
        transparent: false
    });
    
    const building = new THREE.Mesh(geometry, material);
    building.castShadow = true;
    building.receiveShadow = true;
    buildingGroup.add(building);
    
    return buildingGroup;
}

function createPlayerAvatar() {
    console.log("Creating player avatar...");
    
    const avatarGroup = new THREE.Group();
    
    // Choose color based on selected avatar
    const boardColor = selectedAvatar === 'boy' ? 0xEF4444 : 0xEC4899;
    const bodyColor = selectedAvatar === 'boy' ? 0x3B82F6 : 0x8B5CF6;
    
    // Hoverboard
    const boardGeometry = new THREE.BoxGeometry(6, 0.5, 3);
    const boardMaterial = new THREE.MeshLambertMaterial({ 
        color: boardColor
    });
    const hoverBoard = new THREE.Mesh(boardGeometry, boardMaterial);
    hoverBoard.castShadow = true;
    avatarGroup.add(hoverBoard);
    
    // Player body
    const bodyGeometry = new THREE.CapsuleGeometry(1, 2, 4, 8);
    const bodyMaterial = new THREE.MeshLambertMaterial({ 
        color: bodyColor
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 2.5;
    body.castShadow = true;
    avatarGroup.add(body);
    
    avatarGroup.position.set(0, hoverHeight, 0);
    scene.add(avatarGroup);
    playerAvatar = avatarGroup;
    
    console.log("Player avatar created at:", playerAvatar.position);
    return avatarGroup;
}

function updateThirdPersonCamera() {
    if (!playerAvatar) return;
    
    cameraAngle += (targetCameraAngle - cameraAngle) * 0.1;
    
    const cameraOffset = new THREE.Vector3(
        Math.sin(cameraAngle) * cameraDistance,
        cameraHeight,
        Math.cos(cameraAngle) * cameraDistance
    );
    
    camera.position.copy(playerAvatar.position).add(cameraOffset);
    camera.lookAt(playerAvatar.position);
}

function onWindowResize() {
    if (!camera || !renderer) return;
    
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

/* ==============================
   SIDEBAR SYSTEM - FIXED
============================== */

function initSidebar() {
    console.log("Initializing sidebar...");
    
    const sidebar = document.getElementById('sidebar');
    const toggleButton = document.getElementById('sidebar-toggle');
    const modalOverlay = document.querySelector('.modal-overlay');
    
    // Make sure sidebar toggle is visible and clickable
    toggleButton.style.display = 'flex';
    toggleButton.style.zIndex = '1000';
    
    toggleButton.addEventListener('click', (e) => {
        e.stopPropagation();
        const isActive = sidebar.classList.toggle('active');
        canMove = !isActive;
        
        if (modalOverlay) {
            modalOverlay.classList.toggle('active', isActive);
        }
        
        console.log("Sidebar toggled, active:", isActive);
    });
    
    document.addEventListener('click', (e) => {
        if (sidebar.classList.contains('active') && 
            !sidebar.contains(e.target) && 
            e.target !== toggleButton) {
            sidebar.classList.remove('active');
            canMove = true;
            if (modalOverlay) {
                modalOverlay.classList.remove('active');
            }
        }
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sidebar.classList.contains('active')) {
            sidebar.classList.remove('active');
            canMove = true;
            if (modalOverlay) {
                modalOverlay.classList.remove('active');
            }
        }
    });
    
    // Initialize stats
    initStatsTracking();
    
    console.log("Sidebar initialized");
}

function initStatsTracking() {
    let playTime = 0;
    let distanceTraveled = 0;
    let lastPosition = playerAvatar ? playerAvatar.position.clone() : new THREE.Vector3();
    
    setInterval(() => {
        playTime++;
        const playTimeElement = document.getElementById('play-time');
        if (playTimeElement) {
            playTimeElement.textContent = playTime + 'm';
        }
        
        if (playerAvatar) {
            const currentPosition = playerAvatar.position.clone();
            distanceTraveled += currentPosition.distanceTo(lastPosition);
            lastPosition.copy(currentPosition);
            const distanceElement = document.getElementById('distance-traveled');
            if (distanceElement) {
                distanceElement.textContent = Math.round(distanceTraveled) + 'm';
            }
        }
    }, 60000);
}

/* ==============================
   ASSISTANT BOTS SYSTEM (Simplified)
============================== */

class AssistantBot {
    constructor(name, position) {
        this.name = name;
        this.position = position;
        this.knowledgeBase = this.initializeKnowledgeBase();
        this.isActive = true;
        this.mesh = null;
    }

    initializeKnowledgeBase() {
        return {
            "hello": "Hello! I'm " + this.name + ", your assistant bot. How can I help you today?",
            "help": "I can help you with game controls, building purchases, and token management!",
            "default": "I'm not sure about that. Try asking about game controls or building purchases."
        };
    }

    processMessage(message) {
        const lowerMessage = message.toLowerCase().trim();
        
        if (this.knowledgeBase[lowerMessage]) {
            return this.knowledgeBase[lowerMessage];
        } else if (lowerMessage.includes("hello") || lowerMessage.includes("hi")) {
            return this.knowledgeBase["hello"];
        } else if (lowerMessage.includes("help")) {
            return this.knowledgeBase["help"];
        }
        
        return this.knowledgeBase["default"];
    }

    createVisual() {
        const botGroup = new THREE.Group();
        
        // Simple bot body
        const bodyGeometry = new THREE.CylinderGeometry(2, 2, 4, 8);
        const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0x3B82F6 });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.castShadow = true;
        botGroup.add(body);

        // Bot head
        const headGeometry = new THREE.SphereGeometry(1.5, 8, 8);
        const headMaterial = new THREE.MeshLambertMaterial({ color: 0x60A5FA });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 2.5;
        head.castShadow = true;
        botGroup.add(head);

        botGroup.position.copy(this.position);
        botGroup.userData = {
            isBot: true,
            botName: this.name,
            botInstance: this
        };

        this.mesh = botGroup;
        scene.add(botGroup);
        botObjects.push(botGroup);

        return botGroup;
    }
}

function initializeAssistantBots() {
    console.log("Initializing assistant bots...");
    
    // Create two simple bots
    const bot1 = new AssistantBot("Alex", new THREE.Vector3(30, 2, 30));
    const bot2 = new AssistantBot("Sam", new THREE.Vector3(-30, 2, -30));
    
    assistantBots.set("Alex", bot1);
    assistantBots.set("Sam", bot2);
    
    // Create visual representations
    bot1.createVisual();
    bot2.createVisual();
    
    console.log("Assistant bots initialized");
}

function checkBotInteraction() {
    if (!playerAvatar) return;
    
    let closestBot = null;
    let closestDistance = Infinity;
    
    botObjects.forEach(bot => {
        const distance = bot.position.distanceTo(playerAvatar.position);
        
        if (distance < 20 && distance < closestDistance) {
            closestDistance = distance;
            closestBot = bot;
        }
    });
    
    if (closestBot) {
        const instructions = document.getElementById('instructions');
        if (instructions) {
            instructions.innerHTML = '<div>Press E to talk with ' + closestBot.userData.botName + '</div>' + 
                                   '<div>WASD to move, mouse to look around</div>';
        }
    }
}

function setupBotChatSystem() {
    const sendBtn = document.getElementById('bot-chat-send');
    const input = document.getElementById('bot-chat-input');
    const closeBtn = document.getElementById('close-bot-chat');
    
    if (sendBtn) {
        sendBtn.addEventListener('click', sendUserMessage);
    }
    
    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendUserMessage();
            }
        });
    }
    
    if (closeBtn) {
        closeBtn.addEventListener('click', closeBotChatModal);
    }
}

function openBotChatModal(botName, botInstance) {
    currentBotInteraction = { name: botName, instance: botInstance };
    document.getElementById('bot-chat-modal').style.display = 'block';
}

function closeBotChatModal() {
    document.getElementById('bot-chat-modal').style.display = 'none';
    currentBotInteraction = null;
}

function sendUserMessage() {
    if (!currentBotInteraction) return;
    
    const userInput = document.getElementById('bot-chat-input');
    const message = userInput.value.trim();
    
    if (!message) return;
    
    userInput.value = '';
    const response = currentBotInteraction.instance.processMessage(message);
    
    // Simulate bot response
    setTimeout(() => {
        console.log(currentBotInteraction.name + ":", response);
    }, 500);
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
    playerStats.gameTokens = 100;
    updateTokenDisplay();
}

function updateTokenDisplay() {
    document.getElementById('token-balance').textContent = playerStats.gameTokens;
    document.getElementById('building-token-balance').textContent = playerStats.gameTokens;
    document.getElementById('bullet-token-balance').textContent = playerStats.gameTokens;
    document.getElementById('transfer-token-balance').textContent = playerStats.gameTokens;
}

async function addTokens(amount) {
    playerStats.gameTokens += amount;
    updateTokenDisplay();
}

async function removeTokens(amount) {
    if (playerStats.gameTokens < amount) {
        throw new Error(`Insufficient tokens`);
    }
    playerStats.gameTokens -= amount;
    updateTokenDisplay();
}

function setupTokenTransfer() {
    const transferBtn = document.getElementById('transfer-token-btn-sidebar');
    if (transferBtn) {
        transferBtn.addEventListener('click', () => {
            document.getElementById('token-transfer-modal').style.display = 'block';
        });
    }
}

function setupTokenPurchase() {
    const purchaseBtn = document.getElementById('purchase-token-btn-sidebar');
    if (purchaseBtn) {
        purchaseBtn.addEventListener('click', () => {
            document.getElementById('token-purchase-modal').style.display = 'block';
        });
    }
}

/* ==============================
   BUILDING OWNERSHIP SYSTEM
============================== */

async function initBuildingOwnership() {
    // Mock data
    for (let i = 0; i < 5; i++) {
        buildingOwnership.set(i, {
            building_id: i,
            owner_address: null,
            owner_name: null,
            for_sale: false,
            sale_price: 0
        });
    }
    updateOwnedBuildingsDisplay();
}

function updateOwnedBuildingsDisplay() {
    const container = document.getElementById('owned-buildings-container');
    if (container) {
        container.innerHTML = '';
        ownedBuildings.forEach(building => {
            const buildingItem = document.createElement('div');
            buildingItem.className = 'owned-building-item';
            buildingItem.innerHTML = `
                <div>
                    <strong>Building ${building.building_id}</strong><br>
                    <span>Owner: ${building.owner_name || 'Unknown'}</span>
                </div>
            `;
            container.appendChild(buildingItem);
        });
        
        document.getElementById('owned-buildings-count').textContent = ownedBuildings.length;
    }
}

/* ==============================
   BULLET SYSTEM
============================== */

function setupBulletPurchaseWithTokens() {
    const buyBtn = document.getElementById('buy-500-token');
    if (buyBtn) {
        buyBtn.addEventListener('click', async () => {
            if (playerStats.gameTokens < GAME_CONFIG.BULLET_COST) {
                alert(`Need ${GAME_CONFIG.BULLET_COST} token for bullets`);
                return;
            }
            await removeTokens(GAME_CONFIG.BULLET_COST);
            playerStats.bullets += GAME_CONFIG.BULLET_AMOUNT;
            updateBulletDisplay();
            alert(`Purchased ${GAME_CONFIG.BULLET_AMOUNT} bullets!`);
        });
    }
}

function updateBulletDisplay() {
    document.getElementById('bullet-count').textContent = playerStats.bullets;
}

function shootBullet() {
    const currentTime = performance.now();
    if (currentTime - lastShotTime < shotCooldown || playerStats.bullets <= 0) {
        return;
    }
    
    playerStats.bullets--;
    updateBulletDisplay();
    lastShotTime = currentTime;
    
    // Simple bullet implementation
    const bulletGeometry = new THREE.SphereGeometry(0.3, 8, 8);
    const bulletMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFF00 });
    const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
    
    const direction = new THREE.Vector3(
        Math.sin(cameraAngle),
        -0.1,
        Math.cos(cameraAngle)
    ).normalize();
    
    bullet.position.copy(playerAvatar.position);
    bullet.position.y += 2;
    scene.add(bullet);
    
    bullets.push({
        mesh: bullet,
        velocity: direction.multiplyScalar(bulletSpeed),
        lifeTime: 2000
    });
}

function updateBullets() {
    const currentTime = performance.now();
    const delta = (currentTime - prevTime) / 1000;
    
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        bullet.mesh.position.add(bullet.velocity.clone().multiplyScalar(delta));
        bullet.lifeTime -= delta * 1000;
        
        if (bullet.lifeTime <= 0 || bullet.mesh.position.distanceTo(playerAvatar.position) > 500) {
            scene.remove(bullet.mesh);
            bullets.splice(i, 1);
        }
    }
}

/* ==============================
   CONTROLS
============================== */

function setupMobileControls() {
    // Simplified mobile controls setup
    const buttons = ['forward-btn', 'backward-btn', 'left-btn', 'right-btn', 'shoot-btn'];
    
    buttons.forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                switch(btnId) {
                    case 'forward-btn': moveForward = true; break;
                    case 'backward-btn': moveBackward = true; break;
                    case 'left-btn': moveLeft = true; break;
                    case 'right-btn': moveRight = true; break;
                    case 'shoot-btn': shootBullet(); break;
                }
            });
            
            btn.addEventListener('touchend', (e) => {
                e.preventDefault();
                switch(btnId) {
                    case 'forward-btn': moveForward = false; break;
                    case 'backward-btn': moveBackward = false; break;
                    case 'left-btn': moveLeft = false; break;
                    case 'right-btn': moveRight = false; break;
                }
            });
        }
    });
}

// Keyboard controls
document.addEventListener('keydown', (event) => {
    if (!canMove) return;
    
    switch(event.key.toLowerCase()) {
        case 'w': moveForward = true; break;
        case 's': moveBackward = true; break;
        case 'a': moveLeft = true; break;
        case 'd': moveRight = true; break;
        case ' ': shootBullet(); break;
        case 'e': 
            if (currentBotInteraction) {
                openBotChatModal(currentBotInteraction.name, currentBotInteraction.instance);
            }
            break;
    }
});

document.addEventListener('keyup', (event) => {
    switch(event.key.toLowerCase()) {
        case 'w': moveForward = false; break;
        case 's': moveBackward = false; break;
        case 'a': moveLeft = false; break;
        case 'd': moveRight = false; break;
    }
});

// Mouse look
document.addEventListener('mousemove', (event) => {
    if (!canMove) return;
    
    targetCameraAngle -= event.movementX * 0.002;
    cameraHeight = Math.max(5, Math.min(20, cameraHeight - event.movementY * 0.1));
});

/* ==============================
   COLLISION DETECTION
============================== */

function checkCollisions(newPosition) {
    if (!playerAvatar) return false;
    
    const playerCollider = new THREE.Box3().setFromCenterAndSize(newPosition, playerSize);
    
    for (let i = 0; i < collisionObjects.length; i++) {
        if (playerCollider.intersectsBox(collisionObjects[i])) {
            return true;
        }
    }
    return false;
}

/* ==============================
   MAIN GAME LOOP
============================== */

function animate() {
    requestAnimationFrame(animate);
    
    const time = performance.now();
    const delta = (time - prevTime) / 1000;
    hoverTime += delta;
    
    if (canMove && playerAvatar) {
        const moveSpeed = 30.0 * delta;
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
        
        // Hover bobbing
        const hoverBob = Math.sin(hoverTime * hoverBobSpeed) * hoverBobAmount;
        newPosition.y = hoverHeight + hoverBob;
        
        // Simple collision detection
        if (!checkCollisions(newPosition)) {
            playerAvatar.position.copy(newPosition);
        }
        
        // World boundaries
        const boundary = 200;
        playerAvatar.position.x = Math.max(-boundary, Math.min(boundary, playerAvatar.position.x));
        playerAvatar.position.z = Math.max(-boundary, Math.min(boundary, playerAvatar.position.z));
    }
    
    // Update camera
    updateThirdPersonCamera();
    
    // Update bullets
    updateBullets();
    
    // Animate bots
    botObjects.forEach(bot => {
        if (bot.userData) {
            const bob = Math.sin(hoverTime * 1.5) * 0.2;
            bot.position.y = bot.userData.botInstance.position.y + bob;
            bot.rotation.y += 0.01;
        }
    });
    
    // Render scene
    if (scene && camera) {
        renderer.render(scene, camera);
    }
    
    prevTime = time;
}

console.log("NFT Shooter Universe loaded successfully!");
