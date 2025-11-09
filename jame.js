/* ==============================
   FIXED CORE GAME CODE
============================== */

// Add missing variable at the top
let frameCount = 0;

// Add transaction locking sets
let buildingTransactions = new Set();
let tokenTransactions = new Set();

/* ==============================
   FIXED INITIALIZATION
============================== */

document.addEventListener('DOMContentLoaded', function() {
  console.log("🎮 NFT Shooter Universe - Initializing");
  
  // Setup mobile controls if needed
  if (isMobile) {
    document.getElementById('desktop-instructions').style.display = 'none';
    document.getElementById('mobile-instructions').style.display = 'block';
    setupMobileControls();
  }

  // Initialize avatar selection
  setupAvatarSelection();
  
  // Check auth in background
  checkAuthBackground();
});

async function checkAuthBackground() {
  try {
    const { data } = await client.auth.getSession();
    if (data.session) {
      console.log("🔐 User is signed in");
      document.body.classList.add('signed-in');
    } else {
      console.log("🎮 Free roam mode");
      document.body.classList.remove('signed-in');
    }
  } catch (error) {
    console.log("Auth check failed:", error);
    document.body.classList.remove('signed-in');
  }
}

/* ==============================
   FIXED AVATAR SELECTION
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

  if (confirmButton) {
    confirmButton.addEventListener('click', () => {
      if (selectedAvatar) {
        startGame();
      } else {
        alert('Please select an avatar to continue');
      }
    });
  }
}

function startGame() {
  console.log("🚀 Starting game...");
  
  // Hide avatar selection
  document.getElementById('avatar-selection').style.display = 'none';
  
  // Initialize game systems
  init3DScene();
  loadNFTs();
  initTokenSystem();
  initBuildingOwnership();
  setupBulletPurchaseWithTokens();
  
  // Check authentication status
  checkAuthenticationStatus();
  
  console.log("🎯 Game started successfully!");
}

/* ==============================
   FIXED AUTHENTICATION
============================== */

function checkAuthenticationStatus() {
  client.auth.getSession().then(({ data }) => {
    if (data.session) {
      document.body.classList.add('signed-in');
      enableFullFeatures();
      removeBots();
    } else {
      document.body.classList.remove('signed-in');
      enableFreeRoamMode();
      createBots();
    }
  }).catch(error => {
    console.log("Auth check failed:", error);
    document.body.classList.remove('signed-in');
    enableFreeRoamMode();
    createBots();
  });
}

function enableFreeRoamMode() {
  // Disable purchase buttons
  const elementsToDisable = [
    'transfer-token-btn-sidebar',
    'purchase-token-btn-sidebar', 
    'buy-500-token',
    'buy-100',
    'purchase-building',
    'purchase-token-cards'
  ];

  elementsToDisable.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.style.background = '#6b7280';
      el.onclick = () => {
        alert('Please sign in to access this feature');
      };
    }
  });
}

function enableFullFeatures() {
  // Re-enable buttons
  const transferBtn = document.getElementById('transfer-token-btn-sidebar');
  if (transferBtn) {
    transferBtn.style.background = '';
    transferBtn.onclick = () => openTokenTransferModal();
  }
  
  const purchaseBtn = document.getElementById('purchase-token-btn-sidebar');
  if (purchaseBtn) {
    purchaseBtn.style.background = '#10b981';
    purchaseBtn.onclick = () => openTokenPurchaseModal();
  }
  
  const bulletTokenBtn = document.getElementById('buy-500-token');
  if (bulletTokenBtn) {
    bulletTokenBtn.style.background = '#10b981';
    bulletTokenBtn.onclick = () => buyBulletsWithToken();
  }
}

/* ==============================
   FIXED BOT SYSTEM
============================== */

function updateBots() {
  // Only update bots every 4 frames for performance
  if (frameCount % 4 !== 0) return;
  
  if (!document.body.classList.contains('signed-in')) {
    updateWelcomeBot();
    updateAssistantBot();
    updateBotBullets();
  }
}

function updateWelcomeBot() {
  const bot = bots.welcome;
  if (!bot.active || !bot.mesh) return;
  
  const direction = new THREE.Vector3()
    .subVectors(bot.targetPosition, bot.position)
    .normalize();
  
  const distanceToTarget = bot.position.distanceTo(bot.targetPosition);
  
  if (distanceToTarget > 3) {
    bot.position.add(direction.multiplyScalar(bot.speed));
    bot.mesh.position.copy(bot.position);
  } else {
    // Set new random target
    bot.targetPosition.set(
      Math.random() * 400 - 200,
      3,
      Math.random() * 400 - 200
    );
  }
}

/* ==============================
   FIXED TOKEN SYSTEM
============================== */

async function addTokens(amount, reason = "") {
  // Validate amount
  if (amount <= 0) {
    console.error("Invalid token amount:", amount);
    return;
  }
  
  playerStats.gameTokens += amount;
  
  // Save to localStorage
  if (account) {
    localStorage.setItem(`gameTokens_${account}`, playerStats.gameTokens.toString());
  }
  
  updateTokenDisplay();
  
  // Show notification
  if (reason) {
    showTokenReward(amount, reason);
  }
}

async function removeTokens(amount) {
  if (playerStats.gameTokens < amount) {
    throw new Error(`Insufficient tokens. Required: ${amount}, Available: ${playerStats.gameTokens}`);
  }
  
  playerStats.gameTokens -= amount;
  
  if (account) {
    localStorage.setItem(`gameTokens_${account}`, playerStats.gameTokens.toString());
  }
  
  updateTokenDisplay();
}

function showTokenReward(amount, reason) {
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
  `;
  notification.innerHTML = `+${amount} Tokens!<br><small>${reason}</small>`;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 3000);
}

/* ==============================
   FIXED BUILDING SYSTEM
============================== */

async function purchaseBuilding() {
  if (!document.body.classList.contains('signed-in')) {
    alert("🔒 Please sign in to purchase buildings");
    return;
  }
  
  if (!currentBuildingInteraction) return;
  
  const buildingId = currentBuildingInteraction.id;
  
  // Prevent duplicate transactions
  if (buildingTransactions.has(buildingId)) {
    alert("Transaction already in progress for this building");
    return;
  }
  
  buildingTransactions.add(buildingId);
  
  try {
    const buildingData = buildingOwnership.get(buildingId);
    const purchasePrice = buildingData && buildingData.forSale ? 
      buildingData.salePrice : GAME_CONFIG.BUILDING_BASE_COST;
    
    if (playerStats.gameTokens < purchasePrice) {
      alert(`Insufficient tokens! You need ${purchasePrice} but only have ${playerStats.gameTokens}.`);
      return;
    }
    
    await removeTokens(purchasePrice);
    
    // Update ownership
    buildingOwnership.set(buildingId, {
      owner: account,
      ownerName: 'New Owner',
      purchasePrice: purchasePrice,
      salePrice: null,
      forSale: false
    });
    
    alert(`✅ Building purchased for ${purchasePrice} tokens!`);
    updateTokenDisplay();
    closeBuildingModal();
    
  } catch (err) {
    console.error("Building purchase failed:", err);
    alert(`Purchase failed: ${err.message}`);
  } finally {
    buildingTransactions.delete(buildingId);
  }
}

/* ==============================
   FIXED BULLET PURCHASE
============================== */

async function buyBulletsWithToken() {
  if (!document.body.classList.contains('signed-in')) {
    alert("🔒 Please sign in to purchase bullets with tokens");
    return;
  }
  
  const tokenCost = 1;
  const bulletAmount = 500;
  
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
    alert(`Purchase failed: ${err.message}`);
  }
}

/* ==============================
   FIXED ANIMATION LOOP
============================== */

function animate() {
  requestAnimationFrame(animate);
  
  const time = performance.now();
  const delta = (time - prevTime) / 1000;
  hoverTime += delta;
  frameCount++; // Increment frame counter
  
  // Player movement (existing code)
  if (((controls && controls.isLocked) || isMobile) && canMove) {
    // ... your existing movement code ...
  }
  
  // Update bots with frame skipping
  if (frameCount % 4 === 0) {
    updateBots();
  }
  
  // Update other game systems
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
   SIMPLE ERROR HANDLING
============================== */

function showError(message) {
  console.error("Game Error:", message);
  alert("Game Error: " + message);
}

// Add safe wrapper for game updates
function safeUpdate() {
  try {
    // Your game update logic here
  } catch (error) {
    console.error("Update error:", error);
  }
}

// Initialize
console.log("🎮 NFT Shooter Universe - Fixed Version Ready!");
