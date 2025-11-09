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
  gameTokens: 0
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

// World settings
let worldSize = 1500;
let worldBoundary = worldSize / 2 - 50;

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
let bridgeSegments = [];
let playerSize = new THREE.Vector3(10, 2, 10);

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
   ASSISTANT BOTS SYSTEM
============================== */

class AssistantBot {
    constructor(name, position) {
        this.name = name;
        this.position = position;
        this.knowledgeBase = this.initializeKnowledgeBase();
        this.isActive = true;
        this.mesh = null;
        this.responseCooldown = false;
    }

    initializeKnowledgeBase() {
        return {
            "hello": "Hello! I'm " + this.name + ", your assistant bot. How can I help you today?",
            "help": "I can help you with: building purchases, token management, NFT trading, and game navigation. Just ask me anything!",
            "time": "The current time is: " + new Date().toLocaleTimeString(),
            "weather": "I don't have real-time weather data, but in our virtual world, it's always perfect for exploring!",
            "building": "You can purchase buildings for " + GAME_CONFIG.BUILDING_BASE_COST + " tokens. Approach any available building and press E to interact.",
            "tokens": "Game tokens can be used to purchase buildings (250 tokens) or bullets (1 token = 500 bullets). You can also convert tokens to real NFTs.",
            "nft": "NFTs in this world represent digital assets. You can buy, sell, or transfer them. Look for floating NFT displays around the city.",
            "bullets": "Bullets cost 1 token for 500 bullets. Use them to interact with the environment and earn points by hitting NFT targets.",
            "multiplayer": "You can see other players in the world and chat with them using the T key or sidebar chat.",
            "controls": isMobile ? 
                "Mobile: Use touch controls to move and look around. Tap buttons to interact." :
                "Desktop: WASD to move, mouse to look, SPACE to shoot, E to interact, T to chat, B to buy bullets.",
            "joke": "Why don't scientists trust atoms? Because they make up everything!",
            "bye": "Goodbye! Feel free to ask me anything anytime. Happy exploring!",
            "default": "I'm not sure about that. Try asking about: buildings, tokens, NFTs, bullets, controls, or say 'help' for more options."
        };
    }

    processMessage(message) {
        if (this.responseCooldown) {
            return "Please wait a moment before asking another question...";
        }

        const lowerMessage = message.toLowerCase().trim();
        
        // Set cooldown
        this.responseCooldown = true;
        setTimeout(() => {
            this.responseCooldown = false;
        }, 2000);

        // Check for exact matches
        if (this.knowledgeBase[lowerMessage]) {
            return this.knowledgeBase[lowerMessage];
        }

        // Check for keywords
        if (lowerMessage.includes("hello") || lowerMessage.includes("hi") || lowerMessage.includes("hey")) {
            return this.knowledgeBase["hello"];
        } else if (lowerMessage.includes("help")) {
            return this.knowledgeBase["help"];
        } else if (lowerMessage.includes("time")) {
            return this.knowledgeBase["time"];
        } else if (lowerMessage.includes("weather")) {
            return this.knowledgeBase["weather"];
        } else if (lowerMessage.includes("building") || lowerMessage.includes("purchase") || lowerMessage.includes("buy")) {
            return this.knowledgeBase["building"];
        } else if (lowerMessage.includes("token") || lowerMessage.includes("currency") || lowerMessage.includes("money")) {
            return this.knowledgeBase["tokens"];
        } else if (lowerMessage.includes("nft") || lowerMessage.includes("crypto") || lowerMessage.includes("digital")) {
            return this.knowledgeBase["nft"];
        } else if (lowerMessage.includes("bullet") || lowerMessage.includes("shoot") || lowerMessage.includes("ammo")) {
            return this.knowledgeBase["bullets"];
        } else if (lowerMessage.includes("multiplayer") || lowerMessage.includes("player") || lowerMessage.includes("chat")) {
            return this.knowledgeBase["multiplayer"];
        } else if (lowerMessage.includes("control") || lowerMessage.includes("move") || lowerMessage.includes("how to")) {
            return this.knowledgeBase["controls"];
        } else if (lowerMessage.includes("joke") || lowerMessage.includes("funny") || lowerMessage.includes("laugh")) {
            return this.knowledgeBase["joke"];
        } else if (lowerMessage.includes("bye") || lowerMessage.includes("goodbye") || lowerMessage.includes("exit")) {
            return this.knowledgeBase["bye"];
        }

        return this.knowledgeBase["default"];
    }

    createVisual() {
        const botGroup = new THREE.Group();
        
        // Main body
        const bodyGeometry = new THREE.CylinderGeometry(3, 3, 6, 8);
        const bodyMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x3B82F6,
            metalness: 0.7,
            roughness: 0.3
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.castShadow = true;
        body.receiveShadow = true;
        botGroup.add(body);

        // Head
        const headGeometry = new THREE.SphereGeometry(2.5, 8, 8);
        const headMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x60A5FA,
            metalness: 0.8,
            roughness: 0.2
        });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 4;
        head.castShadow = true;
        botGroup.add(head);

        // Glowing eyes
        const eyeGeometry = new THREE.SphereGeometry(0.5, 6, 6);
        const eyeMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x00FF00,
            emissive: 0x00FF00
        });
        
        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(-0.8, 4.5, 2.2);
        botGroup.add(leftEye);
        
        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        rightEye.position.set(0.8, 4.5, 2.2);
        botGroup.add(rightEye);

        // Platform
        const platformGeometry = new THREE.CylinderGeometry(4, 4, 1, 8);
        const platformMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x1F2937,
            transparent: true,
            opacity: 0.8
        });
        const platform = new THREE.Mesh(platformGeometry, platformMaterial);
        platform.position.y = -3.5;
        platform.receiveShadow = true;
        botGroup.add(platform);

        botGroup.position.copy(this.position);
        botGroup.userData = {
            isBot: true,
            botName: this.name,
            botInstance: this
        };

        this.mesh = botGroup;
        scene.add(botGroup);
        botObjects.push(botGroup);

        // Add to collision objects
        const botBox = new THREE.Box3().setFromObject(botGroup);
        collisionObjects.push(botBox);

        return botGroup;
    }

    showResponse(message) {
        if (this.mesh) {
            // Create floating response text
            this.createFloatingText(message);
        }
    }

    createFloatingText(message) {
        const words = message.split(' ');
        const lines = [];
        let currentLine = '';
        
        // Simple text wrapping
        words.forEach(word => {
            if ((currentLine + word).length < 30) {
                currentLine += (currentLine ? ' ' : '') + word;
            } else {
                lines.push(currentLine);
                currentLine = word;
            }
        });
        if (currentLine) lines.push(currentLine);
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 512;
        canvas.height = 64 + (lines.length - 1) * 25;
        
        // Background
        context.fillStyle = 'rgba(59, 130, 246, 0.9)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        // Border
        context.strokeStyle = '#FFFFFF';
        context.lineWidth = 3;
        context.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
        
        // Text
        context.font = '16px Arial';
        context.fillStyle = '#FFFFFF';
        context.textAlign = 'center';
        
        lines.forEach((line, index) => {
            context.fillText(line, canvas.width / 2, 30 + index * 25);
        });
        
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ 
            map: texture,
            transparent: true
        });
        const sprite = new THREE.Sprite(material);
        
        sprite.position.set(
            this.position.x,
            this.position.y + 12,
            this.position.z
        );
        sprite.scale.set(25, 3 + (lines.length - 1) * 1.5, 1);
        
        scene.add(sprite);
        
        // Remove after 5 seconds
        setTimeout(() => {
            scene.remove(sprite);
        }, 5000);
    }
}

function initializeAssistantBots() {
    // Create two assistant bots at strategic locations
    const bot1 = new AssistantBot("Alex", new THREE.Vector3(0, 5, -200));
    const bot2 = new AssistantBot("Sam", new THREE.Vector3(200, 5, 0));
    
    assistantBots.set("Alex", bot1);
    assistantBots.set("Sam", bot2);
    
    // Create visual representations
    bot1.createVisual();
    bot2.createVisual();
    
    console.log("Assistant bots initialized: Alex and Sam");
}

function checkBotInteraction() {
    botObjects.forEach(bot => {
        if (bot.userData.originalEmissive !== undefined) {
            bot.children[0].material.emissive.setHex(bot.userData.originalEmissive);
        }
    });
    
    let closestBot = null;
    let closestDistance = Infinity;
    
    botObjects.forEach(bot => {
        const distance = bot.position.distanceTo(playerAvatar.position);
        
        if (distance < 25 && distance < closestDistance) {
            closestDistance = distance;
            closestBot = bot;
        }
    });
    
    if (closestBot) {
        closestBot.userData.originalEmissive = closestBot.children[0].material.emissive.getHex();
        closestBot.children[0].material.emissive.setHex(0xf59e0b);
        
        const instructions = document.getElementById('instructions');
        const originalContent = instructions.innerHTML;
        instructions.innerHTML = '<div>Press E to talk with ' + closestBot.userData.botName + '</div>' + originalContent;
        
        const interactKeyHandler = (e) => {
            if ((e.key === 'e' || e.key === 'E') && canMove) {
                openBotChatModal(closestBot.userData.botName, closestBot.userData.botInstance);
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

function openBotChatModal(botName, botInstance) {
    currentBotInteraction = { name: botName, instance: botInstance };
    
    const botChatModal = document.getElementById('bot-chat-modal');
    const botMessages = document.getElementById('bot-messages');
    
    botMessages.innerHTML = '';
    
    // Add welcome message
    addBotMessage(botName, botInstance.knowledgeBase["hello"]);
    
    botChatModal.style.display = 'block';
    document.getElementById('bot-chat-input').focus();
}

function closeBotChatModal() {
    document.getElementById('bot-chat-modal').style.display = 'none';
    currentBotInteraction = null;
    
    if (botResponseTimeout) {
        clearTimeout(botResponseTimeout);
        botResponseTimeout = null;
    }
}

function sendUserMessage() {
    if (!currentBotInteraction) return;
    
    const userInput = document.getElementById('bot-chat-input');
    const message = userInput.value.trim();
    
    if (!message) return;
    
    // Add user message to chat
    addUserMessage(message);
    userInput.value = '';
    
    // Get bot response
    const response = currentBotInteraction.instance.processMessage(message);
    
    // Show response in world
    currentBotInteraction.instance.showResponse(response);
    
    // Add bot response to chat after a short delay
    botResponseTimeout = setTimeout(() => {
        addBotMessage(currentBotInteraction.name, response);
    }, 1000);
}

function addUserMessage(message) {
    const messagesContainer = document.getElementById('bot-messages');
    const messageElement = document.createElement('div');
    messageElement.className = 'message user-message';
    messageElement.innerHTML = `
        <div class="message-sender">You:</div>
        <div class="message-text">${message}</div>
    `;
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function addBotMessage(botName, message) {
    const messagesContainer = document.getElementById('bot-messages');
    const messageElement = document.createElement('div');
    messageElement.className = 'message bot-message';
    messageElement.innerHTML = `
        <div class="message-sender">${botName}:</div>
        <div class="message-text">${message}</div>
    `;
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Set up bot chat event listeners
function setupBotChatSystem() {
    document.getElementById('bot-chat-send').addEventListener('click', sendUserMessage);
    document.getElementById('bot-chat-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendUserMessage();
        }
    });
    document.getElementById('close-bot-chat').addEventListener('click', closeBotChatModal);
    
    // Bot selection
    document.querySelectorAll('.bot-option').forEach(option => {
        option.addEventListener('click', () => {
            const botName = option.getAttribute('data-bot');
            const botInstance = assistantBots.get(botName);
            if (botInstance) {
                openBotChatModal(botName, botInstance);
            }
        });
    });
}

/* ==============================
   INITIALIZATION
============================== */

// Check authentication on load
document.addEventListener('DOMContentLoaded', function() {
    client.auth.getSession().then(({ data }) => {
        if (!data.session) {
            console.log("User not signed in - restricting free roam access");
        } else {
            console.log("User signed in - free roam enabled");
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
    
    // Initialize avatar selection
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
    console.log("Starting game with avatar:", selectedAvatar);
    
    // Hide avatar selection
    document.getElementById('avatar-selection').style.display = 'none';
    
    // Initialize sidebar
    initSidebar();
    
    // Initialize simplified multiplayer
    multiplayer = {
        playerName: 'Player',
        playerColor: Math.random() * 0xFFFFFF,
        sendPositionUpdate: function() {
            // Mock multiplayer position updates
        }
    };
    
    // Set player name from input
    const nameInput = document.getElementById('player-name');
    if (nameInput && nameInput.value.trim()) {
        multiplayer.playerName = nameInput.value.trim();
    }
    
    // Initialize game systems
    init3DScene();
    initializeAssistantBots();
    initTokenSystem();
    initBuildingOwnership();
    setupBulletPurchaseWithTokens();
    
    // Start game loop
    animate();
    
    // Start bot interaction checking
    setInterval(() => {
        if (canMove && playerAvatar) {
            checkBotInteraction();
        }
    }, 500);
    
    console.log("Game started successfully!");
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
        playerStats.gameTokens = 100; // Start with some tokens for testing
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
}

async function addTokens(amount) {
    playerStats.gameTokens += amount;
    updateTokenDisplay();
    console.log(`Added ${amount} tokens to player balance. New balance: ${playerStats.gameTokens}`);
}

async function removeTokens(amount) {
    if (playerStats.gameTokens < amount) {
        throw new Error(`Insufficient token balance. Required: ${amount}, Available: ${playerStats.gameTokens}`);
    }
    
    playerStats.gameTokens -= amount;
    updateTokenDisplay();
    console.log(`Removed ${amount} tokens from player balance. New balance: ${playerStats.gameTokens}`);
}

function setupTokenTransfer() {
    document.getElementById('transfer-token-btn-sidebar').addEventListener('click', () => {
        document.getElementById('token-transfer-modal').style.display = 'block';
    });
    
    document.getElementById('transfer-token-confirm').addEventListener('click', async () => {
        const amount = parseInt(document.getElementById('transfer-amount').value);
        
        if (!amount || amount < GAME_CONFIG.MIN_TRANSFER) {
            alert(`Minimum transfer amount is ${GAME_CONFIG.MIN_TRANSFER} tokens`);
            return;
        }
        
        if (amount > playerStats.gameTokens) {
            alert('Insufficient token balance');
            return;
        }
        
        try {
            await removeTokens(amount);
            alert(`Successfully converted ${amount} tokens to NFTs!`);
            document.getElementById('token-transfer-modal').style.display = 'none';
        } catch (err) {
            alert('Failed to transfer tokens: ' + err.message);
        }
    });
    
    document.getElementById('close-transfer-modal').addEventListener('click', () => {
        document.getElementById('token-transfer-modal').style.display = 'none';
    });
}

function setupTokenPurchase() {
    document.getElementById('purchase-token-btn-sidebar').addEventListener('click', () => {
        document.getElementById('token-purchase-modal').style.display = 'block';
    });
    
    document.getElementById('buy-250-token').addEventListener('click', async () => {
        try {
            await addTokens(250);
            alert('Successfully purchased 250 game tokens!');
            document.getElementById('token-purchase-modal').style.display = 'none';
        } catch (err) {
            alert('Failed to purchase tokens: ' + err.message);
        }
    });
    
    document.getElementById('close-token-purchase-modal').addEventListener('click', () => {
        document.getElementById('token-purchase-modal').style.display = 'none';
    });
}

/* ==============================
   BUILDING OWNERSHIP SYSTEM
============================== */

async function initBuildingOwnership() {
    // Mock building ownership data
    try {
        for (let i = 0; i < 10; i++) {
            buildingOwnership.set(i, {
                building_id: i,
                owner_address: null,
                owner_name: null,
                for_sale: false,
                sale_price: 0
            });
        }
        updateOwnedBuildingsDisplay();
    } catch (err) {
        console.error("Failed to load building ownership:", err);
    }
}

function updateOwnedBuildingsDisplay() {
    const container = document.getElementById('owned-buildings-container');
    container.innerHTML = '';
    
    ownedBuildings.forEach(building => {
        const buildingItem = document.createElement('div');
        buildingItem.className = 'owned-building-item';
        buildingItem.innerHTML = `
            <div>
                <strong>Building ${building.building_id}</strong><br>
                <span>Owner: ${building.owner_name || 'Unknown'}</span>
            </div>
            <div>
                <span>${building.for_sale ? 'For Sale: ' + building.sale_price + ' tokens' : 'Not for sale'}</span>
            </div>
        `;
        container.appendChild(buildingItem);
    });
    
    document.getElementById('owned-buildings-count').textContent = ownedBuildings.length;
}

/* ==============================
   BULLET SYSTEM WITH TOKENS
============================== */

function setupBulletPurchaseWithTokens() {
    document.getElementById('buy-500-token').addEventListener('click', async () => {
        if (playerStats.gameTokens < GAME_CONFIG.BULLET_COST) {
            alert(`You need at least ${GAME_CONFIG.BULLET_COST} token to purchase bullets`);
            return;
        }
        
        try {
            await removeTokens(GAME_CONFIG.BULLET_COST);
            playerStats.bullets += GAME_CONFIG.BULLET_AMOUNT;
            updateBulletDisplay();
            document.getElementById('bullet-modal').style.display = 'none';
            alert(`Purchased ${GAME_CONFIG.BULLET_AMOUNT} bullets!`);
        } catch (err) {
            alert('Failed to purchase bullets: ' + err.message);
        }
    });
}

function updateBulletDisplay() {
    document.getElementById('bullet-count').textContent = playerStats.bullets;
}

/* ==============================
   SIDEBAR SYSTEM
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
    let lastPosition = playerAvatar ? playerAvatar.position.clone() : new THREE.Vector3();
    
    setInterval(() => {
        playTime++;
        document.getElementById('play-time').textContent = playTime + 'm';
        
        if (playerAvatar) {
            const currentPosition = playerAvatar.position.clone();
            distanceTraveled += currentPosition.distanceTo(lastPosition);
            lastPosition.copy(currentPosition);
            document.getElementById('distance-traveled').textContent = Math.round(distanceTraveled) + 'm';
        }
    }, 60000);
}

/* ==============================
   3D SCENE SETUP
============================== */

function init3DScene() {
    console.log("Initializing 3D scene...");
    
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Sky blue background
    scene.fog = new THREE.Fog(0x87CEEB, 100, 2000);
    
    // Create camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 5000);
    camera.position.set(0, 15, 25);
    
    // Create renderer
    renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        alpha: true 
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    const canvasContainer = document.getElementById('canvas-container');
    canvasContainer.innerHTML = ''; // Clear any existing canvas
    canvasContainer.appendChild(renderer.domElement);
    
    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(100, 200, 100);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);
    
    // Create world
    createWorld();
    
    // Create player avatar
    createPlayerAvatar();
    
    // Set up window resize handler
    window.addEventListener('resize', onWindowResize);
    
    console.log("3D scene initialized successfully");
}

function createWorld() {
    // Create ground
    const groundGeometry = new THREE.PlaneGeometry(worldSize, worldSize);
    const groundMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x4ADE80, // Green ground
        side: THREE.DoubleSide
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    
    // Create a simple city grid for testing
    createSimpleCity();
    
    // Create central area
    createCentralArea();
}

function createSimpleCity() {
    // Create some basic buildings
    for (let i = -5; i <= 5; i++) {
        for (let j = -5; j <= 5; j++) {
            if (i === 0 && j === 0) continue; // Skip center
            
            const building = createSimpleBuilding();
            building.position.set(i * 80, 0, j * 80);
            scene.add(building);
            buildingObjects.push(building);
            
            // Add collision
            const buildingBox = new THREE.Box3().setFromObject(building);
            collisionObjects.push(buildingBox);
        }
    }
}

function createSimpleBuilding() {
    const buildingGroup = new THREE.Group();
    
    const width = 15 + Math.random() * 10;
    const depth = 15 + Math.random() * 10;
    const height = 20 + Math.random() * 30;
    
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshStandardMaterial({ 
        color: Math.random() * 0xFFFFFF,
        metalness: 0.3,
        roughness: 0.7
    });
    
    const building = new THREE.Mesh(geometry, material);
    building.position.y = height / 2;
    building.castShadow = true;
    building.receiveShadow = true;
    buildingGroup.add(building);
    
    return buildingGroup;
}

function createCentralArea() {
    // Create a central platform
    const platformGeometry = new THREE.CylinderGeometry(100, 100, 2, 32);
    const platformMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xF59E0B, // Orange platform
        metalness: 0.2,
        roughness: 0.8
    });
    const platform = new THREE.Mesh(platformGeometry, platformMaterial);
    platform.position.y = 1;
    platform.receiveShadow = true;
    scene.add(platform);
    
    // Add some decorative elements
    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const x = Math.cos(angle) * 80;
        const z = Math.sin(angle) * 80;
        
        const pillar = createPillar();
        pillar.position.set(x, 0, z);
        scene.add(pillar);
    }
}

function createPillar() {
    const pillarGroup = new THREE.Group();
    
    const geometry = new THREE.CylinderGeometry(2, 2, 15, 8);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0x3B82F6,
        metalness: 0.8,
        roughness: 0.2
    });
    
    const pillar = new THREE.Mesh(geometry, material);
    pillar.position.y = 7.5;
    pillar.castShadow = true;
    pillarGroup.add(pillar);
    
    return pillarGroup;
}

function createPlayerAvatar() {
    const avatarGroup = new THREE.Group();
    
    // Hoverboard base
    const boardGeometry = new THREE.BoxGeometry(6, 0.3, 3);
    const boardMaterial = new THREE.MeshStandardMaterial({ 
        color: selectedAvatar === 'boy' ? 0xEF4444 : 0xEC4899, // Red for boy, pink for girl
        metalness: 0.8,
        roughness: 0.2
    });
    const hoverBoard = new THREE.Mesh(boardGeometry, boardMaterial);
    hoverBoard.castShadow = true;
    avatarGroup.add(hoverBoard);
    
    // Player body (simplified)
    const bodyGeometry = new THREE.CapsuleGeometry(1.2, 2.5, 4, 8);
    const bodyMaterial = new THREE.MeshStandardMaterial({ 
        color: selectedAvatar === 'boy' ? 0x3B82F6 : 0x8B5CF6, // Blue for boy, purple for girl
        metalness: 0.3,
        roughness: 0.7
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 2;
    body.castShadow = true;
    avatarGroup.add(body);
    
    avatarGroup.position.set(0, hoverHeight, 0);
    scene.add(avatarGroup);
    playerAvatar = avatarGroup;
    
    console.log("Player avatar created at position:", playerAvatar.position);
    
    return avatarGroup;
}

function updateThirdPersonCamera() {
    cameraAngle += (targetCameraAngle - cameraAngle) * 0.1;
    
    const cameraOffset = new THREE.Vector3(
        Math.sin(cameraAngle) * cameraDistance,
        cameraHeight,
        Math.cos(cameraAngle) * cameraDistance
    );
    
    if (playerAvatar) {
        camera.position.copy(playerAvatar.position).add(cameraOffset);
        camera.lookAt(playerAvatar.position);
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function checkCollisions(newPosition) {
    const playerCollider = new THREE.Box3().setFromCenterAndSize(newPosition, playerSize);
    
    for (let i = 0; i < collisionObjects.length; i++) {
        if (playerCollider.intersectsBox(collisionObjects[i])) {
            return true;
        }
    }
    return false;
}

function setupMobileControls() {
    const forwardBtn = document.getElementById('forward-btn');
    const backwardBtn = document.getElementById('backward-btn');
    const leftBtn = document.getElementById('left-btn');
    const rightBtn = document.getElementById('right-btn');
    const shootBtn = document.getElementById('shoot-btn');
    const lookControls = document.getElementById('look-controls');
    
    // Movement controls
    const setMoveState = (direction, state) => {
        switch(direction) {
            case 'forward': moveForward = state; break;
            case 'backward': moveBackward = state; break;
            case 'left': moveLeft = state; break;
            case 'right': moveRight = state; break;
        }
    };
    
    const addTouchListeners = (element, direction) => {
        element.addEventListener('touchstart', (e) => { 
            e.preventDefault(); 
            setMoveState(direction, true); 
        });
        element.addEventListener('touchend', (e) => { 
            e.preventDefault(); 
            setMoveState(direction, false); 
        });
        element.addEventListener('touchcancel', (e) => { 
            e.preventDefault(); 
            setMoveState(direction, false); 
        });
    };
    
    addTouchListeners(forwardBtn, 'forward');
    addTouchListeners(backwardBtn, 'backward');
    addTouchListeners(leftBtn, 'left');
    addTouchListeners(rightBtn, 'right');
    
    // Shooting
    shootBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (canMove) {
            shootBullet();
        }
    });
    
    // Look controls
    lookControls.addEventListener('touchstart', (e) => {
        if (lookTouchId === null) {
            const touch = e.touches[0];
            lookTouchId = touch.identifier;
            lookStartX = touch.clientX;
            lookStartY = touch.clientY;
        }
    });
    
    lookControls.addEventListener('touchmove', (e) => {
        for (let i = 0; i < e.touches.length; i++) {
            const touch = e.touches[i];
            if (touch.identifier === lookTouchId) {
                lookX = touch.clientX - lookStartX;
                lookY = touch.clientY - lookStartY;
                lookStartX = touch.clientX;
                lookStartY = touch.clientY;
                break;
            }
        }
    });
    
    lookControls.addEventListener('touchend', (e) => {
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

function shootBullet() {
    const currentTime = performance.now();
    if (currentTime - lastShotTime < shotCooldown || playerStats.bullets <= 0) {
        return;
    }
    
    playerStats.bullets--;
    updateBulletDisplay();
    lastShotTime = currentTime;
    
    // Create bullet
    const bulletGeometry = new THREE.SphereGeometry(0.3, 8, 8);
    const bulletMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFF00 });
    const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
    
    const direction = new THREE.Vector3(
        Math.sin(cameraAngle),
        -0.1, // Slightly downward
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
        
        if (bullet.lifeTime <= 0 || 
            bullet.mesh.position.distanceTo(playerAvatar.position) > 500) {
            scene.remove(bullet.mesh);
            bullets.splice(i, 1);
        }
    }
}

/* ==============================
   KEYBOARD CONTROLS
============================== */

document.addEventListener('keydown', (event) => {
    if (!canMove) return;
    
    switch(event.key.toLowerCase()) {
        case 'w':
            moveForward = true;
            break;
        case 's':
            moveBackward = true;
            break;
        case 'a':
            moveLeft = true;
            break;
        case 'd':
            moveRight = true;
            break;
        case ' ':
            if (canJump) {
                velocity.y = 15;
                canJump = false;
            }
            break;
        case ' ':
            shootBullet();
            break;
    }
});

document.addEventListener('keyup', (event) => {
    switch(event.key.toLowerCase()) {
        case 'w':
            moveForward = false;
            break;
        case 's':
            moveBackward = false;
            break;
        case 'a':
            moveLeft = false;
            break;
        case 'd':
            moveRight = false;
            break;
    }
});

// Mouse look (simplified)
let mouseX = 0, mouseY = 0;
document.addEventListener('mousemove', (event) => {
    if (!canMove) return;
    
    mouseX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
    mouseY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;
    
    targetCameraAngle -= mouseX * 0.002;
    cameraHeight = Math.max(5, Math.min(20, cameraHeight - mouseY * 0.1));
});

/* ==============================
   MAIN GAME LOOP
============================== */

function animate() {
    requestAnimationFrame(animate);
    
    const time = performance.now();
    const delta = (time - prevTime) / 1000;
    hoverTime += delta;
    
    if (canMove && playerAvatar) {
        const moveSpeed = 50.0 * delta;
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
        
        // Hover bobbing effect
        const hoverBob = Math.sin(hoverTime * hoverBobSpeed) * hoverBobAmount;
        newPosition.y = hoverHeight + hoverBob;
        
        // Simple gravity
        if (velocity.y !== 0) {
            velocity.y -= 9.8 * delta;
            newPosition.y += velocity.y * delta;
            
            if (newPosition.y <= hoverHeight + hoverBob && velocity.y < 0) {
                velocity.y = 0;
                canJump = true;
                newPosition.y = hoverHeight + hoverBob;
            }
        }
        
        // Check collisions
        if (!checkCollisions(newPosition)) {
            playerAvatar.position.copy(newPosition);
        }
        
        // World boundaries
        if (playerAvatar.position.x > worldBoundary) playerAvatar.position.x = worldBoundary;
        if (playerAvatar.position.x < -worldBoundary) playerAvatar.position.x = -worldBoundary;
        if (playerAvatar.position.z > worldBoundary) playerAvatar.position.z = worldBoundary;
        if (playerAvatar.position.z < -worldBoundary) playerAvatar.position.z = -worldBoundary;
    }
    
    // Mobile look controls
    if (isMobile && (lookX !== 0 || lookY !== 0) && canMove) {
        targetCameraAngle -= lookX * 0.01;
        cameraHeight = Math.max(5, Math.min(20, cameraHeight - lookY * 0.1));
        lookX = 0;
        lookY = 0;
    }
    
    // Update camera
    updateThirdPersonCamera();
    
    // Update bullets
    updateBullets();
    
    // Animate bots
    botObjects.forEach(bot => {
        if (bot.userData && bot.userData.botInstance) {
            const bob = Math.sin(hoverTime * 1.5) * 0.3;
            bot.position.y = bot.userData.botInstance.position.y + bob;
            bot.rotation.y += 0.01;
        }
    });
    
    // Render the scene
    renderer.render(scene, camera);
    
    prevTime = time;
}

// Initialize the game
console.log("NFT Shooter Universe with Assistant Bots initialized successfully!");
