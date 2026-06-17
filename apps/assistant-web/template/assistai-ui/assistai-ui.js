const assistAiPrototypeRoot = document.getElementById("assistai-root");

if (!assistAiPrototypeRoot) {
  throw new Error("Missing #assistai-root container for AssistAI prototype.");
}

assistAiPrototypeRoot.innerHTML = "    <div class=\"app-shell\">\n      <div class=\"app\">\n        <aside class=\"sidebar\">\n          <div class=\"sidebar-top\">\n            <div class=\"sidebar-brand\">\n              <div class=\"brand\" aria-label=\"AssistAI\">\n                <img src=\"./logo.svg\" alt=\"AssistAI \u6807\u5fd7\" />\n              </div>\n              <span class=\"brand-title\">\u4f01\u4e1a AI \u52a9\u624b</span>\n            </div>\n            <button class=\"collapse-btn\" aria-label=\"\u6536\u8d77\u4fa7\u680f\">\n              <svg class=\"icon\" viewBox=\"0 0 24 24\">\n                <rect x=\"4\" y=\"5\" width=\"16\" height=\"14\" rx=\"2\"></rect>\n                <path d=\"M10 5v14\"></path>\n              </svg>\n            </button>\n          </div>\n\n          <button class=\"new-chat\">\n            <span class=\"new-chat-main\">\n              <svg class=\"icon\" viewBox=\"0 0 24 24\">\n                <circle cx=\"12\" cy=\"12\" r=\"9\"></circle>\n                <path d=\"M12 8v8\"></path>\n                <path d=\"M8 12h8\"></path>\n              </svg>\n              <span>\u65b0\u5efa\u4f1a\u8bdd</span>\n            </span>\n          </button>\n\n          <div class=\"sidebar-scroll\">\n            <div class=\"sidebar-group\">\n              <a class=\"nav-item\" data-nav-target=\"library-workspace\" href=\"./library.html\">\n                <svg class=\"icon nav-item-icon\" viewBox=\"0 0 24 24\">\n                  <path d=\"M5 6.5A2.5 2.5 0 0 1 7.5 4H19v16H7.5A2.5 2.5 0 0 0 5 22z\"></path>\n                  <path d=\"M8 8h7\"></path>\n                  <path d=\"M8 12h7\"></path>\n                  <path d=\"M8 16h5\"></path>\n                </svg>\n                <span>\u8d44\u6599\u5e93</span>\n              </a>\n              <a class=\"nav-item\" data-nav-target=\"gpts-workspace\" href=\"./gpts.html\">\n                <img class=\"nav-item-logo\" src=\"../../src/assets/icons/apps.svg\" alt=\"\" />\n                <span>\u667a\u80fd\u4f53\u5e7f\u573a</span>\n              </a>\n              <a class=\"nav-item\" data-nav-target=\"regulation-assistant\" href=\"./policy.html\">\n                <img class=\"nav-item-logo\" src=\"../../public/gpts/policy.svg\" alt=\"\" />\n                <span>\u5236\u5ea6\u52a9\u624b</span>\n              </a>\n            </div>\n            <div class=\"sidebar-group history-group\">\n              <button class=\"section-title history-toggle\" aria-expanded=\"true\" aria-controls=\"historyList\">\n                <span class=\"section-title-main\">\n                  <svg class=\"icon\" viewBox=\"0 0 24 24\">\n                    <circle cx=\"12\" cy=\"12\" r=\"8\"></circle>\n                    <path d=\"M12 8v5\"></path>\n                    <path d=\"m12 13 3 2\"></path>\n                  </svg>\n                  <span>\u5386\u53f2\u4f1a\u8bdd</span>\n                </span>\n                <svg class=\"icon icon-sm section-toggle-icon\" viewBox=\"0 0 24 24\">\n                  <path d=\"m9 6 6 6-6 6\"></path>\n                </svg>\n              </button>\n              <div class=\"history-list\" id=\"historyList\">\n                <div class=\"history-entry\">\n                  <button class=\"history-item active\">\u5165\u804c IT \u5de5\u5177\u4f7f\u7528\u6307\u5357</button>\n                  <button class=\"history-more\" aria-label=\"\u66f4\u591a\u64cd\u4f5c\">\n                    <svg class=\"icon icon-sm\" viewBox=\"0 0 24 24\">\n                      <circle cx=\"7\" cy=\"12\" r=\"1.25\"></circle>\n                      <circle cx=\"12\" cy=\"12\" r=\"1.25\"></circle>\n                      <circle cx=\"17\" cy=\"12\" r=\"1.25\"></circle>\n                    </svg>\n                  </button>\n                </div>\n                <div class=\"history-entry\">\n                  <button class=\"history-item\">\u7ec4\u7ec7\u77e5\u8bc6\u5e93\u5efa\u8bbe\u8282\u594f</button>\n                  <button class=\"history-more\" aria-label=\"\u66f4\u591a\u64cd\u4f5c\">\n                    <svg class=\"icon icon-sm\" viewBox=\"0 0 24 24\">\n                      <circle cx=\"7\" cy=\"12\" r=\"1.25\"></circle>\n                      <circle cx=\"12\" cy=\"12\" r=\"1.25\"></circle>\n                      <circle cx=\"17\" cy=\"12\" r=\"1.25\"></circle>\n                    </svg>\n                  </button>\n                </div>\n                <div class=\"history-entry\">\n                  <button class=\"history-item\">\u9500\u552e\u5468\u62a5\u81ea\u52a8\u6c47\u603b\u5efa\u8bae</button>\n                  <button class=\"history-more\" aria-label=\"\u66f4\u591a\u64cd\u4f5c\">\n                    <svg class=\"icon icon-sm\" viewBox=\"0 0 24 24\">\n                      <circle cx=\"7\" cy=\"12\" r=\"1.25\"></circle>\n                      <circle cx=\"12\" cy=\"12\" r=\"1.25\"></circle>\n                      <circle cx=\"17\" cy=\"12\" r=\"1.25\"></circle>\n                    </svg>\n                  </button>\n                </div>\n                <div class=\"history-entry\">\n                  <button class=\"history-item\">\u8d22\u52a1\u5171\u4eab\u6d41\u7a0b\u8bf4\u660e\u6574\u7406</button>\n                  <button class=\"history-more\" aria-label=\"\u66f4\u591a\u64cd\u4f5c\">\n                    <svg class=\"icon icon-sm\" viewBox=\"0 0 24 24\">\n                      <circle cx=\"7\" cy=\"12\" r=\"1.25\"></circle>\n                      <circle cx=\"12\" cy=\"12\" r=\"1.25\"></circle>\n                      <circle cx=\"17\" cy=\"12\" r=\"1.25\"></circle>\n                    </svg>\n                  </button>\n                </div>\n                <div class=\"history-entry\">\n                  <button class=\"history-item\">\u5408\u540c\u95ee\u7b54\u9875\u9762\u4fe1\u606f\u7ed3\u6784</button>\n                  <button class=\"history-more\" aria-label=\"\u66f4\u591a\u64cd\u4f5c\">\n                    <svg class=\"icon icon-sm\" viewBox=\"0 0 24 24\">\n                      <circle cx=\"7\" cy=\"12\" r=\"1.25\"></circle>\n                      <circle cx=\"12\" cy=\"12\" r=\"1.25\"></circle>\n                      <circle cx=\"17\" cy=\"12\" r=\"1.25\"></circle>\n                    </svg>\n                  </button>\n                </div>\n                <div class=\"history-entry\">\n                  <button class=\"history-item\">\u5ba2\u670d SOP \u4f18\u5316\u5efa\u8bae</button>\n                  <button class=\"history-more\" aria-label=\"\u66f4\u591a\u64cd\u4f5c\">\n                    <svg class=\"icon icon-sm\" viewBox=\"0 0 24 24\">\n                      <circle cx=\"7\" cy=\"12\" r=\"1.25\"></circle>\n                      <circle cx=\"12\" cy=\"12\" r=\"1.25\"></circle>\n                      <circle cx=\"17\" cy=\"12\" r=\"1.25\"></circle>\n                    </svg>\n                  </button>\n                </div>\n                <div class=\"history-entry\">\n                  <button class=\"history-item\">\u9879\u76ee\u5468\u4f8b\u4f1a\u7eaa\u8981\u6458\u8981</button>\n                  <button class=\"history-more\" aria-label=\"\u66f4\u591a\u64cd\u4f5c\">\n                    <svg class=\"icon icon-sm\" viewBox=\"0 0 24 24\">\n                      <circle cx=\"7\" cy=\"12\" r=\"1.25\"></circle>\n                      <circle cx=\"12\" cy=\"12\" r=\"1.25\"></circle>\n                      <circle cx=\"17\" cy=\"12\" r=\"1.25\"></circle>\n                    </svg>\n                  </button>\n                </div>\n                <button class=\"history-item more\">\u67e5\u770b\u5168\u90e8</button>\n              </div>\n              <div class=\"history-menu\" id=\"historyMenu\" aria-hidden=\"true\">\n                <button class=\"history-menu-item\" data-action=\"rename\">\n                  <svg class=\"icon icon-sm\" viewBox=\"0 0 24 24\">\n                    <path d=\"m4 20 4.5-1 9.7-9.7a2.1 2.1 0 0 0-3-3L5.5 16l-1.5 4z\"></path>\n                  </svg>\n                  <span>\u7f16\u8f91\u6807\u9898</span>\n                </button>\n                <button class=\"history-menu-item\" data-action=\"pin\">\n                  <svg class=\"icon icon-sm\" viewBox=\"0 0 24 24\">\n                    <path d=\"M12 4v10\"></path>\n                    <path d=\"m8 8 4-4 4 4\"></path>\n                    <path d=\"M8 14h8\"></path>\n                  </svg>\n                  <span>\u7f6e\u9876</span>\n                </button>\n                <button class=\"history-menu-item is-danger\" data-action=\"delete\">\n                  <svg class=\"icon icon-sm\" viewBox=\"0 0 24 24\">\n                    <path d=\"M4 7h16\"></path>\n                    <path d=\"M10 11v6\"></path>\n                    <path d=\"M14 11v6\"></path>\n                    <path d=\"M6 7l1 11a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-11\"></path>\n                    <path d=\"M9 7V4h6v3\"></path>\n                  </svg>\n                  <span>\u5220\u9664</span>\n                </button>\n              </div>\n            </div>\n          </div>\n\n        <div class=\"sidebar-footer\">\n            <div class=\"profile-menu\" id=\"profileMenu\" aria-hidden=\"true\">\n              <button class=\"profile-menu-item\" data-action=\"settings\">\n                <svg class=\"icon icon-sm\" viewBox=\"0 0 24 24\">\n                  <circle cx=\"12\" cy=\"12\" r=\"3\"></circle>\n                  <path d=\"M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h0a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 1 1.5h0a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v0a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1z\"></path>\n                </svg>\n                <span>\u8bbe\u7f6e</span>\n              </button>\n              <button class=\"profile-menu-item is-danger\" data-action=\"logout\">\n                <svg class=\"icon icon-sm\" viewBox=\"0 0 24 24\">\n                  <path d=\"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4\"></path>\n                  <path d=\"m16 17 5-5-5-5\"></path>\n                  <path d=\"M21 12H9\"></path>\n                </svg>\n                <span>\u9000\u51fa</span>\n              </button>\n            </div>\n            <button class=\"profile\" aria-label=\"\u6253\u5f00\u8d26\u53f7\u83dc\u5355\">\n              <span class=\"profile-main\">\n                <span class=\"avatar\">Z</span>\n                <span class=\"profile-name\">zhangsan</span>\n              </span>\n              <svg class=\"icon icon-sm\" viewBox=\"0 0 24 24\">\n                <path d=\"m6 9 6 6 6-6\"></path>\n              </svg>\n            </button>\n          </div>\n        </aside>\n\n        <main class=\"main\">\n          <div class=\"main-layout\">\n            <header class=\"topbar\">\n              <div class=\"topbar-left\">\n                <button class=\"top-action sidebar-trigger\" aria-label=\"\u6253\u5f00\u5386\u53f2\u4f1a\u8bdd\">\n                  <svg class=\"icon\" viewBox=\"0 0 24 24\">\n                    <path d=\"M4 7h16\"></path>\n                    <path d=\"M4 12h16\"></path>\n                    <path d=\"M4 17h16\"></path>\n                  </svg>\n                </button>\n                <div class=\"crumb\">\n                  <span class=\"crumb-title\" id=\"crumbTitle\">\u5165\u804c IT \u5de5\u5177\u4f7f\u7528\u6307\u5357</span>\n                </div>\n              </div>\n              <div class=\"topbar-right\">\n                <div class=\"action-feedback\" id=\"actionFeedback\" aria-live=\"polite\"></div>\n              </div>\n            </header>\n\n            <div class=\"main-scroll\">\n              <div class=\"content\">\n                <article class=\"article\" id=\"articleThread\"></article>\n              </div>\n\n              <div class=\"workspace-view\" id=\"workspaceView\"></div>\n\n              <div class=\"empty-view\">\n                <div class=\"empty-shell\">\n                  <div class=\"empty-hero\">\n                    <div class=\"empty-logo\" aria-hidden=\"true\">\n                      <img id=\"emptyLogo\" src=\"./logo.svg\" alt=\"\" />\n                    </div>\n                    <h1 class=\"empty-title\" id=\"emptyTitle\">\u4eca\u5929\u60f3\u8ba9\u6211\u5e2e\u4f60\u5904\u7406\u4ec0\u4e48\uff1f</h1>\n                  </div>\n                  <p class=\"empty-support\" id=\"emptySupport\">\n                    \u4ece\u5236\u5ea6\u67e5\u8be2\u3001\u7eaa\u8981\u6574\u7406\u5230\u65b9\u6848\u8d77\u8349\uff0c\u8fd9\u91cc\u66f4\u9002\u5408\u5904\u7406\u5177\u4f53\u5de5\u4f5c\u4efb\u52a1\uff0c\u800c\u4e0d\u662f\u6cdb\u6cdb\u804a\u5929\u3002\n                  </p>\n                  <div class=\"suggestion-label\" id=\"emptySuggestionLabel\">\u5efa\u8bae\u4ece\u8fd9\u4e9b\u5e38\u89c1\u4efb\u52a1\u5f00\u59cb</div>\n                  <div class=\"suggestion-strip\" id=\"promptChipList\">\n                    <button class=\"prompt-chip\" data-prompt=\"\u5e2e\u6211\u6574\u7406\u4e00\u7248\u65b0\u5458\u5de5\u5165\u804c\u5de5\u5177\u6e05\u5355\">\u6574\u7406\u5165\u804c\u6e05\u5355</button>\n                    <button class=\"prompt-chip\" data-prompt=\"\u628a\u8fd9\u4efd\u6d41\u7a0b\u8bf4\u660e\u6539\u5199\u6210\u9762\u5411\u5458\u5de5\u7684 FAQ\">\u6539\u5199\u6d41\u7a0b FAQ</button>\n                    <button class=\"prompt-chip\" data-prompt=\"\u6839\u636e\u4f1a\u8bae\u7eaa\u8981\u8f93\u51fa\u4e00\u7248\u53ef\u6267\u884c\u884c\u52a8\u9879\">\u63d0\u70bc\u884c\u52a8\u9879</button>\n                  </div>\n\n                  <div class=\"empty-composer-area\">\n                    <div class=\"composer\">\n                      <div class=\"composer-upload\" aria-live=\"polite\">\n                        <div class=\"upload-file-grid\"></div>\n                      </div>\n                      <textarea class=\"composer-input\" id=\"emptyComposerInput\" rows=\"2\" placeholder=\"\u8f93\u5165\u4f60\u7684\u95ee\u9898\uff0c\u6211\u53ef\u4ee5\u5e2e\u4f60\u67e5\u8d44\u6599\u3001\u5199\u65b9\u6848\u3001\u6574\u7406\u5185\u5bb9\"></textarea>\n                      <input class=\"upload-input\" type=\"file\" multiple accept=\".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.ppt,.pptx,image/*\" hidden />\n                      <div class=\"composer-bottom\">\n                        <div class=\"composer-left\">\n                          <button class=\"round-btn\" aria-label=\"\u6dfb\u52a0\" data-action=\"upload\">\n                            <svg class=\"icon\" viewBox=\"0 0 24 24\">\n                              <path d=\"M12 5v14\"></path>\n                              <path d=\"M5 12h14\"></path>\n                            </svg>\n                          </button>\n                        </div>\n                        <div class=\"composer-right\">\n                          <div class=\"model-select\">\n                            <button class=\"model-chip\" aria-label=\"\u5207\u6362\u6a21\u578b\" aria-expanded=\"false\">\n                              <span>GLM-5.0</span>\n                              <svg class=\"icon icon-sm\" viewBox=\"0 0 24 24\">\n                                <path d=\"m6 9 6 6 6-6\"></path>\n                              </svg>\n                            </button>\n                            <div class=\"model-menu\" aria-hidden=\"true\">\n                              <button class=\"model-option is-active\" data-model=\"GLM-5.0\">GLM-5.0</button>\n                              <button class=\"model-option\" data-model=\"GLM-4.7\">GLM-4.7</button>\n                            </div>\n                          </div>\n                          <button class=\"send-btn\" aria-label=\"\u53d1\u9001\">\n                            <svg class=\"icon\" viewBox=\"0 0 24 24\">\n                              <path d=\"M12 19V5\"></path>\n                              <path d=\"m6 11 6-6 6 6\"></path>\n                            </svg>\n                          </button>\n                        </div>\n                      </div>\n                    </div>\n                    <div class=\"footnote\">v1.0.1 XXX\u516c\u53f8</div>\n                  </div>\n                </div>\n              </div>\n            </div>\n\n            <div class=\"composer-wrap\">\n              <div class=\"composer-area\">\n                <div class=\"composer\">\n                  <div class=\"composer-upload\" aria-live=\"polite\">\n                    <div class=\"upload-file-grid\"></div>\n                  </div>\n                  <textarea class=\"composer-input\" id=\"articleComposerInput\" rows=\"2\" placeholder=\"\u7ee7\u7eed\u63d0\u95ee\uff0c\u4f8b\u5982\uff1a\u5e2e\u6211\u628a\u8fd9\u4efd\u8bf4\u660e\u6574\u7406\u6210\u9762\u5411\u65b0\u5458\u5de5\u7684 FAQ \u7248\u672c\"></textarea>\n                  <input class=\"upload-input\" type=\"file\" multiple accept=\".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.ppt,.pptx,image/*\" hidden />\n                  <div class=\"composer-bottom\">\n                    <div class=\"composer-left\">\n                      <button class=\"round-btn\" aria-label=\"\u6dfb\u52a0\" data-action=\"upload\">\n                        <svg class=\"icon\" viewBox=\"0 0 24 24\">\n                          <path d=\"M12 5v14\"></path>\n                          <path d=\"M5 12h14\"></path>\n                        </svg>\n                      </button>\n                    </div>\n                    <div class=\"composer-right\">\n                      <div class=\"model-select\">\n                        <button class=\"model-chip\" aria-label=\"\u5207\u6362\u6a21\u578b\" aria-expanded=\"false\">\n                          <span>GLM-5.0</span>\n                          <svg class=\"icon icon-sm\" viewBox=\"0 0 24 24\">\n                            <path d=\"m6 9 6 6 6-6\"></path>\n                          </svg>\n                        </button>\n                        <div class=\"model-menu\" aria-hidden=\"true\">\n                          <button class=\"model-option is-active\" data-model=\"GLM-5.0\">GLM-5.0</button>\n                          <button class=\"model-option\" data-model=\"GLM-4.7\">GLM-4.7</button>\n                        </div>\n                      </div>\n                      <button class=\"send-btn\" aria-label=\"\u53d1\u9001\">\n                        <svg class=\"icon\" viewBox=\"0 0 24 24\">\n                          <path d=\"M12 19V5\"></path>\n                          <path d=\"m6 11 6-6 6 6\"></path>\n                        </svg>\n                      </button>\n                    </div>\n                  </div>\n                </div>\n                <div class=\"footnote\">v1.0.1 XXX\u516c\u53f8</div>\n              </div>\n            </div>\n          </div>\n        </main>\n      </div>\n      <div class=\"mobile-backdrop\" aria-hidden=\"true\"></div>\n    </div>\n\n    ";

      const app = document.querySelector(".app");
      const mainLayout = document.querySelector(".main-layout");
      const newChatButton = document.querySelector(".new-chat");
      const collapseButton = document.querySelector(".collapse-btn");
      const sidebarTrigger = document.querySelector(".sidebar-trigger");
      const mobileBackdrop = document.querySelector(".mobile-backdrop");
      const sidebarScroll = document.querySelector(".sidebar-scroll");
      const historyGroup = document.querySelector(".history-group");
      const historyToggle = document.querySelector(".history-toggle");
      const historyMenu = document.getElementById("historyMenu");
      const historyMenuButtons = Array.from(document.querySelectorAll(".history-more"));
      const historyMenuItems = Array.from(document.querySelectorAll(".history-menu-item"));
      const focusModeButton = document.querySelector(".focus-mode-btn");
      let actionFeedback = document.getElementById("actionFeedback");
      const crumbTitle = document.getElementById("crumbTitle");
      const crumb = document.querySelector(".crumb");
      const articleThread = document.getElementById("articleThread");
      const workspaceView = document.getElementById("workspaceView");
      const emptyLogo = document.getElementById("emptyLogo");
      const emptyTitle = document.getElementById("emptyTitle");
      const emptySupport = document.getElementById("emptySupport");
      const emptySuggestionLabel = document.getElementById("emptySuggestionLabel");
      const promptChipList = document.getElementById("promptChipList");
      const emptyComposerInput = document.getElementById("emptyComposerInput");
      const articleComposerInput = document.getElementById("articleComposerInput");
      const profileButton = document.querySelector(".profile");
      const profileMenu = document.getElementById("profileMenu");
      const profileMenuItems = Array.from(document.querySelectorAll(".profile-menu-item"));
      const navButtons = Array.from(document.querySelectorAll("[data-nav-target]"));
      const historyItems = Array.from(document.querySelectorAll(".history-item"));
      const composerInputs = Array.from(document.querySelectorAll(".composer-input"));
      const sendButtons = Array.from(document.querySelectorAll(".send-btn"));
      const roundButtons = Array.from(document.querySelectorAll(".round-btn"));
      const composers = Array.from(document.querySelectorAll(".composer"));
      const modelChips = Array.from(document.querySelectorAll(".model-chip"));
      const modelSelects = Array.from(document.querySelectorAll(".model-select"));
      const modelMenus = Array.from(document.querySelectorAll(".model-menu"));
      const modelOptions = Array.from(document.querySelectorAll(".model-option"));
      const modelSequence = ["GLM-5.0", "GLM-4.7"];
      const composerControllers = composers.map((composer) => ({
        composer,
        input: composer.querySelector(".composer-input"),
        uploadArea: composer.querySelector(".composer-upload"),
        uploadGrid: composer.querySelector(".upload-file-grid"),
        fileInput: composer.querySelector(".upload-input"),
        uploadButton: composer.querySelector('[data-action="upload"]'),
        files: []
      }));
      const assistantShells = {
        "main-assistant": {
          key: "main-assistant",
          label: "AI 助手",
          logo: "./logo.svg",
          avatar: "./assistant-avatar.svg",
          emptyTitle: "今天想让我帮你处理什么？",
          emptySupport: "从制度查询、纪要整理到方案起草，这里更适合处理具体工作任务，而不是泛泛聊天。",
          suggestionLabel: "建议从这些常见任务开始",
          emptyPlaceholder: "输入你的问题，我可以帮你查资料、写方案、整理内容",
          articlePlaceholder: "继续提问，例如：帮我把这份说明整理成面向新员工的 FAQ 版本",
          prompts: [
            {
              label: "整理入职清单",
              prompt: "帮我整理一版新员工入职工具清单"
            },
            {
              label: "改写流程 FAQ",
              prompt: "把这份流程说明改写成面向员工的 FAQ"
            },
            {
              label: "提炼行动项",
              prompt: "根据会议纪要输出一版可执行行动项"
            }
          ]
        },
        "regulation-assistant": {
          key: "regulation-assistant",
          label: "制度助手",
          logo: "../../public/gpts/policy.svg",
          avatar: "../../public/gpts/policy.svg",
          emptyTitle: "你想查哪条制度或流程？",
          emptySupport: "适合查询制度条款、审批口径和流程边界。先把场景说清楚，我会按内部制度问答的方式给你整理结论。",
          suggestionLabel: "可以直接从这些问题开始",
          emptyPlaceholder: "输入制度问题，例如：差旅报销里哪些发票不能报？",
          articlePlaceholder: "继续追问，例如：把适用条件和例外情况也一起列出来",
          prompts: [
            {
              label: "查报销口径",
              prompt: "差旅报销里哪些发票不能报，哪些情况需要补充说明？"
            },
            {
              label: "问采购流程",
              prompt: "采购申请从发起到审批完成一般有哪些步骤，哪些节点容易被退回？"
            },
            {
              label: "理顺请假规则",
              prompt: "员工请假时年假、调休和病假的优先顺序是怎样的？"
            }
          ]
        }
      };
      const sessionContentMap = {
        "入职 IT 工具使用指南": {
          user:
            "帮我把新员工入职时要用到的 IT 工具整理成一版说明，要求顺序清楚、员工拿到以后能直接照着操作。",
          assistant: [
            "可以直接按“先开通账号、再安装工具、最后完成协同设置”来写，这样员工不容易漏步骤。",
            "第一段建议说明目标和适用范围，比如这份说明面向新入职员工，覆盖账号登录、办公软件安装、企业沟通工具接入和基础安全设置。",
            "第二段写成连续文字版会更稳：先登录统一身份账号，确认邮箱和企业 IM 已开通；再安装办公套件、VPN 和浏览器插件；最后完成共享盘、日历和会议室预约权限的绑定。",
            "如果你要给新员工直接使用，下一步我建议再补一个“常见问题”小节，重点写安装失败、账号未激活和权限未同步这三类问题。"
          ]
        },
        "组织知识库建设节奏": {
          user:
            "我想整理一版组织知识库建设节奏，不要讲原则，直接告诉我怎么分阶段推进。",
          assistant: [
            "可以先按三段推进：先解决资料分散，再解决更新机制，最后再做复用和沉淀。",
            "第一阶段用两周时间收口现有资料，先把制度、流程、项目文档和常见问答分到固定目录，不要求一步到位，但要先让大家知道资料放哪里。",
            "第二阶段重点不是继续上传，而是明确谁维护、多久更新一次、哪些资料过期要下线。没有更新机制，知识库很快会失效。",
            "第三阶段再做问答复用，把高频问题整理成标准答案，并把会议纪要、方案模板和案例经验逐步抽成可复用内容。"
          ]
        },
        "销售周报自动汇总建议": {
          user:
            "销售团队每周都要手工整理周报，帮我写一版自动汇总建议，先给我文字版。",
          assistant: [
            "这个场景的重点不是把周报写得更漂亮，而是减少重复搬运数据的时间。",
            "可以先让系统自动汇总 CRM 里的新增线索、推进阶段、赢单金额和重点客户变更，再把这些内容生成一版周报底稿，销售只需要补充风险和下周动作。",
            "这样能解决两个问题：第一，管理层拿到的数据口径统一，不会出现不同人统计方式不一样；第二，销售本身从整理数据里解放出来，更多时间放在客户跟进。",
            "如果要继续往下写，我建议再补一个落地条件说明，交代清楚数据源、模板字段和人工补充项分别是什么。"
          ]
        },
        "财务共享流程说明整理": {
          user:
            "把财务共享流程说明整理得更适合普通员工看，不要术语太多，也不要写成制度口吻。",
          assistant: [
            "这类说明最容易出问题的地方，是写成财务部门内部视角，员工看完还是不知道自己该做什么。",
            "建议直接按“员工发起什么、系统会发生什么、什么时候需要补材料”来写。比如员工先提交报销申请，系统自动校验基础字段，再进入财务复核，缺材料时由系统返回提醒。",
            "文字上尽量减少审核、归档、结算这类抽象词，换成更直接的表达，例如“提交”“补充附件”“等待复核结果”“查看到账状态”。",
            "如果你要对外发布，我建议再加一句时效说明，让员工知道每一步通常需要多久。"
          ]
        },
        "合同问答页面信息结构": {
          user:
            "我在做合同问答页面的信息结构，先给我一版文字建议，重点是页面要让业务同学容易找到答案。",
          assistant: [
            "合同问答页面不要先按法务分类，而要先按业务同学会怎么问来组织信息。",
            "第一层建议直接分成签约前、履约中、变更与终止、常见风险这四组，让用户先定位场景。",
            "每个问题下面的答案不要太长，先给一句明确结论，再补适用条件、所需材料和下一步联系谁。这样页面可扫读性会高很多。",
            "如果后面要接知识问答助手，这种结构也更适合继续沉淀成标准问答库。"
          ]
        },
        "客服 SOP 优化建议": {
          user:
            "客服 SOP 现在写得太散，我想先拿到一版优化建议，告诉我应该怎么改结构。",
          assistant: [
            "客服 SOP 最需要优化的是阅读路径，而不是词句本身。",
            "可以先按“接待前准备、接待过程判断、升级处理、收尾沉淀”四段来重写，让客服知道自己每一步该看什么。",
            "在每段里只保留关键判断语句，比如什么情况下可以直接答复、什么情况下必须转人工、什么情况下要升级给产品或运营。",
            "这样改完以后，SOP 会从说明文档变成操作文档，新人也更容易上手。"
          ]
        },
        "项目周例会纪要摘要": {
          user:
            "帮我把项目周例会纪要整理成摘要版，先给文字结构，不用做成卡片。",
          assistant: [
            "摘要版建议只保留三部分：本周进展、当前风险、下周动作。",
            "本周进展只写已经完成或明确推进的事项，不要把讨论过程塞进去。当前风险只保留会影响时间、资源或范围的重点问题。",
            "下周动作要写清责任人和时间点，否则纪要只是在复述会议，没有形成执行价值。",
            "如果你后面把原始纪要发我，我可以直接按这个结构替你改写成最终版。"
          ]
        },
        "历史会话": {
          user:
            "我想先看一下历史会话里通常有哪些类型的问题，给我一版文字总结就行。",
          assistant: [
            "从现有记录看，主要集中在制度说明整理、流程优化建议、知识库沉淀、会议纪要摘要和业务问答结构这几类任务。",
            "这些会话有一个共同点，就是用户更关注“怎么落地”和“怎么让同事直接拿去用”，而不是单纯生成长篇内容。",
            "如果后面你要继续扩展历史会话，建议优先补更多真实业务问题，让页面第一眼更像正在被使用的内部系统。"
          ]
        }
      };
      const regulationSessionContentMap = {
        "差旅报销口径整理": {
          user:
            "帮我把差旅报销里容易被退回的情形整理成一版员工可读说明，先给文字版。",
          assistant: [
            "先把结论讲清楚最重要，员工通常不是不知道要报销，而是不知道哪些票据会被退回。",
            "可以先按发票合规、行程匹配、金额异常和补充说明四类来整理。比如发票抬头不符、行程与申请单不一致、住宿超标或缺少出差说明，都应该明确写成可判断的条目。",
            "员工版本不要堆制度术语，建议改成“什么情况下可以直接提交、什么情况下要补材料、什么情况下大概率会被退回”这种表达。",
            "如果你准备发给全员，下一步建议再补一段“常见补充材料清单”，让大家第一次提交就能更完整。"
          ]
        },
        "采购审批流程说明": {
          user:
            "把采购审批流程写成面向业务同学的说明，重点说清楚每一步为什么会卡住。",
          assistant: [
            "这类说明最好不要只列步骤，而是同步解释每一步卡住的常见原因。",
            "可以按“发起申请、预算确认、供应商比选、合同审核、审批归档”来写，每一步后面补一句典型退回原因，比如预算字段不完整、比选材料不足或合同附件缺失。",
            "如果目标是降低沟通成本，建议把每一步需要准备的材料一起并排写出来，而不是单独放到附录里。",
            "这样业务同学看完不仅知道流程走向，也知道自己在进入下一步前要准备什么。"
          ]
        },
        "请假规则口径": {
          user:
            "请帮我整理年假、调休、病假在系统里的优先顺序和常见例外情况。",
          assistant: [
            "这类问题最需要先统一口径，再说明例外，不然部门之间会出现不同解释。",
            "建议正文先写默认顺序，例如优先消化调休，再使用年假；病假则按医疗证明和系统规则单独处理。然后把跨月、假期重叠、审批后变更这几类例外单独列出来。",
            "如果系统和制度存在时间差，需要明确写“以最新制度与 HR 通知为准”，避免员工把历史经验当成当前规则。",
            "你后面如果要做成 FAQ，我可以再把这些口径改写成更短的问题答案格式。"
          ]
        }
      };
      const generatedAnswerTemplatesByAssistant = {
        "main-assistant": [
          "我先给你一版文字版回答，重点会放在背景、问题、处理方式和预期结果，方便你后续继续追问细节。",
          "如果这是要给领导或项目组看的，我建议先保留核心结论，再把实施步骤和边界条件补在后面，这样更容易对齐。",
          "下一步你可以继续限定输出方向，比如要方案版、汇报版还是 FAQ 版，我会按那个语气继续展开。"
        ],
        "regulation-assistant": [
          "我先按制度问答的方式给你一版结论，优先说清楚适用场景、判断口径和需要补充的材料。",
          "如果这类问题涉及审批或报销边界，建议把“默认规则”和“例外情况”分开写，避免同事把特殊口径当成通用规则。",
          "你下一步可以继续限定部门、制度版本或具体场景，我会把答案收敛得更准确。"
        ]
      };
      const gptWorkspaceItems = [
        {
          gid: "regulation-assistant",
          name: "制度助手",
          desc: "适合处理制度查询、审批口径确认和流程边界解释，回答风格更偏内部问答和规则说明。",
          owner: "官方",
          usageCount: 1280,
          pinnedUserCount: 348,
          isPinned: true,
          isRequiredPinned: true,
          logo: "../../public/gpts/policy.svg",
          target: "regulation-assistant"
        },
        {
          gid: "deepseek-assistant",
          name: "DeepSeek",
          desc: "面向通用工作任务的主助手，适合纪要整理、方案起草、资料压缩和文档改写。",
          owner: "官方",
          usageCount: 2310,
          pinnedUserCount: 592,
          isPinned: true,
          logo: "../../src/assets/icons/ds-logo.svg",
          target: "main-assistant"
        },
        {
          gid: "weekly-briefing",
          name: "周报助手",
          desc: "把销售、项目和运营周报整理成统一结构，突出关键进展、风险和下周动作。",
          owner: "运营团队",
          usageCount: 486,
          pinnedUserCount: 129,
          isPinned: false,
          logo: "",
          target: {
            key: "weekly-briefing",
            label: "周报助手",
            logo: "../../src/assets/icons/file-pen-solid.svg",
            avatar: "../../src/assets/icons/file-pen-solid.svg",
            emptyTitle: "这周要整理哪类周报？",
            emptySupport: "适合先把原始纪要、CRM 进展和风险点压成一版可汇报的周报底稿，再继续细化给不同角色看的版本。",
            suggestionLabel: "可以先给我这些输入",
            emptyPlaceholder: "输入你的要求，例如：把销售周报整理成管理层摘要",
            articlePlaceholder: "继续追问，例如：再压缩成领导五分钟能看完的一版",
            prompts: [
              { label: "销售周报", prompt: "帮我整理一版销售团队周报，重点突出新增线索、推进和风险" },
              { label: "项目汇总", prompt: "把项目周例会纪要压成一版项目周报摘要" },
              { label: "运营复盘", prompt: "根据运营数据写一版本周复盘和下周动作" }
            ]
          }
        },
        {
          gid: "faq-builder",
          name: "FAQ 助手",
          desc: "把制度、流程说明或长文档改写成员工更容易扫读和检索的 FAQ 结构。",
          owner: "人事团队",
          usageCount: 315,
          pinnedUserCount: 82,
          isPinned: false,
          logo: "",
          target: {
            key: "faq-builder",
            label: "FAQ 助手",
            logo: "../../src/assets/icons/comment-dots-regular.svg",
            avatar: "../../src/assets/icons/comment-dots-regular.svg",
            emptyTitle: "要把哪份说明改成 FAQ？",
            emptySupport: "更适合把流程说明、制度通知和项目介绍改成问答式结构，降低第一次阅读的理解成本。",
            suggestionLabel: "适合从这些改写目标开始",
            emptyPlaceholder: "输入你的要求，例如：把采购流程改成面向员工的 FAQ",
            articlePlaceholder: "继续追问，例如：把答案压短一点，适合放到知识库页面里",
            prompts: [
              { label: "改采购 FAQ", prompt: "把采购流程说明改写成业务同学能直接看的 FAQ" },
              { label: "改报销 FAQ", prompt: "把报销制度通知压成一版常见问题回答" },
              { label: "改入职 FAQ", prompt: "把新员工入职步骤改成问答形式" }
            ]
          }
        }
      ];

      const myGptsItems = [
        {
          gid: "my-custom-1",
          name: "技术翻译助手",
          desc: "专门针对技术文档的翻译和专业词汇润色，保持术语一致性。",
          owner: "zhangsan",
          logo: "",
          isPinned: false
        },
        {
          gid: "my-custom-2",
          name: "代码评审专家",
          desc: "基于公司内部代码规范，对提交的代码片段进行初步质量评估。",
          owner: "zhangsan",
          logo: "",
          isPinned: true
        }
      ];

      function renderMyGptsWorkspace() {
        if (!workspaceView) return;
        updateTopbarRight(`
          <button class="topbar-nav-btn" data-workspace-action="gpts-plaza">回到广场</button>
          <button class="topbar-nav-btn primary" data-workspace-action="create-gpt">+ 创建智能体</button>
        `);
        crumbTitle.textContent = "我的智能体";
        workspaceView.innerHTML = `
          <div class="workspace-shell">
            <section class="workspace-section" style="margin-top: 0;">
              <div class="workspace-section-head">
                <div>
                  <h2 class="workspace-section-title">我创建的</h2>
                  <p class="workspace-section-desc">你作为 Owner 的智能体，拥有最高管理权限。</p>
                </div>
                <span class="workspace-section-count">${myGptsItems.length}</span>
              </div>
              <div class="my-gpts-list">
                ${myGptsItems.map((item, idx) => `
                  <div class="my-gpt-card">
                    <div class="my-gpt-info">
                      <div class="my-gpt-avatar">${item.logo ? `<img src="${item.logo}" />` : item.name[0]}</div>
                      <div class="my-gpt-details">
                        <div style="display: flex; align-items: center;">
                          <div class="my-gpt-name">${item.name}</div>
                          <span class="status-badge">${idx === 0 ? '白名单' : '私有'}</span>
                        </div>
                        <div class="my-gpt-desc">${item.desc}</div>
                      </div>
                    </div>
                    <div class="my-gpt-actions">
                      <button class="icon-btn" title="编辑" data-workspace-action="edit-gpt" data-gid="${item.gid}">
                        <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                      </button>
                      <button class="icon-btn" title="更多操作">
                        <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1.25"></circle><circle cx="19" cy="12" r="1.25"></circle><circle cx="5" cy="12" r="1.25"></circle></svg>
                      </button>
                    </div>
                  </div>
                `).join('')}
              </div>
            </section>
          </div>
        `;
        crumbTitle.textContent = "我的智能体";
        mainLayout.classList.add("is-workspace");
        scrollToTop();
      }

      function renderCreateGptWorkspace(gid = null) {
        if (!workspaceView) return;
        const item = gid ? myGptsItems.find(it => it.gid === gid) : null;
        updateTopbarRight(`
          <button class="topbar-nav-btn" data-workspace-action="my-gpts">返回</button>
          <button class="topbar-nav-btn primary" data-workspace-action="save-gpt">${gid ? "保存" : "创建"}</button>
        `);
        crumbTitle.textContent = gid ? "编辑智能体" : "创建智能体";
        workspaceView.innerHTML = `
          <div class="workspace-shell">
            <div class="gpt-tabs">
              <button class="gpt-tab">Create / 帮我创建</button>
              <button class="gpt-tab is-active">Configure / 配置</button>
            </div>

            <div class="gpt-create-layout" style="grid-template-columns: 1fr 1fr; max-width: 1200px;">
              <div class="form-column">
                <div class="form-card" style="padding: 20px;">
                  <h3 class="form-section-title">
                    <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                    智能体档案
                  </h3>
                  <div class="form-grid">
                    <div style="display: flex; gap: 20px; align-items: flex-start;">
                       <div class="my-gpt-avatar" style="width: 80px; height: 80px; font-size: 32px; flex: none; cursor: pointer;">
                          ${item && item.logo ? `<img src="${item.logo}" />` : (item ? item.name[0] : '+')}
                       </div>
                       <div style="flex: 1; display: grid; gap: 12px;">
                          <div class="form-item">
                            <label class="form-label">名称</label>
                            <input type="text" class="form-input" placeholder="名称" value="${item ? item.name : ''}">
                          </div>
                          <div class="form-item">
                            <label class="form-label">描述</label>
                            <input type="text" class="form-input" placeholder="简短描述" value="${item ? item.desc : ''}">
                          </div>
                       </div>
                    </div>
                  </div>
                </div>

                <div class="form-card" style="padding: 20px;">
                  <h3 class="form-section-title">
                    <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                    指令 (Instructions)
                  </h3>
                  <div class="form-item">
                    <textarea class="form-textarea" rows="10" placeholder="你希望该智能体如何工作？其角色和限制是什么？">${item ? '你是一个专业的翻译润色助手...' : ''}</textarea>
                  </div>
                </div>

                <div class="form-card" style="padding: 20px;">
                  <h3 class="form-section-title">
                    <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                    知识库 (Knowledge)
                  </h3>
                  <div class="upload-zone" style="padding: 16px;">
                    <div class="upload-title" style="font-size: 12px;">上传文件</div>
                  </div>
                </div>

                <div class="form-card" style="padding: 20px;">
                  <h3 class="form-section-title">
                    <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"></path></svg>
                    能力 (Capabilities)
                  </h3>
                  <div class="capabilities-grid" style="grid-template-columns: 1fr 1fr;">
                    <div class="cap-item" style="padding: 8px 12px;">
                      <input type="checkbox" id="cap-web" checked>
                      <label for="cap-web" style="font-size: 13px;">联网搜索</label>
                    </div>
                    <div class="cap-item" style="padding: 8px 12px;">
                      <input type="checkbox" id="cap-code" checked>
                      <label for="cap-code" style="font-size: 13px;">代码解释器</label>
                    </div>
                  </div>
                </div>
              </div>

              <div class="form-column">
                <div class="preview-panel">
                  <div class="preview-header">
                    <span class="preview-title">Preview / 预览</span>
                  </div>
                  <div class="preview-content">
                    <div class="preview-placeholder-icon">
                       ${item && item.logo ? `<img src="${item.logo}" style="width: 48px; height: 48px;"/>` : (item ? item.name[0] : '？')}
                    </div>
                    <div style="font-size: 18px; font-weight: 600; color: var(--text);">${item ? item.name : '智能体名称'}</div>
                    <p style="font-size: 13px; color: var(--text-soft); margin-top: 8px;">在此处测试你的智能体效果...</p>

                    <div style="margin-top: auto; width: 100%; border-top: 1px solid var(--line); padding-top: 20px;">
                       <div style="background: white; border: 1px solid var(--line); border-radius: 12px; padding: 10px 14px; text-align: left; color: var(--text-faint); font-size: 13px;">
                          输入消息测试...
                       </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;
        crumbTitle.textContent = gid ? "编辑智能体" : "创建智能体";
        mainLayout.classList.add("is-workspace");
        scrollToTop();
      }

      function scrollToTop() {
        const scroll = document.querySelector(".main-scroll");
        if (scroll) scroll.scrollTop = 0;
      }

      function updateTopbarRight(html) {
        const topbarRight = document.querySelector(".topbar-right");
        if (!topbarRight) return;
        topbarRight.innerHTML = html;
        actionFeedback = topbarRight.querySelector(".action-feedback") || document.getElementById("actionFeedback");
      }

      function resetTopbarRight() {
        const topbarRight = document.querySelector(".topbar-right");
        if (!topbarRight) return;
        topbarRight.innerHTML = `<div class="action-feedback" id="actionFeedback" aria-live="polite"></div>`;
        actionFeedback = document.getElementById("actionFeedback");
      }

      const libraryWorkspaceCollections = [
        {
          name: "员工制度与流程",
          updatedAt: "今天 14:20",
          fileCount: 36,
          scope: "全员可见",
          tags: ["制度", "流程", "高频"]
        },
        {
          name: "项目交付模板库",
          updatedAt: "昨天 18:40",
          fileCount: 18,
          scope: "项目组",
          tags: ["模板", "交付", "协同"]
        },
        {
          name: "财务共享资料",
          updatedAt: "06-15 10:12",
          fileCount: 22,
          scope: "财务 / 业务",
          tags: ["报销", "付款", "FAQ"]
        },
        {
          name: "新员工入职资料",
          updatedAt: "06-14 09:08",
          fileCount: 14,
          scope: "HR / 全员",
          tags: ["入职", "手册", "指南"]
        }
      ];
      const personalKnowledgeBases = [
        {
          name: "合同审核知识库",
          desc: "把常见合同条款说明、风险口径和审核结论整理成可检索知识库，供后续问答引用。",
          chunkCount: 186,
          sourceCount: 12,
          status: "已完成索引"
        },
        {
          name: "报销制度问答库",
          desc: "聚合差旅、招待、采购付款等制度文件，适合后续挂到制度问答类助手下。",
          chunkCount: 264,
          sourceCount: 18,
          status: "持续更新"
        },
        {
          name: "项目交付经验库",
          desc: "沉淀项目复盘、交付模板和常见问题，便于在写方案或做交付总结时做 RAG 检索。",
          chunkCount: 132,
          sourceCount: 9,
          status: "待补充"
        }
      ];
      let currentModelIndex = 0;
      let feedbackTimer = null;
      let activeHistoryEntry = null;
      let historyMenuTimer = null;
      let currentShell = assistantShells["main-assistant"];
      let currentLibraryTab = "files";

      function isMobileView() {
        return window.matchMedia("(max-width: 900px)").matches;
      }

      function closeMobileNav() {
        app.classList.remove("is-mobile-nav-open");
      }

      function closeProfileMenu() {
        profileMenu?.classList.remove("is-open");
        profileMenu?.setAttribute("aria-hidden", "true");
      }

      function cancelHistoryMenuClose() {
        window.clearTimeout(historyMenuTimer);
      }

      function queueHistoryMenuClose() {
        window.clearTimeout(historyMenuTimer);
        historyMenuTimer = window.setTimeout(() => {
          closeHistoryMenu();
        }, 140);
      }

      function closeHistoryMenu() {
        cancelHistoryMenuClose();
        historyMenu?.classList.remove("is-open");
        historyMenu?.setAttribute("aria-hidden", "true");
        activeHistoryEntry?.classList.remove("is-menu-open");
        activeHistoryEntry = null;
      }

      function openHistoryMenu(trigger) {
        if (!historyMenu || !historyGroup) return;
        const entry = trigger.closest(".history-entry");
        if (!entry) return;

        if (activeHistoryEntry === entry && historyMenu.classList.contains("is-open")) {
          closeHistoryMenu();
          return;
        }

        activeHistoryEntry?.classList.remove("is-menu-open");
        activeHistoryEntry = entry;
        entry.classList.add("is-menu-open");
        cancelHistoryMenuClose();

        const triggerRect = trigger.getBoundingClientRect();
        historyMenu.classList.add("is-open");
        historyMenu.setAttribute("aria-hidden", "false");
        historyMenu.style.visibility = "hidden";

        const menuRect = historyMenu.getBoundingClientRect();
        const menuWidth = menuRect.width || 226;
        const menuHeight = menuRect.height || 320;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const gap = 10;
        const edge = 12;

        const openUp = viewportHeight - triggerRect.bottom < menuHeight + edge && triggerRect.top > menuHeight / 2;
        const top = openUp
          ? Math.max(edge, triggerRect.bottom - menuHeight)
          : Math.min(viewportHeight - menuHeight - edge, triggerRect.top);

        let left = triggerRect.right + gap;
        if (left + menuWidth > viewportWidth - edge) {
          left = triggerRect.left - menuWidth - gap;
        }
        left = Math.max(edge, Math.min(left, viewportWidth - menuWidth - edge));

        historyMenu.style.top = `${top}px`;
        historyMenu.style.left = `${left}px`;
        historyMenu.dataset.placement = openUp ? "top" : "bottom";
        historyMenu.style.visibility = "";
      }

      function getVisibleComposerInput() {
        if (mainLayout.classList.contains("is-empty")) {
          return emptyComposerInput;
        }
        if (mainLayout.classList.contains("is-workspace")) {
          return null;
        }
        return articleComposerInput;
      }

      function getShellConfig(target) {
        if (typeof target === "string") {
          return assistantShells[target];
        }
        return target;
      }

      function getSessionMapForCurrentShell() {
        return currentShell.key === "regulation-assistant"
          ? regulationSessionContentMap
          : sessionContentMap;
      }

      function getGeneratedAnswerTemplates() {
        return generatedAnswerTemplatesByAssistant[currentShell.key]
          || generatedAnswerTemplatesByAssistant["main-assistant"];
      }

      function activateNav(target) {
        navButtons.forEach((button) => {
          button.classList.toggle("is-active", button.dataset.navTarget === target);
        });
      }

      function renderPromptChips(shell) {
        if (!promptChipList) return;
        promptChipList.innerHTML = shell.prompts
          .map(
            (item) => `
              <button class="prompt-chip" data-prompt="${escapeHtml(item.prompt)}">${escapeHtml(item.label)}</button>
            `
          )
          .join("");
      }

      function applyShell(shell) {
        currentShell = shell;
        activateNav(assistantShells[shell.key] ? shell.key : "gpts-workspace");
        if (emptyLogo) emptyLogo.src = shell.logo;
        if (emptyTitle) emptyTitle.textContent = shell.emptyTitle;
        if (emptySupport) emptySupport.textContent = shell.emptySupport;
        if (emptySuggestionLabel) emptySuggestionLabel.textContent = shell.suggestionLabel;
        if (emptyComposerInput) emptyComposerInput.placeholder = shell.emptyPlaceholder;
        if (articleComposerInput) articleComposerInput.placeholder = shell.articlePlaceholder;
        renderPromptChips(shell);
      }

      function resolveWorkspaceTarget(item) {
        const target = getShellConfig(item.target);
        return target || assistantShells["main-assistant"];
      }

      function createCardLogo(item) {
        if (item.logo) {
          return `<img src="${item.logo}" alt="" />`;
        }
        return escapeHtml(item.name.slice(0, 1));
      }

      function renderWorkspaceCards(items) {
        if (!items.length) {
          return `
            <div class="gpt-empty">
              <div>
                <div class="gpt-card-logo">A</div>
                <h2 class="gpt-empty-title">暂时没有可用智能体</h2>
                <p class="gpt-empty-desc">新的智能体开放后会出现在这里。</p>
              </div>
            </div>
          `;
        }

        return `
          <div class="gpts-grid">
            ${items
              .map(
                (item) => `
                  <article class="gpt-card" data-open-agent="${item.gid}">
                    <button class="gpt-pin ${item.isPinned ? "is-active" : ""} ${item.isRequiredPinned ? "is-required" : ""}" data-pin-agent="${item.gid}" aria-label="${item.isPinned ? "取消固定" : "固定"}">
                      <svg class="icon icon-sm" viewBox="0 0 24 24">
                        <path d="M12 4v10"></path>
                        <path d="m8 8 4-4 4 4"></path>
                        <path d="M8 14h8"></path>
                      </svg>
                    </button>
                    <div class="gpt-card-top">
                      <div class="gpt-card-logo">${createCardLogo(item)}</div>
                      <div>
                        <h3 class="gpt-card-title">${escapeHtml(item.name)}</h3>
                        <p class="gpt-card-desc">${escapeHtml(item.desc)}</p>
                      </div>
                    </div>
                    <div class="gpt-card-bottom">
                      <div class="gpt-card-meta">
                        <div>${escapeHtml(item.owner ? `创建者：${item.owner}` : "创建者：官方")}</div>
                        <div class="gpt-card-meta-row">
                          <span>使用 ${item.usageCount}</span>
                          <span>固定 ${item.pinnedUserCount}</span>
                        </div>
                      </div>
                      <svg class="icon gpt-card-arrow" viewBox="0 0 24 24">
                        <path d="M5 12h14"></path>
                        <path d="m13 6 6 6-6 6"></path>
                      </svg>
                    </div>
                  </article>
                `
              )
              .join("")}
          </div>
        `;
      }

      function renderWorkspace() {
        if (!workspaceView) return;
        const pinned = gptWorkspaceItems.filter((item) => item.isPinned);
        const others = gptWorkspaceItems.filter((item) => !item.isPinned);
        updateTopbarRight(`
          <button class="topbar-nav-btn" data-workspace-action="my-gpts">
            <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            我的智能体
          </button>
          <button class="topbar-nav-btn primary" data-workspace-action="create-gpt">
            <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>
            创建
          </button>
        `);
        workspaceView.innerHTML = `
          <div class="workspace-shell">
            <section class="workspace-section" style="margin-top: 0;">
              <div class="workspace-section-head">
                <div>
                  <h2 class="workspace-section-title">常用智能体</h2>
                  <p class="workspace-section-desc">你最常使用的智能体，随时从侧边栏快速开始。</p>
                </div>
                <span class="workspace-section-count">${pinned.length}</span>
              </div>
              ${renderWorkspaceCards(pinned)}
            </section>
            <section class="workspace-section">
              <div class="workspace-section-head">
                <div>
                  <h2 class="workspace-section-title">全部智能体</h2>
                  <p class="workspace-section-desc">浏览当前可用的智能体，找到更适合任务的工作方式。</p>
                </div>
                <span class="workspace-section-count">${others.length}</span>
              </div>
              ${renderWorkspaceCards(others)}
            </section>
          </div>
        `;
      }

      function renderLibraryWorkspace(activeTab = currentLibraryTab) {
        if (!workspaceView) return;
        currentLibraryTab = activeTab;
        workspaceView.innerHTML = `
          <div class="workspace-shell">
            <section class="workspace-hero">
              <div class="workspace-hero-top">
                <div>
                  <div class="workspace-kicker">
                    <svg class="icon" viewBox="0 0 24 24">
                      <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4H19v16H7.5A2.5 2.5 0 0 0 5 22z"></path>
                      <path d="M8 8h7"></path>
                      <path d="M8 12h7"></path>
                      <path d="M8 16h5"></path>
                    </svg>
                    资料库
                  </div>
                  <h1 class="workspace-title">个人资料库</h1>
                  <p class="workspace-subtitle">先用一个静态页面模拟个人资料库首页，后续可以逐步接入真实文件、标签、分组和检索能力。当前重点是先把导航和页面层级跑通。</p>
                </div>
                <div class="workspace-actions">
                  <button class="workspace-action" data-library-action="search">搜索资料</button>
                  <button class="workspace-action primary" data-library-action="upload">上传资料</button>
                </div>
              </div>
            </section>
            <section class="workspace-section">
              <div class="library-tabs">
                <button class="library-tab ${activeTab === "files" ? "is-active" : ""}" data-library-tab="files">文件资料</button>
                <button class="library-tab ${activeTab === "knowledge" ? "is-active" : ""}" data-library-tab="knowledge">知识库</button>
              </div>
            </section>
            <section class="workspace-section">
              <div class="library-panel">
                <div class="library-panel-header">
                  <div>
                    <h2 class="library-panel-title">${activeTab === "files" ? "最近文件资料" : "我的知识库"}</h2>
                    <p class="library-panel-subtitle">${activeTab === "files"
                      ? "这里先模拟你个人常用的文件资料分组，后面可以继续决定是按目录、标签还是项目来组织。"
                      : "这里先模拟已经做过 RAG 化处理的知识库集合，后面可以继续补索引状态、命中效果和挂载到助手的关系。"}
                    </p>
                  </div>
                  <span class="workspace-section-count">${activeTab === "files" ? libraryWorkspaceCollections.length : personalKnowledgeBases.length}</span>
                </div>
                ${activeTab === "files" ? `
                  <div class="library-list">
                    ${libraryWorkspaceCollections.map((item) => `
                      <div class="library-item">
                        <div class="library-item-main">
                          <div class="library-item-icon">
                            <svg class="icon" viewBox="0 0 24 24">
                              <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4H19v16H7.5A2.5 2.5 0 0 0 5 22z"></path>
                              <path d="M8 8h7"></path>
                              <path d="M8 12h7"></path>
                            </svg>
                          </div>
                          <div>
                            <h3 class="library-item-name">${escapeHtml(item.name)}</h3>
                            <p class="library-item-meta">最近更新 ${escapeHtml(item.updatedAt)} · ${item.fileCount} 份资料 · ${escapeHtml(item.scope)}</p>
                          </div>
                        </div>
                        <div class="library-item-tags">
                          ${item.tags.map((tag) => `<span class="library-tag">${escapeHtml(tag)}</span>`).join("")}
                        </div>
                      </div>
                    `).join("")}
                  </div>
                ` : `
                  <div class="knowledge-grid">
                    ${personalKnowledgeBases.map((item) => `
                      <div class="knowledge-card">
                        <div class="knowledge-card-top">
                          <div>
                            <h3 class="knowledge-card-name">${escapeHtml(item.name)}</h3>
                            <p class="knowledge-card-desc">${escapeHtml(item.desc)}</p>
                          </div>
                          <span class="knowledge-meta-pill">${escapeHtml(item.status)}</span>
                        </div>
                        <div class="knowledge-card-meta">
                          <span class="library-tag">分块 ${item.chunkCount}</span>
                          <span class="library-tag">源文件 ${item.sourceCount}</span>
                          <span class="library-tag">RAG 检索</span>
                        </div>
                      </div>
                    `).join("")}
                  </div>
                `}
              </div>
            </section>
          </div>
        `;
      }

      function showAssistantHome(target, shouldFocus = false, crumbLabel) {
        const shell = getShellConfig(target);
        if (!shell) return;
        applyShell(shell);
        mainLayout.classList.add("is-empty");
        mainLayout.classList.remove("is-workspace");
        mainLayout.classList.remove("is-focus-mode");
        focusModeButton?.classList.remove("is-active");
        newChatButton.classList.add("is-active");
        crumbTitle.textContent = crumbLabel || shell.label;
        crumb?.classList.remove("is-hidden");
        resetTopbarRight();
        clearHistoryActive();
        closeHistoryMenu();
        resetComposerUploads();
        composerInputs.forEach((field) => {
          field.value = "";
        });
        closeMobileNav();

        if (shouldFocus) {
          window.requestAnimationFrame(() => {
            getVisibleComposerInput()?.focus();
          });
        }
      }

      function showWorkspaceState() {
        mainLayout.classList.add("is-workspace");
        mainLayout.classList.remove("is-empty");
        mainLayout.classList.remove("is-focus-mode");
        activateNav("gpts-workspace");
        newChatButton.classList.remove("is-active");
        crumbTitle.textContent = "智能体广场";
        crumb?.classList.remove("is-hidden");
        closeHistoryMenu();
        resetComposerUploads();
        composerInputs.forEach((field) => {
          field.value = "";
        });
        closeMobileNav();
        renderWorkspace();
      }

      function showLibraryWorkspaceState() {
        mainLayout.classList.add("is-workspace");
        mainLayout.classList.remove("is-empty");
        mainLayout.classList.remove("is-focus-mode");
        focusModeButton?.classList.remove("is-active");
        activateNav("library-workspace");
        newChatButton.classList.remove("is-active");
        crumbTitle.textContent = "资料库";
        crumb?.classList.remove("is-hidden");
        closeHistoryMenu();
        resetComposerUploads();
        composerInputs.forEach((field) => {
          field.value = "";
        });
        closeMobileNav();
        renderLibraryWorkspace();
      }

      function showFeedback(message) {
        if (!actionFeedback) return;
        actionFeedback.textContent = message;
        actionFeedback.classList.add("is-visible");
        window.clearTimeout(feedbackTimer);
        feedbackTimer = window.setTimeout(() => {
          actionFeedback.classList.remove("is-visible");
        }, 1800);
      }

      function clearHistoryActive() {
        historyItems.forEach((item) => item.classList.remove("active"));
      }

      function setHistoryActive(label) {
        historyItems.forEach((item) => {
          item.classList.toggle("active", item.textContent.trim() === label && !item.classList.contains("more"));
        });
      }

      function escapeHtml(value) {
        return value
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }

      function formatFileSize(size) {
        if (!Number.isFinite(size) || size <= 0) return "0KB";
        if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))}KB`;
        return `${(size / (1024 * 1024)).toFixed(1)}MB`;
      }

      function getFilePresentation(file) {
        const lowerName = (file.name || "").toLowerCase();
        const extension = lowerName.includes(".") ? lowerName.split(".").pop() : "";
        const sizeLabel = formatFileSize(file.size);
        const base = {
          iconClass: "is-generic",
          typeLabel: extension ? extension.toUpperCase() : "文件",
          icon: `
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="8.1" stroke="rgba(255,255,255,0.78)" stroke-width="2.2" fill="none"></circle>
              <path d="M17.2 7.8A8 8 0 0 1 18.8 12" stroke="rgba(255,255,255,0.32)" stroke-width="2.2" fill="none" stroke-linecap="round"></path>
              <circle cx="12" cy="12" r="4.2" fill="rgba(255,255,255,0.05)"></circle>
            </svg>
          `
        };

        if (["pdf"].includes(extension)) {
          return {
            ...base,
            iconClass: "is-pdf",
            typeLabel: "PDF"
          };
        }

        if (["doc", "docx"].includes(extension)) {
          return {
            ...base,
            iconClass: "is-word",
            typeLabel: "Word"
          };
        }

        if (["xls", "xlsx", "csv"].includes(extension)) {
          return {
            ...base,
            iconClass: "is-sheet",
            typeLabel: "表格"
          };
        }

        if (file.type?.startsWith("image/") || ["png", "jpg", "jpeg", "webp"].includes(extension)) {
          return {
            ...base,
            iconClass: "is-image",
            typeLabel: "图片"
          };
        }

        return {
          ...base,
          typeLabel: extension ? extension.toUpperCase() : "文件",
          sizeLabel
        };
      }

      function renderComposerUploads(controller) {
        if (!controller.uploadArea || !controller.uploadGrid) return;

        if (!controller.files.length) {
          controller.uploadArea.classList.remove("is-visible");
          controller.uploadGrid.style.removeProperty("--upload-file-count");
          controller.uploadGrid.innerHTML = "";
          return;
        }

        controller.uploadArea.classList.add("is-visible");
        controller.uploadGrid.style.setProperty("--upload-file-count", String(controller.files.length));

        controller.uploadGrid.innerHTML = controller.files
          .map((file, index) => {
            const presentation = getFilePresentation(file);
            const sizeLabel = presentation.sizeLabel || formatFileSize(file.size);
            return `
              <div class="upload-file-card">
                <div class="upload-file-icon ${presentation.iconClass}">
                  ${presentation.icon}
                </div>
                <div class="upload-file-meta">
                  <div class="upload-file-name">${escapeHtml(file.name)}</div>
                  <div class="upload-file-subtitle">${presentation.typeLabel} · ${sizeLabel}</div>
                </div>
                <button class="upload-file-remove" type="button" data-upload-remove="${index}" aria-label="移除文件">
                  <svg class="icon icon-sm" viewBox="0 0 24 24">
                    <path d="M6 6l12 12"></path>
                    <path d="M18 6 6 18"></path>
                  </svg>
                </button>
              </div>
            `;
          })
          .join("");
      }

      function resetComposerUploads() {
        composerControllers.forEach((controller) => {
          controller.files = [];
          if (controller.fileInput) controller.fileInput.value = "";
          renderComposerUploads(controller);
        });
      }

      function bindComposerUploads() {
        composerControllers.forEach((controller) => {
          controller.uploadButton?.addEventListener("click", () => {
            controller.fileInput?.click();
          });

          controller.fileInput?.addEventListener("change", () => {
            const nextFiles = Array.from(controller.fileInput.files || []);
            if (!nextFiles.length) return;

            controller.files = nextFiles;
            renderComposerUploads(controller);
            showFeedback(`已添加 ${nextFiles.length} 个文件（演示）`);
          });

          controller.uploadArea?.addEventListener("click", (event) => {
            const removeButton = event.target.closest("[data-upload-remove]");
            if (removeButton) {
              const removeIndex = Number(removeButton.dataset.uploadRemove);
              controller.files = controller.files.filter((_, index) => index !== removeIndex);
              if (!controller.files.length && controller.fileInput) {
                controller.fileInput.value = "";
              }
              renderComposerUploads(controller);
              showFeedback(controller.files.length ? "已更新文件列表（演示）" : "已移除全部文件（演示）");
              return;
            }

          });
        });
      }

      function buildResponseSections(paragraphs) {
        const safeParagraphs = Array.isArray(paragraphs) ? paragraphs.filter(Boolean) : [];
        if (!safeParagraphs.length) return "";

        const first = safeParagraphs[0];
        const last = safeParagraphs.length > 1 ? safeParagraphs[safeParagraphs.length - 1] : safeParagraphs[0];
        const middle = safeParagraphs.slice(1, -1);
        const coreParagraphs = middle.length ? middle : safeParagraphs.length > 1 ? [safeParagraphs[1]] : [safeParagraphs[0]];

        const sections = [
          {
            title: "关键结论",
            icon: `<svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M12 3v11"></path><path d="m8 10 4-7 4 7"></path><path d="M10 18h4"></path><path d="M9 21h6"></path></svg>`,
            paragraphs: [first]
          },
          {
            title: "核心思路",
            icon: `<svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M4 12h16"></path><path d="M12 4v16"></path><circle cx="12" cy="12" r="8"></circle></svg>`,
            paragraphs: coreParagraphs
          }
        ];

        if (safeParagraphs.length > 1) {
          sections.push({
            title: "下一步建议",
            icon: `<svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M5 12h14"></path><path d="m13 6 6 6-6 6"></path></svg>`,
            paragraphs: [last]
          });
        }

        return sections
          .map(
            (section) => `
              <section class="response-section">
                <div class="response-heading">
                  ${section.icon}
                  <span>${section.title}</span>
                </div>
                <div class="response-divider" aria-hidden="true"></div>
                <div class="response-copy">
                  ${section.paragraphs.map((text) => `<p>${escapeHtml(text)}</p>`).join("")}
                </div>
              </section>
            `
          )
          .join("");
      }

      function renderThread(label, options = {}) {
        const { generated = false, prompt = "" } = options;
        const activeSessionMap = getSessionMapForCurrentShell();
        const session = generated
          ? {
              user: prompt,
              assistant: getGeneratedAnswerTemplates()
            }
          : activeSessionMap[label]
            || activeSessionMap[Object.keys(activeSessionMap)[0]]
            || sessionContentMap["入职 IT 工具使用指南"];

        const assistantSections = buildResponseSections(session.assistant);

        articleThread.innerHTML = `
          <div class="message-row user-row">
            <p class="article-intro">${escapeHtml(session.user)}</p>
          </div>
          <div class="message-row agent-row">
            <div class="agent-avatar" aria-hidden="true">
              <img src="${currentShell.avatar}" alt="" />
            </div>
            <section class="text-card">
              <div class="response-panel">
                ${assistantSections}
              </div>
              <div class="assistant-actions">
                <button class="meta-action" aria-label="刷新演示结果">
                  <svg class="icon" viewBox="0 0 24 24">
                    <path d="M7.2 8.3A6.5 6.5 0 0 1 18 10"></path>
                    <path d="M17.5 5.5V10H13"></path>
                    <path d="M16.8 15.7A6.5 6.5 0 0 1 6 14"></path>
                    <path d="M6.5 18.5V14H11"></path>
                  </svg>
                </button>
                <button class="meta-action" aria-label="导出内容">
                  <svg class="icon" viewBox="0 0 24 24">
                    <path d="M10 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3"></path>
                    <path d="M14 5h3a2 2 0 0 1 2 2v3"></path>
                    <path d="m13 11 6 0"></path>
                    <path d="m16 8 3 3-3 3"></path>
                    <path d="M10 19h4"></path>
                  </svg>
                </button>
              </div>
            </section>
          </div>
        `;
      }

      function showEmptyState(shouldFocus = false) {
        showAssistantHome("main-assistant", shouldFocus, "新建会话");
      }

      function showArticleState(label, options = {}) {
        const { syncHistory = true, generated = false, prompt = "" } = options;
        mainLayout.classList.remove("is-empty");
        mainLayout.classList.remove("is-workspace");
        newChatButton.classList.remove("is-active");
        crumbTitle.textContent = label;
        crumb?.classList.remove("is-hidden");
        resetTopbarRight();
        resetComposerUploads();
        renderThread(label, { generated, prompt });

        if (syncHistory) {
          setHistoryActive(label);
        } else {
          clearHistoryActive();
        }

        closeMobileNav();
      }

      function toggleSidebarSurface() {
        if (isMobileView()) {
          app.classList.toggle("is-mobile-nav-open");
          return;
        }

        app.classList.toggle("is-sidebar-hidden");
        showFeedback(app.classList.contains("is-sidebar-hidden") ? "已收起历史会话" : "已展开历史会话");
      }

      function syncModelLabel(label) {
        modelChips.forEach((chip) => {
          const textNode = chip.querySelector("span");
          if (textNode) textNode.textContent = label;
        });
        modelOptions.forEach((option) => {
          option.classList.toggle("is-active", option.dataset.model === label);
        });
      }

      function closeModelMenus() {
        modelChips.forEach((chip) => {
          chip.classList.remove("is-open");
          chip.setAttribute("aria-expanded", "false");
        });
        modelMenus.forEach((menu) => {
          menu.classList.remove("is-open");
          menu.setAttribute("aria-hidden", "true");
        });
      }

      function submitCurrentInput(input) {
        const targetInput = input || getVisibleComposerInput();
        if (!targetInput) return;

        const question = targetInput.value.trim();
        if (!question) {
          targetInput.focus();
          showFeedback("先输入一个具体任务，再开始演示");
          return;
        }

        const shortTitle = question.length > 18 ? `${question.slice(0, 18)}...` : question;
        showArticleState(shortTitle, { syncHistory: false, generated: true, prompt: question });
        resetComposerUploads();
        composerInputs.forEach((field) => {
          field.value = "";
        });
        showFeedback("已生成一版演示内容");
      }

      newChatButton.addEventListener("click", () => {
        window.location.href = "./index.html";
      });

      navButtons.forEach((button) => {
        button.addEventListener("click", () => {
          const target = button.dataset.navTarget;
          if (target === "library-workspace") {
            showLibraryWorkspaceState();
            return;
          }
          if (target === "gpts-workspace") {
            showWorkspaceState();
            return;
          }
          if (target) {
            showAssistantHome(target, false);
            showFeedback(`已切换到${button.textContent.trim().replace("广场", "").trim()}`);
          }
        });
      });

      collapseButton.addEventListener("click", toggleSidebarSurface);
      sidebarTrigger?.addEventListener("click", toggleSidebarSurface);
      mobileBackdrop?.addEventListener("click", closeMobileNav);
      historyToggle?.addEventListener("click", () => {
        const nextCollapsed = !historyGroup?.classList.contains("is-collapsed");
        historyGroup?.classList.toggle("is-collapsed", nextCollapsed);
        historyToggle.setAttribute("aria-expanded", String(!nextCollapsed));
      });
      profileButton?.addEventListener("click", () => {
        const nextOpen = !profileMenu?.classList.contains("is-open");
        closeHistoryMenu();
        closeProfileMenu();
        if (nextOpen) {
          profileMenu?.classList.add("is-open");
          profileMenu?.setAttribute("aria-hidden", "false");
        }
      });

      profileMenuItems.forEach((item) => {
        item.addEventListener("click", () => {
          const action = item.dataset.action;
          closeProfileMenu();
          showFeedback(action === "settings" ? "已打开设置（演示）" : "已退出登录（演示）");
        });
      });

      focusModeButton?.addEventListener("click", () => {
        const nextState = !mainLayout.classList.contains("is-focus-mode");
        mainLayout.classList.toggle("is-focus-mode", nextState);
        focusModeButton.classList.toggle("is-active", nextState);
        showFeedback(nextState ? "已切换到专注阅读" : "已退出专注阅读");
      });

      historyItems.forEach((item) => {
        item.addEventListener("click", () => {
          const label = item.textContent.trim();
          const isMore = item.classList.contains("more");
          closeHistoryMenu();
          if (!isMore) {
            const nextShell = regulationSessionContentMap[label]
              ? assistantShells["regulation-assistant"]
              : assistantShells["main-assistant"];
            applyShell(nextShell);
          } else {
            applyShell(assistantShells["main-assistant"]);
          }
          showArticleState(isMore ? "历史会话" : label, { syncHistory: !isMore, generated: false });
          showFeedback(isMore ? "已展开更多历史会话（演示）" : `已打开“${label}”`);
        });
      });

      historyMenuButtons.forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          openHistoryMenu(button);
        });
      });

      document.querySelectorAll(".history-entry").forEach((entry) => {
        entry.addEventListener("mouseenter", cancelHistoryMenuClose);
        entry.addEventListener("mouseleave", () => {
          if (activeHistoryEntry === entry && historyMenu?.classList.contains("is-open")) {
            queueHistoryMenuClose();
          }
        });
      });

      historyMenu?.addEventListener("mouseenter", cancelHistoryMenuClose);
      historyMenu?.addEventListener("mouseleave", queueHistoryMenuClose);

      historyMenuItems.forEach((item) => {
        item.addEventListener("click", () => {
          if (!activeHistoryEntry) return;
          const targetItem = activeHistoryEntry.querySelector(".history-item");
          if (!targetItem) return;

          const action = item.dataset.action;
          const label = targetItem.textContent.trim();

          if (action === "rename") {
            if (!label.includes(" · 已整理")) {
              targetItem.textContent = `${label} · 已整理`;
            }
            showFeedback(`已编辑“${label}”标题（演示）`);
          } else if (action === "pin") {
            const historyList = document.getElementById("historyList");
            historyList?.insertBefore(activeHistoryEntry, historyList.firstElementChild);
            showFeedback(`已置顶“${label}”`);
          } else if (action === "delete") {
            activeHistoryEntry.remove();
            showFeedback(`已删除“${label}”（演示）`);
          }

          closeHistoryMenu();
        });
      });

      document.addEventListener("click", (event) => {
        if (!historyMenu?.classList.contains("is-open")) return;
        if (historyMenu.contains(event.target)) return;
        if (event.target.closest(".history-more")) return;
        closeHistoryMenu();
      });

      document.addEventListener("click", (event) => {
        if (!profileMenu?.classList.contains("is-open")) return;
        if (profileMenu.contains(event.target)) return;
        if (event.target.closest(".profile")) return;
        closeProfileMenu();
      });

      window.addEventListener("resize", closeHistoryMenu);
      sidebarScroll?.addEventListener("scroll", closeHistoryMenu);

      promptChipList?.addEventListener("click", (event) => {
        const chip = event.target.closest(".prompt-chip");
        if (!chip) return;
        const input = getVisibleComposerInput();
        if (!input) return;
        input.value = chip.dataset.prompt || chip.textContent.trim();
        submitCurrentInput(input);
      });

      sendButtons.forEach((button) => {
        button.addEventListener("click", () => {
          submitCurrentInput(getVisibleComposerInput());
        });
      });

      composerInputs.forEach((input) => {
        input.addEventListener("keydown", (event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submitCurrentInput(input);
          }
        });
      });

      roundButtons.forEach((button) => {
        button.addEventListener("click", () => {
          if (button.dataset.action === "upload") return;
          const label = button.getAttribute("aria-label");
          const isVoice = label === "语音";
          button.classList.toggle("is-active");
          showFeedback(isVoice ? (button.classList.contains("is-active") ? "已打开语音入口（演示）" : "已关闭语音入口") : "已打开附件入口（演示）");
        });
      });

      modelChips.forEach((chip) => {
        chip.addEventListener("click", (event) => {
          event.stopPropagation();
          const select = chip.closest(".model-select");
          const menu = select?.querySelector(".model-menu");
          const shouldOpen = !chip.classList.contains("is-open");
          closeModelMenus();
          if (!shouldOpen || !menu) return;
          chip.classList.add("is-open");
          chip.setAttribute("aria-expanded", "true");
          menu.classList.add("is-open");
          menu.setAttribute("aria-hidden", "false");
        });
      });

      modelOptions.forEach((option) => {
        option.addEventListener("click", (event) => {
          event.stopPropagation();
          const nextModel = option.dataset.model;
          if (!nextModel) return;
          currentModelIndex = modelSequence.indexOf(nextModel);
          if (currentModelIndex < 0) currentModelIndex = 0;
          syncModelLabel(nextModel);
          closeModelMenus();
          showFeedback(`已切换到 ${nextModel}`);
        });
      });

      articleThread?.addEventListener("click", (event) => {
        const metaAction = event.target.closest(".meta-action");

        if (metaAction) {
          const label = metaAction.getAttribute("aria-label");
          if (label === "复制内容") {
            metaAction.classList.add("is-active");
            window.setTimeout(() => metaAction.classList.remove("is-active"), 1200);
            showFeedback("内容已复制到演示剪贴板");
            return;
          }

          metaAction.classList.toggle("is-active");
          showFeedback(`${label}已执行（演示）`);
        }
      });

      workspaceView?.addEventListener("click", (event) => {
        const libraryTab = event.target.closest("[data-library-tab]");
        if (libraryTab) {
          renderLibraryWorkspace(libraryTab.dataset.libraryTab || "files");
          return;
        }

        const libraryAction = event.target.closest("[data-library-action]");
        if (libraryAction) {
          const action = libraryAction.dataset.libraryAction;
          showFeedback(action === "upload" ? "已打开上传资料入口（演示）" : "已打开资料搜索入口（演示）");
          return;
        }

        const pinButton = event.target.closest("[data-pin-agent]");
        if (pinButton) {
          const targetId = pinButton.dataset.pinAgent;
          const item = gptWorkspaceItems.find((entry) => entry.gid === targetId);
          if (!item || item.isRequiredPinned) {
            showFeedback("该智能体默认固定展示");
            return;
          }
          item.isPinned = !item.isPinned;
          renderWorkspace();
          showFeedback(item.isPinned ? `已固定“${item.name}”` : `已取消固定“${item.name}”`);
          return;
        }

        const actionButton = event.target.closest("[data-workspace-action]");
        if (actionButton) {
          const action = actionButton.dataset.workspaceAction;
          if (action === "my-gpts") {
            renderMyGptsWorkspace();
          } else if (action === "create-gpt") {
            renderCreateGptWorkspace();
          } else if (action === "edit-gpt") {
            renderCreateGptWorkspace(actionButton.dataset.gid);
          } else if (action === "gpts-plaza") {
            showWorkspaceState();
          } else if (action === "save-gpt") {
            showFeedback("已保存配置（演示）");
            renderMyGptsWorkspace();
          } else if (action === "delete-gpt") {
            showFeedback("已删除智能体（演示）");
            renderMyGptsWorkspace();
          } else if (action === "upload-knowledge") {
            showFeedback("已打开文件选择（演示）");
          }
          return;
        }

        const card = event.target.closest("[data-open-agent]");
        if (!card) return;
        const item = gptWorkspaceItems.find((entry) => entry.gid === card.dataset.openAgent);
        if (!item) return;
        showAssistantHome(resolveWorkspaceTarget(item), false);
        showFeedback(`已打开“${item.name}”主页`);
      });

      document.querySelector(".topbar")?.addEventListener("click", (event) => {
        const actionButton = event.target.closest("[data-workspace-action]");
        if (!actionButton) return;
        const action = actionButton.dataset.workspaceAction;
        if (action === "my-gpts") {
          renderMyGptsWorkspace();
        } else if (action === "create-gpt") {
          renderCreateGptWorkspace();
        } else if (action === "gpts-plaza") {
          showWorkspaceState();
        } else if (action === "save-gpt") {
          showFeedback("已保存配置（演示）");
          renderMyGptsWorkspace();
        }
      });

      function initializePage() {
        const initialShellKey = document.body.dataset.initialAssistant || "main-assistant";
        const initialView = document.body.dataset.initialView || "empty";
        const initialShell = assistantShells[initialShellKey] || assistantShells["main-assistant"];

        applyShell(initialShell);

        if (initialView === "workspace") {
          showWorkspaceState();
        } else if (initialView === "library") {
          showLibraryWorkspaceState();
        } else if (initialView === "assistant-home") {
          showAssistantHome(initialShell.key, false);
        } else if (initialView === "article") {
          showArticleState(document.body.dataset.initialLabel || "入职 IT 工具使用指南");
        } else {
          showEmptyState(false);
        }

        bindComposerUploads();
      }

      initializePage();

      document.addEventListener("keydown", (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
          event.preventDefault();
          showEmptyState(true);
          showFeedback("已定位到新建会话");
        }

        if (event.key === "Escape") {
          closeProfileMenu();
          closeModelMenus();
          closeMobileNav();
        }
      });

      document.addEventListener("click", (event) => {
        if (event.target.closest(".model-select")) return;
        closeModelMenus();
      });
    
