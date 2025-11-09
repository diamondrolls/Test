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

// Assistant Bots System
let assistantBots = new Map();
let currentBotInteraction = null;
let botResponseTimeout = null;

// World settings
let worldSize = 1500;
let worldBoundary = worldSize / 2 - 50;

// 3D scene variables
let scene, camera, renderer, controls;
let nftObjects = [], environmentObjects = [], buildingObjects = [], botObjects = [];
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
            emissive: 0x00FF00,
            emissiveIntensity: 0.5
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

        // Name tag
        const nameTag = this.createNameTag(this.name);
        nameTag.position.y = 8;
        botGroup.add(nameTag);

        // Glow effect
        const glowGeometry = new THREE.SphereGeometry(4, 8, 8);
        const glowMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x3B82F6,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        glow.position.y = 2;
        botGroup.add(glow);

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

    createNameTag(name) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;
        
        // Background
        context.fillStyle = '#3B82F6';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        // Border
        context.strokeStyle = '#FFFFFF';
        context.lineWidth = 4;
        context.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
        
        // Text
        context.font = 'bold 20px Arial';
        context.fillStyle = '#FFFFFF';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(name, canvas.width / 2, canvas.height / 2);
        
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(12, 3, 1);
        
        return sprite;
    }

    showResponse(message) {
        if (this.mesh) {
            // Create floating response text
            this.createFloatingText(message);
            
            // Visual feedback - pulse glow
            if (this.mesh.children[5]) { // glow element
                const originalScale = this.mesh.children[5].scale.x;
                this.mesh.children[5].scale.setScalar(originalScale * 1.2);
                setTimeout(() => {
                    if (this.mesh && this.mesh.children[5]) {
                        this.mesh.children[5].scale.setScalar(originalScale);
                    }
                }, 500);
            }
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
   FREE ROAM ACCESS CONTROL
============================== */

function checkFreeRoamAccess() {
    return new Promise((resolve) => {
        client.auth.getSession().then(({ data }) => {
            if (data.session) {
                resolve(true);
            } else {
                resolve(false);
                showSignInRequiredModal();
            }
        }).catch(() => {
            resolve(false);
            showSignInRequiredModal();
        });
    });
}

function showSignInRequiredModal() {
    const modal = document.getElementById('signin-required-modal');
    if (!modal) {
        // Create modal if it doesn't exist
        const modalHTML = `
            <div id="signin-required-modal" class="modal" style="display: block; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 2000; display: flex; align-items: center; justify-content: center;">
                <div class="modal-content" style="background: white; padding: 20px; border-radius: 10px; max-width: 400px; text-align: center;">
                    <h3>Sign In Required</h3>
                    <p>You need to be signed in to access Free Roam mode.</p>
                    <p>Please sign in to explore the world freely and interact with other players.</p>
                    <div class="modal-actions" style="margin-top: 20px;">
                        <button id="go-to-signin" class="btn-primary" style="background: #3b82f6; color: white; padding: 10px 20px; border: none; border-radius: 5px; margin: 5px;">Go to Sign In</button>
                        <button id="cancel-free-roam" class="btn-secondary" style="background: #6b7280; color: white; padding: 10px 20px; border: none; border-radius: 5px; margin: 5px;">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        document.getElementById('go-to-signin').addEventListener('click', () => {
            window.location.href = 'https://diamondrolls.github.io/play/';
        });
        
        document.getElementById('cancel-free-roam').addEventListener('click', () => {
            document.getElementById('signin-required-modal').style.display = 'none';
        });
    } else {
        modal.style.display = 'block';
    }
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
    // Initialize sidebar
    initSidebar();
    
    // Initialize multiplayer (simplified version)
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
    
    // Hide avatar selection
    document.getElementById('avatar-selection').style.display = 'none';
    
    // Initialize game systems
    init3DScene();
    initializeAssistantBots(); // Initialize bots
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
    
    // Start bot interaction checking
    setInterval(() => {
        if (canMove && playerAvatar) {
            checkBotInteraction();
        }
    }, 500);
}

/* ==============================
   MODIFIED FREE ROAM FUNCTION
============================== */

async function freeRoam() {
    const hasAccess = await checkFreeRoamAccess();
    if (!hasAccess) {
        return;
    }
    
    console.log("=== Free Roam Mode ===");
    console.log("Welcome to Free Roam! You can interact with any assistant bot here.");
    console.log("Available bots: Alex, Sam");
    console.log("Type 'exit' to return to main menu.");
    console.log("You can mention a bot by name or chat freely.");
    
    // Implementation would continue here...
    // Note: The actual free roam implementation would depend on your specific game structure
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
            // Simulate token purchase
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
    // Load building ownership data
    try {
        const { data, error } = await client
            .from('building_ownership')
            .select('*');
            
        if (error) throw error;
        
        if (data) {
            data.forEach(building => {
                buildingOwnership.set(building.building_id, building);
                if (building.owner_address === account) {
                    ownedBuildings.push(building);
                }
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
   MODIFIED SIDEBAR FOR BOT ACCESS
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
    }, 60000); // Update every minute
}

/* ==============================
   3D SCENE SETUP (Modified to include bots)
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
    
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    
    window.addEventListener('resize', onWindowResize);
    initMiniMap();
    animate();
}

function createWorld() {
    // Create ground
    const groundGeometry = new THREE.PlaneGeometry(worldSize, worldSize);
    const groundMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x2D3748,
        side: THREE.DoubleSide
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    
    // Create city grid
    createCityGrid();
    
    // Create central plaza
    createCentralPlaza();
    
    // Create bridges
    createBridges();
    
    // Create buildings
    createBuildings();
}

function createCityGrid() {
    const gridSize = 20;
    const spacing = 70;
    
    for (let i = -gridSize; i <= gridSize; i++) {
        for (let j = -gridSize; j <= gridSize; j++) {
            if (Math.abs(i) <= 2 && Math.abs(j) <= 2) continue; // Skip center
            
            const building = createSimpleBuilding();
            building.position.set(i * spacing, 0, j * spacing);
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
    
    const width = 20 + Math.random() * 20;
    const depth = 20 + Math.random() * 20;
    const height = 30 + Math.random() * 70;
    
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

function createCentralPlaza() {
    const plazaGeometry = new THREE.CylinderGeometry(150, 150, 2, 32);
    const plazaMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x4B5563,
        metalness: 0.2,
        roughness: 0.8
    });
    const plaza = new THREE.Mesh(plazaGeometry, plazaMaterial);
    plaza.position.y = 1;
    plaza.receiveShadow = true;
    scene.add(plaza);
    
    // Add decorative elements
    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const x = Math.cos(angle) * 100;
        const z = Math.sin(angle) * 100;
        
        const pillar = createPillar();
        pillar.position.set(x, 0, z);
        scene.add(pillar);
    }
}

function createPillar() {
    const pillarGroup = new THREE.Group();
    
    const geometry = new THREE.CylinderGeometry(3, 3, 20, 8);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0xF59E0B,
        metalness: 0.8,
        roughness: 0.2
    });
    
    const pillar = new THREE.Mesh(geometry, material);
    pillar.position.y = 10;
    pillar.castShadow = true;
    pillarGroup.add(pillar);
    
    return pillarGroup;
}

function createBridges() {
    // Create bridge segments
    for (let i = -2; i <= 2; i++) {
        const bridgeSegment = createBridgeSegment();
        bridgeSegment.position.set(i * 50, 20, 0);
        scene.add(bridgeSegment);
        bridgeSegments.push(bridgeSegment);
        
        // Add collision for bridge
        const bridgeBox = new THREE.Box3().setFromObject(bridgeSegment);
        collisionObjects.push(bridgeBox);
    }
}

function createBridgeSegment() {
    const segmentGroup = new THREE.Group();
    
    const geometry = new THREE.BoxGeometry(40, 2, 10);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0x78350F,
        metalness: 0.4,
        roughness: 0.6
    });
    
    const segment = new THREE.Mesh(geometry, material);
    segment.position.y = 1;
    segment.castShadow = true;
    segment.receiveShadow = true;
    segmentGroup.add(segment);
    
    return segmentGroup;
}

function createBuildings() {
    // Create special buildings with ownership capabilities
    for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI * 2;
        const radius = 300;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        
        const building = createOwnableBuilding(i);
        building.position.set(x, 0, z);
        building.rotation.y = -angle;
        scene.add(building);
        buildingObjects.push(building);
        
        // Add collision
        const buildingBox = new THREE.Box3().setFromObject(building);
        collisionObjects.push(buildingBox);
    }
}

function createOwnableBuilding(id) {
    const buildingGroup = new THREE.Group();
    buildingGroup.userData = { buildingId: id, isOwnable: true };
    
    const width = 40;
    const depth = 40;
    const height = 60;
    
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0x3B82F6,
        metalness: 0.5,
        roughness: 0.5
    });
    
    const building = new THREE.Mesh(geometry, material);
    building.position.y = height / 2;
    building.castShadow = true;
    building.receiveShadow = true;
    buildingGroup.add(building);
    
    return buildingGroup;
}

function createPlayerAvatar() {
    const avatarGroup = new THREE.Group();
    
    // Hoverboard base
    const boardGeometry = new THREE.BoxGeometry(8, 0.5, 4);
    const boardMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xEF4444,
        metalness: 0.8,
        roughness: 0.2
    });
    hoverBoard = new THREE.Mesh(boardGeometry, boardMaterial);
    hoverBoard.castShadow = true;
    avatarGroup.add(hoverBoard);
    
    // Player body (simplified)
    const bodyGeometry = new THREE.CapsuleGeometry(1.5, 3, 4, 8);
    const bodyMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x3B82F6,
        metalness: 0.3,
        roughness: 0.7
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 2.5;
    body.castShadow = true;
    avatarGroup.add(body);
    
    avatarGroup.position.set(0, hoverHeight, 0);
    scene.add(avatarGroup);
    playerAvatar = avatarGroup;
    
    return avatarGroup;
}

function updateThirdPersonCamera() {
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
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function initMiniMap() {
    miniMapScene = new THREE.Scene();
    miniMapCamera = new THREE.OrthographicCamera(-worldSize/2, worldSize/2, worldSize/2, -worldSize/2, 1, 1000);
    miniMapCamera.position.y = 500;
    miniMapCamera.lookAt(0, 0, 0);
    
    const miniMapCanvas = document.createElement('canvas');
    miniMapCanvas.width = 120;
    miniMapCanvas.height = 120;
    const context = miniMapCanvas.getContext('2d');
    
    window.updateMiniMap = function() {
        context.fillStyle = '#000033';
        context.fillRect(0, 0, miniMapCanvas.width, miniMapCanvas.height);
        
        // Draw player
        const playerX = (playerAvatar.position.x / worldSize) * miniMapCanvas.width + miniMapCanvas.width/2;
        const playerZ = (playerAvatar.position.z / worldSize) * miniMapCanvas.height + miniMapCanvas.height/2;
        
        context.fillStyle = '#3B82F6';
        context.beginPath();
        context.arc(playerX, playerZ, 3, 0, Math.PI * 2);
        context.fill();
        
        // Update mini-map display
        const miniMap = document.getElementById('mini-map');
        if (miniMap) {
            miniMap.style.backgroundImage = `url(${miniMapCanvas.toDataURL()})`;
        }
    };
}

function checkCollisions(newPosition) {
    playerCollider.setFromCenterAndSize(newPosition, playerSize);
    
    for (let i = 0; i < collisionObjects.length; i++) {
        if (playerCollider.intersectsBox(collisionObjects[i])) {
            return true;
        }
    }
    return false;
}

function checkIfOnBridge(position) {
    for (let i = 0; i < bridgeSegments.length; i++) {
        const segment = bridgeSegments[i];
        const distance = position.distanceTo(segment.position);
        if (distance < 30) {
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
    
    forwardBtn.addEventListener('touchstart', (e) => { e.preventDefault(); setMoveState('forward', true); });
    forwardBtn.addEventListener('touchend', (e) => { e.preventDefault(); setMoveState('forward', false); });
    
    backwardBtn.addEventListener('touchstart', (e) => { e.preventDefault(); setMoveState('backward', true); });
    backwardBtn.addEventListener('touchend', (e) => { e.preventDefault(); setMoveState('backward', false); });
    
    leftBtn.addEventListener('touchstart', (e) => { e.preventDefault(); setMoveState('left', true); });
    leftBtn.addEventListener('touchend', (e) => { e.preventDefault(); setMoveState('left', false); });
    
    rightBtn.addEventListener('touchstart', (e) => { e.preventDefault(); setMoveState('right', true); });
    rightBtn.addEventListener('touchend', (e) => { e.preventDefault(); setMoveState('right', false); });
    
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
            lookX = 0;
            lookY = 0;
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
    const bulletGeometry = new THREE.SphereGeometry(0.5, 8, 8);
    const bulletMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFF00 });
    const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
    
    const direction = new THREE.Vector3(
        Math.sin(cameraAngle),
        0,
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
    
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        bullet.mesh.position.add(bullet.velocity.clone().multiplyScalar(clock.getDelta()));
        bullet.lifeTime -= clock.getDelta() * 1000;
        
        if (bullet.lifeTime <= 0 || 
            bullet.mesh.position.distanceTo(playerAvatar.position) > 1000) {
            scene.remove(bullet.mesh);
            bullets.splice(i, 1);
        }
    }
}

function checkNFTInteraction() {
    // Simplified NFT interaction check
    // In a full implementation, this would handle NFT collisions and interactions
}

function loadNFTs() {
    // Simplified NFT loading
    // In a full implementation, this would load actual NFT data from blockchain
    console.log("NFT loading system initialized");
}

/* ==============================
   ANIMATE FUNCTION (Modified for bot interactions)
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
    
    updateThirdPersonCamera();
    updateBullets();
    checkNFTInteraction();
    
    // Animate bots (gentle floating motion)
    botObjects.forEach(bot => {
        if (bot.userData && bot.userData.botInstance) {
            const bob = Math.sin(hoverTime * 1.5) * 0.3;
            bot.position.y = bot.userData.botInstance.position.y + bob;
            
            // Gentle rotation
            bot.rotation.y += 0.01;
        }
    });
    
    if (window.updateMiniMap) {
        window.updateMiniMap();
    }
    
    prevTime = time;
    renderer.render(scene, camera);
}

// Initialize the game
console.log("NFT Shooter Universe with Assistant Bots initialized successfully!");
