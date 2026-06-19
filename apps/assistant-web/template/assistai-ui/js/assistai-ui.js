const assistAiPrototypeRoot = document.getElementById("assistai-root");

if (!assistAiPrototypeRoot) {
  throw new Error("Missing #assistai-root container for AssistAI prototype.");
}

assistAiPrototypeRoot.innerHTML = "    <div class=\"app-shell\">\n      <div class=\"app\">\n        <aside class=\"sidebar\">\n          <div class=\"sidebar-top\">\n            <div class=\"sidebar-brand\">\n              <div class=\"brand\" aria-label=\"AssistAI\">\n                <img src=\"./assets/logo.svg\" alt=\"AssistAI \u6807\u5fd7\" />\n              </div>\n              <span class=\"brand-title\">\u4f01\u4e1a AI \u52a9\u624b</span>\n            </div>\n            <button class=\"collapse-btn\" aria-label=\"\u6536\u8d77\u4fa7\u680f\">\n              <svg class=\"icon\" viewBox=\"0 0 24 24\">\n                <rect x=\"4\" y=\"5\" width=\"16\" height=\"14\" rx=\"2\"></rect>\n                <path d=\"M10 5v14\"></path>\n              </svg>\n            </button>\n          </div>\n\n          <button class=\"new-chat\">\n            <span class=\"new-chat-main\">\n              <svg class=\"icon\" viewBox=\"0 0 24 24\">\n                <circle cx=\"12\" cy=\"12\" r=\"9\"></circle>\n                <path d=\"M12 8v8\"></path>\n                <path d=\"M8 12h8\"></path>\n              </svg>\n              <span>\u65b0\u5efa\u4f1a\u8bdd</span>\n            </span>\n          </button>\n\n          <div class=\"sidebar-scroll\">\n            <div class=\"sidebar-group\">\n              <a class=\"nav-item\" data-nav-target=\"library-workspace\" href=\"./library.html\">\n                <svg class=\"icon nav-item-icon\" viewBox=\"0 0 24 24\">\n                  <path d=\"M5 6.5A2.5 2.5 0 0 1 7.5 4H19v16H7.5A2.5 2.5 0 0 0 5 22z\"></path>\n                  <path d=\"M8 8h7\"></path>\n                  <path d=\"M8 12h7\"></path>\n                  <path d=\"M8 16h5\"></path>\n                </svg>\n                <span>\u8d44\u6599\u5e93</span>\n              </a>\n              <a class=\"nav-item\" data-nav-target=\"gpts-workspace\" href=\"./gpts.html\">\n                <img class=\"nav-item-logo\" src=\"../../src/assets/icons/apps.svg\" alt=\"\" />\n                <span>\u667a\u80fd\u4f53\u5e7f\u573a</span>\n              </a>\n              <a class=\"nav-item\" data-nav-target=\"regulation-assistant\" href=\"./policy.html\">\n                <img class=\"nav-item-logo\" src=\"../../public/gpts/policy.svg\" alt=\"\" />\n                <span>\u5236\u5ea6\u52a9\u624b</span>\n              </a>\n            </div>\n            <div class=\"sidebar-group history-group\">\n              <button class=\"section-title history-toggle\" aria-expanded=\"true\" aria-controls=\"historyList\">\n                <span class=\"section-title-main\">\n                  <svg class=\"icon\" viewBox=\"0 0 24 24\">\n                    <circle cx=\"12\" cy=\"12\" r=\"8\"></circle>\n                    <path d=\"M12 8v5\"></path>\n                    <path d=\"m12 13 3 2\"></path>\n                  </svg>\n                  <span>\u5386\u53f2\u4f1a\u8bdd</span>\n                </span>\n                <svg class=\"icon icon-sm section-toggle-icon\" viewBox=\"0 0 24 24\">\n                  <path d=\"m9 6 6 6-6 6\"></path>\n                </svg>\n              </button>\n              <div class=\"history-list\" id=\"historyList\">\n                <div class=\"history-entry\">\n                  <button class=\"history-item active\">\u5165\u804c IT \u5de5\u5177\u4f7f\u7528\u6307\u5357</button>\n                  <button class=\"history-more\" aria-label=\"\u66f4\u591a\u64cd\u4f5c\">\n                    <svg class=\"icon icon-sm\" viewBox=\"0 0 24 24\">\n                      <circle cx=\"7\" cy=\"12\" r=\"1.25\"></circle>\n                      <circle cx=\"12\" cy=\"12\" r=\"1.25\"></circle>\n                      <circle cx=\"17\" cy=\"12\" r=\"1.25\"></circle>\n                    </svg>\n                  </button>\n                </div>\n                <div class=\"history-entry\">\n                  <button class=\"history-item\">\u7ec4\u7ec7\u77e5\u8bc6\u5e93\u5efa\u8bbe\u8282\u594f</button>\n                  <button class=\"history-more\" aria-label=\"\u66f4\u591a\u64cd\u4f5c\">\n                    <svg class=\"icon icon-sm\" viewBox=\"0 0 24 24\">\n                      <circle cx=\"7\" cy=\"12\" r=\"1.25\"></circle>\n                      <circle cx=\"12\" cy=\"12\" r=\"1.25\"></circle>\n                      <circle cx=\"17\" cy=\"12\" r=\"1.25\"></circle>\n                    </svg>\n                  </button>\n                </div>\n                <div class=\"history-entry\">\n                  <button class=\"history-item\">\u9500\u552e\u5468\u62a5\u81ea\u52a8\u6c47\u603b\u5efa\u8bae</button>\n                  <button class=\"history-more\" aria-label=\"\u66f4\u591a\u64cd\u4f5c\">\n                    <svg class=\"icon icon-sm\" viewBox=\"0 0 24 24\">\n                      <circle cx=\"7\" cy=\"12\" r=\"1.25\"></circle>\n                      <circle cx=\"12\" cy=\"12\" r=\"1.25\"></circle>\n                      <circle cx=\"17\" cy=\"12\" r=\"1.25\"></circle>\n                    </svg>\n                  </button>\n                </div>\n                <div class=\"history-entry\">\n                  <button class=\"history-item\">\u8d22\u52a1\u5171\u4eab\u6d41\u7a0b\u8bf4\u660e\u6574\u7406</button>\n                  <button class=\"history-more\" aria-label=\"\u66f4\u591a\u64cd\u4f5c\">\n                    <svg class=\"icon icon-sm\" viewBox=\"0 0 24 24\">\n                      <circle cx=\"7\" cy=\"12\" r=\"1.25\"></circle>\n                      <circle cx=\"12\" cy=\"12\" r=\"1.25\"></circle>\n                      <circle cx=\"17\" cy=\"12\" r=\"1.25\"></circle>\n                    </svg>\n                  </button>\n                </div>\n                <div class=\"history-entry\">\n                  <button class=\"history-item\">\u5408\u540c\u95ee\u7b54\u9875\u9762\u4fe1\u606f\u7ed3\u6784</button>\n                  <button class=\"history-more\" aria-label=\"\u66f4\u591a\u64cd\u4f5c\">\n                    <svg class=\"icon icon-sm\" viewBox=\"0 0 24 24\">\n                      <circle cx=\"7\" cy=\"12\" r=\"1.25\"></circle>\n                      <circle cx=\"12\" cy=\"12\" r=\"1.25\"></circle>\n                      <circle cx=\"17\" cy=\"12\" r=\"1.25\"></circle>\n                    </svg>\n                  </button>\n                </div>\n                <div class=\"history-entry\">\n                  <button class=\"history-item\">\u5ba2\u670d SOP \u4f18\u5316\u5efa\u8bae</button>\n                  <button class=\"history-more\" aria-label=\"\u66f4\u591a\u64cd\u4f5c\">\n                    <svg class=\"icon icon-sm\" viewBox=\"0 0 24 24\">\n                      <circle cx=\"7\" cy=\"12\" r=\"1.25\"></circle>\n                      <circle cx=\"12\" cy=\"12\" r=\"1.25\"></circle>\n                      <circle cx=\"17\" cy=\"12\" r=\"1.25\"></circle>\n                    </svg>\n                  </button>\n                </div>\n                <div class=\"history-entry\">\n                  <button class=\"history-item\">\u9879\u76ee\u5468\u4f8b\u4f1a\u7eaa\u8981\u6458\u8981</button>\n                  <button class=\"history-more\" aria-label=\"\u66f4\u591a\u64cd\u4f5c\">\n                    <svg class=\"icon icon-sm\" viewBox=\"0 0 24 24\">\n                      <circle cx=\"7\" cy=\"12\" r=\"1.25\"></circle>\n                      <circle cx=\"12\" cy=\"12\" r=\"1.25\"></circle>\n                      <circle cx=\"17\" cy=\"12\" r=\"1.25\"></circle>\n                    </svg>\n                  </button>\n                </div>\n                <button class=\"history-item more\">\u67e5\u770b\u5168\u90e8</button>\n              </div>\n              <div class=\"history-menu\" id=\"historyMenu\" aria-hidden=\"true\">\n                <button class=\"history-menu-item\" data-action=\"rename\">\n                  <svg class=\"icon icon-sm\" viewBox=\"0 0 24 24\">\n                    <path d=\"m4 20 4.5-1 9.7-9.7a2.1 2.1 0 0 0-3-3L5.5 16l-1.5 4z\"></path>\n                  </svg>\n                  <span>\u7f16\u8f91\u6807\u9898</span>\n                </button>\n                <button class=\"history-menu-item\" data-action=\"pin\">\n                  <svg class=\"icon icon-sm\" viewBox=\"0 0 24 24\">\n                    <path d=\"M12 4v10\"></path>\n                    <path d=\"m8 8 4-4 4 4\"></path>\n                    <path d=\"M8 14h8\"></path>\n                  </svg>\n                  <span>\u7f6e\u9876</span>\n                </button>\n                <button class=\"history-menu-item is-danger\" data-action=\"delete\">\n                  <svg class=\"icon icon-sm\" viewBox=\"0 0 24 24\">\n                    <path d=\"M4 7h16\"></path>\n                    <path d=\"M10 11v6\"></path>\n                    <path d=\"M14 11v6\"></path>\n                    <path d=\"M6 7l1 11a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-11\"></path>\n                    <path d=\"M9 7V4h6v3\"></path>\n                  </svg>\n                  <span>\u5220\u9664</span>\n                </button>\n              </div>\n            </div>\n          </div>\n\n        <div class=\"sidebar-footer\">\n            <div class=\"profile-menu\" id=\"profileMenu\" aria-hidden=\"true\">\n              <button class=\"profile-menu-item\" data-action=\"settings\">\n                <svg class=\"icon icon-sm\" viewBox=\"0 0 24 24\">\n                  <circle cx=\"12\" cy=\"12\" r=\"3\"></circle>\n                  <path d=\"M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h0a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 1 1.5h0a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v0a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1z\"></path>\n                </svg>\n                <span>\u8bbe\u7f6e</span>\n              </button>\n              <button class=\"profile-menu-item is-danger\" data-action=\"logout\">\n                <svg class=\"icon icon-sm\" viewBox=\"0 0 24 24\">\n                  <path d=\"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4\"></path>\n                  <path d=\"m16 17 5-5-5-5\"></path>\n                  <path d=\"M21 12H9\"></path>\n                </svg>\n                <span>\u9000\u51fa</span>\n              </button>\n            </div>\n            <button class=\"profile\" aria-label=\"\u6253\u5f00\u8d26\u53f7\u83dc\u5355\">\n              <span class=\"profile-main\">\n                <span class=\"avatar\">Z</span>\n                <span class=\"profile-name\">zhangsan</span>\n              </span>\n              <svg class=\"icon icon-sm\" viewBox=\"0 0 24 24\">\n                <path d=\"m6 9 6 6 6-6\"></path>\n              </svg>\n            </button>\n          </div>\n        </aside>\n\n        <main class=\"main\">\n          <div class=\"main-layout\">\n            <header class=\"topbar\">\n              <div class=\"topbar-left\">\n                <button class=\"top-action sidebar-trigger\" aria-label=\"\u6253\u5f00\u5386\u53f2\u4f1a\u8bdd\">\n                  <svg class=\"icon\" viewBox=\"0 0 24 24\">\n                    <path d=\"M4 7h16\"></path>\n                    <path d=\"M4 12h16\"></path>\n                    <path d=\"M4 17h16\"></path>\n                  </svg>\n                </button>\n                <div class=\"crumb\">\n                  <span class=\"crumb-title\" id=\"crumbTitle\">\u5165\u804c IT \u5de5\u5177\u4f7f\u7528\u6307\u5357</span>\n                </div>\n              </div>\n              <div class=\"topbar-right\">\n                <div class=\"action-feedback\" id=\"actionFeedback\" aria-live=\"polite\"></div>\n              </div>\n            </header>\n\n            <div class=\"main-scroll\">\n              <div class=\"content\">\n                <article class=\"article\" id=\"articleThread\"></article>\n              </div>\n\n              <div class=\"workspace-view\" id=\"workspaceView\"></div>\n\n              <div class=\"empty-view\">\n                <div class=\"empty-shell\">\n                  <div class=\"empty-hero\">\n                    <div class=\"empty-logo\" aria-hidden=\"true\">\n                      <img id=\"emptyLogo\" src=\"./assets/logo.svg\" alt=\"\" />\n                    </div>\n                    <h1 class=\"empty-title\" id=\"emptyTitle\">\u4eca\u5929\u60f3\u8ba9\u6211\u5e2e\u4f60\u5904\u7406\u4ec0\u4e48\uff1f</h1>\n                  </div>\n                  <p class=\"empty-support\" id=\"emptySupport\">\n                    \u4ece\u5236\u5ea6\u67e5\u8be2\u3001\u7eaa\u8981\u6574\u7406\u5230\u65b9\u6848\u8d77\u8349\uff0c\u8fd9\u91cc\u66f4\u9002\u5408\u5904\u7406\u5177\u4f53\u5de5\u4f5c\u4efb\u52a1\uff0c\u800c\u4e0d\u662f\u6cdb\u6cdb\u804a\u5929\u3002\n                  </p>\n                  <div class=\"suggestion-label\" id=\"emptySuggestionLabel\">\u5efa\u8bae\u4ece\u8fd9\u4e9b\u5e38\u89c1\u4efb\u52a1\u5f00\u59cb</div>\n                  <div class=\"suggestion-strip\" id=\"promptChipList\">\n                    <button class=\"prompt-chip\" data-prompt=\"\u5e2e\u6211\u6574\u7406\u4e00\u7248\u65b0\u5458\u5de5\u5165\u804c\u5de5\u5177\u6e05\u5355\">\u6574\u7406\u5165\u804c\u6e05\u5355</button>\n                    <button class=\"prompt-chip\" data-prompt=\"\u628a\u8fd9\u4efd\u6d41\u7a0b\u8bf4\u660e\u6539\u5199\u6210\u9762\u5411\u5458\u5de5\u7684 FAQ\">\u6539\u5199\u6d41\u7a0b FAQ</button>\n                    <button class=\"prompt-chip\" data-prompt=\"\u6839\u636e\u4f1a\u8bae\u7eaa\u8981\u8f93\u51fa\u4e00\u7248\u53ef\u6267\u884c\u884c\u52a8\u9879\">\u63d0\u70bc\u884c\u52a8\u9879</button>\n                  </div>\n\n                  <div class=\"empty-composer-area\">\n                    <div class=\"composer\">\n                      <div class=\"composer-upload\" aria-live=\"polite\">\n                        <div class=\"upload-file-grid\"></div>\n                      </div>\n                      <textarea class=\"composer-input\" id=\"emptyComposerInput\" rows=\"2\" placeholder=\"\u8f93\u5165\u4f60\u7684\u95ee\u9898\uff0c\u6211\u53ef\u4ee5\u5e2e\u4f60\u67e5\u8d44\u6599\u3001\u5199\u65b9\u6848\u3001\u6574\u7406\u5185\u5bb9\"></textarea>\n                      <input class=\"upload-input\" type=\"file\" multiple accept=\".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.ppt,.pptx,image/*\" hidden />\n                      <div class=\"composer-bottom\">\n                        <div class=\"composer-left\">\n                          <button class=\"round-btn\" aria-label=\"\u6dfb\u52a0\" data-action=\"upload\">\n                            <svg class=\"icon\" viewBox=\"0 0 24 24\">\n                              <path d=\"M12 5v14\"></path>\n                              <path d=\"M5 12h14\"></path>\n                            </svg>\n                          </button>\n                        </div>\n                        <div class=\"composer-right\">\n                          <div class=\"model-select\">\n                            <button class=\"model-chip\" aria-label=\"\u5207\u6362\u6a21\u578b\" aria-expanded=\"false\">\n                              <span>GLM-5.0</span>\n                              <svg class=\"icon icon-sm\" viewBox=\"0 0 24 24\">\n                                <path d=\"m6 9 6 6 6-6\"></path>\n                              </svg>\n                            </button>\n                            <div class=\"model-menu\" aria-hidden=\"true\">\n                              <button class=\"model-option is-active\" data-model=\"GLM-5.0\">GLM-5.0</button>\n                              <button class=\"model-option\" data-model=\"GLM-4.7\">GLM-4.7</button>\n                            </div>\n                          </div>\n                          <button class=\"send-btn\" aria-label=\"\u53d1\u9001\">\n                            <svg class=\"icon\" viewBox=\"0 0 24 24\">\n                              <path d=\"M12 19V5\"></path>\n                              <path d=\"m6 11 6-6 6 6\"></path>\n                            </svg>\n                          </button>\n                        </div>\n                      </div>\n                    </div>\n                    <div class=\"footnote\">v1.0.1 XXX\u516c\u53f8</div>\n                  </div>\n                </div>\n              </div>\n            </div>\n\n            <div class=\"composer-wrap\">\n              <div class=\"composer-area\">\n                <div class=\"composer\">\n                  <div class=\"composer-upload\" aria-live=\"polite\">\n                    <div class=\"upload-file-grid\"></div>\n                  </div>\n                  <textarea class=\"composer-input\" id=\"articleComposerInput\" rows=\"2\" placeholder=\"\u7ee7\u7eed\u63d0\u95ee\uff0c\u4f8b\u5982\uff1a\u5e2e\u6211\u628a\u8fd9\u4efd\u8bf4\u660e\u6574\u7406\u6210\u9762\u5411\u65b0\u5458\u5de5\u7684 FAQ \u7248\u672c\"></textarea>\n                  <input class=\"upload-input\" type=\"file\" multiple accept=\".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.ppt,.pptx,image/*\" hidden />\n                  <div class=\"composer-bottom\">\n                    <div class=\"composer-left\">\n                      <button class=\"round-btn\" aria-label=\"\u6dfb\u52a0\" data-action=\"upload\">\n                        <svg class=\"icon\" viewBox=\"0 0 24 24\">\n                          <path d=\"M12 5v14\"></path>\n                          <path d=\"M5 12h14\"></path>\n                        </svg>\n                      </button>\n                    </div>\n                    <div class=\"composer-right\">\n                      <div class=\"model-select\">\n                        <button class=\"model-chip\" aria-label=\"\u5207\u6362\u6a21\u578b\" aria-expanded=\"false\">\n                          <span>GLM-5.0</span>\n                          <svg class=\"icon icon-sm\" viewBox=\"0 0 24 24\">\n                            <path d=\"m6 9 6 6 6-6\"></path>\n                          </svg>\n                        </button>\n                        <div class=\"model-menu\" aria-hidden=\"true\">\n                          <button class=\"model-option is-active\" data-model=\"GLM-5.0\">GLM-5.0</button>\n                          <button class=\"model-option\" data-model=\"GLM-4.7\">GLM-4.7</button>\n                        </div>\n                      </div>\n                      <button class=\"send-btn\" aria-label=\"\u53d1\u9001\">\n                        <svg class=\"icon\" viewBox=\"0 0 24 24\">\n                          <path d=\"M12 19V5\"></path>\n                          <path d=\"m6 11 6-6 6 6\"></path>\n                        </svg>\n                      </button>\n                    </div>\n                  </div>\n                </div>\n                <div class=\"footnote\">v1.0.1 XXX\u516c\u53f8</div>\n              </div>\n            </div>\n          </div>\n        </main>\n      </div>\n      <div class=\"mobile-backdrop\" aria-hidden=\"true\"></div>\n    </div>\n\n    ";

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
      const primarySidebarGroup = document.querySelector(".sidebar-group");
      if (primarySidebarGroup) {
        const skillExploreNavButton = document.createElement("a");
        skillExploreNavButton.className = "nav-item";
        skillExploreNavButton.href = "./explore.html";
        skillExploreNavButton.dataset.navTarget = "skill-explore-workspace";
        skillExploreNavButton.innerHTML = `
          <svg class="icon nav-item-icon" viewBox="0 0 24 24">
            <path d="M12 3.5 14.7 9l5.9.9-4.3 4.2 1 5.9-5.3-2.8-5.3 2.8 1-5.9-4.3-4.2L9.3 9z"></path>
          </svg>
          <span>探索技能</span>
        `;
        primarySidebarGroup.appendChild(skillExploreNavButton);

        const automationNavButton = document.createElement("a");
        automationNavButton.className = "nav-item";
        automationNavButton.href = "./automation.html";
        automationNavButton.dataset.navTarget = "automation-workspace";
        automationNavButton.innerHTML = `
          <svg class="icon nav-item-icon" viewBox="0 0 24 24">
            <rect x="4.5" y="5" width="15" height="15" rx="3"></rect>
            <path d="M8 3.5v3"></path>
            <path d="M16 3.5v3"></path>
            <path d="M7.5 11h9"></path>
            <path d="M12 11v5"></path>
            <path d="m12 16 2 2"></path>
          </svg>
          <span>定时任务</span>
        `;
        primarySidebarGroup.appendChild(automationNavButton);
      }
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
      const {
        gptWorkspaceItems,
        myGptsItems,
        libraryWorkspaceCollections,
        personalKnowledgeBases,
        automationTaskGroups,
        skillExploreGroups,
        assistantShells,
        sessionContentMap,
        regulationSessionContentMap,
        generatedAnswerTemplatesByAssistant
      } = window.AssistAiPrototypeData;

      const context = {
        workspaceView,
        mainLayout,
        crumbTitle,
        escapeHtml,
        updateTopbarRight,
        setCurrentLibraryTab(value) {
          currentLibraryTab = value;
        }
      };

      const gptsRenderers = window.AssistAiPrototypeWorkspaces?.gpts?.createRendererSet(context) || {};
      const libraryRenderers = window.AssistAiPrototypeWorkspaces?.library?.createRendererSet(context) || {};
      const automationRenderers = window.AssistAiPrototypeWorkspaces?.automation?.createRendererSet(context) || {};
      const exploreRenderers = window.AssistAiPrototypeWorkspaces?.explore?.createRendererSet(context) || {};

      const { renderMyGptsWorkspace = () => {}, renderCreateGptWorkspace = () => {}, renderWorkspace = () => {} } = gptsRenderers;
      const { renderLibraryWorkspace = () => {} } = libraryRenderers;
      const { renderAutomationWorkspace = () => {} } = automationRenderers;
      const { renderSkillExploreWorkspace = () => {} } = exploreRenderers;
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
        renderLibraryWorkspace(currentLibraryTab);
      }

      function showAutomationWorkspaceState() {
        mainLayout.classList.add("is-workspace");
        mainLayout.classList.remove("is-empty");
        mainLayout.classList.remove("is-focus-mode");
        focusModeButton?.classList.remove("is-active");
        activateNav("automation-workspace");
        newChatButton.classList.remove("is-active");
        crumbTitle.textContent = "定时任务";
        crumb?.classList.remove("is-hidden");
        closeHistoryMenu();
        resetComposerUploads();
        composerInputs.forEach((field) => {
          field.value = "";
        });
        closeMobileNav();
        renderAutomationWorkspace();
      }

      function showSkillExploreWorkspaceState() {
        mainLayout.classList.add("is-workspace");
        mainLayout.classList.remove("is-empty");
        mainLayout.classList.remove("is-focus-mode");
        focusModeButton?.classList.remove("is-active");
        activateNav("skill-explore-workspace");
        newChatButton.classList.remove("is-active");
        crumbTitle.textContent = "探索技能";
        crumb?.classList.remove("is-hidden");
        closeHistoryMenu();
        resetComposerUploads();
        composerInputs.forEach((field) => {
          field.value = "";
        });
        closeMobileNav();
        renderSkillExploreWorkspace();
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
          if (target === "skill-explore-workspace") {
            showSkillExploreWorkspaceState();
            return;
          }
          if (target === "automation-workspace") {
            showAutomationWorkspaceState();
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

      if (collapseButton) {
        collapseButton.addEventListener("click", toggleSidebarSurface);
      }
      if (sidebarTrigger) {
        sidebarTrigger.addEventListener("click", toggleSidebarSurface);
      }
      if (mobileBackdrop) {
        mobileBackdrop.addEventListener("click", closeMobileNav);
      }
      if (historyToggle) {
        historyToggle.addEventListener("click", () => {
          const nextCollapsed = !historyGroup?.classList.contains("is-collapsed");
          historyGroup?.classList.toggle("is-collapsed", nextCollapsed);
          historyToggle.setAttribute("aria-expanded", String(!nextCollapsed));
        });
      }
      if (profileButton) {
        profileButton.addEventListener("click", () => {
          const nextOpen = !profileMenu?.classList.contains("is-open");
          closeHistoryMenu();
          closeProfileMenu();
          if (nextOpen) {
            profileMenu?.classList.add("is-open");
            profileMenu?.setAttribute("aria-hidden", "false");
          }
        });
      }

      profileMenuItems.forEach((item) => {
        item.addEventListener("click", () => {
          const action = item.dataset.action;
          closeProfileMenu();
          showFeedback(action === "settings" ? "已打开设置（演示）" : "已退出登录（演示）");
        });
      });

      if (focusModeButton) {
        focusModeButton.addEventListener("click", () => {
          const nextState = !mainLayout.classList.contains("is-focus-mode");
          mainLayout.classList.toggle("is-focus-mode", nextState);
          focusModeButton.classList.toggle("is-active", nextState);
          showFeedback(nextState ? "已切换到专注阅读" : "已退出专注阅读");
        });
      }

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
          } else if (action === "create-automation") {
            showFeedback("已打开新建定时任务表单（演示）");
          } else if (action === "automation-log") {
            showFeedback("已打开执行日志（演示）");
          } else if (action === "edit-automation") {
            showFeedback("已进入任务规则编辑页（演示）");
          } else if (action === "run-automation") {
            showFeedback("已触发一次立即执行（演示）");
          } else if (action === "skill-filter") {
            showFeedback("已切换到推荐排序（演示）");
          } else if (action === "skill-request") {
            showFeedback("已打开技能需求提报表单（演示）");
          } else if (action === "preview-skill") {
            showFeedback("已打开技能详情页（演示）");
          } else if (action === "launch-skill") {
            showFeedback("已进入技能体验流程（演示）");
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
        } else if (action === "create-automation") {
          showFeedback("已打开新建定时任务表单（演示）");
        } else if (action === "automation-log") {
          showFeedback("已打开执行日志（演示）");
        } else if (action === "skill-filter") {
          showFeedback("已切换到推荐排序（演示）");
        } else if (action === "skill-request") {
          showFeedback("已打开技能需求提报表单（演示）");
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
        } else if (initialView === "skill-explore") {
          showSkillExploreWorkspaceState();
        } else if (initialView === "automation") {
          showAutomationWorkspaceState();
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
    
