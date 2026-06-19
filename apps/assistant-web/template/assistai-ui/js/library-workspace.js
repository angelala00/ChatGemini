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
                  <button class="library-tab ${nextTab === "files" ? "is-active" : ""}" data-library-tab="files">文件资料</button>
                  <button class="library-tab ${nextTab === "knowledge" ? "is-active" : ""}" data-library-tab="knowledge">知识库</button>
              </div>
            </section>
            <section class="workspace-section">
              <div class="library-panel">
                <div class="library-panel-header">
                  <div>
                      <h2 class="library-panel-title">${nextTab === "files" ? "最近文件资料" : "我的知识库"}</h2>
                      <p class="library-panel-subtitle">${nextTab === "files"
                        ? "这里先模拟你个人常用的文件资料分组，后面可以继续决定是按目录、标签还是项目来组织。"
                        : "这里先模拟已经做过 RAG 化处理的知识库集合，后面可以继续补索引状态、命中效果和挂载到助手的关系。"}
                      </p>
                    </div>
                    <span class="workspace-section-count">${nextTab === "files" ? libraryWorkspaceCollections.length : personalKnowledgeBases.length}</span>
                  </div>
                  ${nextTab === "files" ? `
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

      return {
        renderLibraryWorkspace
      };
    }
  };
})();