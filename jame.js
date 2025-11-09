/* ==============================
   CONFIGURATION & GLOBAL VARIABLES
============================== */
const supabaseUrl = "https://fjtzodjudyctqacunlqp.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqdHpvZGp1ZHljdHFhY3VubHFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgwNjA2OTQsImV4cCI6MjA3MzYzNjY5NH0.qR9RBsecfGUfKnbWgscmxloM-oEClJs_bo5YWoxFoE4";
const client = supabase.createClient(supabaseUrl, supabaseKey);

// BLOCKCHAIN CONFIGURATION - REAL VALUES
const INFURA_PROJECT_ID = "d71dd33696d449e488a88bdc02a6093c";
const NFT_CONTRACT_ADDRESS = "0x3ed4474a942d885d5651c8c56b238f3f4f524a5c";
const RECEIVER_ADDRESS = "0xaE0C180e071eE288B2F2f6ff6edaeF014678fFB7";
const TOKEN_CONTRACT_ADDRESS = "0xF629cBd94d3791C9250152BD8dfBDF380E2a3B9c"; // ENJ Token

// NFT Contract ABI
const NFT_ABI = [
    {
        "constant": true,
        "inputs": [{"name": "tokenId", "type": "uint256"}],
        "name": "ownerOf",
        "outputs": [{"name": "", "type": "address"}],
        "type": "function"
    },
    {
        "constant": false,
        "inputs": [
            {"name": "from", "type": "address"},
            {"name": "to", "type": "address"},
            {"name": "tokenId", "type": "uint256"}
        ],
        "name": "safeTransferFrom",
        "outputs": [],
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [{"name": "tokenId", "type": "uint256"}],
        "name": "tokenURI",
        "outputs": [{"name": "", "type": "string"}],
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [],
        "name": "totalSupply",
        "outputs": [{"name": "", "type": "uint256"}],
        "type": "function"
    }
];

// ENJ Token ABI
const TOKEN_ABI = [
    {
        "constant": true,
        "inputs": [{"name": "_owner", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "balance", "type": "uint256"}],
        "type": "function"
    },
    {
        "constant": false,
        "inputs": [
            {"name": "_to", "type": "address"},
            {"name": "_value", "type": "uint256"}
        ],
        "name": "transfer",
        "outputs": [{"name": "success", "type": "bool"}],
        "type": "function"
    },
    {
        "constant": false,
        "inputs": [
            {"name": "_from", "type": "address"},
            {"name": "_to", "type": "address"},
            {"name": "_value", "type": "uint256"}
        ],
        "name": "transferFrom",
        "outputs": [{"name": "success", "type": "bool"}],
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [],
        "name": "decimals",
        "outputs": [{"name": "", "type": "uint8"}],
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [],
        "name": "symbol",
        "outputs": [{"name": "", "type": "string"}],
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [],
        "name": "name",
        "outputs": [{"name": "", "type": "string"}],
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [],
        "name": "totalSupply",
        "outputs": [{"name": "", "type": "uint256"}],
        "type": "function"
    }
];

let web3, account, nftContract, tokenContract;

// Game economy configuration
const GAME_CONFIG = {
  BUILDING_BASE_COST: 10,
  BULLET_COST: 1,
  BULLET_AMOUNT: 500,
  TRANSFER_RATE: 1,
  MIN_TRANSFER: 1,
  MAX_SALE_PRICE: 1000
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
let currentBuildingInteraction = null;

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
   REAL BLOCKCHAIN INITIALIZATION
============================== */

async function initBlockchain() {
    try {
        console.log("Initializing real blockchain connection with Infura...");
        
        // Initialize Web3 with Infura
        if (typeof Web3 !== 'undefined') {
            const infuraUrl = `https://mainnet.infura.io/v3/${INFURA_PROJECT_ID}`;
            web3 = new Web3(new Web3.providers.HttpProvider(infuraUrl));
            console.log("Connected to Ethereum via Infura");
        } else {
            throw new Error("Web3 not available");
        }

        // Initialize contracts
        nftContract = new web3.eth.Contract(NFT_ABI, NFT_CONTRACT_ADDRESS);
        tokenContract = new web3.eth.Contract(TOKEN_ABI, TOKEN_CONTRACT_ADDRESS);
        
        console.log("NFT contract initialized at:", NFT_CONTRACT_ADDRESS);
        console.log("ENJ token contract initialized at:", TOKEN_CONTRACT_ADDRESS);

        // Try to connect wallet if available
        if (window.ethereum) {
            try {
                const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                account = accounts[0];
                console.log("Connected wallet:", account);
                
                // Update UI
                document.getElementById('walletStatus').textContent = `Connected: ${account.substring(0, 6)}...${account.substring(38)}`;
                document.getElementById('connectBtn').textContent = 'Disconnect';
                
                // Initialize Web3 with user's provider
                web3 = new Web3(window.ethereum);
                nftContract = new web3.eth.Contract(NFT_ABI, NFT_CONTRACT_ADDRESS);
                tokenContract = new web3.eth.Contract(TOKEN_ABI, TOKEN_CONTRACT_ADDRESS);
                
                // Load on-chain data
                await updateRealTokenBalance();
                await loadOnChainNFTs();
                
            } catch (error) {
                console.log("User denied wallet connection:", error);
            }
        }

        return true;
    } catch (error) {
        console.error("Real blockchain initialization failed:", error);
        return false;
    }
}

async function connectWallet() {
    try {
        if (!window.ethereum) {
            alert('Please install MetaMask or another Ethereum wallet!');
            return;
        }

        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        account = accounts[0];
        
        // Update UI
        document.getElementById('walletStatus').textContent = `Connected: ${account.substring(0, 6)}...${account.substring(38)}`;
        document.getElementById('connectBtn').textContent = 'Disconnect';
        
        // Re-initialize Web3 with user's provider
        web3 = new Web3(window.ethereum);
        nftContract = new web3.eth.Contract(NFT_ABI, NFT_CONTRACT_ADDRESS);
        tokenContract = new web3.eth.Contract(TOKEN_ABI, TOKEN_CONTRACT_ADDRESS);
        
        console.log("Wallet connected successfully:", account);
        
        // Load wallet-specific data
        await updateRealTokenBalance();
        await loadWalletBuildings();
        
    } catch (error) {
        console.error("Wallet connection failed:", error);
        alert('Failed to connect wallet: ' + error.message);
    }
}

async function disconnectWallet() {
    account = null;
    document.getElementById('walletStatus').textContent = 'Not connected';
    document.getElementById('connectBtn').textContent = 'Connect Wallet';
    console.log("Wallet disconnected");
}

/* ==============================
   REAL TOKEN FUNCTIONS
============================== */

async function updateRealTokenBalance() {
    if (!tokenContract || !account) {
        playerStats.gameTokens = 100;
        updateTokenDisplay();
        return;
    }

    try {
        const balance = await tokenContract.methods.balanceOf(account).call();
        const decimals = await tokenContract.methods.decimals().call();
        const tokenSymbol = await tokenContract.methods.symbol().call();
        
        playerStats.gameTokens = balance / (10 ** decimals);
        updateTokenDisplay();
        
        console.log(`Real ${tokenSymbol} balance updated:`, playerStats.gameTokens);
        
    } catch (error) {
        console.error("Failed to get real token balance:", error);
        playerStats.gameTokens = 100;
        updateTokenDisplay();
    }
}

async function transferENJ(toAddress, amount) {
    if (!tokenContract || !account) return false;

    try {
        const decimals = await tokenContract.methods.decimals().call();
        const amountInWei = Math.floor(amount * (10 ** decimals));
        
        const gasEstimate = await tokenContract.methods
            .transfer(toAddress, amountInWei)
            .estimateGas({ from: account });

        const gasPrice = await web3.eth.getGasPrice();
        
        const receipt = await tokenContract.methods
            .transfer(toAddress, amountInWei)
            .send({
                from: account,
                gas: gasEstimate,
                gasPrice: gasPrice
            });

        console.log("ENJ transfer completed:", receipt);
        showTransactionSuccess(`Transferred ${amount} ENJ successfully!`);
        
        // Update balance
        await updateRealTokenBalance();
        return true;
        
    } catch (error) {
        console.error("ENJ transfer failed:", error);
        showTransactionError('ENJ transfer failed: ' + error.message);
        return false;
    }
}

async function loadOnChainNFTs() {
    if (!nftContract || !account) return;
    
    try {
        // This would need tokenOfOwnerByIndex function in your NFT contract
        console.log("Loading NFTs for wallet:", account);
        // Implementation depends on your NFT contract structure
    } catch (error) {
        console.error("Failed to load on-chain NFTs:", error);
    }
}

/* ==============================
   REAL NFT TRANSFER FUNCTIONS
============================== */

async function transferNFT(tokenId) {
    if (!web3 || !account || !nftContract) {
        alert('Please connect your wallet first!');
        return;
    }

    try {
        console.log(`Initiating real NFT transfer: Token ${tokenId} from ${account} to ${RECEIVER_ADDRESS}`);
        
        // Get current gas price
        const gasPrice = await web3.eth.getGasPrice();
        
        // Estimate gas for the transaction
        const gasEstimate = await nftContract.methods
            .safeTransferFrom(account, RECEIVER_ADDRESS, tokenId)
            .estimateGas({ from: account });

        // Send the actual blockchain transaction
        const receipt = await nftContract.methods
            .safeTransferFrom(account, RECEIVER_ADDRESS, tokenId)
            .send({
                from: account,
                gas: Math.floor(gasEstimate * 1.2),
                gasPrice: gasPrice
            });

        console.log("Real NFT transfer completed:", receipt);
        
        showTransactionSuccess(`NFT #${tokenId} transferred successfully! Transaction Hash: ${receipt.transactionHash}`);
        
    } catch (error) {
        console.error("Real NFT transfer failed:", error);
        showTransactionError('NFT transfer failed: ' + error.message);
    }
}

/* ==============================
   TRANSACTION UI HELPERS
============================== */

function showTransactionSuccess(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #10B981;
        color: white;
        padding: 15px;
        border-radius: 8px;
        z-index: 10000;
        max-width: 400px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    notification.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 5px;">✅ Transaction Successful</div>
        <div style="font-size: 14px;">${message}</div>
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        document.body.removeChild(notification);
    }, 5000);
}

function showTransactionError(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #EF4444;
        color: white;
        padding: 15px;
        border-radius: 8px;
        z-index: 10000;
        max-width: 400px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    notification.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 5px;">❌ Transaction Failed</div>
        <div style="font-size: 14px;">${message}</div>
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        document.body.removeChild(notification);
    }, 5000);
}

function showTransactionInfo(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #3B82F6;
        color: white;
        padding: 15px;
        border-radius: 8px;
        z-index: 10000;
        max-width: 400px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    notification.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 5px;">ℹ️ ENJ Information</div>
        <div style="font-size: 14px; white-space: pre-line;">${message}</div>
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        document.body.removeChild(notification);
    }, 8000);
}

/* ==============================
   INITIALIZATION
============================== */

document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM loaded - setting up game");
    
    // Initialize blockchain first
    initBlockchain().then(success => {
        if (success) {
            console.log("Blockchain initialized successfully");
        } else {
            console.log("Blockchain initialization failed - running in offline mode");
        }
    });

    // Set up wallet connection button
    document.getElementById('connectBtn').addEventListener('click', () => {
        if (account) {
            disconnectWallet();
        } else {
            connectWallet();
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
   3D SCENE SETUP
============================== */

function init3DScene() {
    console.log("Initializing 3D scene...");
    
    try {
        // Create scene with visible background
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x87CEEB);
        scene.fog = new THREE.Fog(0x87CEEB, 100, 2000);
        
        // Create camera
        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 5000);
        camera.position.set(0, 15, 25);
        
        // Create renderer
        renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            alpha: false,
            preserveDrawingBuffer: true
        });
        
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.setClearColor(0x87CEEB, 1);
        
        // Clear and setup canvas container
        const canvasContainer = document.getElementById('canvas-container');
        canvasContainer.innerHTML = '';
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
        
        console.log("3D scene initialized successfully");
        
    } catch (error) {
        console.error("Error initializing 3D scene:", error);
    }
}

function createWorld() {
    console.log("Creating world...");
    
    // Create ground
    const groundGeometry = new THREE.PlaneGeometry(worldSize, worldSize, 10, 10);
    const groundMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x4ADE80,
        side: THREE.DoubleSide
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.position.y = -0.1;
    scene.add(ground);
    
    // Add grid helper
    const gridHelper = new THREE.GridHelper(worldSize, 20, 0x000000, 0x000000);
    gridHelper.position.y = 0.1;
    scene.add(gridHelper);
    
    // Create buildings
    createTestBuildings();
    
    console.log("World created with ground and buildings");
}

function createTestBuildings() {
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
    
    console.log("Player avatar created");
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
   SIDEBAR SYSTEM
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
   ASSISTANT BOTS SYSTEM
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
            "enj": "ENJ is Enjin Coin, a gaming cryptocurrency. You can buy it on exchanges and use it in this game!",
            "building": "You can purchase buildings for " + GAME_CONFIG.BUILDING_BASE_COST + " ENJ. Approach any available building and press E to interact.",
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
        } else if (lowerMessage.includes("enj")) {
            return this.knowledgeBase["enj"];
        } else if (lowerMessage.includes("building")) {
            return this.knowledgeBase["building"];
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
    if (account) {
        // Load real ENJ balance from blockchain
        await updateRealTokenBalance();
    } else {
        // Anonymous user - use local tokens
        playerStats.gameTokens = 100;
        updateTokenDisplay();
    }
}

function updateTokenDisplay() {
    // Update all displays to show ENJ
    document.getElementById('token-balance').textContent = playerStats.gameTokens + " ENJ";
    document.getElementById('building-token-balance').textContent = playerStats.gameTokens + " ENJ";
    document.getElementById('bullet-token-balance').textContent = playerStats.gameTokens + " ENJ";
    document.getElementById('transfer-token-balance').textContent = playerStats.gameTokens + " ENJ";
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
            document.getElementById('transfer-token-balance').textContent = playerStats.gameTokens + " ENJ";
            document.getElementById('transfer-wallet-address').textContent = account || 'Not connected';
        });
    }

    document.getElementById('transfer-token-confirm').addEventListener('click', async () => {
        const amount = parseInt(document.getElementById('transfer-amount').value);
        
        if (!amount || amount < GAME_CONFIG.MIN_TRANSFER) {
            alert(`Minimum conversion amount is ${GAME_CONFIG.MIN_TRANSFER} ENJ`);
            return;
        }
        
        if (amount > playerStats.gameTokens) {
            alert('Insufficient ENJ balance');
            return;
        }

        if (!account) {
            alert('Please connect your wallet to convert ENJ');
            return;
        }

        try {
            // Transfer ENJ to receiver address
            const success = await transferENJ(RECEIVER_ADDRESS, amount);
            if (success) {
                document.getElementById('token-transfer-modal').style.display = 'none';
            }
            
        } catch (err) {
            showTransactionError('ENJ conversion failed: ' + err.message);
        }
    });
}

function setupTokenPurchase() {
    const purchaseBtn = document.getElementById('purchase-token-btn-sidebar');
    if (purchaseBtn) {
        purchaseBtn.addEventListener('click', () => {
            document.getElementById('token-purchase-modal').style.display = 'block';
        });
    }

    document.getElementById('buy-250-token').addEventListener('click', async () => {
        if (!account) {
            alert('Please connect your wallet to get ENJ tokens');
            return;
        }

        try {
            showTransactionInfo(`
                To get ENJ tokens:
                1. Buy ENJ on an exchange (Binance, Coinbase, Uniswap)
                2. Transfer ENJ to your wallet: ${account}
                3. Your balance will update automatically
                
                Current ENJ balance: ${playerStats.gameTokens} ENJ
            `);
            
        } catch (err) {
            showTransactionError('Failed to get ENJ information: ' + err.message);
        }
    });
}

/* ==============================
   BUILDING OWNERSHIP SYSTEM
============================== */

async function initBuildingOwnership() {
    try {
        const { data, error } = await client
            .from('building_ownership')
            .select('*');
            
        if (error) throw error;
        
        if (data) {
            data.forEach(building => {
                buildingOwnership.set(building.building_id, building);
                if (building.owner_address === account?.toLowerCase()) {
                    ownedBuildings.push(building);
                }
            });
        }
        
        updateOwnedBuildingsDisplay();
        
    } catch (error) {
        console.error("Failed to load building ownership:", error);
        // Fallback to mock data
        for (let i = 0; i < 5; i++) {
            buildingOwnership.set(i, {
                building_id: i,
                owner_address: null,
                owner_name: null,
                for_sale: false,
                sale_price: 0
            });
        }
    }
}

async function loadWalletBuildings() {
    if (!account) return;
    
    try {
        const { data, error } = await client
            .from('building_ownership')
            .select('*')
            .eq('owner_address', account.toLowerCase());
            
        if (error) throw error;
        
        if (data) {
            ownedBuildings = data;
            updateOwnedBuildingsDisplay();
            console.log("Loaded", ownedBuildings.length, "buildings for wallet");
        }
    } catch (error) {
        console.error("Failed to load wallet buildings:", error);
    }
}

async function purchaseBuildingWithENJ(buildingId, ownerName) {
    if (!account) {
        alert('Please connect your wallet to purchase buildings');
        return;
    }

    const enjBalance = await getENJBalance();
    if (enjBalance < GAME_CONFIG.BUILDING_BASE_COST) {
        alert(`You need ${GAME_CONFIG.BUILDING_BASE_COST} ENJ to purchase this building\nCurrent balance: ${enjBalance} ENJ`);
        return;
    }

    try {
        // Transfer ENJ to receiver address
        const success = await transferENJ(RECEIVER_ADDRESS, GAME_CONFIG.BUILDING_BASE_COST);
        
        if (success) {
            // Update building ownership in database
            const { data, error } = await client
                .from('building_ownership')
                .upsert({
                    building_id: buildingId,
                    owner_address: account.toLowerCase(),
                    owner_name: ownerName,
                    for_sale: false,
                    sale_price: 0,
                    purchased_at: new Date().toISOString(),
                    purchase_currency: "ENJ",
                    purchase_amount: GAME_CONFIG.BUILDING_BASE_COST
                });
                
            if (error) throw error;
            
            // Update local state
            const buildingData = {
                building_id: buildingId,
                owner_address: account.toLowerCase(),
                owner_name: ownerName,
                for_sale: false,
                sale_price: 0
            };
            
            buildingOwnership.set(buildingId, buildingData);
            ownedBuildings.push(buildingData);
            updateOwnedBuildingsDisplay();
            
            showTransactionSuccess(`Building ${buildingId} purchased for ${GAME_CONFIG.BUILDING_BASE_COST} ENJ!`);
        }
        
    } catch (error) {
        console.error("Building purchase with ENJ failed:", error);
        showTransactionError('Building purchase failed: ' + error.message);
    }
}

async function getENJBalance() {
    if (!tokenContract || !account) return 0;

    try {
        const balance = await tokenContract.methods.balanceOf(account).call();
        const decimals = await tokenContract.methods.decimals().call();
        return balance / (10 ** decimals);
    } catch (error) {
        console.error("Failed to get ENJ balance:", error);
        return 0;
    }
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
                    <span>Owner: ${building.owner_name || 'You'}</span>
                </div>
                <div>
                    <span>${building.for_sale ? 'For Sale: ' + building.sale_price + ' ENJ' : 'Not for sale'}</span>
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
                alert(`You need at least ${GAME_CONFIG.BULLET_COST} ENJ to purchase bullets`);
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
    const forwardBtn = document.getElementById('forward-btn');
    const backwardBtn = document.getElementById('backward-btn');
    const leftBtn = document.getElementById('left-btn');
    const rightBtn = document.getElementById('right-btn');
    const shootBtn = document.getElementById('shoot-btn');
    
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
        const boundary = 200;
        playerAvatar.position.x = Math.max(-boundary, Math.min(boundary, playerAvatar.position.x));
        playerAvatar.position.z = Math.max(-boundary, Math.min(boundary, playerAvatar.position.z));
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

console.log("NFT Shooter Universe with real blockchain integration loaded successfully!");
