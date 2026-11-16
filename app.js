const video = document.getElementById("camera-feed");
const canvas = document.getElementById("capture-canvas");
const subtitleBox = document.getElementById("subtitle-box");
const statusBadge = document.getElementById("status-badge");
const reticle = document.getElementById("reticle");
const questionInput = document.getElementById("question-input");
const sendBtn = document.getElementById("send-btn");
const micBtn = document.getElementById("mic-btn");
const quickScanBtn = document.getElementById("quick-scan-btn");
const switchCamBtn = document.getElementById("switch-cam-btn");
const muteBtn = document.getElementById("mute-btn");

let currentStream = null;
let useRearCamera = true;
let isMuted = false;
let currentAudio = null;

// 1. 크롬북 & 스마트폰 자동 대응 카메라 초기화
async function startCamera() {
  if (currentStream) {
    currentStream.getTracks().forEach((track) => track.stop());
  }

  const preferredFacing = useRearCamera ? "environment" : "user";

  try {
    // 1차 시도: 선호 방향(후면 우선)으로 요청
    currentStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: preferredFacing },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
  } catch (err) {
    // 2차 시도: 크롬북처럼 후면 카메라가 없을 때 기본 웹캠으로 자동 전환
    try {
      currentStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
    } catch (fallbackErr) {
      subtitleBox.textContent = "카메라 권한이 필요해! 브라우저 주소창 왼쪽 자물쇠를 눌러 카메라를 허용해 줘.";
      statusBadge.textContent = "CAMERA ERROR";
      return;
    }
  }

  video.srcObject = currentStream;
  // 문제집 글씨가 반전되지 않도록 항상 원본 정방향 유지
  video.style.transform = "scaleX(1)";
}

switchCamBtn.addEventListener("click", () => {
  useRearCamera = !useRearCamera;
  startCamera();
});

muteBtn.addEventListener("click", () => {
  isMuted = !isMuted;
  muteBtn.textContent = isMuted ? "🔇 조용한 모드" : "🔊 음성 ON";
  if (isMuted && currentAudio) {
    currentAudio.pause();
  }
});

// 2. 현재 카메라 프레임 캡처 (수학 문제 글씨가 잘 보이도록 적정 해상도 압축)
function captureFrameBase64() {
  if (!video.videoWidth || !video.videoHeight) return null;

  const maxWidth = 1024;
  const scale = Math.min(1, maxWidth / video.videoWidth);
  canvas.width = video.videoWidth * scale;
  canvas.height = video.videoHeight * scale;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}

// 3. AI 비전 분석 요청
async function analyzeVision(promptText) {
  const imageBase64 = captureFrameBase64();
  if (!imageBase64) {
    subtitleBox.textContent = "카메라 화면이 아직 준비되지 않았어. 잠시 후 다시 시도해 줘!";
    return;
  }

  reticle.classList.add("scanning");
  statusBadge.textContent = "SCANNING...";
  subtitleBox.textContent = `분석 중: "${promptText}"`;

  try {
    const res = await fetch("/api/vision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64, prompt: promptText }),
    });

    const data = await res.json();
    if (!res.ok || !data.reply) {
      throw new Error(data.error || "분석 실패");
    }

    subtitleBox.textContent = data.reply;
    statusBadge.textContent = `ACTIVE (${data.engine?.toUpperCase() || "AI"})`;

    if (!isMuted) {
      speakReelsVoice(data.reply);
    }
  } catch (err) {
    subtitleBox.textContent = "오류 발생: " + err.message;
    statusBadge.textContent = "ERROR";
  } finally {
    reticle.classList.remove("scanning");
  }
}

// 4. 릴스 목소리 재생
async function speakReelsVoice(text) {
  try {
    if (currentAudio) {
      currentAudio.pause();
    }
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (data.audioBase64) {
      currentAudio = new Audio("data:audio/mp3;base64," + data.audioBase64);
      currentAudio.play();
    }
  } catch (e) {
    console.error("TTS 오류:", e);
  }
}

// 5. 버튼 및 음성 인식 이벤트
sendBtn.addEventListener("click", () => {
  const q = questionInput.value.trim() || "지금 보이는 게 뭐야?";
  questionInput.value = "";
  analyzeVision(q);
});

questionInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendBtn.click();
});

quickScanBtn.addEventListener("click", () => {
  analyzeVision("지금 카메라에 보이는 사물이나 글씨, 수학 문제가 있으면 핵심만 정확하게 알려줘.");
});

// 음성 인식 (Web Speech API)
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
  const recognition = new SpeechRecognition();
  recognition.lang = "ko-KR";
  recognition.interimResults = false;

  micBtn.addEventListener("click", () => {
    try {
      recognition.start();
      micBtn.classList.add("listening");
      micBtn.textContent = "👂 듣는 중... 질문해!";
    } catch (e) {}
  });

  recognition.onresult = (event) => {
    const spokenText = event.results[0][0].transcript;
    analyzeVision(spokenText);
  };

  recognition.onend = () => {
    micBtn.classList.remove("listening");
    micBtn.textContent = "🎙️ 말로 물어보기";
  };

  recognition.onerror = () => {
    micBtn.classList.remove("listening");
    micBtn.textContent = "🎙️ 말로 물어보기";
  };
} else {
  micBtn.style.display = "none";
}

// 시작 시 카메라 자동 실행
startCamera();
