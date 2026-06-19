(function () {
  window.AssistAiPrototypeWorkspaces = window.AssistAiPrototypeWorkspaces || {};
  window.AssistAiPrototypeWorkspaces.voiceLab = {
    createRendererSet(deps) {
      const { workspaceView, escapeHtml } = deps;

      let permissionState = "loading"; // loading, allowed, denied
      let permissionMessage = "正在检查语音实验室权限...";
      let recorderState = "idle"; // idle, recording, ready, error
      let recordingSeconds = 0;
      let audioUrl = "";
      let recordingError = "";
      let speechText = "这是一段语音输出测试。";

      let mediaRecorder = null;
      let stream = null;
      let chunks = [];
      let timer = null;

      function renderVoiceLabWorkspace() {
        if (!workspaceView) return;

        const hasMediaDevices = typeof navigator !== "undefined" && !!navigator.mediaDevices;
        const support = {
          secureContext: typeof window !== "undefined" && window.isSecureContext,
          mediaDevices: hasMediaDevices,
          getUserMedia: hasMediaDevices && typeof navigator.mediaDevices.getUserMedia === "function",
          mediaRecorder: typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined",
          speechSynthesis: typeof window !== "undefined" && "speechSynthesis" in window,
        };

        const supportLabel = (val) => val ? "支持" : "不支持";
        const supportClass = (val) => val ? "font-semibold text-slate-800" : "font-semibold text-red-600";

        workspaceView.innerHTML = `
          <div class="workspace-shell w-[min(100%,920px)] mx-auto p-[36px_26px_72px] max-[900px]:p-[24px_14px_56px] text-[#2f3a46]">
            <header class="mb-6">
              <p class="text-xs font-semibold uppercase tracking-[0.22em] text-[#87919d]">
                Voice Lab
              </p>
              <h1 class="mt-2 text-2xl font-semibold tracking-[0] text-[#2f3a46]">
                语音能力测试
              </h1>
              <p class="mt-2 max-w-[680px] text-sm leading-6 text-[#66717d]">
                用于验证当前浏览器或企微内嵌环境是否支持麦克风录音、录音回放和浏览器语音输出。
              </p>
            </header>

            <section class="rounded-[18px] border border-[#e7edf2] bg-white/95 p-5 shadow-[0_18px_38px_rgba(23,28,38,0.06)] mb-5">
              <div class="flex items-center gap-2.5 text-sm font-semibold">
                ${permissionState === "allowed" ? `
                  <svg class="w-5 h-5 text-[#279ab3]" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                ` : permissionState === "loading" ? `
                  <svg class="w-5 h-5 animate-spin text-[#87919d]" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18"></path>
                  </svg>
                ` : `
                  <svg class="w-5 h-5 text-red-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                `}
                <span>${permissionMessage}</span>
              </div>
            </section>

            ${permissionState === "allowed" ? `
              <div class="grid gap-5">
                <section class="grid gap-3 rounded-[18px] border border-[#e7edf2] bg-white/95 p-5 shadow-[0_18px_38px_rgba(23,28,38,0.06)]">
                  <h2 class="text-base font-semibold text-slate-800">环境能力</h2>
                  <div class="grid gap-2 sm:grid-cols-2">
                    <div class="flex items-center justify-between rounded-xl bg-[#f6f8fa] px-3 py-2.5 text-sm border border-slate-100">
                      <span class="text-[#66717d]">安全上下文 (window.isSecureContext)</span>
                      <span class="${supportClass(support.secureContext)}">${supportLabel(support.secureContext)}</span>
                    </div>
                    <div class="flex items-center justify-between rounded-xl bg-[#f6f8fa] px-3 py-2.5 text-sm border border-slate-100">
                      <span class="text-[#66717d]">mediaDevices API</span>
                      <span class="${supportClass(support.mediaDevices)}">${supportLabel(support.mediaDevices)}</span>
                    </div>
                    <div class="flex items-center justify-between rounded-xl bg-[#f6f8fa] px-3 py-2.5 text-sm border border-slate-100">
                      <span class="text-[#66717d]">getUserMedia 授权方法</span>
                      <span class="${supportClass(support.getUserMedia)}">${supportLabel(support.getUserMedia)}</span>
                    </div>
                    <div class="flex items-center justify-between rounded-xl bg-[#f6f8fa] px-3 py-2.5 text-sm border border-slate-100">
                      <span class="text-[#66717d]">MediaRecorder 录音机</span>
                      <span class="${supportClass(support.mediaRecorder)}">${supportLabel(support.mediaRecorder)}</span>
                    </div>
                    <div class="flex items-center justify-between rounded-xl bg-[#f6f8fa] px-3 py-2.5 text-sm border border-slate-100">
                      <span class="text-[#66717d]">speechSynthesis 语音合成</span>
                      <span class="${supportClass(support.speechSynthesis)}">${supportLabel(support.speechSynthesis)}</span>
                    </div>
                  </div>
                </section>

                <section class="grid gap-4 rounded-[18px] border border-[#e7edf2] bg-white/95 p-5 shadow-[0_18px_38px_rgba(23,28,38,0.06)]">
                  <div class="flex items-center gap-2 border-b border-slate-50 pb-2">
                    <svg class="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path>
                    </svg>
                    <h2 class="text-base font-semibold text-slate-800">语音输入探测</h2>
                  </div>
                  <div class="flex flex-wrap items-center gap-4">
                    ${recorderState !== "recording" ? `
                      <button id="startRecBtn" type="button" class="inline-flex h-10 items-center gap-2 rounded-xl bg-[#2f3a46] px-4 text-sm font-semibold text-white transition-all hover:bg-[#202936] hover:-translate-y-0.5 active:translate-y-0 shadow-sm">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path>
                        </svg>
                        开始录音
                      </button>
                    ` : `
                      <button id="stopRecBtn" type="button" class="inline-flex h-10 items-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white transition-all hover:bg-red-700 hover:-translate-y-0.5 active:translate-y-0 shadow-sm animate-pulse">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                          <path stroke-linecap="round" stroke-linejoin="round" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H10a1 1 0 01-1-1v-4z"></path>
                        </svg>
                        停止录音
                      </button>
                    `}
                    <span class="text-sm text-[#66717d]">
                      状态：<span class="font-semibold text-slate-800">${
                        recorderState === "recording" ? `录音中 <span class="text-red-500 font-mono">${recordingSeconds}s</span>` :
                        recorderState === "ready" ? '<span class="text-[#279ab3]">已生成录音</span>' :
                        recorderState === "error" ? '<span class="text-red-600">异常</span>' : "待测试"
                      }</span>
                    </span>
                  </div>
                  ${recordingError ? `
                    <div class="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 border border-red-100">
                      ${recordingError}
                    </div>
                  ` : ""}
                  ${audioUrl ? `
                    <div class="mt-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <audio id="labAudio" class="w-full" controls src="${audioUrl}">
                        <track kind="captions" />
                      </audio>
                    </div>
                  ` : ""}
                </section>

                <section class="grid gap-4 rounded-[18px] border border-[#e7edf2] bg-white/95 p-5 shadow-[0_18px_38px_rgba(23,28,38,0.06)]">
                  <div class="flex items-center gap-2 border-b border-slate-50 pb-2">
                    <svg class="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .9-1.077 1.337-1.707.707L5.586 15z"></path>
                    </svg>
                    <h2 class="text-base font-semibold text-slate-800">语音输出探测</h2>
                  </div>
                  <textarea id="speechInput" class="w-full min-h-24 resize-none rounded-xl border border-[#d4dde5] bg-white px-3 py-2.5 text-sm leading-6 outline-none focus:border-[#bddfe6] focus:ring-4 focus:ring-[#47b9d2]/10 transition-all text-slate-800 animate-fade-in" placeholder="输入测试语音文本">${escapeHtml(speechText)}</textarea>
                  <div class="flex flex-wrap gap-3">
                    <button id="speakBtn" type="button" class="inline-flex h-10 items-center gap-2 rounded-xl bg-[#2f3a46] px-4 text-sm font-semibold text-white transition-all hover:bg-[#202936] hover:-translate-y-0.5 active:translate-y-0 shadow-sm disabled:cursor-not-allowed disabled:bg-[#c3ccd4] disabled:translate-y-0" ${!support.speechSynthesis ? "disabled" : ""}>
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path>
                        <path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                      </svg>
                      播放测试
                    </button>
                    <button id="stopSpeakBtn" type="button" class="inline-flex h-10 items-center gap-2 rounded-xl border border-[#d4dde5] px-4 text-sm font-semibold text-[#2f3a46] transition-all hover:bg-[#f6f8fa] hover:-translate-y-0.5 active:translate-y-0 shadow-sm disabled:cursor-not-allowed disabled:text-[#a0a9b2] disabled:translate-y-0" ${!support.speechSynthesis ? "disabled" : ""}>
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5"></path>
                      </svg>
                      停止播放
                    </button>
                  </div>
                </section>
              </div>
            ` : ""}
          </div>
        `;

        // Bind events
        if (permissionState === "allowed") {
          const startRecBtn = document.getElementById("startRecBtn");
          const stopRecBtn = document.getElementById("stopRecBtn");
          const speakBtn = document.getElementById("speakBtn");
          const stopSpeakBtn = document.getElementById("stopSpeakBtn");
          const speechInput = document.getElementById("speechInput");

          if (startRecBtn) startRecBtn.addEventListener("click", startRecordingFlow);
          if (stopRecBtn) stopRecBtn.addEventListener("click", stopRecordingFlow);
          if (speakBtn) speakBtn.addEventListener("click", speakFlow);
          if (stopSpeakBtn) stopSpeakBtn.addEventListener("click", stopSpeakFlow);
          if (speechInput) {
            speechInput.addEventListener("input", (e) => {
              speechText = e.target.value;
            });
          }
        }
      }

      async function startRecordingFlow() {
        recordingError = "";
        const hasMediaDevices = typeof navigator !== "undefined" && !!navigator.mediaDevices;
        const getUserMedia = hasMediaDevices && typeof navigator.mediaDevices.getUserMedia === "function";
        const mediaRecorderSupported = typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined";

        if (!getUserMedia || !mediaRecorderSupported) {
          recorderState = "error";
          recordingError = "当前环境不支持浏览器录音能力。";
          renderVoiceLabWorkspace();
          return;
        }

        try {
          if (audioUrl) {
            URL.revokeObjectURL(audioUrl);
            audioUrl = "";
          }

          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          chunks = [];
          mediaRecorder = new MediaRecorder(stream);
          mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              chunks.push(event.data);
            }
          };
          mediaRecorder.onstop = () => {
            const blob = new Blob(chunks, {
              type: mediaRecorder.mimeType || "audio/webm",
            });
            audioUrl = URL.createObjectURL(blob);
            recorderState = "ready";
            stopTimer();
            stopStream();
            renderVoiceLabWorkspace();
          };

          mediaRecorder.start();
          recordingSeconds = 0;
          recorderState = "recording";
          renderVoiceLabWorkspace();

          timer = window.setInterval(() => {
            recordingSeconds += 1;
            renderVoiceLabWorkspace();
          }, 1000);
        } catch (error) {
          recorderState = "error";
          recordingError = error instanceof Error ? error.message : "麦克风授权或录音启动失败";
          stopTimer();
          stopStream();
          renderVoiceLabWorkspace();
        }
      }

      function stopRecordingFlow() {
        if (mediaRecorder && mediaRecorder.state === "recording") {
          mediaRecorder.stop();
        }
      }

      function stopTimer() {
        if (timer) {
          window.clearInterval(timer);
          timer = null;
        }
      }

      function stopStream() {
        if (stream) {
          stream.getTracks().forEach((track) => track.stop());
          stream = null;
        }
      }

      function speakFlow() {
        if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(speechText || "语音输出测试");
        utterance.lang = "zh-CN";
        window.speechSynthesis.speak(utterance);
      }

      function stopSpeakFlow() {
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          window.speechSynthesis.cancel();
        }
      }

      // Check permission on startup
      if (permissionState === "loading") {
        setTimeout(() => {
          permissionState = "allowed";
          permissionMessage = "当前账号已开启语音实验室（已模拟激活）。";
          renderVoiceLabWorkspace();
        }, 500);
      }

      return {
        renderVoiceLabWorkspace
      };
    }
  };
})();
