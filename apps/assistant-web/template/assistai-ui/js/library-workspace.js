(function () {
  const {
    libraryWorkspaceCollections,
    personalKnowledgeBases
  } = window.AssistAiPrototypeData;

  window.AssistAiPrototypeWorkspaces = window.AssistAiPrototypeWorkspaces || {};
  window.AssistAiPrototypeWorkspaces.library = {
    createRendererSet(deps) {
      const {
        workspaceView,
        escapeHtml,
        setCurrentLibraryTab
      } = deps;

      function renderLibraryWorkspace(activeTab) {
        if (!workspaceView) return;
        const nextTab = activeTab || "files";
        setCurrentLibraryTab(nextTab);
        workspaceView.innerHTML = `
          <div class="workspace-shell w-[min(100%,1180px)] mx-auto p-[36px_26px_72px] max-[900px]:p-[24px_14px_56px]">
            <section class="workspace-hero">
              <div class="workspace-hero-top">
                <div>
                  <div class="workspace-kicker inline-flex items-center gap-2 text-[rgba(65,156,175,0.98)] text-[11px] font-bold tracking-[0.13em] uppercase">
                    <svg class="icon" viewBox="0 0 24 24">
                      <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4H19v16H7.5A2.5 2.5 0 0 0 5 22z"></path>
                      <path d="M8 8h7"></path>
                      <path d="M8 12h7"></path>
                      <path d="M8 16h5"></path>
                    </svg>
                    资料库
                  </div>
                  <h1 class="workspace-title mt-2.5 mx-0 mb-0 text-[rgba(38,49,61,0.98)] text-[30px] font-semibold tracking-[-0.03em] max-[680px]:text-2xl">个人资料库</h1>
                  <p class="workspace-subtitle max-w-[640px] mt-2.5 mx-0 mb-0 text-[rgba(97,109,121,0.96)] text-sm leading-[1.7]">先用一个静态页面模拟个人资料库首页，后续可以逐步接入真实文件、标签、分组和检索能力。当前重点是先把导航和页面层级跑通。</p>
                </div>
                <div class="workspace-actions">
                  <button class="workspace-action min-h-10 px-4 inline-flex items-center gap-2 rounded-[13px] border border-[rgba(232,236,240,0.98)] bg-white/84 text-[rgba(86,97,109,0.98)] text-sm font-medium transition-all duration-160 hover:border-[rgba(211,220,227,0.98)] hover:bg-white hover:text-[rgba(72,84,96,0.98)] hover:-translate-y-0.5 active:translate-y-0" data-library-action="search">搜索资料</button>
                  <button class="workspace-action primary min-h-10 px-4 inline-flex items-center gap-2 rounded-[13px] border border-[rgba(67,169,193,0.2)] bg-gradient-to-b from-[rgba(109,207,228,0.98)] to-[rgba(71,185,210,0.98)] text-white text-sm font-medium shadow-[0_8px_20px_rgba(71,185,210,0.22)] transition-all duration-160 hover:-translate-y-0.5 hover:shadow-[0_10px_22px_rgba(71,185,210,0.3)] active:translate-y-0" data-library-action="upload">上传资料</button>
                </div>
              </div>
            </section>
            <section class="workspace-section mt-10">
              <div class="library-tabs inline-flex gap-2 p-1.5 rounded-2xl bg-[rgba(244,247,250,0.96)] border border-[rgba(232,236,240,0.98)]">
                  <button class="library-tab min-h-[38px] px-3.5 inline-flex items-center rounded-xl text-sm font-semibold transition-all duration-[160ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] ${nextTab === "files" ? "is-active bg-[rgba(255,255,255,0.98)] text-[rgba(38,49,61,0.98)] shadow-[0_4px_12px_rgba(23,28,38,0.04)]" : "text-[rgba(96,107,119,0.96)]"}" data-library-tab="files">文件资料</button>
                  <button class="library-tab min-h-[38px] px-3.5 inline-flex items-center rounded-xl text-sm font-semibold transition-all duration-[160ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] ${nextTab === "knowledge" ? "is-active bg-[rgba(255,255,255,0.98)] text-[rgba(38,49,61,0.98)] shadow-[0_4px_12px_rgba(23,28,38,0.04)]" : "text-[rgba(96,107,119,0.96)]"}" data-library-tab="knowledge">知识库</button>
              </div>
            </section>
            <section class="workspace-section mt-10">
              <div class="library-panel rounded-[22px] border border-[rgba(232,236,240,0.98)] bg-[rgba(252,253,254,0.92)] shadow-[var(--shadow-sm)]">
                <div class="library-panel-header flex items-center justify-between gap-3 pt-5 px-[22px] pb-3.5">
                  <div>
                      <h2 class="library-panel-title m-0 text-[rgba(38,49,61,0.98)] text-base font-semibold tracking-[-0.01em]">${nextTab === "files" ? "最近文件资料" : "我的知识库"}</h2>
                      <p class="library-panel-subtitle mt-1.5 mb-0 text-[rgba(105,116,127,0.96)] text-[13px] leading-[1.65]">${nextTab === "files"
                        ? "这里先模拟你个人常用的文件资料分组，后面可以继续决定是按目录、标签还是项目来组织。"
                        : "这里先模拟已经做过 RAG 化处理的知识库集合，后面可以继续补索引状态、命中效果和挂载到助手的关系。"}
                      </p>
                    </div>
                    <span class="workspace-section-count min-w-8 min-h-[28px] px-2.5 inline-grid place-items-center rounded-full border border-[rgba(232,236,240,0.98)] bg-white/74 text-[rgba(113,123,134,0.94)] text-[12px] font-semibold">${nextTab === "files" ? libraryWorkspaceCollections.length : personalKnowledgeBases.length}</span>
                  </div>
                  ${nextTab === "files" ? `
                  <div class="library-list grid gap-2.5 pb-4 px-4">
                    ${libraryWorkspaceCollections.map((item) => `
                      <div class="library-item flex items-center justify-between gap-4 p-3.5 rounded-2xl border border-[rgba(236,239,243,0.98)] bg-[rgba(255,255,255,0.88)]">
                        <div class="library-item-main min-w-0 flex items-center gap-3">
                          <div class="library-item-icon w-10 h-10 flex-none grid place-items-center rounded-[14px] bg-[rgba(240,248,250,0.96)] text-[rgba(60,164,185,0.98)]">
                            <svg class="icon" viewBox="0 0 24 24">
                              <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4H19v16H7.5A2.5 2.5 0 0 0 5 22z"></path>
                              <path d="M8 8h7"></path>
                              <path d="M8 12h7"></path>
                            </svg>
                          </div>
                          <div>
                            <h3 class="library-item-name m-0 text-[rgba(38,49,61,0.98)] text-sm font-semibold">${escapeHtml(item.name)}</h3>
                            <p class="library-item-meta mt-1 mb-0 text-[rgba(110,121,132,0.95)] text-xs leading-[1.7]">最近更新 ${escapeHtml(item.updatedAt)} · ${item.fileCount} 份资料 · ${escapeHtml(item.scope)}</p>
                          </div>
                        </div>
                        <div class="library-item-tags flex flex-wrap gap-1.5 justify-end">
                          ${item.tags.map((tag) => `<span class="library-tag min-h-[24px] px-[9px] inline-flex items-center rounded-full bg-[rgba(243,247,249,0.96)] text-[rgba(96,107,119,0.96)] text-xs font-medium">${escapeHtml(tag)}</span>`).join("")}
                        </div>
                      </div>
                    `).join("")}
                  </div>
                ` : `
                  <div class="knowledge-grid grid gap-3 pb-4 px-4">
                    ${personalKnowledgeBases.map((item) => `
                      <div class="knowledge-card p-4 grid gap-3 rounded-[18px] border border-[rgba(236,239,243,0.98)] bg-[rgba(255,255,255,0.88)]">
                        <div class="knowledge-card-top flex items-start justify-between gap-3">
                          <div>
                            <h3 class="knowledge-card-name m-0 text-[rgba(38,49,61,0.98)] text-[15px] font-semibold">${escapeHtml(item.name)}</h3>
                            <p class="knowledge-card-desc mt-1.5 mb-0 text-[rgba(105,116,127,0.96)] text-[13px] leading-[1.7]">${escapeHtml(item.desc)}</p>
                          </div>
                          <span class="knowledge-meta-pill min-h-[26px] px-2.5 inline-flex items-center rounded-full bg-[rgba(240,248,250,0.96)] text-[rgba(71,154,173,0.98)] text-xs font-semibold">${escapeHtml(item.status)}</span>
                        </div>
                        <div class="knowledge-card-meta flex flex-wrap gap-2">
                          <span class="library-tag min-h-[24px] px-[9px] inline-flex items-center rounded-full bg-[rgba(243,247,249,0.96)] text-[rgba(96,107,119,0.96)] text-xs font-medium">分块 ${item.chunkCount}</span>
                          <span class="library-tag min-h-[24px] px-[9px] inline-flex items-center rounded-full bg-[rgba(243,247,249,0.96)] text-[rgba(96,107,119,0.96)] text-xs font-medium">源文件 ${item.sourceCount}</span>
                          <span class="library-tag min-h-[24px] px-[9px] inline-flex items-center rounded-full bg-[rgba(243,247,249,0.96)] text-[rgba(96,107,119,0.96)] text-xs font-medium">RAG 检索</span>
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

      return {
        renderLibraryWorkspace
      };
    }
  };
})();