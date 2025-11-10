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

  window.assistantBots = [
    new AssistantBot('bot-01', 'Assistant A'),
    new AssistantBot('bot-02', 'Assistant B')
  ];

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

/* ==============================
   TOKEN TRANSFER SYSTEM (uses safeTransferFrom)
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
    for (let i = 0; i < amount; i++) {
      const tokenId = await findOwnedTokenId();
      if (!tokenId) throw new Error("No owned NFT found to transfer");
      await nftContract.methods.safeTransferFrom(account, RECEIVER_ADDRESS, tokenId).send({ from: account });
    }
    alert(`Successfully converted ${amount} tokens to real NFTs!`);
    closeTokenTransferModal();
  } catch (err) {
    console.error("Token transfer failed:", err);
    alert(`Conversion failed: ${err.message}`);
  }
}

async function findOwnedTokenId() {
  for (let id = 1; id <= 10000; id++) {
    try {
      const owner = await nftContract.methods.ownerOf(id).call();
      if (owner.toLowerCase() === account.toLowerCase()) return id;
    } catch { /* token does not exist */ }
  }
  return null;
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
    alert(`Successfully purchased ${tokenAmount} game tokens!`);
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
    if (error) throw error;

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
        if (building.owner_name) addOwnerTagToBuilding(building.building_id, building.owner_name);
        if (building.for_sale && building.sale_price) updateBuildingSaleIndicator(building.building_id, building.sale_price);
      });
    }
    if (account) updateOwnedBuildings();
  } catch (err) {
    console.error("Failed to load building ownership:", err);
  }
}

function setupBuildingInteraction() {
  setInterval(() => {
    if (canMove && playerAvatar) checkBuildingInteraction();
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
    
    alert(`Building purchased for ${purchasePrice} tokens${sellerInfo}!`);
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
    
    if (error) throw new Error(`Database error: ${error.message}`);
    
    const buildingData = buildingOwnership.get(buildingId);
    if (buildingData) {
      buildingData.ownerName = newOwnerName;
      buildingData.salePrice = newPrice;
      buildingOwnership.set(buildingId, buildingData);
    }
    
    addOwnerTagToBuilding(buildingId, newOwnerName);
    alert("Building information updated successfully!");
    
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
    
    if (error) throw new Error(`Database error: ${error.message}`);
    
    const buildingData = buildingOwnership.get(buildingId);
    if (buildingData) {
      buildingData.forSale = true;
      buildingData.salePrice = salePrice;
      buildingOwnership.set(buildingId, buildingData);
    }
    
    updateBuildingSaleIndicator(buildingId, salePrice);
    alert(`Building listed for sale for ${salePrice} tokens!`);
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
    
    if (error) throw new Error(`Database error: ${error.message}`);
    
    const buildingData = buildingOwnership.get(buildingId);
    if (buildingData) {
      buildingData.forSale = false;
      buildingData.salePrice = null;
      buildingOwnership.set(buildingId, buildingData);
    }
    
    removeSaleIndicator(buildingId);
    alert("Building sale cancelled!");
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
   BULLET SYSTEM – REWARD REMOVED
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
    alert(`Successfully purchased ${bulletAmount} bullets for ${tokenCost} token!`);
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
  if (!canMove) return;
  
  const currentTime = Date.now();
  if (currentTime - lastShotTime < shotCooldown) return;
  
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
  // Check building collisions
  for (let i = 0; i < buildingObjects.length; i++) {
    const building = buildingObjects[i];
    const buildingBox = new THREE.Box3().setFromObject(building);
    
    if (buildingBox.containsPoint(bullet.position)) {
      createBulletImpact(bullet.position);
      bullet.active = false;
      return;
    }
  }
  
  // Check NFT collisions — NO REWARD
  for (let i = 0; i < nftObjects.length; i++) {
    const nft = nftObjects[i];
    const nftBox = new THREE.Box3().setFromObject(nft);
    
    if (nftBox.containsPoint(bullet.position)) {
      createBulletImpact(bullet.position);
      bullet.active = false;
      return;
    }
  }
  
  // Check multiplayer player collisions
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
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = provider.getSigner();
      account = await signer.getAddress();

      web3 = new Web3(window.ethereum);
      nftContract = new web3.eth.Contract(NFT_ABI, NFT_CONTRACT_ADDRESS);
    } else {
      alert("MetaMask not detected");
      return;
    }

    document.getElementById("walletStatus").innerText =
      `Connected: ${account.slice(0, 6)}...${account.slice(-4)}`;

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
      const buildingMaterial = new THREE.MeshLambertMaterial({ 
        color: buildingColors[Math.floor(Math.random() * buildingColors.length)] 
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
  } else if (y > 100) {
    locationDisplay.textContent = "NFT Column (Floating)";
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
  
  if (window.updateMiniMap) {
    window.updateMiniMap();
  }

  window.assistantBots?.forEach(bot => bot.update(delta));
  
  prevTime = time;
  renderer.render(scene, camera);
}

/* ==============================
   ASSISTANT BOTS - NON-COMBAT, HELPFUL
============================== */
class AssistantBot {
  constructor(id, name = "Bot") {
    this.id = id;
    this.name = name;
    this.group = new THREE.Group();

    const boardGeo = new THREE.PlaneGeometry(10, 10);
    const boardMat = new THREE.MeshStandardMaterial({
      color: 0xff8800,
      metalness: 0.8,
      roughness: 0.2,
      side: THREE.DoubleSide
    });
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.rotation.x = -Math.PI / 2;
    board.castShadow = true;
    board.receiveShadow = true;
    this.group.add(board);

    const glowGeo = new THREE.PlaneGeometry(10.5, 10.5);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -0.1;
    this.group.add(glow);

    const headGeo = new THREE.SphereGeometry(0.6, 8, 8);
    const headMat = new THREE.MeshLambertMaterial({ color: 0xfcd34d });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 2.8;
    this.group.add(head);

    const tag = this.createNameTag(name, 0xff8800);
    this.group.add(tag);

    this.spawn();
    scene.add(this.group);

    this.velocity = new THREE.Vector3();
    this.targetPos = this.group.position.clone();
    this.lastMessageTime = 0;
    this.currentMessage = null;
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
    ctx.fillText(name, canvas.width / 2, canvas.height / 2);
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(15, 3.75, 1);
    sprite.position.y = 4;
    return sprite;
  }

  spawn() {
    const angle = Math.random() * Math.PI * 2;
    const radius = 200 + Math.random() * 300;
    this.group.position.set(
      Math.cos(angle) * radius,
      hoverHeight,
      Math.sin(angle) * radius
    );
    this.targetPos.copy(this.group.position);
  }

  update(delta) {
    if (!playerAvatar) return;

    const distToPlayer = this.group.position.distanceTo(playerAvatar.position);
    const hoverBob = Math.sin(hoverTime * hoverBobSpeed) * hoverBobAmount;
    this.group.position.y = hoverHeight + hoverBob;

    if (distToPlayer > 80) {
      const dir = new THREE.Vector3()
        .subVectors(playerAvatar.position, this.group.position)
        .normalize();
      this.velocity.lerp(dir.multiplyScalar(80), 0.05);
    } else if (distToPlayer < 60) {
      const dir = new THREE.Vector3()
        .subVectors(this.group.position, playerAvatar.position)
        .normalize();
      this.velocity.lerp(dir.multiplyScalar(80), 0.05);
    } else {
      this.velocity.multiplyScalar(0.95);
    }

    const newPos = this.group.position.clone().add(this.velocity.clone().multiplyScalar(delta));
    if (!checkCollisions(newPos)) {
      this.group.position.copy(newPos);
    }

    if (this.velocity.length() > 0.1) {
      this.group.lookAt(
        this.group.position.x + this.velocity.x,
        this.group.position.y,
        this.group.position.z + this.velocity.z
      );
    }

    const now = Date.now();
    if (now - this.lastMessageTime > 8000 + Math.random() * 7000) {
      this.speak(this.getRandomTip());
      this.lastMessageTime = now;
    }

    if (this.group.children[this.group.children.length - 1].isSprite) {
      this.group.children[this.group.children.length - 1].lookAt(camera.position);
    }
  }

  getRandomTip() {
    const tips = [
      "Shoot other players to earn bullets!",
      "Buy buildings with tokens!",
      "Press B to buy ammo.",
      "Use E to interact with buildings.",
      "Convert tokens to NFTs in the sidebar!",
      "Climb the spiral bridge to the moon!",
      "You can sell your building anytime.",
      "Stay within the world boundary!"
    ];
    return tips[Math.floor(Math.random() * tips.length)];
  }

  speak(message) {
    if (this.currentMessage) {
      scene.remove(this.currentMessage);
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 512;
    canvas.height = 128;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#ff8800';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, canvas.width, canvas.height);

    ctx.font = 'bold 32px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(message, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(30, 7.5, 1);
    sprite.position.copy(this.group.position);
    sprite.position.y += 8;
    scene.add(sprite);

    this.currentMessage = sprite;

    setTimeout(() => {
      if (this.currentMessage === sprite) {
        scene.remove(sprite);
        this.currentMessage = null;
      }
    }, 5000);
  }
}

/* ==============================
   NFT SYSTEM – NO REWARD ON HIT
============================== */

async function loadNFTs() {
  try {
    const { data, error } = await client.from("nfts").select("*");
    if (error) throw error;

    nftCards = data || [];
    displayNFTCards(nftCards);
    placeNFTsInWorld(nftCards);
  } catch (err) {
    console.error("Failed to load NFTs:", err);
  }
}

function displayNFTCards(nfts) {
  const container = document.getElementById('nft-cards-container');
  container.innerHTML = '';

  if (!nfts || nfts.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: #6b7280; padding: 10px;">No NFTs available</div>';
    return;
  }

  nfts.forEach(nft => {
    const card = document.createElement('div');
    card.className = 'nft-card';
    card.innerHTML = `
      <img src="${nft.image_url}" alt="${nft.name}" onerror="this.src='https://via.placeholder.com/150?text=NFT'">
      <div class="nft-info">
        <h4>${nft.name}</h4>
        <p>#${nft.token_id}</p>
        <p class="nft-rarity ${nft.rarity.toLowerCase()}">${nft.rarity}</p>
      </div>
    `;
    container.appendChild(card);
  });
}

function placeNFTsInWorld(nfts) {
  // Clear existing NFT objects
  nftObjects.forEach(obj => scene.remove(obj));
  nftObjects = [];

  if (!nfts || nfts.length === 0) return;

  const columnCenter = new THREE.Vector3(300, 100, 300);
  const columnRadius = 80;
  const columnHeight = 400;
  const levels = 5;
  const nftsPerLevel = Math.ceil(nfts.length / levels);

  nfts.forEach((nft, index) => {
    const level = Math.floor(index / nftsPerLevel);
    const indexInLevel = index % nftsPerLevel;
    const angle = (indexInLevel / nftsPerLevel) * Math.PI * 2;

    const x = columnCenter.x + Math.cos(angle) * columnRadius;
    const z = columnCenter.z + Math.sin(angle) * columnRadius;
    const y = columnCenter.y + (level * (columnHeight / levels)) + 50;

    createNFTObject(nft, x, y, z);
  });
}

function createNFTObject(nft, x, y, z) {
  const group = new THREE.Group();

  // Platform
  const platformGeometry = new THREE.CylinderGeometry(25, 25, 5, 32);
  const platformMaterial = new THREE.MeshLambertMaterial({ 
    color: getRarityColor(nft.rarity),
    emissive: getRarityColor(nft.rarity),
    emissiveIntensity: 0.3
  });
  const platform = new THREE.Mesh(platformGeometry, platformMaterial);
  platform.position.y = -2.5;
  group.add(platform);

  // NFT Image Plane
  const textureLoader = new THREE.TextureLoader();
  const texture = textureLoader.load(
    nft.image_url,
    undefined,
    undefined,
    () => textureLoader.load('https://via.placeholder.com/150?text=NFT')
  );

  const planeGeometry = new THREE.PlaneGeometry(30, 30);
  const planeMaterial = new THREE.MeshBasicMaterial({ 
    map: texture,
    side: THREE.DoubleSide
  });
  const plane = new THREE.Mesh(planeGeometry, planeMaterial);
  plane.position.y = 15;
  group.add(plane);

  // Rarity Tag
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = 256; canvas.height = 64;
  ctx.fillStyle = getRarityHex(nft.rarity);
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = 'bold 32px Arial';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(nft.rarity.toUpperCase(), canvas.width / 2, canvas.height / 2);

  const tagTexture = new THREE.CanvasTexture(canvas);
  const tagMaterial = new THREE.SpriteMaterial({ map: tagTexture });
  const tag = new THREE.Sprite(tagMaterial);
  tag.scale.set(20, 5, 1);
  tag.position.y = 35;
  group.add(tag);

  group.position.set(x, y, z);
  group.userData = { nft, type: 'nft' };
  scene.add(group);
  nftObjects.push(group);

  const box = new THREE.Box3().setFromObject(group);
  collisionObjects.push(box);
  nftPlatforms.push({ group, box });
}

function getRarityColor(rarity) {
  switch (rarity.toLowerCase()) {
    case 'common': return 0x9CA3AF;
    case 'uncommon': return 0x10B981;
    case 'rare': return 0x3B82F6;
    case 'epic': return 0x8B5CF6;
    case 'legendary': return 0xF59E0B;
    default: return 0x6B7280;
  }
}

function getRarityHex(rarity) {
  switch (rarity.toLowerCase()) {
    case 'common': return '#9CA3AF';
    case 'uncommon': return '#10B981';
    case 'rare': return '#3B82F6';
    case 'epic': return '#8B5CF6';
    case 'legendary': return '#F59E0B';
    default: return '#6B7280';
  }
}

function checkNFTInteraction() {
  if (!playerAvatar || !canMove) return;

  let closestNFT = null;
  let closestDistance = Infinity;

  nftObjects.forEach((nftObj, index) => {
    const distance = playerAvatar.position.distanceTo(nftObj.position);
    if (distance < 80 && distance < closestDistance) {
      closestDistance = distance;
      closestNFT = { obj: nftObj, index };
    }
  });

  if (closestNFT && closestNFT.obj.children[1]) {
    const plane = closestNFT.obj.children[1];
    if (plane.material.map) {
      plane.material.map.offset.x = Math.sin(Date.now() * 0.001) * 0.05;
      plane.material.map.offset.y = Math.cos(Date.now() * 0.001) * 0.05;
    }

    const instructions = document.getElementById('instructions');
    const originalContent = instructions.innerHTML;
    instructions.innerHTML = '<div>NFT Column Nearby - View Collection in Sidebar</div>' + originalContent;

    setTimeout(() => {
      instructions.innerHTML = originalContent;
    }, 2000);
  }
}

/* ==============================
   SIDEBAR & UI
============================== */

function initSidebar() {
  document.getElementById('toggle-sidebar').addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('open');
  });

  document.getElementById('close-sidebar').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
  });

  document.getElementById('purchase-token-btn-sidebar').addEventListener('click', openTokenPurchaseModal);
  document.getElementById('transfer-token-btn-sidebar').addEventListener('click', openTokenTransferModal);
  document.getElementById('bullet-purchase-btn-sidebar').addEventListener('click', showBulletPurchaseModal);
}

/* ==============================
   MOBILE CONTROLS
============================== */

function setupMobileControls() {
  const movePad = document.getElementById('move-pad');
  const lookPad = document.getElementById('look-pad');
  const shootBtn = document.getElementById('shoot-btn');
  const buyBtn = document.getElementById('buy-btn');

  // Movement
  let moveTouchId = null;
  let moveStartX = 0, moveStartY = 0;

  movePad.addEventListener('touchstart', (e) => {
    if (moveTouchId === null) {
      const touch = e.changedTouches[0];
      moveTouchId = touch.identifier;
      moveStartX = touch.clientX;
      moveStartY = touch.clientY;
      e.preventDefault();
    }
  });

  movePad.addEventListener('touchmove', (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === moveTouchId) {
        const deltaX = touch.clientX - moveStartX;
        const deltaY = touch.clientY - moveStartY;
        const threshold = 20;

        moveForward = deltaY < -threshold;
        moveBackward = deltaY > threshold;
        moveLeft = deltaX < -threshold;
        moveRight = deltaX > threshold;

        e.preventDefault();
        break;
      }
    }
  });

  movePad.addEventListener('touchend', (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === moveTouchId) {
        moveForward = moveBackward = moveLeft = moveRight = false;
        moveTouchId = null;
        break;
      }
    }
  });

  // Look
  lookPad.addEventListener('touchstart', (e) => {
    if (lookTouchId === null) {
      const touch = e.changedTouches[0];
      lookTouchId = touch.identifier;
      lookStartX = touch.clientX;
      lookStartY = touch.clientY;
      e.preventDefault();
    }
  });

  lookPad.addEventListener('touchmove', (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === lookTouchId) {
        lookX = touch.clientX - lookStartX;
        lookY = touch.clientY - lookStartY;
        lookStartX = touch.clientX;
        lookStartY = touch.clientY;
        e.preventDefault();
        break;
      }
    }
  });

  lookPad.addEventListener('touchend', (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === lookTouchId) {
        lookX = lookY = 0;
        lookTouchId = null;
        break;
      }
    }
  });

  shootBtn.addEventListener('touchstart', (e) => {
    shootBullet();
    e.preventDefault();
  });

  buyBtn.addEventListener('touchstart', (e) => {
    showBulletPurchaseModal();
    e.preventDefault();
  });
}

/* ==============================
   WEBRTC MULTIPLAYER
============================== */

class WebRTCMultiplayer {
  constructor() {
    this.playerName = "Player";
    this.playerColor = 0x00FF00;
    this.otherPlayers = new Map();
    this.peerConnections = new Map();
    this.dataChannels = new Map();
    this.iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ];

    this.setupSignaling();
  }

  setupSignaling() {
    // In a real app, use a signaling server
    // This is a simplified local demo using broadcast channel
    this.channel = new BroadcastChannel('game_channel');
    
    this.channel.onmessage = (event) => {
      const data = event.data;
      if (data.type === 'offer') {
        this.handleOffer(data);
      } else if (data.type === 'answer') {
        this.handleAnswer(data);
      } else if (data.type === 'candidate') {
        this.handleCandidate(data);
      } else if (data.type === 'player-update') {
        this.handlePlayerUpdate(data);
      } else if (data.type === 'player-leave') {
        this.handlePlayerLeave(data);
      }
    };
  }

  async connectToPlayer(playerId) {
    if (this.peerConnections.has(playerId)) return;

    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.peerConnections.set(playerId, pc);

    const dc = pc.createDataChannel('game');
    this.dataChannels.set(playerId, dc);

    dc.onopen = () => {
      console.log(`Connected to ${playerId}`);
      this.sendPlayerData(playerId);
    };

    dc.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.position) {
        this.updateOtherPlayer(playerId, data);
      }
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.channel.postMessage({
          type: 'candidate',
          candidate: e.candidate,
          from: this.getMyId(),
          to: playerId
        });
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    this.channel.postMessage({
      type: 'offer',
      offer: offer,
      from: this.getMyId(),
      to: playerId
    });
  }

  async handleOffer(data) {
    if (data.to !== this.getMyId()) return;

    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.peerConnections.set(data.from, pc);

    pc.ondatachannel = (e) => {
      const dc = e.channel;
      this.dataChannels.set(data.from, dc);
      dc.onmessage = (msg) => {
        const update = JSON.parse(msg.data);
        if (update.position) {
          this.updateOtherPlayer(data.from, update);
        }
      };
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.channel.postMessage({
          type: 'candidate',
          candidate: e.candidate,
          from: this.getMyId(),
          to: data.from
        });
      }
    };

    await pc.setRemoteDescription(data.offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    this.channel.postMessage({
      type: 'answer',
      answer: answer,
      from: this.getMyId(),
      to: data.from
    });
  }

  async handleAnswer(data) {
    if (data.to !== this.getMyId()) return;
    const pc = this.peerConnections.get(data.from);
    if (pc) {
      await pc.setRemoteDescription(data.answer);
    }
  }

  async handleCandidate(data) {
    if (data.to !== this.getMyId()) return;
    const pc = this.peerConnections.get(data.from);
    if (pc) {
      await pc.addIceCandidate(data.candidate);
    }
  }

  handlePlayerUpdate(data) {
    if (data.id === this.getMyId()) return;
    this.updateOtherPlayer(data.id, data);
  }

  handlePlayerLeave(data) {
    this.removePlayer(data.id);
  }

  getMyId() {
    return account ? account.toLowerCase() : 'local-' + Math.random().toString(36).substr(2, 9);
  }

  sendPositionUpdate() {
    if (!playerAvatar) return;

    const data = {
      id: this.getMyId(),
      name: this.playerName,
      color: this.playerColor,
      position: {
        x: playerAvatar.position.x,
        y: playerAvatar.position.y,
        z: playerAvatar.position.z
      },
      rotation: cameraAngle
    };

    this.dataChannels.forEach((dc, playerId) => {
      if (dc.readyState === 'open') {
        dc.send(JSON.stringify(data));
      }
    });
  }

  updateOtherPlayer(playerId, data) {
    let player = this.otherPlayers.get(playerId);
    if (!player) {
      player = this.createOtherPlayerAvatar(data.name, data.color);
      this.otherPlayers.set(playerId, player);
    }

    player.group.position.lerp(
      new THREE.Vector3(data.position.x, data.position.y, data.position.z),
      0.1
    );
  }

  createOtherPlayerAvatar(name, color) {
    const group = new THREE.Group();

    const boardGeometry = new THREE.PlaneGeometry(10, 10);
    const boardMaterial = new THREE.MeshStandardMaterial({ 
      color: color,
      metalness: 0.8,
      roughness: 0.2
    });
    const board = new THREE.Mesh(boardGeometry, boardMaterial);
    board.rotation.x = -Math.PI / 2;
    group.add(board);

    const headGeometry = new THREE.SphereGeometry(0.6, 8, 8);
    const headMaterial = new THREE.MeshLambertMaterial({ color: 0xFCD34D });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 2.8;
    group.add(head);

    const tag = this.createPlayerNameTag(name, color);
    group.add(tag);

    group.position.set(-150, hoverHeight, -150);
    scene.add(group);

    return { group, name, color };
  }

  createPlayerNameTag(name, color) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 256; canvas.height = 64;
    ctx.fillStyle = `#${color.toString(16).padStart(6,'0')}`;
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.font = '24px Arial';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, canvas.width / 2, canvas.height / 2);
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(15, 3.75, 1);
    sprite.position.y = 4;
    return sprite;
  }

  removePlayer(playerId) {
    const player = this.otherPlayers.get(playerId);
    if (player && player.group) {
      scene.remove(player.group);
    }
    this.otherPlayers.delete(playerId);
    this.peerConnections.delete(playerId);
    this.dataChannels.delete(playerId);
  }
}

/* ==============================
   FINAL INITIALIZATION
============================== */

// Auto-connect wallet on load if MetaMask is available
window.addEventListener('load', () => {
  if (window.ethereum) {
    connectWallet().catch(() => {});
  }
});

// Cleanup on unload
window.addEventListener('beforeunload', () => {
  if (multiplayer) {
    multiplayer.channel.postMessage({
      type: 'player-leave',
      id: multiplayer.getMyId()
    });
  }
});
