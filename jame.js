// ===============================================
// NFT SHOOTER UNIVERSE – FULL COMPLETE CODE 2025
// Player & Bots: Hoverboards ON
// NFTs: NO hoverboards, widely spaced, fast loading
// ===============================================

const supabaseUrl = "https://fjtzodjudyctqacunlqp.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqdHpvZGp1ZHljdHFhY3VubHFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgwNjA2OTQsImV4cCI6MjA3MzYzNjY5NH0.qR9RBsecfGUfKnbWgscmxloM-oEClJs_bo5YWoxFoE4";
const client = supabase.createClient(supabaseUrl, supabaseKey);

const NFT_CONTRACT_ADDRESS = "0x3ed4474a942d885d5651c8c56b238f3f4f524a5c";
const NFT_ABI = [
  { "constant": true, "inputs": [{ "name": "tokenId", "type": "uint256" }], "name": "ownerOf", "outputs": [{ "name": "", "type": "address" }], "type": "function" },
  { "constant": false, "inputs": [{ "name": "from", "type": "address" }, { "name": "to", "type": "address" }, { "name": "tokenId", "type": "uint256" }], "name": "safeTransferFrom", "outputs": [], "type": "function" }
];
const RECEIVER_ADDRESS = "0xaE0C180e071eE288B2F2f6ff6edaeF014678fFB7";

let web3, account, nftContract;

// Game State
let playerStats = { health: 50, maxHealth: 50, bullets: 500, maxBullets: 1000, score: 0, gameTokens: 0 };
let bullets = [];
let bulletSpeed = 120;
let lastShotTime = 0;
let shotCooldown = 80;

// 3D
let scene, camera, renderer, controls;
let playerAvatar, hoverBoard;
let hoverHeight = 3;
let nftObjects = [];
let assistantBots = [];
let clock = new THREE.Clock();

// Mobile
let isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;

// Multiplayer placeholder (you can replace with your WebRTC later)
class WebRTCMultiplayer {
  constructor() { this.playerName = "Player"; this.playerColor = 0x00ff88; }
  sendPositionUpdate() { }
}
let multiplayer = new WebRTCMultiplayer();

// ===============================================
// DOM READY
// ===============================================
document.addEventListener("DOMContentLoaded", () => {
  client.auth.getSession().then(({ data }) => {
    if (!data.session) window.location.href = "https://diamondrolls.github.io/play/";
  });

  if (isMobile) {
    document.getElementById("desktop-instructions")?.classList.add("hidden");
    document.getElementById("mobile-instructions")?.classList.remove("hidden");
    setupMobileControls();
  }

  document.get  ("#start-game-btn")?.addEventListener("click", startGame);
  document.getElementById("connect-wallet")?.addEventListener("click", connectWallet);
});

function startGame() {
  document.getElementById("loading-screen")?.remove();
  init3D();
  createPlayerAvatar();
  assistantBots = [
    new AssistantBot("bot1", "Alpha Bot"),
    new AssistantBot("bot2", "Beta Bot")
  ];
  loadNFTs();
  animate();
}

// ===============================================
// 3D INITIALIZATION
// ===============================================
function init3D() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000022);
  scene.fog = new THREE.FogExp2(0x000022, 0.0008);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 3000);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  // Lights
  scene.add(new THREE.AmbientLight(0x404060, 1.5));
  const dirLight = new THREE.DirectionalLight(0xffffff, 1);
  dirLight.position.set(200, 300, 200);
  dirLight.castShadow = true;
  scene.add(dirLight);

  // Ground (invisible, just for reference)
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(3000, 3000),
    new THREE.MeshBasicMaterial({ color: 0x001133, transparent: true, opacity: 0.3 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  window.addEventListener("resize", onWindowResize);
  if (!isMobile) setupDesktopControls();
}

// ===============================================
// PLAYER AVATAR – WITH HOVERBOARD
// ===============================================
function createPlayerAvatar() {
  const group = new THREE.Group();

  // Hoverboard
  const boardGeo = new THREE.PlaneGeometry(10, 10);
  const boardMat = new THREE.MeshStandardMaterial({
    color: multiplayer.playerColor,
    metalness: 0.9,
    roughness: 0.1,
    side: THREE.DoubleSide
  });
  hoverBoard = new THREE.Mesh(boardGeo, boardMat);
  hoverBoard.rotation.x = -Math.PI / 2;
  hoverBoard.castShadow = true;
  group.add(hoverBoard);

  // Underglow
  const glowGeo = new THREE.PlaneGeometry(11, 11);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0x00ffff,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -0.15;
  group.add(glow);

  // Simple body
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 0.6, 2, 12),
    new THREE.MeshLambertMaterial({ color: 0x0088ff })
  );
  body.position.y = 1.5;
  group.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.8, 16, 12),
    new THREE.MeshLambertMaterial({ color: 0xffdd88 })
  );
  head.position.y = 3.2;
  group.add(head);

  group.position.set(0, hoverHeight, 0);
  scene.add(group);
  playerAvatar = group;
}

// ===============================================
// ASSISTANT BOT – WITH HOVERBOARD + HYPER ACTIVE
// ===============================================
class AssistantBot {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.group = new THREE.Group();

    // Hoverboard (kept!)
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 10),
      new THREE.MeshStandardMaterial({ color: 0xff6600, metalness: 0.9, roughness: 0.1, side: THREE.DoubleSide })
    );
    board.rotation.x = -Math.PI / 2;
    board.castShadow = true;
    this.group.add(board);

    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(11, 11),
      new THREE.MeshBasicMaterial({ color: 0x00ff99, transparent: true, opacity: 0.7 })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -0.15;
    this.group.add(glow);

    // Head
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.8, 16, 12),
      new THREE.MeshLambertMaterial({ color: 0xffaa00 })
    );
    head.position.y = 2.8;
    this.group.add(head);

    // Name tag
    const canvas = document.createElement("canvas");
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ff8800";
    ctx.fillRect(0, 0, 256, 64);
    ctx.font = "bold 32px Arial";
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.fillText(name, 128, 38);
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
    sprite.scale.set(14, 4, 1);
    sprite.position.y = 5.5;
    this.group.add(sprite);

    this.spawn();
    scene.add(this.group);

    this.velocity = new THREE.Vector3();
    this.target = this.group.position.clone();
    this.changeTargetTimer = 0;
    this.shootTimer = 0;
  }

  spawn() {
    const angle = Math.random() * Math.PI * 2;
    const dist = 100 + Math.random() * 150;
    this.group.position.set(Math.cos(angle) * dist, hoverHeight, Math.sin(angle) * dist);
  }

  update(delta) {
    this.changeTargetTimer -= delta;
    if (this.changeTargetTimer <= 0 || this.group.position.distanceTo(this.target) < 40) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 180 + Math.random() * 220;
      this.target = new THREE.Vector3(
        this.group.position.x + Math.cos(angle) * dist,
        hoverHeight,
        this.group.position.z + Math.sin(angle) * dist
      );
      this.changeTargetTimer = 1.5 + Math.random() * 4;
    }

    const dir = this.target.clone().sub(this.group.position).normalize();
    const speed = 110 + Math.random() * 80;
    this.velocity.lerp(dir.multiplyScalar(speed), 0.15);

    this.group.position.add(this.velocity.clone().multiplyScalar(delta));
    if (this.velocity.length() > 1) this.group.lookAt(this.group.position.clone().add(this.velocity));

    // Hover bob
    this.group.position.y = hoverHeight + Math.sin(performance.now() * 0.005 + this.group.position.x) * 0.5;

    // Shoot at player
    if (playerAvatar && this.group.position.distanceTo(playerAvatar.position) < 180) {
      this.shootTimer -= delta;
      if (this.shootTimer <= 0) {
        this.shoot();
        this.shootTimer = 0.6 + Math.random() * 0.7;
      }
    }
  }

  shoot() {
    const dir = playerAvatar.position.clone().sub(this.group.position).normalize();
    const start = this.group.position.clone().add(new THREE.Vector3(0, 2, 0));
    const bullet = {
      pos: start.clone(),
      vel: dir.multiplyScalar(bulletSpeed),
      owner: "bot",
      mesh: null
    };

    const geo = new THREE.SphereGeometry(0.8);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff3300 });
    bullet.mesh = new THREE.Mesh(geo, mat);
    bullet.mesh.position.copy(start);
    scene.add(bullet.mesh);
    bullets.push(bullet);
  }
}

// ===============================================
// NFT LOADING – NO PLATFORM, WIDE & FAST
// ===============================================
async function loadNFTs() {
  try {
    const { data } = await client.from("nfts").select("*").order("created_at", { ascending: false });
    if (!data || data.length === 0) return;

    nftObjects.forEach(o => {
      scene.remove(o);
      if (o.userData.glow) scene.remove(o.userData.glow);
    });
    nftObjects = [];

    placeNFTsInSpiral(data);
  } catch (e) { console.error("NFT load error:", e); }
}

function placeNFTsInSpiral(nfts) {
  const centerX = 0, centerZ = 0;
  const maxRadius = 260;
  const safeLimit = 380;

  nfts.forEach((nft, i) => {
    let x, z, y, attempts = 0;
    do {
      const angle = i * 0.65 + (Math.random() - 0.5) * 1.4;
      const radius = 50 + (i % 35) * 9 + Math.random() * 50;
      x = centerX + Math.cos(angle) * radius;
      z = centerZ + Math.sin(angle) * radius;
      y = 15 + (i * 13) % 520 + Math.random() * 120;
      attempts++;
    } while (Math.hypot(x, z) > safeLimit && attempts < 60);

    createNFTPlane(nft, { x, y: y + 10, z });
  });
}

function createNFTPlane(nftData, pos) {
  const geo = new THREE.PlaneGeometry(10, 10);
  const mat = new THREE.MeshStandardMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.95,
    metalness: 0.1,
    roughness: 0.9
  });

  const plane = new THREE.Mesh(geo, mat);
  plane.position.set(pos.x, pos.y, pos.z);
  plane.rotation.y = Math.random() * Math.PI * 2;
  plane.userData = { nftData, isNFT: true };

  const loader = new THREE.TextureLoader();
  loader.load(
    nftData.image_url || "https://via.placeholder.com/512",
    tex => {
      tex.minFilter = tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      mat.map = tex;
      mat.needsUpdate = true;
    },
    null,
    () => mat.color.setHex(0x6666ff)
  );

  plane.castShadow = true;
  scene.add(plane);
  nftObjects.push(plane);

  // Subtle glow ring only (no platform)
  const glow = new THREE.Mesh(
    new THREE.RingGeometry(5.3, 7.5, 32),
    new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = pos.y - 0.1;
  scene.add(glow);
  plane.userData.glow = glow;
}

// ===============================================
// SHOOTING
// ===============================================
document.addEventListener("pointerdown", (e) => {
  if (!playerAvatar || e.button !== 0) return;
  if (Date.now() - lastShotTime < shotCooldown) return;

  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);

  const bullet = {
    pos: playerAvatar.position.clone().add(new THREE.Vector3(0, 2, 0)),
    vel: dir.multiplyScalar(bulletSpeed),
    owner: "player",
    mesh: null
  };

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.6),
    new THREE.MeshBasicMaterial({ color: 0x00ff00 })
  );
  mesh.position.copy(bullet.pos);
  scene.add(mesh);
  bullet.mesh = mesh;
  bullets.push(bullet);

  lastShotTime = Date.now();
  playerStats.bullets = Math.max(0, playerStats.bullets - 1);
  updateHUD();
});

// ===============================================
// ANIMATION LOOP
// ===============================================
function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  // Player movement (WASD / mobile)
  if (playerAvatar) {
    const moveSpeed = 60 * delta;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    const velocity = new THREE.Vector3();
    if (moveForward) velocity.add(forward);
    if (moveBackward) velocity.sub(forward);
    if (moveLeft) velocity.sub(right);
    if (moveRight) velocity.add(right);

    if (velocity.length() > 0) {
      velocity.normalize().multiplyScalar(moveSpeed * 80);
      playerAvatar.position.add(velocity);
      playerAvatar.lookAt(playerAvatar.position.clone().add(velocity));
    }

    // Hover bob
    playerAvatar.position.y = hoverHeight + Math.sin(performance.now() * 0.004) * 0.4;
  }

  // Update bots
  assistantBots.forEach(bot => bot.update(delta));

  // Update bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.pos.add(b.vel.clone().multiplyScalar(delta));
    b.mesh.position.copy(b.pos);

    if (b.pos.distanceTo(playerAvatar.position) < 5 && b.owner === "bot") {
      playerStats.health -= 10;
      updateHUD();
      scene.remove(b.mesh);
      bullets.splice(i, 1);
      if (playerStats.health <= 0) alert("Game Over!");
      continue;
    }

    if (b.pos.length() > 1000) {
      scene.remove(b.mesh);
      bullets.splice(i, 1);
    }
  }

  renderer.render(scene, camera);
}

// ===============================================
// CONTROLS
// ===============================================
function setupDesktopControls() {
  document.addEventListener("keydown", e => {
    switch (e.code) {
      case "KeyW": moveForward = true; break;
      case "KeyS": moveBackward = true; break;
      case "KeyA": moveLeft = true; break;
      case "KeyD": moveRight = true; break;
    }
  });
  document.addEventListener("keyup", e => {
    switch (e.code) {
      case "KeyW": moveForward = false; break;
      case "KeyS": moveBackward = false; break;
      case "KeyA": moveLeft = false; break;
      case "KeyD": moveRight = false; break;
    }
  });
}

function setupMobileControls() {
  const joy = document.getElementById("joystick");
  // You can add Nipple.js or simple buttons here
}

// ===============================================
// HUD & WALLET (basic)
// ===============================================
function updateHUD() {
  document.getElementById("health").textContent = playerStats.health;
  document.getElementById("bullets").textContent = playerStats.bullets;
  document.getElementById("score").textContent = playerStats.score;
}

async function connectWallet() {
  if (window.ethereum) {
    try {
      await window.ethereum.request({ method: "eth_requestAccounts" });
      web3 = new Web3(window.ethereum);
      const accounts = await web3.eth.getAccounts();
      account = accounts[0];
      document.getElementById("wallet-address").textContent = account.slice(0, 6) + "..." + account.slice(-4);
    } catch (e) { alert("Wallet connection failed"); }
  } else {
    alert("Please install MetaMask");
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ===============================================
// START
// ===============================================
console.log("%cNFT Shooter Universe Ready!", "color: cyan; font-size: 20px");
