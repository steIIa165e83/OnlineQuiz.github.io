// Replace with the actual API URL later
const API_BASE_URL = "http://127.0.0.1:8000";
const STORAGE_PREFIX = "onlineQuiz:participant:";
const ROOM_POLL_INTERVAL_MS = 2500;
const ROOM_REQUEST_TIMEOUT_MS = 8000;

// Join form elements
const form = document.querySelector("form");
const roomCodeInput = document.querySelector("#room-code");
const nicknameInput = document.querySelector("#nickname");
const submitButton = form.querySelector("button[type='submit']");
const message = document.querySelector("#message");

// Lobby elements
const lobby = document.querySelector("#lobby");
const lobbyRoomCode = document.querySelector("#lobby-room-code");
const lobbyNickname = document.querySelector("#lobby-nickname");
const roomStatus = document.querySelector("#room-status");
const lobbyMessage = document.querySelector("#lobby-message");
const leaveButton = document.querySelector("#leave-button");

let currentParticipant = null;
let pollingEnabled = false;
let pollingTimer = null;
let activeStatusRequest = null;

function normalizeRoomCode(roomCode) {
  return roomCode.trim().toUpperCase();
}

// Return STORAGE_PREFIX:RoomCode, e.g. "onlineQuiz:participant:ABC123"
function getStorageKey(roomCode) {
  return STORAGE_PREFIX + normalizeRoomCode(roomCode);
}

// Save JSON information about the participant to localStorage
function saveParticipant(participant) {
  const record = {
    room_code: normalizeRoomCode(participant.room_code),
    student_id: participant.student_id,
    nickname: participant.nickname,
    saved_at: Date.now(),
  };

  try {
    localStorage.setItem(getStorageKey(record.room_code), JSON.stringify(record));
    return true;
  } catch (error) {
    console.error("Could not save participant information.", error);
    return false;
  }
}

function removeParticipant(roomCode) {
  try {
    localStorage.removeItem(getStorageKey(roomCode));
  } catch (error) {
    console.error("Could not remove participant information.", error);
  }
}

function getSavedParticipants(roomCode) {
  const records = [];
  try{
    const requestedRoomCode = roomCode ? normalizeRoomCode(roomCode) : null;
    const savedKeys = [];

    for(let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith(STORAGE_PREFIX)) {
        continue;
      }
      savedKeys.push(key);
    }

    for (const key of savedKeys) {
      const savedRoomCode = key.slice(STORAGE_PREFIX.length);
      if(requestedRoomCode  && savedRoomCode !== requestedRoomCode) {
        continue;
      }

      try {
        const record = JSON.parse(localStorage.getItem(key));
        if (
              record &&
              normalizeRoomCode(record.room_code) === savedRoomCode &&
              typeof record.student_id === "string" &&
              record.student_id.length > 0 &&
              typeof record.nickname === "string" &&
              record.nickname.length > 0
            ) {
              records.push(record);
            } else {
              localStorage.removeItem(key);
            }
          } catch (error) {
            console.error("Could not retrieve saved participant information.", error);
            localStorage.removeItem(key);
          }
      }
    } catch (error) {
      console.error("Could not retrieve saved participant information.", error);
    }

  return records.sort((first, second) => (second.saved_at || 0) - (first.saved_at || 0));
}

async function requestStudent(roomCode, studentId) {
  return fetch(`${API_BASE_URL}/rooms/${encodeURIComponent(roomCode)}/students/${encodeURIComponent(studentId)}`);
}

async function requestRoom(roomCode, signal) {
  return fetch(`${API_BASE_URL}/rooms/${encodeURIComponent(roomCode)}`, { signal });
}

async function restoreSavedParticipant() {
  // Auto-fill room code from invite link (e.g. ?room=ABC123)
  const params = new URLSearchParams(window.location.search);
  const roomFromUrl = params.get("room");
  if (roomFromUrl) {
    roomCodeInput.value = normalizeRoomCode(roomFromUrl);
  }

  const candidates = getSavedParticipants(roomFromUrl);
  for (const savedParticipant of candidates) {
    let response;
    try {
      response = await requestStudent(
        savedParticipant.room_code,
        savedParticipant.student_id
      );
    } catch (error) {
      console.error(error);
      message.textContent =
        "Could not connect to the server to verify saved participant information. Please check your network connection.";
      return;
    }

    if (response.status === 404) {
      removeParticipant(savedParticipant.room_code);
      continue;
    }
    if (!response.ok) {
      message.textContent =
        "Could not connect to the server to verify saved participant information. Please check your network connection.";
      return;
    }

    const participant = await response.json().catch(() => null);
    if (
      !participant ||
      participant.room_code !== savedParticipant.room_code ||
      participant.student_id !== savedParticipant.student_id
    ) {
      message.textContent =
        "Could not connect to the server to verify saved participant information. Please check your network connection.";
      return;
    }

    showLobby(participant);
    return;
  }
}

function showLobby(participant) {
  stopRoomPolling();
  currentParticipant = participant;
  form.hidden = true;     // Hide the join form
  lobby.hidden = false;   // Show the lobby
  lobbyRoomCode.textContent = participant.room_code;
  lobbyNickname.textContent = participant.nickname;
  startRoomPolling(participant.room_code);
}

function displayRoomStatus(status) {
  if (status === "waiting") {
    roomStatus.textContent = "Waiting for the quiz to start...";
    lobbyMessage.textContent = "Please wait for the instructor to start the quiz.";
    return true;
  }
  if (status === "active") {
    roomStatus.textContent = "The quiz has started!";
    lobbyMessage.textContent = "The quiz is now in progress.";
    return true;
  }
  if (status === "finished") {
    roomStatus.textContent = "The quiz has finished.";
    lobbyMessage.textContent = "The quiz has ended. Thank you for participating.";
    return false;
  }

  roomStatus.textContent = "Unknown room status.";
  return true;
}

async function pollRoomStatus(roomCode) {
  if (!pollingEnabled) {
    return;
  }

  let shouldContinue = true;
  const controller = new AbortController();
  activeStatusRequest = controller;
  const timeout = setTimeout(() => controller.abort(), ROOM_REQUEST_TIMEOUT_MS);

  try {
    const response = await requestRoom(roomCode, controller.signal);
    if (response.ok) {
      const room = await response.json();
      shouldContinue = displayRoomStatus(room.status);
    } else {
      roomStatus.textContent = "Could not retrieve room status. Retrying...";
    }
  } catch (error) {
    if (error.name === "AbortError" && pollingEnabled) {
      roomStatus.textContent = "Request timed out. Retrying...";
    } else if (error.name !== "AbortError") {
      console.error(error);
      roomStatus.textContent = "Could not connect to the server. Retrying...";
    }
  } finally {
    clearTimeout(timeout);
    if (activeStatusRequest === controller) {
      activeStatusRequest = null;
    }
    if (pollingEnabled && shouldContinue) {
      pollingTimer = setTimeout(() => pollRoomStatus(roomCode), ROOM_POLL_INTERVAL_MS);
    }
  }
}

function startRoomPolling(roomCode) {
  pollingEnabled = true;
  pollRoomStatus(roomCode);
}

function stopRoomPolling() {
  pollingEnabled = false;
  if (pollingTimer !== null) {
    clearTimeout(pollingTimer); // Clear the polling timer
    pollingTimer = null;
  }
  if (activeStatusRequest) {
    activeStatusRequest.abort();
    activeStatusRequest = null;
  }
}

async function joinRoom(roomCode, nickname) {
  const response = await fetch(
    `${API_BASE_URL}/rooms/${encodeURIComponent(roomCode)}/students`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: nickname }),
    }
  );

  const result = await response.json().catch(() => null); // Handle cases where the response is not JSON
  return { response, result };
}

function leaveLobby() {
  if (!currentParticipant) {
    return;
  }
  if (!window.confirm("Do you leave the room?")) {
    return;
  }

  stopRoomPolling();
  removeParticipant(currentParticipant.room_code);
  currentParticipant = null;

  lobby.hidden = true;
  form.hidden = false;
  nicknameInput.value = "";
  message.textContent = "Left from the room"
}

form.addEventListener("submit", async function (event) {
  event.preventDefault(); // Prevent page reload

  // Validate inputs
  const roomCode = normalizeRoomCode(roomCodeInput.value);
  const nickname = nicknameInput.value.trim();
  if (roomCode === "" || nickname === "") {
    message.textContent = "Please enter both the room code and nickname.";
    return; 
  }

  submitButton.disabled = true;    // Prevent multiple submissions
  message.textContent = "Joining...";

  try {
    const { response, result } = await joinRoom(roomCode, nickname);

    // Handle error responses
    if(!response.ok) {
      if (response.status === 404) {
        message.textContent = "Room not found. Please check the room code.";
        return;
      }
      if (result && typeof result.detail === "string") {
        message.textContent = result.detail;
        return;
      }
      message.textContent = "Failed to join the room. Please try again.";
      return;
    }
    if(!result) {
      message.textContent = "Unexpected server response.";
      return;
    }
    
  // Handle the successful response
    const saved = saveParticipant(result);
    showLobby(result);
    if (!saved) {
      lobbyMessage.textContent = "Joined the room, but could not save your information locally.";
    }

  } catch (error) {
    // Network failure, server down, etc.
    console.error(error);
    message.textContent = "Could not connect to the server.";
  } finally {
    submitButton.disabled = false;
  }
});

window.addEventListener("pagehide", stopRoomPolling);
window.addEventListener("pageshow", function () {
  if (!lobby.hidden && !pollingEnabled) {
    startRoomPolling(lobbyRoomCode.textContent);
  }
})

leaveButton.addEventListener("click", leaveLobby);

restoreSavedParticipant();