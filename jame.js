/* ==============================
   MOBILE-OPTIMIZED NFT SHOOTER
============================== */
const client = supabase.createClient(
  "https://fjtzodjudyctqacunlqp.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqdHpvZGp1ZHljdHFhY3VubHFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgwNjA2OTQsImV4cCI6MjA3MzYzNjY5NH0.qR9RBsecfGUfKnbWgscmxloM-oEClJs_bo5YWoxFoE4"
);

let web3, account, tokenContract;
const TOKEN_ADDRESS = "0xF629cBd94d3791C9250152BD8dfBDF380E2a3B9c";
const TOKEN_ABI = [ /* balanceOf, decimals */ ];

let scene, camera, renderer, playerAvatar;
let buildingObjects = [], botObjects = [], bullets = [], collisionObjects = [];
let clock = new THREE.Clock();
let canMove = false;
let selectedAvatar = null;

const playerStats = { health: 50, bullets: 100, gameTokens: 100 };
let cameraAngle = 0, targetCameraAngle = 0;
let hoverTime = 0, worldBoundary = 400;

/* ==============================
   INIT
============================== */
function init3D() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB);
  scene.fog = new THREE.Fog(0x87CEEB, 50, 1000);

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(0, 12, 25);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  document.getElementById('canvas-container').appendChild(renderer.domElement);

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.position.set(100, 150, 100); sun.castShadow = true;
  scene.add(sun);

  createWorld();
  createAvatar();
  createBuildings();
  createBots();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  animate();
}

function createWorld() {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1000, 1000),
    new THREE.MeshLambertMaterial({ color: 0x4ade80 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  scene.add(new THREE.GridHelper(1000, 40, 0x000000, 0x333333));
}

function createAvatar() {
  const group = new THREE.Group();
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(5, 0.5, 3),
    new THREE.MeshLambertMaterial({ color: selectedAvatar === 'boy' ? 0x3b82f6 : 0xec4899 })
  );
  board.castShadow = true;
  group.add(board);

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(1, 2, 6, 10),
    new THREE.MeshLambertMaterial({ color: selectedAvatar === 'boy' ? 0x1e40af : 0xbe185d })
  );
  body.position.y = 2.5;
  body.castShadow = true;
  group.add(body);

  group.position.set(0, 3, 0);
  scene.add(group);
  playerAvatar = group;
}

function createBuildings() {
  const positions = [
    {x:50,z:50,size:25,color:0xff6b6b},
    {x:-50,z:50,size:28,color:0x4ecdc4},
    {x:50,z:-50,size:22,color:0x45b7d1},
    {x:-50,z:-50,size:30,color:0xffa07a},
    {x:0,z:100,size:35,color:0x98d8c8}
  ];
  positions.forEach(p => {
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(p.size, p.size, p.size),
      new THREE.MeshLambertMaterial({ color: p.color })
    );
    b.position.set(p.x, p.size/2, p.z);
    b.castShadow = true; b.receiveShadow = true;
    scene.add(b); buildingObjects.push(b);
    collisionObjects.push(new THREE.Box3().setFromObject(b));
  });
}

function createBots() {
  const data = [
    {name:"Alex", pos:new THREE.Vector3(35,2,35), color:0x3b82f6},
    {name:"Sam", pos:new THREE.Vector3(-35,2,-35), color:0x10b981}
  ];
  data.forEach(d => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.8,1.8,3.5,10), new THREE.MeshLambertMaterial({color:d.color}));
    body.castShadow = true; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(1.4,10,10), new THREE.MeshLambertMaterial({color:0x60a5fa}));
    head.position.y = 2.6; head.castShadow = true; g.add(head);
    g.position.copy(d.pos); scene.add(g); botObjects.push(g);
  });
}

/* ==============================
   CONTROLS
============================== */
let move = { forward: false, backward: false, left: false, right: false };
let lookTouch = null, lookStart = { x: 0, y: 0 };

function addTouch(btnId, action) {
  const btn = document.getElementById(btnId);
  btn.addEventListener('touchstart', e => { e.preventDefault(); move[action] = true; });
  btn.addEventListener('touchend', e => { e.preventDefault(); move[action] = false; });
}

document.getElementById('shoot-btn').addEventListener('touchstart', e => {
  e.preventDefault();
  if (playerStats.bullets > 0) {
    playerStats.bullets--;
    document.getElementById('bullet-count').textContent = playerStats.bullets;
    const dir = new THREE.Vector3(Math.sin(cameraAngle), 0, Math.cos(cameraAngle)).normalize();
    const bullet = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffff00 })
    );
    bullet.position.copy(playerAvatar.position).add(new THREE.Vector3(0,2,0));
    scene.add(bullet);
    bullets.push({ mesh: bullet, vel: dir.multiplyScalar(100), life: 2 });
  }
});

const lookArea = document.getElementById('look-controls');
lookArea.addEventListener('touchstart', e => {
  if (lookTouch) return;
  const touch = e.touches[0];
  lookTouch = touch.identifier;
  lookStart.x = touch.clientX;
  lookStart.y = touch.clientY;
});
lookArea.addEventListener('touchmove', e => {
  if (!lookTouch) return;
  for (let t of e.touches) {
    if (t.identifier === lookTouch) {
      const dx = t.clientX - lookStart.x;
      const dy = t.clientY - lookStart.y;
      targetCameraAngle -= dx * 0.01;
      camera.position.y = THREE.MathUtils.clamp(camera.position.y - dy * 0.05, 8, 30);
      lookStart.x = t.clientX;
      lookStart.y = t.clientY;
      break;
    }
  }
});
lookArea.addEventListener('touchend', e => {
  for (let t of e.changedTouches) {
    if (t.identifier === lookTouch) { lookTouch = null; break; }
  }
});

/* ==============================
   GAME LOOP
============================== */
function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  hoverTime += delta;

  if (canMove && playerAvatar) {
    const speed = 35 * delta;
    const forward = new THREE.Vector3(Math.sin(cameraAngle), 0, Math.cos(cameraAngle));
    const right = new THREE.Vector3(Math.sin(cameraAngle + Math.PI/2), 0, Math.cos(cameraAngle + Math.PI/2));
    const moveVec = new THREE.Vector3();

    if (move.forward) moveVec.add(forward);
    if (move.backward) moveVec.sub(forward);
    if (move.left) moveVec.sub(right);
    if (move.right) moveVec.add(right);

    if (moveVec.length() > 0) {
      moveVec.normalize().multiplyScalar(speed);
      const newPos = playerAvatar.position.clone().add(moveVec);
      newPos.y = 3 + Math.sin(hoverTime * 6) * 0.3;

      if (Math.abs(newPos.x) < worldBoundary && Math.abs(newPos.z) < worldBoundary) {
        const box = new THREE.Box3().setFromCenterAndSize(newPos, new THREE.Vector3(5,5,5));
        let blocked = false;
        for (const col of collisionObjects) {
          if (box.intersectsBox(col)) { blocked = true; break; }
        }
        if (!blocked) playerAvatar.position.copy(newPos);
      }
    }

    playerAvatar.position.y = 3 + Math.sin(hoverTime * 6) * 0.3;
  }

  cameraAngle += (targetCameraAngle - cameraAngle) * 0.1;
  const offset = new THREE.Vector3(Math.sin(cameraAngle)*22, 12, Math.cos(cameraAngle)*22);
  camera.position.copy(playerAvatar.position).add(offset);
  camera.lookAt(playerAvatar.position.clone().add(new THREE.Vector3(0,2,0)));

  // Update bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.mesh.position.add(b.vel.clone().multiplyScalar(delta));
    b.life -= delta;
    if (b.life <= 0) { scene.remove(b.mesh); bullets.splice(i,1); }
  }

  renderer.render(scene, camera);
}

/* ==============================
   START
============================== */
document.addEventListener('DOMContentLoaded', () => {
  // Avatar selection
  document.querySelectorAll('.avatar-option').forEach(el => {
    el.addEventListener('touchstart', () => {
      document.querySelectorAll('.avatar-option').forEach(o => o.classList.remove('selected'));
      el.classList.add('selected');
      selectedAvatar = el.dataset.avatar;
    });
  });

  document.getElementById('confirm-avatar').addEventListener('touchstart', e => {
    e.preventDefault();
    if (!selectedAvatar) return alert('Choose avatar!');
    document.getElementById('avatar-selection').style.display = 'none';
    document.getElementById('sidebar-toggle').style.display = 'flex';
    document.getElementById('mobile-controls').style.display = 'flex';
    document.getElementById('look-controls').style.display = 'block';

    // Setup movement
    addTouch('forward-btn', 'forward');
    addTouch('backward-btn', 'backward');
    addTouch('left-btn', 'left');
    addTouch('right-btn', 'right');

    canMove = true;
    init3D();
  });

  // Wallet
  document.getElementById('connectBtn').addEventListener('click', async () => {
    if (!window.ethereum) return alert('Install MetaMask!');
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      account = accounts[0];
      web3 = new Web3(window.ethereum);
      tokenContract = new web3.eth.Contract(TOKEN_ABI, TOKEN_ADDRESS);
      document.getElementById('walletStatus').textContent = `Connected: ${account.substr(0,6)}...`;
      const bal = await tokenContract.methods.balanceOf(account).call();
      const dec = await tokenContract.methods.decimals().call();
      playerStats.gameTokens = bal / (10 ** dec);
      document.getElementById('token-balance').textContent = playerStats.gameTokens.toFixed(2) + " ENJ";
    } catch (err) { alert('Failed'); }
  });
});
