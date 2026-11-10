const API_BASE_URL = "http://127.0.0.1:8000";

const form = document.querySelector("form");
const roomCodeInput = document.querySelector("#room-code");
const nicknameInput = document.querySelector("#nickname");
const message = document.querySelector("#message");

const params = new URLSearchParams(window.location.search);
const roomFromUrl = params.get("room");

if (roomFromUrl) {
  roomCodeInput.value = roomFromUrl.trim().toUpperCase();
}

form.addEventListener("submit", async function (event) {
    event.preventDefault();

    const roomCode = roomCodeInput.value.trim().toUpperCase();
    const nickname = nicknameInput.value.trim();
    if (roomCode === "" || nickname === "") {
    message.textContent = "Please enter both the room code and nickname.";
    return;
    }

    const response = await fetch(API_BASE_URL + "/rooms/" + roomCode + "/students", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nickname:nickname }),
    });
    const result = await response.json();
    message.textContent = "Joined\n" + " nickname: " + result.nickname + "\n room_code: " + result.room_code;
});