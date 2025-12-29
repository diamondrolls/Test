// This file contains utility functions for updating the UI elements related to
// players and room information in the application.

/**
 * Updates the player count and player list in the UI.
 * Iterates through the `state` parameter to count players and lists their names.
 * Displays this information in the DOM elements `#player-count` and `#player-list`.
 *
 * @param {Object} state - The presence state, containing details about players.
 */
function updatePlayerCountAndList(state) {
    const playerCountElement = document.querySelector('#player-count');
    const playerListElement = document.querySelector('#player-list');

    if (!playerCountElement || !playerListElement) {
        console.warn("Missing DOM elements: '#player-count' or '#player-list'");
        return;
    }

    const playerNames = Object.values(state).map(player => player.name); // Adjust mapping based on actual state structure
    const playerCount = playerNames.length;

    playerCountElement.textContent = `Players: ${playerCount}`;

    // Clear the existing list
    playerListElement.innerHTML = '';

    // Append the player names to the list
    playerNames.forEach(name => {
        const listItem = document.createElement('li');
        listItem.textContent = name;
        playerListElement.appendChild(listItem);
    });
}

/**
 * Updates the room info UI with details such as room ID and join link.
 * Assumes the presence of DOM elements `#room-info` and `#room-link`.
 *
 * @param {Object} roomInfo - Object containing room details (e.g., ID, join link).
 */
function updateRoomInfoUI(roomInfo) {
    const roomInfoElement = document.querySelector('#room-info');
    const roomLinkElement = document.querySelector('#room-link');

    if (!roomInfoElement || !roomLinkElement) {
        console.warn("Missing DOM elements: '#room-info' or '#room-link'");
        return;
    }

    const { roomId, joinLink } = roomInfo;

    roomInfoElement.textContent = `Room ID: ${roomId}`;
    roomLinkElement.textContent = joinLink;
    roomLinkElement.href = joinLink;
}

module.exports = {
    updatePlayerCountAndList,
    updateRoomInfoUI,
};