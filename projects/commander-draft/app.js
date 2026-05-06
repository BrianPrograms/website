const SCRYFALL_RANDOM_URL = "https://api.scryfall.com/cards/random?q=";

const game = {
  roomCode: null,
  players: [],
  pool: [],
  commanders: [],
  pickedIds: new Set(),
  draftRound: 0,
  pickIndexInRound: 0,
  finalDeckSize: 100,
  includeBanned: false,
  phase: "setup",
};

const els = {
  setupScreen: document.getElementById("setupScreen"),
  commanderScreen: document.getElementById("commanderScreen"),
  draftScreen: document.getElementById("draftScreen"),
  landsScreen: document.getElementById("landsScreen"),
  completeScreen: document.getElementById("completeScreen"),

  roomInfo: document.getElementById("roomInfo"),
  roomCodeText: document.getElementById("roomCodeText"),
  shareLink: document.getElementById("shareLink"),
  copyLinkBtn: document.getElementById("copyLinkBtn"),
  refreshRoomBtn: document.getElementById("refreshRoomBtn"),

  startBtn: document.getElementById("startBtn"),
  loadRoomBtn: document.getElementById("loadRoomBtn"),
  resetBtn: document.getElementById("resetBtn"),
  loadingText: document.getElementById("loadingText"),

  resolveCommandersBtn: document.getElementById("resolveCommandersBtn"),
  commanderChoices: document.getElementById("commanderChoices"),
  commanderGrid: document.getElementById("commanderGrid"),

  draftTitle: document.getElementById("draftTitle"),
  turnText: document.getElementById("turnText"),
  viewMode: document.getElementById("viewMode"),
  searchInput: document.getElementById("searchInput"),
  typeFilter: document.getElementById("typeFilter"),
  sortMode: document.getElementById("sortMode"),
  playersList: document.getElementById("playersList"),
  draftGrid: document.getElementById("draftGrid"),
  draftedView: document.getElementById("draftedView"),
  cardPreview: document.getElementById("cardPreview"),
  currentDeckList: document.getElementById("currentDeckList"),
  retireBtn: document.getElementById("retireBtn"),

  landSplitArea: document.getElementById("landSplitArea"),
  finishBtn: document.getElementById("finishBtn"),
  decklists: document.getElementById("decklists"),
};

els.startBtn.addEventListener("click", createOnlineRoom);
els.loadRoomBtn.addEventListener("click", loadRoomFromInput);
els.resetBtn.addEventListener("click", () => {
  window.location.href = window.location.pathname;
});

els.copyLinkBtn.addEventListener("click", copyShareLink);
els.refreshRoomBtn.addEventListener("click", () => loadRoom(game.roomCode));

els.resolveCommandersBtn.addEventListener("click", resolveCommanderChoicesOnline);
els.viewMode.addEventListener("change", renderCurrentPhase);
els.searchInput.addEventListener("input", renderCurrentPhase);
els.typeFilter.addEventListener("change", renderCurrentPhase);
els.sortMode.addEventListener("change", renderCurrentPhase);
els.retireBtn.addEventListener("click", retireCurrentPlayerOnline);
els.finishBtn.addEventListener("click", finishDraft);

initialLoad();

function initialLoad() {
  const params = new URLSearchParams(window.location.search);
  const roomCode = params.get("room");

  if (roomCode) {
    loadRoom(roomCode);
  }
}

async function createOnlineRoom() {
  const playerNames = [
    document.getElementById("player1").value.trim() || "Player 1",
    document.getElementById("player2").value.trim() || "Player 2",
    document.getElementById("player3").value.trim() || "Player 3",
    document.getElementById("player4").value.trim() || "Player 4",
  ];

  const poolSize = Number(document.getElementById("poolSize").value);
  const finalDeckSize = Number(document.getElementById("finalDeckSize").value);
  const includeBanned = document.getElementById("includeBanned").checked;

  els.startBtn.disabled = true;
  els.loadingText.textContent = "Generating Scryfall card pool in browser...";

  try {
    const { pool, commanders } = await generateValidPool(poolSize, includeBanned);

    els.loadingText.textContent = "Saving room to D1...";

    const res = await fetch("/api/commander-draft/rooms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        playerNames,
        pool,
        commanders,
        finalDeckSize,
        includeBanned,
      }),
    });

    const data = await res.json();

    if (!data.ok) {
      throw new Error(data.error || "Failed to create room.");
    }

    window.location.href = `${window.location.pathname}?room=${data.roomCode}`;
  } catch (err) {
    alert(err.message);
    els.startBtn.disabled = false;
  }
}

async function loadRoomFromInput() {
  const code = document.getElementById("roomCodeInput").value.trim().toUpperCase();

  if (!code) {
    alert("Enter a room code.");
    return;
  }

  window.location.href = `${window.location.pathname}?room=${code}`;
}

async function loadRoom(roomCode) {
  try {
    els.loadingText.textContent = `Loading room ${roomCode.toUpperCase()}...`;

    const res = await fetch(`/api/commander-draft/rooms/${roomCode.toUpperCase()}`);
    const data = await res.json();

    if (!data.ok) {
      throw new Error(data.error || "Failed to load room.");
    }

    applyRoomState(data.room);
    renderCurrentPhase();
  } catch (err) {
    alert(err.message);
    showScreen("setup");
  }
}

function applyRoomState(room) {
  game.roomCode = room.roomCode;
  game.phase = room.phase;
  game.pool = room.pool;
  game.commanders = room.commanders;
  game.pickedIds = new Set(room.pickedIds);
  game.draftRound = room.draftRound;
  game.pickIndexInRound = room.pickIndex;
  game.finalDeckSize = room.finalDeckSize;
  game.includeBanned = room.includeBanned;

  const allCardsById = new Map();

  for (const card of game.pool) {
    allCardsById.set(card.id, card);
  }

  for (const commander of game.commanders) {
    allCardsById.set(commander.id, commander);
  }

  game.players = room.players.map(player => ({
    playerIndex: player.playerIndex,
    name: player.name,
    commanderId: player.commanderId,
    commanderSelectionId: player.commanderSelectionId,
    commander: player.commanderId ? allCardsById.get(player.commanderId) : null,
    picks: player.picks || [],
    retired: player.retired,
    landSplit: player.landSplit || {},
  }));

  els.resetBtn.classList.remove("hidden");
  els.roomInfo.classList.remove("hidden");
  els.roomCodeText.textContent = `Room code: ${game.roomCode}`;
  els.shareLink.value = `${window.location.origin}${window.location.pathname}?room=${game.roomCode}`;
}

function renderCurrentPhase() {
  if (!game.roomCode) {
    showScreen("setup");
    return;
  }

  if (game.phase === "commander_selection") {
    showScreen("commander");
    renderCommanderSelection();
    return;
  }

  if (game.phase === "draft") {
    if (shouldEndDraft()) {
      prepareLandSplit();
      return;
    }

    showScreen("draft");
    renderDraft();
    return;
  }

  showScreen("setup");
}

async function generateValidPool(poolSize, includeBanned) {
  let attempts = 1;

  while (true) {
    els.loadingText.textContent = `Generating pool attempt ${attempts}...`;

    const { pool, commanders } = await buildDraftPool(poolSize, includeBanned);

    if (commanders.length >= 6) {
      els.loadingText.textContent =
        `Pool ready: ${pool.length} cards, ${commanders.length} commanders.`;
      return { pool, commanders };
    }

    attempts++;
  }
}

async function buildDraftPool(targetSize, includeBanned) {
  const pool = [];
  const commanders = [];
  const seenOracleIds = new Set();

  while (pool.length < targetSize) {
    const card = await fetchRandomCard(includeBanned);

    if (!card || !card.oracle_id || seenOracleIds.has(card.oracle_id)) {
      continue;
    }

    if (!isUsableCard(card, includeBanned)) {
      continue;
    }

    seenOracleIds.add(card.oracle_id);

    const compactCard = compactScryfallCard(card);
    pool.push(compactCard);

    if (isCommander(card, includeBanned)) {
      commanders.push(compactCard);
    }

    els.loadingText.textContent =
      `Loaded ${pool.length}/${targetSize} singleton cards. ` +
      `Commanders: ${commanders.length}/6`;

    await sleep(80);
  }

  shuffle(pool);
  shuffle(commanders);

  return { pool, commanders };
}

async function fetchRandomCard(includeBanned) {
  let query = "-type:token -type:sticker -type:attraction -is:digital";

  if (includeBanned) {
    query += " (legal:commander OR banned:commander)";
  } else {
    query += " legal:commander";
  }

  try {
    const res = await fetch(SCRYFALL_RANDOM_URL + encodeURIComponent(query));

    if (!res.ok) {
      return null;
    }

    return await res.json();
  } catch {
    return null;
  }
}

function compactScryfallCard(card) {
  return {
    id: card.id,
    oracle_id: card.oracle_id,
    name: card.name,
    mana_cost: card.mana_cost || "",
    cmc: card.cmc || 0,
    type_line: card.type_line || "",
    oracle_text: card.oracle_text || "",
    color_identity: card.color_identity || [],
    legalities: {
      commander: card.legalities?.commander || "not_legal",
    },
    image: getCardImage(card),
    scryfall_uri: card.scryfall_uri || "",
    layout: card.layout || "",
    front_type_line: getFrontFaceTypeLine(card),
  };
}

function isUsableCard(card, includeBanned) {
  const commanderLegality = card.legalities?.commander;

  if (!includeBanned && commanderLegality !== "legal") return false;

  if (
    includeBanned &&
    commanderLegality !== "legal" &&
    commanderLegality !== "banned"
  ) {
    return false;
  }

  if (card.digital) return false;

  const bannedLayouts = new Set([
    "token",
    "emblem",
    "art_series",
    "scheme",
    "plane",
    "vanguard",
  ]);

  if (bannedLayouts.has(card.layout)) return false;
  if (card.border_color === "silver" || card.border_color === "gold") return false;

  return true;
}

function getFrontFaceTypeLine(card) {
  if (card.card_faces?.[0]?.type_line) {
    return card.card_faces[0].type_line;
  }

  return card.type_line || "";
}

function isAllowedCommanderLegality(card, includeBanned) {
  const legality = card.legalities?.commander;

  if (includeBanned) {
    return legality === "legal" || legality === "banned";
  }

  return legality === "legal";
}

function isCommander(card, includeBanned) {
  const frontType = getFrontFaceTypeLine(card);

  return (
    isAllowedCommanderLegality(card, includeBanned) &&
    frontType.includes("Legendary") &&
    frontType.includes("Creature")
  );
}

function renderCommanderSelection() {
  els.commanderChoices.innerHTML = "";

  for (const player of game.players) {
    const selectedCommander = game.commanders.find(
      commander => commander.id === player.commanderSelectionId
    );

    const box = document.createElement("div");
    box.className = "choice-box";

    box.innerHTML = `
      <h3>${escapeHtml(player.name)}</h3>
      <p class="${selectedCommander ? "success" : "muted"}">
        ${
          selectedCommander
            ? "Selection submitted"
            : "No commander selected"
        }
      </p>
    `;

    els.commanderChoices.appendChild(box);
  }

  els.commanderGrid.innerHTML = "";

  for (const commander of game.commanders) {
    els.commanderGrid.appendChild(
      createCardElement(commander, {
        buttonText: "Choose",
        disabled: false,
        onClick: () => chooseCommanderForPlayerOnline(commander),
      })
    );
  }
}

async function chooseCommanderForPlayerOnline(commander) {
  const playerNumber = prompt(
    `Who is choosing ${commander.name}?\nEnter player number 1-4.`
  );

  const playerIndex = Number(playerNumber) - 1;

  if (playerIndex < 0 || playerIndex >= game.players.length || Number.isNaN(playerIndex)) {
    alert("Invalid player number.");
    return;
  }

  const player = game.players[playerIndex];

  const ok = confirm(`${player.name} will secretly choose this commander. Continue?`);

  if (!ok) return;

  const res = await fetch(`/api/commander-draft/rooms/${game.roomCode}/commander`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      playerIndex,
      commanderId: commander.id,
    }),
  });

  const data = await res.json();

  if (!data.ok) {
    alert(data.error || "Failed to choose commander.");
    return;
  }

  await loadRoom(game.roomCode);
}

async function resolveCommanderChoicesOnline() {
  const ok = confirm("Resolve commander choices now? This cannot be undone.");

  if (!ok) return;

  const res = await fetch(`/api/commander-draft/rooms/${game.roomCode}/resolve-commanders`, {
    method: "POST",
  });

  const data = await res.json();

  if (!data.ok) {
    alert(data.error || "Failed to resolve commanders.");
    return;
  }

  const lines = ["Commander results:"];

  for (const result of data.results) {
    lines.push(
      `${result.playerName}: ${result.commanderName}` +
      `${result.punished ? " (reassigned after duplicate pick)" : ""}`
    );
  }

  alert(lines.join("\n"));
  await loadRoom(game.roomCode);
}

function renderDraft() {
  const currentPlayer = getCurrentDraftPlayer();

  if (!currentPlayer) {
    prepareLandSplit();
    return;
  }

  const legalCount = getLegalAvailableCards(currentPlayer).length;
  const direction = game.draftRound % 2 === 0 ? "→" : "←";

  els.draftTitle.textContent = `Room ${game.roomCode} — Round ${game.draftRound + 1} ${direction}`;
  els.turnText.textContent =
    `${currentPlayer.name}'s turn — ${legalCount} legal choices available.`;

  renderPlayers();
  renderCurrentDeck(currentPlayer);

  if (els.viewMode.value === "drafted") {
    els.draftedView.classList.remove("hidden");
    els.draftGrid.classList.add("hidden");
    renderDraftedView();
  } else {
    els.draftedView.classList.add("hidden");
    els.draftGrid.classList.remove("hidden");
    renderDraftGrid(currentPlayer);
  }
}

function renderPlayers() {
  const currentPlayer = getCurrentDraftPlayer();

  els.playersList.innerHTML = "";

  for (const player of game.players) {
    const box = document.createElement("div");
    box.className = "player-box";

    if (currentPlayer && player.playerIndex === currentPlayer.playerIndex) {
      box.classList.add("active");
    }

    if (player.retired) {
      box.classList.add("retired");
    }

    box.innerHTML = `
      <strong>${escapeHtml(player.name)}</strong>
      <p>${escapeHtml(player.commander?.name || "No commander")}</p>
      <p>${player.picks.length} drafted</p>
      <p>${player.retired ? "Retired to basics" : "Still drafting"}</p>
      ${renderColorPips(player.commander?.color_identity || [])}
    `;

    els.playersList.appendChild(box);
  }
}

function renderDraftGrid(player) {
  const mode = els.viewMode.value;
  const search = els.searchInput.value.trim().toLowerCase();
  const type = els.typeFilter.value;

  let cards = game.pool.filter(card => !game.pickedIds.has(card.id));

  if (mode === "legal") {
    cards = cards.filter(card => isLegalForCommander(card, player.commander));
  }

  cards = cards.filter(card => {
    if (search && !card.name.toLowerCase().includes(search)) return false;
    if (type && !(card.type_line || "").includes(type)) return false;
    return true;
  });

  sortCards(cards);

  els.draftGrid.innerHTML = "";

  if (cards.length === 0) {
    els.draftGrid.innerHTML = `
      <p class="muted">No cards to display. This player should retire to basics.</p>
    `;
    return;
  }

  for (const card of cards) {
    const legal = isLegalForCommander(card, player.commander);

    els.draftGrid.appendChild(
      createCardElement(card, {
        buttonText: legal ? "Draft" : "Illegal",
        disabled: !legal,
        illegal: !legal,
        onClick: () => draftCardOnline(card),
      })
    );
  }
}

function renderDraftedView() {
  els.draftedView.innerHTML = "";

  for (const player of game.players) {
    const box = document.createElement("div");
    box.className = "drafted-box";

    box.innerHTML = `
      <h3>${escapeHtml(player.name)}</h3>
      <p>Commander: ${escapeHtml(player.commander?.name || "No commander")}</p>
      <div class="mini-list">
        ${
          player.picks.length === 0
            ? `<p class="muted">No drafted cards yet.</p>`
            : player.picks
                .map(card => `<div>${escapeHtml(card.name)}</div>`)
                .join("")
        }
      </div>
    `;

    els.draftedView.appendChild(box);
  }
}

function renderCurrentDeck(player) {
  els.currentDeckList.innerHTML = "";

  els.currentDeckList.innerHTML += `
    <div><strong>Commander:</strong> ${escapeHtml(player.commander?.name || "No commander")}</div>
  `;

  for (const card of player.picks) {
    els.currentDeckList.innerHTML += `<div>${escapeHtml(card.name)}</div>`;
  }
}

async function draftCardOnline(card) {
  const player = getCurrentDraftPlayer();

  if (!player) return;

  const ok = confirm(`${player.name} drafts ${card.name}?`);

  if (!ok) return;

  const res = await fetch(`/api/commander-draft/rooms/${game.roomCode}/pick`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      playerIndex: player.playerIndex,
      cardId: card.id,
    }),
  });

  const data = await res.json();

  if (!data.ok) {
    alert(data.error || "Failed to draft card.");
    await loadRoom(game.roomCode);
    return;
  }

  await loadRoom(game.roomCode);
}

async function retireCurrentPlayerOnline() {
  const player = getCurrentDraftPlayer();

  if (!player) return;

  const ok = confirm(
    `${player.name} will stop drafting and fill the rest with basics. Continue?`
  );

  if (!ok) return;

  const res = await fetch(`/api/commander-draft/rooms/${game.roomCode}/retire`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      playerIndex: player.playerIndex,
    }),
  });

  const data = await res.json();

  if (!data.ok) {
    alert(data.error || "Failed to retire player.");
    return;
  }

  await loadRoom(game.roomCode);
}

function getCurrentDraftPlayer() {
  if (shouldEndDraft()) return null;

  const order = getCurrentPickOrder();

  for (let attempts = 0; attempts < game.players.length; attempts++) {
    const playerIndex = order[game.pickIndexInRound];
    const player = game.players.find(p => p.playerIndex === playerIndex);

    if (!player) {
      advanceDraftTurnLocalOnly();
      continue;
    }

    if (!player.retired && getLegalAvailableCards(player).length > 0) {
      return player;
    }

    advanceDraftTurnLocalOnly();
  }

  return null;
}

function getCurrentPickOrder() {
  const order = game.players.map(player => player.playerIndex);

  if (game.draftRound % 2 === 1) {
    order.reverse();
  }

  return order;
}

function advanceDraftTurnLocalOnly() {
  game.pickIndexInRound++;

  if (game.pickIndexInRound >= game.players.length) {
    game.pickIndexInRound = 0;
    game.draftRound++;
  }
}

function shouldEndDraft() {
  if (game.phase !== "draft") return false;

  return game.players.every(
    player => player.retired || getLegalAvailableCards(player).length === 0
  );
}

function getLegalAvailableCards(player) {
  if (!player.commander) return [];

  return game.pool.filter(
    card =>
      !game.pickedIds.has(card.id) &&
      isLegalForCommander(card, player.commander)
  );
}

function isLegalForCommander(card, commander) {
  const cardColors = card.color_identity || [];
  const commanderColors = commander.color_identity || [];

  return cardColors.every(color => commanderColors.includes(color));
}

function prepareLandSplit() {
  for (const player of game.players) {
    initialiseLandSplit(player);
  }

  showScreen("lands");
  renderLandSplit();
}

function initialiseLandSplit(player) {
  if (player.landSplit && Object.keys(player.landSplit).length > 0) {
    return;
  }

  const needed = getNeededBasics(player);
  const colors = player.commander?.color_identity || [];

  const basicMap = {
    W: "Plains",
    U: "Island",
    B: "Swamp",
    R: "Mountain",
    G: "Forest",
  };

  const basics =
    colors.length === 0
      ? ["Wastes"]
      : colors.map(color => basicMap[color]).filter(Boolean);

  player.landSplit = {};

  for (const basic of basics) {
    player.landSplit[basic] = 0;
  }

  for (let i = 0; i < needed; i++) {
    const basic = basics[i % basics.length];
    player.landSplit[basic]++;
  }
}

function renderLandSplit() {
  els.landSplitArea.innerHTML = "";

  for (const player of game.players) {
    const needed = getNeededBasics(player);

    const box = document.createElement("div");
    box.className = "land-box";

    box.innerHTML = `
      <h3>${escapeHtml(player.name)}</h3>
      <p>${escapeHtml(player.commander?.name || "No commander")}</p>
      <p>Drafted: ${player.picks.length}. Basics needed: ${needed}.</p>
      <div class="land-inputs"></div>
      <p class="muted split-total"></p>
      <button>Save Land Split</button>
    `;

    const inputArea = box.querySelector(".land-inputs");
    const totalText = box.querySelector(".split-total");
    const saveButton = box.querySelector("button");

    for (const [land, count] of Object.entries(player.landSplit)) {
      const row = document.createElement("div");
      row.className = "land-row";

      row.innerHTML = `
        <label>${escapeHtml(land)}</label>
        <input type="number" min="0" value="${count}" />
      `;

      const input = row.querySelector("input");

      input.addEventListener("input", () => {
        player.landSplit[land] = Number(input.value);
        updateSplitText(player, needed, totalText);
      });

      inputArea.appendChild(row);
    }

    saveButton.addEventListener("click", () => saveLandSplitOnline(player));

    updateSplitText(player, needed, totalText);
    els.landSplitArea.appendChild(box);
  }
}

function updateSplitText(player, needed, totalText) {
  const total = Object.values(player.landSplit).reduce((a, b) => a + b, 0);

  totalText.textContent =
    total === needed
      ? `Total: ${total}/${needed}`
      : `Total: ${total}/${needed} — must equal ${needed}.`;
}

async function saveLandSplitOnline(player) {
  const needed = getNeededBasics(player);
  const total = Object.values(player.landSplit).reduce((a, b) => a + b, 0);

  if (total !== needed) {
    alert(`${player.name}'s basic land split must total ${needed}.`);
    return;
  }

  const res = await fetch(`/api/commander-draft/rooms/${game.roomCode}/lands`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      playerIndex: player.playerIndex,
      landSplit: player.landSplit,
    }),
  });

  const data = await res.json();

  if (!data.ok) {
    alert(data.error || "Failed to save land split.");
    return;
  }

  alert(`${player.name}'s land split saved.`);
  await loadRoom(game.roomCode);
}

function finishDraft() {
  for (const player of game.players) {
    const needed = getNeededBasics(player);
    const total = Object.values(player.landSplit).reduce((a, b) => a + b, 0);

    if (total !== needed) {
      alert(`${player.name}'s basic land split must total ${needed}.`);
      return;
    }
  }

  showScreen("complete");
  renderDecklists();
}

function renderDecklists() {
  els.decklists.innerHTML = "";

  for (const player of game.players) {
    const text = makeDecklistText(player);

    const box = document.createElement("div");
    box.className = "decklist";

    box.innerHTML = `
      <h3>${escapeHtml(player.name)}</h3>
      <p>Commander: ${escapeHtml(player.commander?.name || "No commander")}</p>
      <textarea readonly>${escapeHtml(text)}</textarea>
      <button>Copy Decklist</button>
    `;

    box.querySelector("button").addEventListener("click", async () => {
      await navigator.clipboard.writeText(text);
      alert(`${player.name}'s decklist copied.`);
    });

    els.decklists.appendChild(box);
  }
}

function makeDecklistText(player) {
  const lines = [];

  lines.push("Commander");
  lines.push(`1 ${player.commander?.name || "No commander"}`);
  lines.push("");
  lines.push("Deck");

  for (const card of player.picks) {
    lines.push(`1 ${card.name}`);
  }

  for (const [land, count] of Object.entries(player.landSplit)) {
    if (count > 0) {
      lines.push(`${count} ${land}`);
    }
  }

  return lines.join("\n");
}

function getNeededBasics(player) {
  const nonCommanderTarget = game.finalDeckSize - 1;
  return Math.max(0, nonCommanderTarget - player.picks.length);
}

function createCardElement(card, options) {
  const div = document.createElement("div");
  div.className = "card";

  if (options.illegal) {
    div.classList.add("illegal");
  }

  const image = getCardImage(card);

  div.innerHTML = `
    ${image ? `<img src="${image}" alt="${escapeHtml(card.name)}">` : ""}
    <h3>${escapeHtml(card.name)}</h3>
    <p>${escapeHtml(card.mana_cost || "")}</p>
    <p>${escapeHtml(card.type_line || "")}</p>
    ${renderColorPips(card.color_identity || [])}
    <button ${options.disabled ? "disabled" : ""}>${options.buttonText}</button>
  `;

  div.addEventListener("mouseenter", () => renderPreview(card));

  const button = div.querySelector("button");

  if (!options.disabled) {
    button.addEventListener("click", options.onClick);
  }

  return div;
}

function renderPreview(card) {
  const image = getCardImage(card);

  els.cardPreview.innerHTML = `
    ${image ? `<img src="${image}" alt="${escapeHtml(card.name)}">` : ""}
    <h3>${escapeHtml(card.name)}</h3>
    <p>${escapeHtml(card.type_line || "")}</p>
    <p>${escapeHtml(card.oracle_text || "")}</p>
  `;
}

function getCardImage(card) {
  if (card.image) return card.image;
  if (card.image_uris?.normal) return card.image_uris.normal;
  if (card.card_faces?.[0]?.image_uris?.normal) {
    return card.card_faces[0].image_uris.normal;
  }
  return "";
}

function sortCards(cards) {
  const mode = els.sortMode.value;

  cards.sort((a, b) => {
    if (mode === "mv") {
      return (a.cmc || 0) - (b.cmc || 0) || a.name.localeCompare(b.name);
    }

    if (mode === "type") {
      return (a.type_line || "").localeCompare(b.type_line || "") ||
        a.name.localeCompare(b.name);
    }

    if (mode === "color") {
      return colorKey(a).localeCompare(colorKey(b)) ||
        a.name.localeCompare(b.name);
    }

    return a.name.localeCompare(b.name);
  });
}

function colorKey(card) {
  return (card.color_identity || ["C"]).join("");
}

function renderColorPips(colors) {
  if (!colors || colors.length === 0) {
    return `
      <div class="color-pips">
        <span class="pip pip-C">C</span>
      </div>
    `;
  }

  return `
    <div class="color-pips">
      ${colors
        .map(color => `<span class="pip pip-${color}">${color}</span>`)
        .join("")}
    </div>
  `;
}

function copyShareLink() {
  navigator.clipboard.writeText(els.shareLink.value);
  alert("Room link copied.");
}

function showScreen(screen) {
  els.setupScreen.classList.add("hidden");
  els.commanderScreen.classList.add("hidden");
  els.draftScreen.classList.add("hidden");
  els.landsScreen.classList.add("hidden");
  els.completeScreen.classList.add("hidden");

  if (screen === "setup") els.setupScreen.classList.remove("hidden");
  if (screen === "commander") els.commanderScreen.classList.remove("hidden");
  if (screen === "draft") els.draftScreen.classList.remove("hidden");
  if (screen === "lands") els.landsScreen.classList.remove("hidden");
  if (screen === "complete") els.completeScreen.classList.remove("hidden");
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}