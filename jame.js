/* ==============================
   CONFIGURATION & GLOBAL VARIABLES
============================== */
const supabaseUrl = "https://fjtzodjudyctqacunlqp.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqdHpvZGp1ZHljdHFhY3VubHFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgwNjA2OTQsImV4cCI6MjA3MzYzNjY5NH0.qR9RBsecfGUfKnbWgscmxloM-oEClJs_bo5YWoxFoE4";
const client = supabase.createClient(supabaseUrl, supabaseKey);

const INFURA_PROJECT_ID = "d71dd33696d449e488a88bdc02a6093c";
const NFT_CONTRACT_ADDRESS = "0x3ed4474a942d885d5651c8c56b238f3f4f524a5c";
const RECEIVER_ADDRESS = "0xaE0C180e071eE288B2F2f6ff6edaeF014678fFB7";
const TOKEN_CONTRACT_ADDRESS = "0xF629cBd94d3791C9250152BD8dfBDF380E2a3B9c";

const NFT_ABI = [ /* (same as before) */ ];
const TOKEN_ABI = [ /* (same as before) */ ];

let web3, account, nftContract, tokenContract;
let scene, camera, renderer, playerAvatar;
let buildingObjects = [], botObjects = [];
let bullets = [], collisionObjects = [];
let clock = new THREE.Clock();
let prevTime = 0;

const GAME_CONFIG = {
  BUILDING_BASE_COST: 10,
  BULLET_COST: 1,
  BULLET_AMOUNT: 500,
  MIN_TRANSFER: 1
};

let playerStats = {
  health: 50, maxHealth: 50,
  bullets: 100, maxBullets: 500,
  score: 0, gameTokens: 100
};

let canMove = false;
let isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let lookX = 0, lookY = 0;
let cameraDistance = 25, cameraHeight = 10, cameraAngle = 0, targetCameraAngle = 0;
let hoverHeight = 3, hoverTime = 0;
let worldSize = 1000, worldBoundary = 450;
let selectedAvatar = null;

/* ==============================
   BLOCKCHAIN INIT
============================== */
async function initBlockchain() {
    try {
        const infuraUrl = `https://mainnet.infura.io/v3/${INFURA_PROJECT_ID}`;
        web3 = new Web3(new Web3.providers.HttpProvider(infuraUrl));
        nftContract = new web3.eth.Contract(NFT_ABI, NFT_CONTRACT_ADDRESS);
        tokenContract = new web3.eth.Contract(TOKEN_ABI, TOKEN_CONTRACT_ADDRESS);

        if (window.ethereum) {
            try {
                const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                account = accounts[0];
                web3 = new Web3(window.ethereum);
                nftContract = new web3.eth.Contract(NFT_ABI, NFT_CONTRACT_ADDRESS);
                tokenContract = new web3.eth.Contract(TOKEN_ABI, TOKEN_CONTRACT_ADDRESS);
                updateWalletUI();
                await updateRealTokenBalance();
            } catch (err) { console.log("Wallet denied"); }
        }
        return true;
    } catch (err) {
        console.error("Blockchain init failed:", err);
        return false;
    }
}

function updateWalletUI() {
    const status = document.getElementById('walletStatus');
    const btn = document.getElementById('connectBtn');
    if (account) {
        status.textContent = `Connected: ${account.substr(0,6)}...${account.substr(-4)}`;
        btn.textContent = 'Disconnect';
    } else {
        status.textContent = 'Not connected';
        btn.textContent = 'Connect Wallet';
    }
}

async function connectWallet() {
    if (!window.ethereum) return alert('Install MetaMask!');
    try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        account = accounts[0];
        web3 = new Web3(window.ethereum);
        nftContract = new web3.eth.Contract(NFT_ABI, NFT_CONTRACT_ADDRESS);
        tokenContract = new web3.eth.Contract(TOKEN_ABI, TOKEN_CONTRACT_ADDRESS);
        updateWalletUI();
        await updateRealTokenBalance();
    } catch (err) {
        alert('Connection failed: ' + err.message);
    }
}

function disconnectWallet() {
    account = null;
    updateWalletUI();
}

/* ==============================
   TOKEN FUNCTIONS
============================== */
async function updateRealTokenBalance() {
    if (!account || !tokenContract) {
        playerStats.gameTokens = 100;
        updateTokenDisplay();
        return;
    }
    try {
        const balance = await tokenContract.methods.balanceOf(account).call();
        const decimals = await tokenContract.methods.decimals().call();
        playerStats.gameTokens = balance / (10 ** decimals);
        updateTokenDisplay();
    } catch (err) {
        console.error("Token fetch error:", err);
        playerStats.gameTokens = 100;
        updateTokenDisplay();
    }
}

function updateTokenDisplay() {
    const displays = ['token-balance', 'building-token-balance', 'bullet-token-balance', 'transfer-token-balance'];
    displays.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = playerStats.gameTokens.toFixed(2) + " ENJ";
    });
}

/* ==============================
   3D SCENE SETUP (FIXED VISIBILITY)
============================== */
function init3DScene() {
    console.log("Initializing 3D scene...");

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 100, 1500);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 3000);
    camera.position.set(0, 15, 30);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x87CEEB);

    const container = document.getElementById('canvas-container');
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // LIGHTS
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(100, 200, 100);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);

    createWorld();
    createPlayerAvatar();
    createBuildings();
    createBots();

    window.addEventListener('resize', onWindowResize);
    console.log("3D Scene Ready");
}

function createWorld() {
    // GROUND
    const groundGeo = new THREE.PlaneGeometry(worldSize, worldSize);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x4ADE80 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.position.y = -0.1;
    scene.add(ground);

    // GRID
    const grid = new THREE.GridHelper(worldSize, 50, 0x000000, 0x333333);
    grid.position.y = 0.1;
    scene.add(grid);
}

function createPlayerAvatar() {
    const group = new THREE.Group();

    // Hoverboard
    const boardGeo = new THREE.BoxGeometry(6, 0.5, 3);
    const boardMat = new THREE.MeshLambertMaterial({ 
        color: selectedAvatar === 'boy' ? 0xEF4444 : 0xEC4899 
    });
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.castShadow = true;
    group.add(board);

    // Body
    const bodyGeo = new THREE.CapsuleGeometry(1.2, 2.5, 6, 12);
    const bodyMat = new THREE.MeshLambertMaterial({ 
        color: selectedAvatar === 'boy' ? 0x3B82F6 : 0x8B5CF6 
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 2.8;
    body.castShadow = true;
    group.add(body);

    group.position.set(0, hoverHeight, 0);
    scene.add(group);
    playerAvatar = group;

    // Add to collision
    const box = new THREE.Box3().setFromObject(group);
    collisionObjects.push(box);
}

function createBuildings() {
    const positions = [
        { x: 60, z: 60, size: 25, color: 0xFF6B6B },
        { x: -60, z: 60, size: 30, color: 0x4ECDC4 },
        { x: 60, z: -60, size: 22, color: 0x45B7D1 },
        { x: -60, z: -60, size: 28, color: 0xFFA07A },
        { x: 0, z: 120, size: 35, color: 0x98D8C8 }
    ];

    positions.forEach((p, i) => {
        const building = new THREE.Mesh(
            new THREE.BoxGeometry(p.size, p.size, p.size),
            new THREE.MeshLambertMaterial({ color: p.color })
        );
        building.position.set(p.x, p.size / 2, p.z);
        building.castShadow = true;
        building.receiveShadow = true;
        building.userData = { id: i, type: 'building' };
        scene.add(building);
        buildingObjects.push(building);

        const box = new THREE.Box3().setFromObject(building);
        collisionObjects.push(box);
    });
}

function createBots() {
    const botData = [
        { name: "Alex", pos: new THREE.Vector3(40, 2, 40), color: 0x3B82F6 },
        { name: "Sam", pos: new THREE.Vector3(-40, 2, -40), color: 0x10B981 }
    ];

    botData.forEach(data => {
        const group = new THREE.Group();

        const body = new THREE.Mesh(
            new THREE.CylinderGeometry(2, 2, 4, 12),
            new THREE.MeshLambertMaterial({ color: data.color })
        );
        body.castShadow = true;
        group.add(body);

        const head = new THREE.Mesh(
            new THREE.SphereGeometry(1.6, 12, 12),
            new THREE.MeshLambertMaterial({ color: 0x60A5FA })
        );
        head.position.y = 2.8;
        head.castShadow = true;
        group.add(head);

        group.position.copy(data.pos);
        group.userData = { name: data.name, type: 'bot' };
        scene.add(group);
        botObjects.push(group);
    });
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function updateThirdPersonCamera() {
    if (!playerAvatar) return;
    cameraAngle += (targetCameraAngle - cameraAngle) * 0.1;
    const offset = new THREE.Vector3(
        Math.sin(cameraAngle) * cameraDistance,
        cameraHeight,
        Math.cos(cameraAngle) * cameraDistance
    );
    camera.position.copy(playerAvatar.position).add(offset);
    camera.lookAt(playerAvatar.position.clone().add(new THREE.Vector3(0, 2, 0)));
}

/* ==============================
   GAME LOOP
============================== */
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    const time = performance.now();
    hoverTime += delta;

    if (canMove && playerAvatar) {
        const speed = 40 * delta;
        const forward = new THREE.Vector3(Math.sin(cameraAngle), 0, Math.cos(cameraAngle));
        const right = new THREE.Vector3(Math.sin(cameraAngle + Math.PI/2), 0, Math.cos(cameraAngle + Math.PI/2));
        const move = new THREE.Vector3();

        if (moveForward) move.add(forward);
        if (moveBackward) move.sub(forward);
        if (moveLeft) move.sub(right);
        if (moveRight) move.add(right);

        if (move.length() > 0) {
            move.normalize().multiplyScalar(speed);
            const newPos = playerAvatar.position.clone().add(move);
            newPos.y = hoverHeight + Math.sin(hoverTime * 5) * 0.3;

            // Simple boundary & collision
            if (newPos.x > -worldBoundary && newPos.x < worldBoundary &&
                newPos.z > -worldBoundary && newPos.z < worldBoundary) {
                const box = new THREE.Box3().setFromCenterAndSize(newPos, new THREE.Vector3(6, 6, 6));
                let blocked = false;
                for (const col of collisionObjects) {
                    if (box.intersectsBox(col)) { blocked = true; break; }
                }
                if (!blocked) playerAvatar.position.copy(newPos);
            }
        }

        playerAvatar.position.y = hoverHeight + Math.sin(hoverTime * 5) * 0.3;
    }

    updateThirdPersonCamera();
    updateBullets(delta);
    renderer.render(scene, camera);
    prevTime = time;
}

function updateBullets(delta) {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.mesh.position.add(b.velocity.clone().multiplyScalar(delta));
        b.life -= delta;
        if (b.life <= 0 || b.mesh.position.distanceTo(playerAvatar.position) > 400) {
            scene.remove(b.mesh);
            bullets.splice(i, 1);
        }
    }
}

/* ==============================
   CONTROLS
============================== */
document.addEventListener('keydown', e => {
    if (!canMove) return;
    switch (e.key.toLowerCase()) {
        case 'w': moveForward = true; break;
        case 's': moveBackward = true; break;
        case 'a': moveLeft = true; break;
        case 'd': moveRight = true; break;
        case ' ': shootBullet(); break;
    }
});

document.addEventListener('keyup', e => {
    switch (e.key.toLowerCase()) {
        case 'w': moveForward = false; break;
        case 's': moveBackward = false; break;
        case 'a': moveLeft = false; break;
        case 'd': moveRight = false; break;
    }
});

document.addEventListener('mousemove', e => {
    if (!canMove) return;
    targetCameraAngle -= e.movementX * 0.002;
    cameraHeight = THREE.MathUtils.clamp(cameraHeight - e.movementY * 0.05, 5, 25);
});

function shootBullet() {
    if (playerStats.bullets <= 0) return;
    playerStats.bullets--;
    document.getElementById('bullet-count').textContent = playerStats.bullets;

    const dir = new THREE.Vector3(Math.sin(cameraAngle), 0, Math.cos(cameraAngle)).normalize();
    const bullet = new THREE.Mesh(
        new THREE.SphereGeometry(0.4, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xFFFF00 })
    );
    bullet.position.copy(playerAvatar.position).add(new THREE.Vector3(0, 2, 0));
    scene.add(bullet);
    bullets.push({ mesh: bullet, velocity: dir.multiplyScalar(120), life: 3 });
}

/* ==============================
   START GAME
============================== */
function startGame() {
    document.getElementById('avatar-selection').style.display = 'none';
    document.getElementById('sidebar-toggle').style.display = 'flex';
    document.getElementById('instructions').style.display = 'block';
    if (isMobile) {
        document.getElementById('mobile-controls').style.display = 'flex';
        document.getElementById('look-controls').style.display = 'block';
    }

    canMove = true;
    init3DScene();
    animate();
    updateTokenDisplay();
}

/* ==============================
   DOM LOADED
============================== */
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded");

    // Wallet Button
    document.getElementById('connectBtn').addEventListener('click', () => {
        account ? disconnectWallet() : connectWallet();
    });

    // Avatar Selection
    document.querySelectorAll('.avatar-option').forEach(opt => {
        opt.addEventListener('click', () => {
            document.querySelectorAll('.avatar-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            selectedAvatar = opt.getAttribute('data-avatar');
        });
    });

    document.getElementById('confirm-avatar').addEventListener('click', () => {
        if (!selectedAvatar) return alert('Choose an avatar!');
        const name = document.getElementById('player-name').value.trim() || 'Player';
        console.log("Starting with:", selectedAvatar, name);
        startGame();
    });

    initBlockchain();
});
