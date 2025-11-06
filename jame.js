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

// Player stats
let playerStats = {
  health: 50,
  maxHealth: 50,
  bullets: 100,
  maxBullets: 500,
  score: 0,
  hitCount: 0,
  maxHitCount: 50,
  nftBalance: 0
};

// Game systems
let nftCards = [];
let bullets = [];
let bulletSpeed = 50; // Increased from 30
let lastShotTime = 0;
let shotCooldown = 150; // Reduced from 200 for faster shooting
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

// Check authentication on load
document.addEventListener('DOMContentLoaded', function() {
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
  
  // Initialize multiplayer
  multiplayer = new WebRTCMultiplayer();
  
  // Set player name from input
  const nameInput = document.getElementById('player-name');
  if (nameInput && nameInput.value.trim()) {
    multiplayer.playerName = nameInput.value.trim();
  }
  
  // Generate random color for player
  multiplayer.playerColor = Math.random() * 0xFFFFFF;
  
  // Hide avatar selection
  document.getElementById('avatar-selection').style.display = 'none';
  
  // Initialize game systems
  init3DScene();
  loadNFTs();
  initNFTCardSystem();
  initBuildingOwnership();
  setupBulletPurchaseWithNFTs();
  
  // Start position updates
  setInterval(() => {
    if (multiplayer) {
      multiplayer.sendPositionUpdate();
    }
  }, 100);
}

/* ==============================
   NFT CARD SYSTEM
============================== */

async function initNFTCardSystem() {
  await loadNFTBalance();
  setupNFTTransfer();
  setupNFTPurchase();
}

async function loadNFTBalance() {
  try {
    if (!account) {
      playerStats.nftBalance = 0;
      updateNFTBalanceDisplay();
      return;
    }
    
    const storedBalance = localStorage.getItem(`nftBalance_${account}`);
    if (storedBalance) {
      playerStats.nftBalance = parseInt(storedBalance);
    } else {
      playerStats.nftBalance = 0;
      localStorage.setItem(`nftBalance_${account}`, '0');
    }
    
    updateNFTBalanceDisplay();
    
  } catch (err) {
    console.error("Failed to load NFT balance:", err);
    playerStats.nftBalance = 0;
    updateNFTBalanceDisplay();
  }
}

function updateNFTBalanceDisplay() {
  document.getElementById('nft-balance').textContent = playerStats.nftBalance;
  document.getElementById('nft-count').textContent = playerStats.nftBalance;
  document.getElementById('building-nft-balance').textContent = playerStats.nftBalance;
  document.getElementById('bullet-nft-balance').textContent = playerStats.nftBalance;
  document.getElementById('transfer-nft-balance').textContent = playerStats.nftBalance;
  
  const transferAmountInput = document.getElementById('transfer-amount');
  if (transferAmountInput) {
    transferAmountInput.max = playerStats.nftBalance;
  }
  
  const purchaseBtn = document.getElementById('purchase-building');
  const balanceCheck = document.getElementById('nft-balance-check');
  
  if (purchaseBtn && balanceCheck) {
    if (playerStats.nftBalance >= 250) {
      purchaseBtn.disabled = false;
      purchaseBtn.textContent = 'Purchase for 250 NFTs';
      balanceCheck.className = 'nft-balance-check sufficient';
      balanceCheck.innerHTML = `Your NFT Balance: <span id="building-nft-balance">${playerStats.nftBalance}</span> - <span style="color: #10b981;">Sufficient</span>`;
    } else {
      purchaseBtn.disabled = true;
      purchaseBtn.textContent = `Insufficient NFTs (Need ${250 - playerStats.nftBalance} more)`;
      balanceCheck.className = 'nft-balance-check insufficient';
      balanceCheck.innerHTML = `Your NFT Balance: <span id="building-nft-balance">${playerStats.nftBalance}</span> - <span style="color: #ef4444;">Insufficient</span>`;
    }
  }
}

async function addNFTs(amount) {
  playerStats.nftBalance += amount;
  
  if (account) {
    localStorage.setItem(`nftBalance_${account}`, playerStats.nftBalance.toString());
  }
  
  updateNFTBalanceDisplay();
  console.log(`Added ${amount} NFTs to player balance. New balance: ${playerStats.nftBalance}`);
}

async function removeNFTs(amount) {
  if (playerStats.nftBalance < amount) {
    throw new Error(`Insufficient NFT balance. Required: ${amount}, Available: ${playerStats.nftBalance}`);
  }
  
  playerStats.nftBalance -= amount;
  
  if (account) {
    localStorage.setItem(`nftBalance_${account}`, playerStats.nftBalance.toString());
  }
  
  updateNFTBalanceDisplay();
  console.log(`Removed ${amount} NFTs from player balance. New balance: ${playerStats.nftBalance}`);
}

/* ==============================
   NFT TRANSFER SYSTEM
============================== */

function setupNFTTransfer() {
  document.getElementById('transfer-nft-btn-sidebar').addEventListener('click', openNFTTransferModal);
  document.getElementById('transfer-nft-confirm').addEventListener('click', transferNFTsToWallet);
  document.getElementById('close-transfer-modal').addEventListener('click', closeNFTTransferModal);
}

function openNFTTransferModal() {
  if (!account) {
    alert("Please connect your wallet to transfer NFTs.");
    return;
  }
  
  if (playerStats.nftBalance <= 0) {
    alert("You don't have any NFT cards to transfer.");
    return;
  }
  
  document.getElementById('transfer-wallet-address').textContent = account;
  document.getElementById('transfer-amount').value = '';
  document.getElementById('transfer-amount').max = playerStats.nftBalance;
  document.getElementById('nft-transfer-modal').style.display = 'block';
}

function closeNFTTransferModal() {
  document.getElementById('nft-transfer-modal').style.display = 'none';
}

async function transferNFTsToWallet() {
  const amount = parseInt(document.getElementById('transfer-amount').value);
  
  if (!amount || amount <= 0) {
    alert("Please enter a valid amount to transfer.");
    return;
  }
  
  if (amount > playerStats.nftBalance) {
    alert(`Insufficient NFT balance. You have ${playerStats.nftBalance} NFTs, but tried to transfer ${amount}.`);
    return;
  }
  
  try {
    await removeNFTs(amount);
    alert(`✅ Successfully transferred ${amount} NFT cards to your wallet!`);
    closeNFTTransferModal();
  } catch (err) {
    console.error("NFT transfer failed:", err);
    alert(`Transfer failed: ${err.message}`);
  }
}

/* ==============================
   NFT PURCHASE SYSTEM
============================== */

function setupNFTPurchase() {
  document.getElementById('purchase-nft-btn-sidebar').addEventListener('click', openNFTPurchaseModal);
  document.getElementById('purchase-nft-cards').addEventListener('click', openNFTPurchaseModal);
  document.getElementById('buy-250-nft').addEventListener('click', purchaseNFTs);
  document.getElementById('close-nft-purchase-modal').addEventListener('click', closeNFTPurchaseModal);
}

function openNFTPurchaseModal() {
  if (!account) {
    alert("Please connect your wallet to purchase NFT cards.");
    return;
  }
  
  document.getElementById('nft-purchase-modal').style.display = 'block';
}

function closeNFTPurchaseModal() {
  document.getElementById('nft-purchase-modal').style.display = 'none';
}

async function purchaseNFTs() {
  if (!account) {
    alert("Please connect your wallet to purchase NFT cards.");
    return;
  }
  
  try {
    const nftAmount = 250;
    const ethPrice = 0.1;
    
    await web3.eth.sendTransaction({
      from: account,
      to: RECEIVER_ADDRESS,
      value: web3.utils.toWei(ethPrice.toString(), 'ether')
    });
    
    await addNFTs(nftAmount);
    alert(`✅ Successfully purchased ${nftAmount} NFT cards!`);
    closeNFTPurchaseModal();
  } catch (err) {
    console.error("NFT purchase failed:", err);
    alert(`Purchase failed: ${err.message}`);
  }
}

/* ==============================
   BUILDING OWNERSHIP SYSTEM
============================== */

async function initBuildingOwnership() {
  await loadBuildingOwnership();
  setupBuildingInteraction();
  updateBuildingPricesForNFTs();
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
          price: building.price || 250,
          forSale: building.for_sale || false
        });
        
        if (building.owner_name) {
          addOwnerTagToBuilding(building.building_id, building.owner_name);
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

function updateBuildingPricesForNFTs() {
  console.log("Building prices updated to use NFT cards");
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

function openBuildingModal(buildingId, buildingIndex) {
  currentBuildingInteraction = { id: buildingId, index: buildingIndex };
  
  const buildingData = buildingOwnership.get(buildingId) || {
    owner: null,
    ownerName: null,
    price: 250,
    forSale: false
  };
  
  document.getElementById('building-id').textContent = buildingId;
  document.getElementById('building-owner').textContent = buildingData.owner ? 
    `${buildingData.owner.slice(0, 6)}...${buildingData.owner.slice(-4)}` : 'None (Available for Purchase)';
  document.getElementById('building-price').textContent = `${buildingData.price} NFTs`;
  document.getElementById('building-owner-name').textContent = buildingData.ownerName || '-';
  
  updateNFTBalanceDisplay();
  
  const isOwner = buildingData.owner && buildingData.owner.toLowerCase() === account?.toLowerCase();
  
  if (isOwner) {
    document.getElementById('purchase-section').style.display = 'none';
    document.getElementById('owner-section').style.display = 'block';
    
    document.getElementById('new-owner-name').value = buildingData.ownerName || '';
    document.getElementById('new-price').value = buildingData.price;
  } else {
    document.getElementById('purchase-section').style.display = 'block';
    document.getElementById('owner-section').style.display = 'none';
    
    const purchaseBtn = document.getElementById('purchase-building');
    if (buildingData.forSale && buildingData.owner) {
      purchaseBtn.textContent = `Purchase for ${buildingData.price} NFTs`;
      purchaseBtn.disabled = false;
    } else if (buildingData.owner) {
      purchaseBtn.textContent = 'Not for Sale';
      purchaseBtn.disabled = true;
    } else {
      purchaseBtn.textContent = 'Purchase for 250 NFTs';
      purchaseBtn.disabled = false;
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
  
  if (buildingData && buildingData.owner && !buildingData.forSale) {
    alert("This building is not for sale.");
    return;
  }
  
  const nftPrice = buildingData && buildingData.forSale ? buildingData.price : 250;
  
  if (playerStats.nftBalance < nftPrice) {
    alert(`Insufficient NFT balance. You need ${nftPrice} NFTs but only have ${playerStats.nftBalance}.`);
    openNFTPurchaseModal();
    return;
  }
  
  try {
    await removeNFTs(nftPrice);
    
    const { error } = await client.from("building_ownership").upsert({
      building_id: buildingId,
      owner: account,
      owner_name: ownerName,
      price: nftPrice,
      for_sale: false,
      updated_at: new Date().toISOString()
    });
    
    if (error) {
      await addNFTs(nftPrice);
      throw new Error(`Database error: ${error.message}`);
    }
    
    buildingOwnership.set(buildingId, {
      owner: account,
      ownerName: ownerName,
      price: nftPrice,
      forSale: false
    });
    
    addOwnerTagToBuilding(buildingId, ownerName);
    updateOwnedBuildings();
    
    alert(`✅ Building purchased successfully for ${nftPrice} NFT cards!`);
    closeBuildingModal();
    
  } catch (err) {
    console.error("Building purchase failed:", err);
    alert(`Purchase failed: ${err.message}`);
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
  
  if (newPrice < 250) {
    alert("Minimum sale price is 250 NFTs.");
    return;
  }
  
  try {
    const { error } = await client.from("building_ownership").update({
      owner_name: newOwnerName,
      price: newPrice,
      updated_at: new Date().toISOString()
    }).eq('building_id', buildingId);
    
    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }
    
    const buildingData = buildingOwnership.get(buildingId);
    if (buildingData) {
      buildingData.ownerName = newOwnerName;
      buildingData.price = newPrice;
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
  
  try {
    const { error } = await client.from("building_ownership").update({
      for_sale: true,
      updated_at: new Date().toISOString()
    }).eq('building_id', buildingId);
    
    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }
    
    const buildingData = buildingOwnership.get(buildingId);
    if (buildingData) {
      buildingData.forSale = true;
      buildingOwnership.set(buildingId, buildingData);
    }
    
    alert("✅ Building listed for sale!");
    
  } catch (err) {
    console.error("Building sale listing failed:", err);
    alert(`Sale listing failed: ${err.message}`);
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
      item.innerHTML = `
        <div>
          <strong>${buildingId}</strong><br>
          <span>${buildingData.ownerName || 'Unnamed'}</span>
        </div>
        <div style="text-align: right;">
          <div>${buildingData.price} NFTs</div>
          <small>${buildingData.forSale ? 'For Sale' : 'Not for Sale'}</small>
        </div>
      `;
      container.appendChild(item);
    }
  });
}

/* ==============================
   BULLET SYSTEM - IMPROVED
============================== */

function setupBulletPurchaseWithNFTs() {
  document.getElementById('buy-500-nft').addEventListener('click', buyBulletsWithNFT);
  document.getElementById('buy-100').addEventListener('click', () => buyBullets(100));
  document.getElementById('close-bullet-modal').addEventListener('click', closeBulletPurchaseModal);
}

async function buyBulletsWithNFT() {
  if (!account) {
    alert("Please connect your wallet to purchase bullets with NFTs.");
    return;
  }
  
  const nftCost = 1;
  const bulletAmount = 500;
  
  if (playerStats.nftBalance < nftCost) {
    alert(`Insufficient NFT balance. You need ${nftCost} NFT but only have ${playerStats.nftBalance}.`);
    return;
  }
  
  try {
    await removeNFTs(nftCost);
    playerStats.bullets = Math.min(playerStats.bullets + bulletAmount, playerStats.maxBullets);
    updateBulletDisplay();
    alert(`✅ Successfully purchased ${bulletAmount} bullets for ${nftCost} NFT card!`);
    closeBulletPurchaseModal();
  } catch (err) {
    console.error("Bullet purchase with NFT failed:", err);
    alert(`Purchase failed: ${err.message}`);
  }
}

function showBulletPurchaseModal() {
  if (!canMove) return;
  
  document.getElementById('bullet-nft-balance').textContent = playerStats.nftBalance;
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
  if (!canMove) {
    console.log("Cannot shoot - movement locked");
    return;
  }
  
  const currentTime = Date.now();
  if (currentTime - lastShotTime < shotCooldown) {
    return;
  }
  
  if (playerStats.bullets <= 0) {
    showBulletPurchaseModal();
    return;
  }
  
  playerStats.bullets--;
  updateBulletDisplay();
  
  // Get camera direction
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  
  // Start bullet slightly in front of player
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
    maxDistance: 2000 // Increased from 1000
  };
  
  bullets.push(bullet);
  createBulletVisual(bullet);
  lastShotTime = currentTime;
  
  // Visual feedback
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
    
    // Update position with proper velocity
    const velocityStep = bullet.velocity.clone().multiplyScalar(0.1);
    bullet.position.add(velocityStep);
    bullet.distanceTraveled += velocityStep.length();
    
    // Update visual meshes
    if (bullet.mesh) bullet.mesh.position.copy(bullet.position);
    if (bullet.glowMesh) bullet.glowMesh.position.copy(bullet.position);
    
    checkBulletCollisions(bullet, i);
    
    // Remove bullets that go too far
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
      // Create impact effect
      createBulletImpact(bullet.position);
      bullet.active = false;
      return;
    }
  }
  
  // Check NFT collisions
  for (let i = 0; i < nftObjects.length; i++) {
    const nft = nftObjects[i];
    const nftBox = new THREE.Box3().setFromObject(nft);
    
    if (nftBox.containsPoint(bullet.position)) {
      createBulletImpact(bullet.position);
      bullet.active = false;
      
      // Reward player for hitting NFT
      playerStats.bullets = Math.min(playerStats.bullets + 50, playerStats.maxBullets);
      playerStats.score += 50;
      updateBulletDisplay();
      updateScoreDisplay();
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
  // Create a simple particle effect
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
      
      // Random direction
      const direction = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2
      ).normalize();
      
      scene.add(particle);
      
      // Animate particle
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
      web3 = new Web3(window.ethereum);
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      account = accounts[0];
    } else {
      const provider = new WalletConnectProvider.default({
        rpc: { 1: "https://mainnet.infura.io/v3/d71dd33696d449e488a88bdc02a6093c" },
      });
      await provider.enable();
      web3 = new Web3(provider);
      const accounts = await web3.eth.getAccounts();
      account = accounts[0];
    }

    document.getElementById("walletStatus").innerText =
      `✅ Connected: ${account.slice(0, 6)}...${account.slice(-4)}`;

    nftContract = new web3.eth.Contract(NFT_ABI, NFT_CONTRACT_ADDRESS);
    
    await loadNFTBalance();
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
  
  prevTime = time;
  renderer.render(scene, camera);
}

/* ==============================
   NFT INTERACTION - IMPROVED
============================== */

function checkNFTInteraction() {
  nftObjects.forEach(nft => {
    if (nft.userData.originalEmissive !== undefined) {
      nft.material.emissive.setHex(nft.userData.originalEmissive);
    }
  });
  
  currentIntersected = null;
  let closestNFT = null;
  let closestDistance = Infinity;
  
  nftObjects.forEach(nft => {
    // Check if building is blocking the view
    if (isNFTBlockedByBuilding(nft)) {
      return; // Skip this NFT if blocked
    }
    
    const position = nft.position.clone();
    position.project(camera);
    
    if (position.x >= -1 && position.x <= 1 && 
        position.y >= -1 && position.y <= 1 && 
        position.z >= -1 && position.z <= 1) {
      
      const distance = nft.position.distanceTo(camera.position);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestNFT = nft;
      }
    }
  });
  
  if (closestNFT) {
    currentIntersected = closestNFT;
    closestNFT.userData.originalEmissive = closestNFT.material.emissive.getHex();
    closestNFT.material.emissive.setHex(0x3b82f6);
    
    if (!isMobile) document.body.style.cursor = 'pointer';
  } else {
    if (!isMobile) document.body.style.cursor = 'auto';
  }
}

function isNFTBlockedByBuilding(nft) {
  const raycaster = new THREE.Raycaster();
  const direction = new THREE.Vector3();
  
  // Get direction from camera to NFT
  direction.subVectors(nft.position, camera.position).normalize();
  
  raycaster.set(camera.position, direction);
  
  // Check for intersections with buildings
  const buildingIntersections = raycaster.intersectObjects(buildingObjects);
  
  if (buildingIntersections.length > 0) {
    const distanceToNFT = camera.position.distanceTo(nft.position);
    const distanceToBuilding = buildingIntersections[0].distance;
    
    // If building is closer than NFT, then NFT is blocked
    if (distanceToBuilding < distanceToNFT) {
      return true;
    }
  }
  
  return false;
}

function createNFTPlatform(x, y, z) {
  const platformGeometry = new THREE.CylinderGeometry(6, 6, 0.5, 16);
  const platformMaterial = new THREE.MeshLambertMaterial({ 
    color: 0x2a2a5a,
    transparent: true,
    opacity: 0.8
  });
  
  const platform = new THREE.Mesh(platformGeometry, platformMaterial);
  platform.position.set(x, y - 4, z);
  platform.receiveShadow = true;
  scene.add(platform);
  
  const platformBox = new THREE.Box3().setFromObject(platform);
  collisionObjects.push(platformBox);
  nftPlatforms.push(platform);
  return platform;
}

function createNFTPlane(nftData, position) {
  const geometry = new THREE.PlaneGeometry(10, 10);
  const textureLoader = new THREE.TextureLoader();
  const material = new THREE.MeshStandardMaterial({ 
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9
  });
  
  const plane = new THREE.Mesh(geometry, material);
  plane.position.set(position.x, position.y, position.z);
  plane.rotation.y = Math.random() * Math.PI * 2;
  plane.userData = {
    nftData: nftData,
    isNFT: true,
    originalEmissive: 0x000000
  };
  
  textureLoader.load(nftData.image_url || 'https://via.placeholder.com/400x400?text=NFT+Image', function(texture) {
    material.map = texture;
    material.needsUpdate = true;
  }, undefined, function(err) {
    console.error('Error loading NFT image:', err);
  });
  
  plane.castShadow = true;
  plane.receiveShadow = true;
  scene.add(plane);
  nftObjects.push(plane);
  
  const glowGeometry = new THREE.PlaneGeometry(10.5, 10.5);
  const glowMaterial = new THREE.MeshBasicMaterial({ 
    color: 0x3b82f6,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide
  });
  const glow = new THREE.Mesh(glowGeometry, glowMaterial);
  glow.position.copy(plane.position);
  glow.rotation.copy(plane.rotation);
  scene.add(glow);
  plane.userData.glow = glow;
}

function openNFTModal(nftData) {
  if (!canMove) return;
  
  document.getElementById('modal-image').src = nftData.image_url || 'https://via.placeholder.com/400x400?text=NFT+Image';
  document.getElementById('modal-title').textContent = nftData.name || `${nftData.collection || 'Untitled'} #${nftData.token_id || ''}`;
  document.getElementById('modal-description').textContent = nftData.description || 'No description available';
  document.getElementById('modal-price').textContent = nftData.price_eth || 'N/A';
  
  const actions = document.getElementById('modal-actions');
  actions.innerHTML = '';
  
  if (!account) {
    const connectBtn = document.createElement('button');
    connectBtn.textContent = 'Connect Wallet to Interact';
    connectBtn.onclick = connectWallet;
    actions.appendChild(connectBtn);
  } else {
    const buyBtn = document.createElement('button');
    buyBtn.textContent = 'Buy NFT';
    buyBtn.onclick = () => buyNFT(nftData);
    actions.appendChild(buyBtn);
    
    const transferBtn = document.createElement('button');
    transferBtn.textContent = 'Transfer NFT';
    transferBtn.onclick = () => transferNFT(nftData);
    actions.appendChild(transferBtn);
  }
  
  document.getElementById('nft-modal').style.display = 'block';
}

document.getElementById('close-modal').addEventListener('click', function() {
  document.getElementById('nft-modal').style.display = 'none';
});

document.addEventListener('click', function onClick(event) {
  if (!canMove) return;
  
  if (((!isMobile && controls && controls.isLocked) || (isMobile && currentIntersected)) && currentIntersected) {
    const nftData = currentIntersected.userData.nftData;
    openNFTModal(nftData);
  }
});

/* ==============================
   NFT LOADING & MANAGEMENT
============================== */

async function loadNFTs() {
  try {
    const { data, error } = await client.from("nfts").select("*").order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading NFTs:", error);
      return;
    }
    
    if (!data || data.length === 0) {
      console.log("No NFTs found in database");
      return;
    }

    console.log(`Loaded ${data.length} NFTs from Supabase`);

    nftObjects.forEach(obj => {
      scene.remove(obj);
      if (obj.userData.glow) scene.remove(obj.userData.glow);
    });
    nftObjects = [];
    
    nftPlatforms.forEach(platform => scene.remove(platform));
    nftPlatforms = [];
    
    createRandomNFTColumn(data);
    document.getElementById('nft-count').textContent = data.length;
    
  } catch (err) {
    console.error("Failed to load NFTs:", err);
  }
}

function createRandomNFTColumn(nfts) {
  const columnHeight = 500;
  const baseX = 0;
  const baseZ = 0;
  const maxRadius = 40;
  
  nfts.forEach((nft, index) => {
    const height = Math.random() * columnHeight;
    const radius = Math.random() * maxRadius;
    const angle = Math.random() * Math.PI * 2;
    
    const x = baseX + Math.cos(angle) * radius;
    const y = height + 10;
    const z = baseZ + Math.sin(angle) * radius;
    
    createNFTPlatform(x, y, z);
    createNFTPlane(nft, { x, y, z });
  });
}

async function buyNFT(nftData) {
  if (!account) return alert("Connect wallet first.");
  try {
    const priceEth = nftData.price_eth || 0.1;
    const totalEth = web3.utils.toWei((Number(priceEth) + 6/1000).toString(), 'ether');
    await web3.eth.sendTransaction({ from: account, to: RECEIVER_ADDRESS, value: totalEth });

    await client.from("nfts").update({ owner: account, sold: true }).eq("token_id", nftData.token_id);
    alert("✅ NFT purchased! Payment sent.");
    loadNFTs();
    document.getElementById('nft-modal').style.display = 'none';
  } catch(err) { 
    console.error(err); 
    alert("Buy failed: " + err.message); 
  }
}

async function sellNFT(nftData) {
  if (!account) return alert("Connect wallet first.");
  const priceEth = prompt("Enter sale price in ETH:");
  if (!priceEth) return;
  await client.from("nfts").update({ sold: false, price_eth: priceEth, owner: account }).eq("token_id", nftData.token_id);
  alert("✅ NFT listed for sale!");
  loadNFTs();
  document.getElementById('nft-modal').style.display = 'none';
}

async function transferNFT(nftData) {
  if (!account) return alert("Connect wallet first.");
  const recipient = prompt("Enter recipient wallet address:");
  if (!recipient) return;
  try {
    const feeEth = web3.utils.toWei((6/1000).toString(), 'ether');
    await web3.eth.sendTransaction({ from: account, to: RECEIVER_ADDRESS, value: feeEth });

    await nftContract.methods.safeTransferFrom(account, recipient, nftData.token_id).send({ from: account });

    await client.from("nfts").update({ owner: recipient }).eq("token_id", nftData.token_id);
    alert("✅ NFT transferred! Fee sent.");
    loadNFTs();
    document.getElementById('nft-modal').style.display = 'none';
  } catch(err) { 
    console.error(err); 
    alert("Transfer failed: " + err.message); 
  }
}

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

function setupMobileControls() {
  document.getElementById('forward-btn').addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (canMove) moveForward = true;
  });
  document.getElementById('forward-btn').addEventListener('touchend', (e) => {
    e.preventDefault();
    moveForward = false;
  });
  
  document.getElementById('backward-btn').addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (canMove) moveBackward = true;
  });
  document.getElementById('backward-btn').addEventListener('touchend', (e) => {
    e.preventDefault();
    moveBackward = false;
  });
  
  document.getElementById('left-btn').addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (canMove) moveLeft = true;
  });
  document.getElementById('left-btn').addEventListener('touchend', (e) => {
    e.preventDefault();
    moveLeft = false;
  });
  
  document.getElementById('right-btn').addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (canMove) moveRight = true;
  });
  document.getElementById('right-btn').addEventListener('touchend', (e) => {
    e.preventDefault();
    moveRight = false;
  });
  
  document.getElementById('shoot-btn').addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (canMove) shootBullet();
  });
  
  const lookControls = document.getElementById('look-controls');
  lookControls.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (!canMove) return;
    
    if (lookTouchId === null) {
      const touch = e.touches[0];
      lookTouchId = touch.identifier;
      lookStartX = touch.clientX;
      lookStartY = touch.clientY;
    }
  });
  
  lookControls.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!canMove) return;
    
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === lookTouchId) {
        const deltaX = touch.clientX - lookStartX;
        const deltaY = touch.clientY - lookStartY;
        lookX = deltaX * 0.5;
        lookY = deltaY * 0.5;
        lookStartX = touch.clientX;
        lookStartY = touch.clientY;
        break;
      }
    }
  });
  
  lookControls.addEventListener('touchend', (e) => {
    e.preventDefault();
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

/* ==============================
   CHAT SYSTEM
============================== */

function createChatMessageBubble(playerId, playerName, message, isOwn = false) {
    removeChatMessage(playerId);
    
    const chatBubble = document.createElement('div');
    chatBubble.className = `chat-bubble ${isOwn ? 'own-message' : ''}`;
    chatBubble.innerHTML = `
        <div class="chat-bubble-sender">${playerName}</div>
        <div class="chat-bubble-text">${message}</div>
    `;
    
    document.body.appendChild(chatBubble);
    
    let playerPosition;
    if (playerId === multiplayer.playerId) {
        playerPosition = window.playerAvatar ? window.playerAvatar.position.clone() : new THREE.Vector3(-150, 3, -150);
    } else {
        const otherPlayer = multiplayer.otherPlayers.get(playerId);
        playerPosition = otherPlayer && otherPlayer.group ? 
            otherPlayer.group.position.clone() : 
            new THREE.Vector3(0, 0, 0);
    }
    
    const screenPosition = playerPosition.clone();
    screenPosition.project(camera);
    
    const x = (screenPosition.x * 0.5 + 0.5) * window.innerWidth;
    const y = -(screenPosition.y * 0.5 - 0.5) * window.innerHeight;
    
    chatBubble.style.left = `${x}px`;
    chatBubble.style.top = `${y - 50}px`;
    
    const timer = setTimeout(() => {
        removeChatMessage(playerId);
    }, 10000);
    
    activeChatMessages.set(playerId, {
        element: chatBubble,
        timer: timer,
        position: playerPosition
    });
    
    setTimeout(() => chatBubble.style.opacity = '1', 10);
    return chatBubble;
}

function removeChatMessage(playerId) {
    if (activeChatMessages.has(playerId)) {
        const { element, timer } = activeChatMessages.get(playerId);
        clearTimeout(timer);
        element.style.opacity = '0';
        setTimeout(() => {
            if (element.parentNode) element.parentNode.removeChild(element);
        }, 300);
        activeChatMessages.delete(playerId);
    }
}

/* ==============================
   MULTIPLAYER SYSTEM
============================== */

class WebRTCMultiplayer {
  constructor() {
    this.peers = new Map();
    this.otherPlayers = new Map();
    this.roomId = 'nft-universe-main';
    this.playerId = this.generatePlayerId();
    this.playerName = 'Explorer';
    this.playerColor = 0x3B82F6;
    this.signalingChannel = null;
    this.dataChannels = new Map();
    
    this.init();
  }

  generatePlayerId() {
    if (!localStorage.getItem('playerId')) {
      localStorage.setItem('playerId', 'player-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9));
    }
    return localStorage.getItem('playerId');
  }

  async init() {
    this.setupSignaling();
    this.setupChat();
    
    const nameInput = document.getElementById('player-name');
    if (nameInput) {
      nameInput.addEventListener('input', (e) => {
        this.playerName = e.target.value.trim() || 'Explorer';
      });
    }
  }

  setupSignaling() {
    try {
      this.signalingChannel = new BroadcastChannel('nft-universe-webrtc');
      
      this.signalingChannel.addEventListener('message', async (event) => {
        const message = event.data;
        
        if (message.roomId !== this.roomId || message.playerId === this.playerId) return;
        
        switch (message.type) {
          case 'player-join':
            await this.handlePlayerJoin(message);
            break;
          case 'offer':
            await this.handleOffer(message);
            break;
          case 'answer':
            await this.handleAnswer(message);
            break;
          case 'ice-candidate':
            await this.handleIceCandidate(message);
            break;
          case 'player-data':
            this.handlePlayerData(message);
            break;
          case 'player-left':
            this.handlePlayerLeft(message);
            break;
          case 'chat-message':
            this.handleChatMessage(message);
            break;
        }
      });

      this.broadcastSignal({
        type: 'player-join',
        playerId: this.playerId,
        playerData: this.getPlayerData()
      });

    } catch (error) {
      console.log('BroadcastChannel not supported, using localStorage fallback');
      this.setupLocalStorageSignaling();
    }
  }

  setupLocalStorageSignaling() {
    setInterval(() => {
      const signals = JSON.parse(localStorage.getItem('nft-universe-signals') || '[]');
      const newSignals = [];
      
      signals.forEach(signal => {
        if (signal.roomId === this.roomId && signal.playerId !== this.playerId) {
          this.handleSignalingMessage(signal);
        } else {
          newSignals.push(signal);
        }
      });
      
      localStorage.setItem('nft-universe-signals', JSON.stringify(newSignals));
    }, 1000);
  }

  broadcastSignal(message) {
    message.roomId = this.roomId;
    message.playerId = this.playerId;
    message.timestamp = Date.now();
    
    if (this.signalingChannel) {
      this.signalingChannel.postMessage(message);
    } else {
      const signals = JSON.parse(localStorage.getItem('nft-universe-signals') || '[]');
      signals.push(message);
      localStorage.setItem('nft-universe-signals', JSON.stringify(signals));
    }
  }

  async handlePlayerJoin(message) {
    console.log('Player joined:', message.playerId);
    await this.createPeerConnection(message.playerId);
  }

  async createPeerConnection(peerId) {
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    const peerConnection = new RTCPeerConnection(configuration);
    const dataChannel = peerConnection.createDataChannel('nft-universe', {
      ordered: true
    });

    this.setupDataChannel(dataChannel, peerId);

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.broadcastSignal({
          type: 'ice-candidate',
          to: peerId,
          candidate: event.candidate
        });
      }
    };

    peerConnection.ondatachannel = (event) => {
      this.setupDataChannel(event.channel, peerId);
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    this.broadcastSignal({
      type: 'offer',
      to: peerId,
      offer: offer
    });

    this.peers.set(peerId, peerConnection);
    this.dataChannels.set(peerId, dataChannel);
  }

  async handleOffer(message) {
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    const peerConnection = new RTCPeerConnection(configuration);

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.broadcastSignal({
          type: 'ice-candidate',
          to: message.playerId,
          candidate: event.candidate
        });
      }
    };

    peerConnection.ondatachannel = (event) => {
      this.setupDataChannel(event.channel, message.playerId);
    };

    await peerConnection.setRemoteDescription(message.offer);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    this.broadcastSignal({
      type: 'answer',
      to: message.playerId,
      answer: answer
    });

    this.peers.set(message.playerId, peerConnection);
  }

  async handleAnswer(message) {
    const peerConnection = this.peers.get(message.playerId);
    if (peerConnection) {
      await peerConnection.setRemoteDescription(message.answer);
    }
  }

  async handleIceCandidate(message) {
    const peerConnection = this.peers.get(message.playerId);
    if (peerConnection && message.candidate) {
      await peerConnection.addIceCandidate(message.candidate);
    }
  }

  setupDataChannel(dataChannel, peerId) {
    dataChannel.onopen = () => {
      console.log('Data channel connected to', peerId);
      this.sendPlayerData(peerId);
    };

    dataChannel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handlePlayerData(data);
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    };

    dataChannel.onclose = () => {
      console.log('Data channel closed with', peerId);
      this.handlePlayerLeft({ playerId: peerId });
    };

    this.dataChannels.set(peerId, dataChannel);
  }

  getPlayerData() {
    return {
      name: this.playerName,
      color: this.playerColor,
      avatar: window.selectedAvatar,
      position: window.playerAvatar ? {
        x: window.playerAvatar.position.x,
        y: window.playerAvatar.position.y,
        z: window.playerAvatar.position.z,
        rotation: window.playerAvatar.rotation.y
      } : { x: -150, y: 3, z: -150, rotation: 0 }
    };
  }

  sendPlayerData(toPeerId = null) {
    const playerData = {
      type: 'player-data',
      playerId: this.playerId,
      data: this.getPlayerData()
    };

    if (toPeerId) {
      const dataChannel = this.dataChannels.get(toPeerId);
      if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify(playerData));
      }
    } else {
      this.dataChannels.forEach((dataChannel, peerId) => {
        if (dataChannel.readyState === 'open') {
          dataChannel.send(JSON.stringify(playerData));
        }
      });
    }
  }

  handlePlayerData(message) {
    if (message.type === 'player-data') {
      this.createOrUpdateOtherPlayer(message.playerId, message.data);
    } else if (message.type === 'chat-message') {
      this.handleChatMessage(message);
    }
  }

  handleChatMessage(message) {
    this.addChatMessage(message.sender, message.text, false);
    createChatMessageBubble(message.playerId, message.sender, message.text, false);
  }

  handlePlayerLeft(message) {
    this.removeOtherPlayer(message.playerId);
    removeChatMessage(message.playerId);
  }

  createOrUpdateOtherPlayer(playerId, playerData) {
    if (this.otherPlayers.has(playerId)) {
      this.updateOtherPlayerPosition(playerId, playerData.position);
    } else {
      this.createOtherPlayer(playerId, playerData);
    }
  }

  createOtherPlayer(playerId, playerData) {
    if (window.scene && playerData.position) {
      const playerGroup = new THREE.Group();
      
      const boardGeometry = new THREE.PlaneGeometry(10, 10);
      const boardMaterial = new THREE.MeshStandardMaterial({ 
        color: playerData.color || 0x3B82F6,
        metalness: 0.8,
        roughness: 0.2,
        side: THREE.DoubleSide
      });
      const board = new THREE.Mesh(boardGeometry, boardMaterial);
      board.rotation.x = -Math.PI / 2;
      board.castShadow = true;
      board.receiveShadow = true;
      playerGroup.add(board);

      let avatar;
      if (playerData.avatar === 'boy') {
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
      } else {
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

      avatar.position.y = 0.1;
      avatar.castShadow = true;
      playerGroup.add(avatar);

      playerGroup.position.set(
        playerData.position.x,
        playerData.position.y,
        playerData.position.z
      );
      playerGroup.rotation.y = playerData.position.rotation;
      playerGroup.castShadow = true;
      
      window.scene.add(playerGroup);

      const nameTag = this.createNameTag(playerData.name, playerData.color);
      playerGroup.add(nameTag);

      this.otherPlayers.set(playerId, {
        group: playerGroup,
        name: playerData.name,
        color: playerData.color,
        avatar: playerData.avatar
      });

      this.updatePlayersPanel();
      console.log('Created other player:', playerId, playerData.name);
    }
  }

  createNameTag(name, color) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 64;
    
    context.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    context.font = '24px Arial';
    context.fillStyle = '#FFFFFF';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(name, canvas.width / 2, canvas.height / 2);
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(material);
    sprite.position.y = 5;
    sprite.scale.set(10, 2.5, 1);
    return sprite;
  }

  updateOtherPlayerPosition(playerId, position) {
    const otherPlayer = this.otherPlayers.get(playerId);
    if (otherPlayer && otherPlayer.group) {
      otherPlayer.group.position.set(position.x, position.y, position.z);
      otherPlayer.group.rotation.y = position.rotation;
    }
  }

  removeOtherPlayer(playerId) {
    const otherPlayer = this.otherPlayers.get(playerId);
    if (otherPlayer && otherPlayer.group && window.scene) {
      window.scene.remove(otherPlayer.group);
      this.otherPlayers.delete(playerId);
      this.updatePlayersPanel();
    }
  }

  updatePlayersPanel() {
    const playersList = document.getElementById('players-list');
    const playerCount = document.getElementById('player-count');
    
    if (playersList && playerCount) {
      playersList.innerHTML = '';
      playerCount.textContent = this.otherPlayers.size + 1;
      
      const currentPlayerItem = document.createElement('div');
      currentPlayerItem.className = 'player-item';
      currentPlayerItem.innerHTML = `
        <div class="player-color" style="background-color: #${this.playerColor.toString(16).padStart(6, '0')};"></div>
        <div class="player-name">${this.playerName} (You)</div>
      `;
      playersList.appendChild(currentPlayerItem);
      
      this.otherPlayers.forEach((player, playerId) => {
        const playerItem = document.createElement('div');
        playerItem.className = 'player-item';
        playerItem.innerHTML = `
          <div class="player-color" style="background-color: #${player.color.toString(16).padStart(6, '0')};"></div>
          <div class="player-name">${player.name}</div>
        `;
        playersList.appendChild(playerItem);
      });
    }
  }

  sendPositionUpdate() {
    if (window.playerAvatar) {
      this.sendPlayerData();
    }
  }

  setupChat() {
    const chatInput = document.getElementById('chat-input');
    const chatSend = document.getElementById('chat-send');
    
    if (chatSend) {
      chatSend.addEventListener('click', () => this.sendChatMessage());
    }
    
    if (chatInput) {
      chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.sendChatMessage();
        }
      });

      if (!window.isMobile) {
        document.addEventListener('keydown', (e) => {
          if (e.key === 't' || e.key === 'T') {
            document.getElementById('sidebar').classList.add('active');
            canMove = false;
            document.querySelector('.modal-overlay').classList.add('active');
            setTimeout(() => chatInput.focus(), 100);
          }
        });
      }
    }
  }

  sendChatMessage() {
    const chatInput = document.getElementById('chat-input');
    const message = chatInput.value.trim();
    
    if (message) {
      const chatData = {
        type: 'chat-message',
        playerId: this.playerId,
        sender: this.playerName,
        text: message
      };
      
      this.dataChannels.forEach((dataChannel, peerId) => {
        if (dataChannel.readyState === 'open') {
          dataChannel.send(JSON.stringify(chatData));
        }
      });
      
      this.addChatMessage(this.playerName, message, true);
      createChatMessageBubble(this.playerId, this.playerName, message, true);
      chatInput.value = '';
    }
  }

  addChatMessage(sender, message, isOwn) {
    const chatMessages = document.getElementById('chat-messages');
    if (chatMessages) {
      const messageElement = document.createElement('div');
      messageElement.className = 'chat-message';
      
      if (isOwn) {
        messageElement.innerHTML = `<span class="chat-sender">You:</span> ${message}`;
      } else {
        messageElement.innerHTML = `<span class="chat-sender">${sender}:</span> ${message}`;
      }
      
      chatMessages.appendChild(messageElement);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }

  disconnect() {
    this.broadcastSignal({
      type: 'player-left',
      playerId: this.playerId
    });
    
    this.peers.forEach((peerConnection, peerId) => peerConnection.close());
    this.otherPlayers.forEach((player, playerId) => this.removeOtherPlayer(playerId));
    if (this.signalingChannel) this.signalingChannel.close();
  }
}

// Clean up multiplayer when page unloads
window.addEventListener('beforeunload', () => {
  if (multiplayer) {
    multiplayer.disconnect();
  }
});

// Initialize the game
console.log("NFT Shooter Universe initialized successfully!");
