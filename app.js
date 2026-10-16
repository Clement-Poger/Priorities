(() => {
  "use strict";

  const usernames = new Set(["noe", "eva", "clem"]);
  const roomStorageKey = "priorities-room-id";
  const authScreen = document.querySelector("#auth-screen");
  const appShell = document.querySelector("#app-shell");
  const loginForm = document.querySelector("#login-form");
  const loginFeedback = document.querySelector("#login-feedback");
  const homeView = document.querySelector("#home-view");
  const roomView = document.querySelector("#room-view");
  const globalFeedback = document.querySelector("#global-feedback");
  const accountName = document.querySelector("#account-name");
  const welcomeName = document.querySelector("#welcome-name");
  const roomCodeInput = document.querySelector("#room-code");
  const createRoomButton = document.querySelector("#create-room");
  const joinForm = document.querySelector("#join-form");
  const signOutButton = document.querySelector("#sign-out");

  let supabase;
  let user;
  let pollingTimer;
  let loadingState = false;
  let activeRoomId = "";
  let activeState;
  let orderedCards = [];
  let busy = false;
  let dragInProgress = false;
  let dragHandlerController;

  const escapeHtml = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);

  function displayName(value) {
    const name = String(value ?? "");
    return ({ clem: "Clément", eva: "Eva", noe: "Noé" })[name.trim().toLowerCase()] || name;
  }

  function setFeedback(element, message) {
    element.textContent = message;
    element.hidden = !message;
  }

  function setGlobalFeedback(message) {
    setFeedback(globalFeedback, message);
  }

  function icon(name) {
    return `<img class="ui-icon" src="./assets/${name}.svg" alt="" aria-hidden="true">`;
  }

  function setBusy(isBusy) {
    busy = isBusy;
    document.querySelectorAll("button").forEach((button) => {
      if (isBusy) {
        button.dataset.disabledBeforeBusy = String(button.disabled);
        button.disabled = true;
      } else if (Object.hasOwn(button.dataset, "disabledBeforeBusy")) {
        button.disabled = button.dataset.disabledBeforeBusy === "true";
        delete button.dataset.disabledBeforeBusy;
      }
    });
  }

  async function withBusy(action) {
    if (busy) return;
    setBusy(true);
    setGlobalFeedback("");
    try {
      await action();
    } catch (error) {
      setGlobalFeedback(error.message || "Une erreur est survenue. Réessaie.");
    } finally {
      setBusy(false);
    }
  }

  function showHome() {
    homeView.hidden = false;
    roomView.hidden = true;
    roomView.replaceChildren();
  }

  function showRoom() {
    homeView.hidden = true;
    roomView.hidden = false;
  }

  function playerAvatar(player) {
    const username = String(player.name || "").trim().toLowerCase();
    const avatarPath = username === "eva"
      ? "./assets/eva.webp"
      : username === "clem" || username === "clément"
        ? "./assets/clement.png"
        : username === "noe" || username === "noé"
          ? "./assets/noe.webp"
          : "";
    return avatarPath
      ? `<span class="player-avatar"><img src="${avatarPath}" alt=""></span>`
      : `<span class="player-avatar" aria-hidden="true">${escapeHtml(username.slice(0, 1).toUpperCase() || "?")}</span>`;
  }

  function playerRow(player, roomStatus) {
    const isHost = player.is_host;
    const status = roomStatus === "lobby"
      ? (isHost ? "Hôte" : "Dans la salle")
      : (player.submitted ? "Terminé" : "En cours");
    return `<li class="player-row">
      ${playerAvatar(player)}
      <span class="player-info"><strong>${escapeHtml(displayName(player.name))}${isHost ? " · " + "Hôte" : ""}</strong><small>${player.score} point${player.score === 1 ? "" : "s"} cette partie</small></span>
      <span class="player-state${player.submitted ? " ready" : ""}">${escapeHtml(status)}</span>
    </li>`;
  }

  function renderPlayers(players, roomStatus) {
    if (!players.length) return `<p class="empty-note">Aucun joueur dans cette salle.</p>`;
    return `<ul class="player-list">${players.map((player) => playerRow(player, roomStatus)).join("")}</ul>`;
  }

  function renderRoomHeading(state, eyebrow, title, copy) {
    return `<div class="room-heading">
      <div><p class="eyebrow">${escapeHtml(eyebrow)}</p><p>${escapeHtml(copy)}</p></div>
      <div class="room-code"><small>CODE DE SALLE</small>${escapeHtml(state.room.code)}</div>
    </div>`;
  }

  function renderLobby(state) {
    const count = state.players.length;
    const canStart = state.room.is_host && count >= 2;
    const settings = state.room.is_host
      ? `<form class="lobby-settings" id="lobby-settings">
          <h2>${icon("settings")} Paramètres</h2>
          <label for="cards-count">Nombre de cartes</label>
          <select id="cards-count" name="cards-count">
            ${Array.from({ length: 8 }, (_, index) => index + 3).map((value) =>
              `              <option value="${value}"${value === (state.room.cards_count || 5) ? " selected" : ""}>${value}</option>`).join("")}
          </select>
          <label class="toggle-row" for="guess-author">
            <input id="guess-author" name="guess-author" type="checkbox"${state.room.guess_author !== false ? " checked" : ""}>
            <span>Deviner l'auteur de l'ordre</span>
          </label>
          <button class="button button-secondary button-wide" type="submit">${icon("check")} Enregistrer</button>
        </form>`
      : `<p class="lobby-options">${state.room.cards_count || 5} cartes · ${state.room.guess_author === false ? "sans deviner l'auteur" : "deviner l'auteur"}</p>`;
    return `${renderRoomHeading(state, "SALLE D'ATTENTE", "Les joueurs", "Partage le code pour inviter tes amis à jouer.")}
      <div class="lobby-toolbar">
        <button class="button button-secondary" type="button" data-action="refresh-room">${icon("refresh")} Actualiser</button>
        ${state.room.is_host ? `<button class="button button-danger" type="button" data-action="close-room">${icon("close")} Fermer la salle</button>` : ""}
      </div>
      <section class="game-panel room-card">
        <h2>${icon("users")} ${count} joueur${count === 1 ? "" : "s"}</h2>
        ${renderPlayers(state.players, "lobby")}
        ${settings}
        ${canStart
          ? `<button class="button button-primary button-wide" type="button" data-action="start-game">Lancer la partie <span aria-hidden="true">→</span></button>`
          : `<p class="room-wait"><span class="pulse-dot"></span>Il faut au moins deux joueurs.</p>`}
      </section>`;
  }

  function renderProgress(step) {
    return `<div class="round-progress" aria-label="Étape ${step} sur 3">
      <span class="progress-segment done"></span>
      <span class="progress-segment${step >= 2 ? " done" : ""}"></span>
      <span class="progress-segment${step >= 3 ? " active" : ""}"></span>
    </div>`;
  }

  function renderRanking(state) {
    const me = state.players.find((player) => player.user_id === user.id);
    const round = state.round;
    if (me && me.submitted) {
      return `${renderRoomHeading(state, "ÉTAPE 1 · TON CLASSEMENT", "Bien joué !", "Ton ordre est enregistré. La suite commence quand tout le monde a terminé.")}
        <section class="game-panel">${renderProgress(1)}
          <div class="room-wait"><span class="pulse-dot"></span>En attente des autres joueurs…</div>
          ${renderPlayers(state.players, "ranking")}
        </section>`;
    }
    const cards = orderedCards.map((card, index) => `<li class="order-card" data-card-id="${escapeHtml(card.id)}">
      <span class="rank-number">${index + 1}</span>
      <span class="rank-copy">${escapeHtml(card.text)}</span>
      <button class="drag-handle" type="button" data-drag-handle aria-label="Glisser pour déplacer ${escapeHtml(card.text)}"><span class="grip-dots" aria-hidden="true"></span></button>
      <span class="rank-actions">
        <button type="button" data-move="up" data-index="${index}" aria-label="Monter ${escapeHtml(card.text)}" ${index === 0 ? "disabled" : ""}>↑</button>
        <button type="button" data-move="down" data-index="${index}" aria-label="Descendre ${escapeHtml(card.text)}" ${index === orderedCards.length - 1 ? "disabled" : ""}>↓</button>
      </span>
    </li>`).join("");
    return `${renderRoomHeading(state, "ÉTAPE 1 · TON CLASSEMENT", "Qu'est-ce qui compte le plus ?", "Place ta priorité numéro un en haut de la liste.")}
      <section class="game-panel">${renderProgress(1)}
        <h2>Du plus important au moins important</h2>
        <p class="room-subtitle">Réorganise les cartes pour que ton ordre te ressemble.</p>
        <ol class="ranking-list" id="rank-list">${cards}</ol>
        <p class="rank-hint">Déplace avec la poignée ou utilise les flèches.</p>
        <p class="visually-hidden" id="rank-announcement" role="status" aria-live="polite"></p>
        <button class="button button-primary button-wide" type="button" data-action="submit-order">Valider mon ordre <span aria-hidden="true">→</span></button>
      </section>`;
  }

  function renderGuessing(state) {
    const round = state.round;
    const me = state.players.find((player) => player.user_id === user.id);
    if (round.guessed_source_id) {
      return `${renderRoomHeading(state, "ÉTAPE 2 · À TOI DE DEVINER", "Réponse enregistrée !", "La révélation arrive dès que tout le monde a fait son choix.")}
        <section class="game-panel">${renderProgress(2)}
          <div class="room-wait"><span class="pulse-dot"></span>En attente des autres détectives…</div>
          ${renderPlayers(state.players, "guessing")}
        </section>`;
    }
    const cards = (round.incoming_order || []).map((card, index) =>
      `<li><span>${index + 1}</span>${escapeHtml(card.text)}</li>`).join("");
    const candidates = state.players.filter((player) => player.user_id !== user.id);
    return `${renderRoomHeading(state, "ÉTAPE 2 · À TOI DE DEVINER", "Qui a fait cet ordre ?", "Lis les priorités de ton ami et devine à qui elles appartiennent.")}
      <section class="game-panel">${renderProgress(2)}
        <h2>Du plus important au moins important</h2>
        <ol class="ordered-list">${cards}</ol>
        <form id="guess-form">
          <fieldset class="guess-fieldset">
            <legend>À ton avis, qui a classé ces cartes ?</legend>
            <div class="choice-list">${candidates.map((player) => `<label class="choice">
              <input type="radio" name="source-player" value="${escapeHtml(player.user_id)}" required>
              ${playerAvatar(player)}<span>${escapeHtml(displayName(player.name))}</span>
            </label>`).join("")}</div>
          </fieldset>
          <button class="button button-primary button-wide" type="submit">Valider ma réponse <span aria-hidden="true">→</span></button>
        </form>
      </section>`;
  }

  function renderReveal(state) {
    const round = state.round;
    const orders = (round.orders || []).map((order) => `<article class="result-card">
      <div class="result-title"><strong>${escapeHtml(displayName(order.name))} a classé</strong></div>
      <ol class="ordered-list">${order.cards.map((card, index) => `<li><span>${index + 1}</span>${escapeHtml(card.text)}</li>`).join("")}</ol>
    </article>`).join("");
    const results = (round.results || []).map((result) => `<article class="result-card">
      <div class="result-title"><strong>${escapeHtml(displayName(result.guesser_name))} devait deviner</strong><span class="result-points">${result.correct ? "+1 point ✦" : "0 point"}</span></div>
      <p class="result-caption">L'ordre venait de <strong>${escapeHtml(displayName(result.source_name))}</strong> · réponse : ${escapeHtml(displayName(result.guessed_name || "aucune"))}</p>
    </article>`).join("");
    const scores = [...state.players].sort((left, right) => right.score - left.score)
      .map((player) => `<span class="score-chip">${escapeHtml(displayName(player.name))} <strong>${player.score}</strong></span>`).join("");
    return `${renderRoomHeading(state, "ÉTAPE 3 · RÉVÉLATION", "Alors, qui connaît qui ?", "Voici les classements et les réponses de cette partie.")}
      <section class="game-panel">${renderProgress(3)}
        <h2>Le tableau des scores</h2>
        <div class="score-board">${scores}</div>
        <h2>Vos priorités</h2>
        ${orders || `<p class="empty-note">Aucun ordre n'a été enregistré.</p>`}
        <h2 class="results-heading">Qui a deviné juste ?</h2>
        ${results || `<p class="empty-note">Aucune réponse enregistrée.</p>`}
        ${state.room.is_host
          ? `<div class="game-actions">
              <button class="button button-primary button-wide" type="button" data-action="start-game">Rejouer <span aria-hidden="true">↻</span></button>
              <button class="button button-secondary button-wide" type="button" data-action="return-to-lobby">Retour à la salle d'attente</button>
            </div>`
          : `<p class="room-wait"><span class="pulse-dot"></span>En attente de l'hôte pour relancer ou retourner à la salle d'attente…</p>`}
      </section>`;
  }

  function renderState(state, silent = false) {
    activeState = state;
    showRoom();
    roomView.classList.toggle("silent-refresh", silent);
    const savedControls = silent
      ? [...roomView.querySelectorAll("input, select, textarea")].map((control) => ({
          id: control.id,
          name: control.name,
          type: control.type,
          value: control.value,
          checked: control.checked
        }))
      : [];
    if (state.room.status === "lobby") {
      roomView.innerHTML = renderLobby(state);
    } else if (state.room.status === "ranking") {
      const myOrder = state.round.my_order || [];
      if (myOrder.length) orderedCards = myOrder;
      else if (!orderedCards.length || orderedCards.length !== state.round.cards.length) orderedCards = [...state.round.cards];
      roomView.innerHTML = renderRanking(state);
    } else if (state.room.status === "guessing") {
      roomView.innerHTML = renderGuessing(state);
    } else {
      roomView.innerHTML = renderReveal(state);
    }
    if (silent && savedControls.length) {
      const controls = [...roomView.querySelectorAll("input, select, textarea")];
      for (const saved of savedControls) {
        const control = controls.find((candidate) => saved.id
          ? candidate.id === saved.id
          : candidate.name === saved.name
            && candidate.type === saved.type
            && (saved.type !== "radio" || candidate.value === saved.value));
        if (!control) continue;
        if (saved.type === "checkbox" || saved.type === "radio") control.checked = saved.checked;
        else control.value = saved.value;
      }
    }
    attachDragHandlers();
    syncPolling();
  }

  async function refreshRoom(showError = true, silent = false) {
    if (!activeRoomId || loadingState || dragInProgress || !user) return;
    loadingState = true;
    try {
      const { data, error } = await supabase.rpc("get_room_state", { p_room_id: activeRoomId });
      if (error) throw error;
      if (!data || !data.room) throw new Error("La salle n'a pas renvoyé d'état de partie valide.");
      renderState(data, silent);
      setGlobalFeedback("");
    } catch (error) {
      if (showError || silent) setGlobalFeedback(error.message || "Impossible de charger la partie.");
      else {
        stopPolling();
        localStorage.removeItem(roomStorageKey);
        activeRoomId = "";
        activeState = undefined;
        showHome();
        setGlobalFeedback("Cette salle n'est plus disponible. Crée ou rejoins une partie.");
      }
    } finally {
      loadingState = false;
    }
  }

  function startPolling() {
    if (pollingTimer !== undefined) return;
    pollingTimer = window.setInterval(() => refreshRoom(false, true), 3000);
  }

  function stopPolling() {
    window.clearInterval(pollingTimer);
    pollingTimer = undefined;
  }

  function syncPolling() {
    if (activeRoomId) startPolling();
    else stopPolling();
  }

  async function enterRoom(roomId) {
    activeRoomId = roomId;
    localStorage.setItem(roomStorageKey, roomId);
    orderedCards = [];
    await refreshRoom();
  }

  async function authenticate(sessionUser) {
    user = sessionUser;
    let pre_username = (sessionUser.email || "").split("@")[0] || "joueur";
    const username = displayName(pre_username);
    accountName.textContent = username;
    welcomeName.textContent = username;
    authScreen.hidden = true;
    appShell.hidden = false;
    activeRoomId = localStorage.getItem(roomStorageKey) || "";
    if (activeRoomId) {
      await refreshRoom(false);
    } else {
      stopPolling();
      showHome();
    }
  }

  async function logout() {
    stopPolling();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    user = undefined;
    activeRoomId = "";
    activeState = undefined;
    localStorage.removeItem(roomStorageKey);
    appShell.hidden = true;
    authScreen.hidden = false;
    loginForm.reset();
    setFeedback(loginFeedback, "");
  }

  function attachDragHandlers() {
    dragHandlerController?.abort();
    dragHandlerController = undefined;
    const list = document.querySelector("#rank-list");
    if (!list) return;
    dragHandlerController = new AbortController();
    const { signal } = dragHandlerController;
    let pointerId;
    let sourceId;
    let startX;
    let startY;
    let offsetX;
    let offsetY;
    let ghost;
    let targetIndex = -1;
    let insertAfter = false;

    function finishDrag(cancelled = false) {
      const fromIndex = ghost ? orderedCards.findIndex((card) => String(card.id) === sourceId) : -1;
      const dropIndex = targetIndex;
      const dropAfter = insertAfter;
      const shouldReorder = !cancelled && fromIndex >= 0 && dropIndex >= 0 && dropIndex !== fromIndex;
      ghost?.remove();
      ghost = undefined;
      dragInProgress = false;
      document.querySelector(".order-card.drag-source")?.classList.remove("drag-source");
      document.querySelector(".order-card.drop-target")?.classList.remove("drop-target");
      document.querySelector(".order-card.drop-before, .order-card.drop-after")
        ?.classList.remove("drop-before", "drop-after");
      if (shouldReorder) {
        const [card] = orderedCards.splice(fromIndex, 1);
        let insertionIndex = dropIndex + (dropAfter ? 1 : 0);
        if (insertionIndex > fromIndex) insertionIndex -= 1;
        orderedCards.splice(insertionIndex, 0, card);
        renderState(activeState);
        const movedIndex = orderedCards.findIndex((orderedCard) => String(orderedCard.id) === sourceId);
        const movedItem = roomView.querySelectorAll(".order-card")[movedIndex];
        movedItem?.querySelector("[data-drag-handle]")?.focus();
        const announcement = roomView.querySelector("#rank-announcement");
        if (announcement) announcement.textContent = `Carte déplacée à la position ${movedIndex + 1}.`;
      }
      pointerId = undefined;
      sourceId = undefined;
      targetIndex = -1;
      insertAfter = false;
    }

    list.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const handle = event.target.closest("[data-drag-handle]");
      if (!handle) return;
      const item = event.target.closest("[data-card-id]");
      if (!item) return;
      event.preventDefault();
      const rect = item.getBoundingClientRect();
      pointerId = event.pointerId;
      sourceId = item.dataset.cardId;
      handle.setPointerCapture(event.pointerId);
      startX = event.clientX;
      startY = event.clientY;
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;
    }, { signal });

    window.addEventListener("pointermove", (event) => {
      if (event.pointerId !== pointerId) return;
      if (!ghost && Math.hypot(event.clientX - startX, event.clientY - startY) > 6) {
        const source = list.querySelector(`[data-card-id="${CSS.escape(sourceId)}"]`);
        if (!source) return;
        ghost = source.cloneNode(true);
        ghost.classList.add("drag-ghost");
        ghost.style.width = `${source.getBoundingClientRect().width}px`;
        document.body.append(ghost);
        source.classList.add("drag-source");
        dragInProgress = true;
      }
      if (!ghost) return;
      event.preventDefault();
      ghost.style.left = `${event.clientX - offsetX}px`;
      ghost.style.top = `${event.clientY - offsetY}px`;
      ghost.style.transform = "scale(1.03) rotate(-1deg)";
      document.querySelector(".order-card.drop-target")?.classList.remove("drop-target");
      document.querySelector(".order-card.drop-before, .order-card.drop-after")
        ?.classList.remove("drop-before", "drop-after");
      const hovered = document.elementFromPoint(event.clientX, event.clientY)?.closest(".order-card");
      if (hovered && hovered.dataset.cardId !== sourceId) {
        targetIndex = [...list.querySelectorAll(".order-card")].indexOf(hovered);
        insertAfter = event.clientY > hovered.getBoundingClientRect().top + hovered.getBoundingClientRect().height / 2;
        hovered.classList.add("drop-target", insertAfter ? "drop-after" : "drop-before");
      } else {
        targetIndex = -1;
        insertAfter = false;
      }
      if (event.clientY < 56) {
        window.scrollBy({ top: -12, behavior: "auto" });
      } else if (event.clientY > window.innerHeight - 56) {
        window.scrollBy({ top: 12, behavior: "auto" });
      }
    }, { passive: false, signal });

    window.addEventListener("pointerup", (event) => {
      if (event.pointerId === pointerId) finishDrag();
    }, { signal });
    window.addEventListener("pointercancel", (event) => {
      if (event.pointerId !== pointerId) return;
      finishDrag(true);
    }, { signal });
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setFeedback(loginFeedback, "");
    const formData = new FormData(loginForm);
    const username = String(formData.get("username") || "").trim().toLowerCase();
    const password = String(formData.get("password") || "");
    if (!usernames.has(username)) {
      setFeedback(loginFeedback, "Ce pseudo n'est pas autorisé pour cette partie.");
      return;
    }
    if (!supabase) {
      setFeedback(loginFeedback, "La connexion Supabase n'est pas configurée. Ajoute l'URL et la clé anon dans supabase-config.js.");
      return;
    }
    const submitButton = loginForm.querySelector("button[type=submit]");
    submitButton.disabled = true;
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: `${username}@priorities.local`,
        password
      });
      if (error) throw error;
      if (!data.user) throw new Error("La connexion n'a pas renvoyé de compte utilisateur.");
      await authenticate(data.user);
    } catch (error) {
      setFeedback(loginFeedback, error.message || "Connexion impossible. Vérifie ton pseudo et ton mot de passe.");
    } finally {
      submitButton.disabled = false;
    }
  });

  createRoomButton.addEventListener("click", () => withBusy(async () => {
    const { data, error } = await supabase.rpc("create_room", { p_display_name: displayName(user.email.split("@")[0]) });
    if (error) throw error;
    if (!data || !data.room_id) throw new Error("La salle n'a pas pu être créée.");
    await enterRoom(data.room_id);
  }));

  joinForm.addEventListener("submit", (event) => {
    event.preventDefault();
    withBusy(async () => {
      const code = String(new FormData(joinForm).get("room-code") || "").trim().toUpperCase();
      const { data, error } = await supabase.rpc("join_room", {
        p_code: code,
        p_display_name: displayName(user.email.split("@")[0])
      });
      if (error) throw error;
      if (!data) throw new Error("Aucune salle ne correspond à ce code.");
      await enterRoom(data);
    });
  });

  signOutButton.addEventListener("click", () => withBusy(logout));

  roomView.addEventListener("click", (event) => {
    const moveButton = event.target.closest("[data-move]");
    if (moveButton) {
      const index = Number(moveButton.dataset.index);
      const nextIndex = moveButton.dataset.move === "up" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= orderedCards.length) return;
      [orderedCards[index], orderedCards[nextIndex]] = [orderedCards[nextIndex], orderedCards[index]];
      renderState(activeState);
      const movedItem = roomView.querySelectorAll(".order-card")[nextIndex];
      movedItem?.querySelector(`[data-move="${moveButton.dataset.move}"]`)?.focus();
      const announcement = roomView.querySelector("#rank-announcement");
      if (announcement) announcement.textContent = `Carte déplacée à la position ${nextIndex + 1}.`;
      return;
    }
    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) return;
    if (actionButton.dataset.action === "refresh-room") {
      withBusy(() => refreshRoom());
    } else if (actionButton.dataset.action === "close-room") {
      if (!window.confirm("Fermer cette salle et la supprimer pour tous les joueurs ?")) return;
      withBusy(async () => {
        const { error } = await supabase.rpc("close_room", { p_room_id: activeRoomId });
        if (error) throw error;
        stopPolling();
        localStorage.removeItem(roomStorageKey);
        activeRoomId = "";
        activeState = undefined;
        showHome();
      });
    } else if (actionButton.dataset.action === "start-game") {
      withBusy(async () => {
        const { error } = await supabase.rpc("start_game", { p_room_id: activeRoomId });
        if (error) throw error;
        orderedCards = [];
        await refreshRoom();
      });
    } else if (actionButton.dataset.action === "return-to-lobby") {
      withBusy(async () => {
        const { error } = await supabase.rpc("return_room_to_lobby", { p_room_id: activeRoomId });
        if (error) throw error;
        orderedCards = [];
        await refreshRoom();
      });
    } else if (actionButton.dataset.action === "submit-order") {
      withBusy(async () => {
        const { error } = await supabase.rpc("submit_order", {
          p_round_id: activeState.round.id,
          p_card_ids: orderedCards.map((card) => card.id)
        });
        if (error) throw error;
        await refreshRoom();
      });
    }
  });

  roomView.addEventListener("submit", (event) => {
    event.preventDefault();
    if (event.target.id === "lobby-settings") {
      withBusy(async () => {
        const formData = new FormData(event.target);
        const { error } = await supabase.rpc("update_room_settings", {
          p_room_id: activeRoomId,
          p_cards_count: Number(formData.get("cards-count")),
          p_guess_author: formData.has("guess-author")
        });
        if (error) throw error;
        await refreshRoom();
      });
    } else if (event.target.id === "guess-form") {
      withBusy(async () => {
        const sourceId = new FormData(event.target).get("source-player");
        if (!sourceId) throw new Error("Choisis un joueur avant de valider.");
        const { error } = await supabase.rpc("submit_guess", {
          p_round_id: activeState.round.id,
          p_source_id: sourceId
        });
        if (error) throw error;
        await refreshRoom();
      });
    }
  });

  async function initialize() {
    const config = window.PRIORITIES_SUPABASE_CONFIG;
    const isConfigured = config?.url && config?.anonKey
      && !config.url.includes("YOUR_PROJECT_REF")
      && !config.anonKey.includes("YOUR_SUPABASE_ANON_KEY")
      && window.supabase?.createClient;
    if (isConfigured) supabase = window.supabase.createClient(config.url, config.anonKey);
    if (!supabase) {
      document.querySelector("#username").disabled = true;
      document.querySelector("#password").disabled = true;
      document.querySelector("#login-form button").disabled = true;
      setFeedback(loginFeedback, "Pour jouer, configure d'abord Supabase dans supabase-config.js. Consulte README.md pour les étapes.");
      return;
    }
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (data.session?.user) await authenticate(data.session.user);
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        user = undefined;
        stopPolling();
        appShell.hidden = true;
        authScreen.hidden = false;
      } else if (event === "SIGNED_IN" && session?.user && !user) {
        window.setTimeout(() => authenticate(session.user), 0);
      }
    });
  }

  initialize().catch((error) => {
    setFeedback(loginFeedback, error.message || "Impossible d'initialiser la connexion.");
  });
})();
