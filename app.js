// Replace with the actual API URL later
const API_BASE_URL = "http://127.0.0.1:8000";

const form = document.querySelector("form");
const roomCodeInput = document.querySelector("#room-code");
const nicknameInput = document.querySelector("#nickname");
const submitButton = form.querySelector("button[type='submit']");
const message = document.querySelector("#message");

// Auto-fill room code from invite link (e.g. ?room=ABC123)
const params = new URLSearchParams(window.location.search);
const roomFromUrl = params.get("room");
if (roomFromUrl) {
  roomCodeInput.value = roomFromUrl.trim().toUpperCase();
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

function getErrorMessage(response, result) {
  if (response.status === 404) {
    return "Room not found. Please check the room code.";
  }
  if (result && typeof result.detail === "string") {
    return result.detail;
  }
  return "Failed to join the room.";
}

form.addEventListener("submit", async function (event) {
  event.preventDefault(); // Prevent page reload

  // Validate inputs
  const roomCode = roomCodeInput.value.trim().toUpperCase();
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
      message.textContent = getErrorMessage(response, result);
      return;
    }
    if(!result) {
      message.textContent = "Unexpected server response.";
      return;
    }
    
  // Handle the successful response
    message.textContent = "Joined! nickname: " + result.nickname + ", room_code: " + result.room_code;
  } catch (error) {
    // Network failure, server down, etc.
    console.error(error);
    message.textContent = "Could not connect to the server.";
  } finally {
    submitButton.disabled = false;
  }
});