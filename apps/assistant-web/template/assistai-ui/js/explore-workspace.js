(function () {
  const {
    skillExploreGroups
  } = window.AssistAiPrototypeData;

  window.AssistAiPrototypeWorkspaces = window.AssistAiPrototypeWorkspaces || {};
  window.AssistAiPrototypeWorkspaces.explore = {
    createRendererSet(deps) {
      const {
        workspaceView,
        escapeHtml,
        updateTopbarRight
      } = deps;

      function renderSkillExploreWorkspace() {
        if (!workspaceView) return;
        updateTopbarRight(`
          <button class="topbar-nav-btn" data-workspace-action="skill-filter">
            推荐排序
          </button>
          <button class="topbar-nav-btn primary" data-workspace-action="skill-request">
            提交技能需求
          </button>
        `);
        workspaceView.innerHTML = `
          <div class="workspace-shell">
            <section class="workspace-hero skill-explore-hero">
              <div class="workspace-hero-top skill-explore-hero-top">
                <div>
                  <div class="workspace-kicker">
                    <svg class="icon" viewBox="0 0 24 24">
                      <path d="M12 3.5 14.7 9l5.9.9-4.3 4.2 1 5.9-5.3-2.8-5.3 2.8 1-5.9-4.3-4.2L9.3 9z"></path>
                    </svg>
                    探索技能
                  </div>
                  <h1 class="workspace-title">技能探索广场</h1>
                  <p class="workspace-subtitle">这里先 mock 一个“探索技能”首页，重点展示推荐技能、适用场景和预期输出。后续如果继续细化，可以再补搜索、筛选、详情页和一键收藏。</p>
                </div>
                <div class="skill-explore-stats">
                  <div class="skill-explore-stat">
                    <span class="skill-explore-stat-label">本周新增</span>
                    <strong class="skill-explore-stat-value">12</strong>
                    <span class="skill-explore-stat-note">覆盖纪要、FAQ、周报和待办拆解</span>
                  </div>
                  <div class="skill-explore-stat">
                    <span class="skill-explore-stat-label">常用场景</span>
                    <strong class="skill-explore-stat-value">8</strong>
                    <span class="skill-explore-stat-note">已按业务任务做过一轮归类</span>
                  </div>
                </div>
              </div>
            </section>
            ${skillExploreGroups.map((group) => `
              <section class="workspace-section">
                <div class="workspace-section-head">
                  <div>
                    <h2 class="workspace-section-title">${escapeHtml(group.title)}</h2>
                    <p class="workspace-section-desc">${escapeHtml(group.desc)}</p>
                  </div>
                  <span class="workspace-section-count">${group.skills.length}</span>
                </div>
                <div class="skill-explore-grid">
                  ${group.skills.map((skill) => `
                    <article class="skill-card">
                      <div class="skill-card-top">
                        <div>
                          <div class="skill-card-badge">${escapeHtml(skill.badge)}</div>
                          <h3 class="skill-card-title">${escapeHtml(skill.name)}</h3>
                          <p class="skill-card-summary">${escapeHtml(skill.summary)}</p>
                        </div>
                        <span class="skill-card-owner">${escapeHtml(skill.owner)}</span>
                      </div>
                      <dl class="skill-card-meta">
                        <div class="skill-card-meta-item">
                          <dt>适用场景</dt>
                          <dd>${escapeHtml(skill.scenario)}</dd>
                        </div>
                        <div class="skill-card-meta-item">
                          <dt>输出结果</dt>
                          <dd>${escapeHtml(skill.outputs)}</dd>
                        </div>
                      </dl>
                      <div class="skill-card-actions">
                        <button class="workspace-action" data-workspace-action="preview-skill">查看详情</button>
                        <button class="workspace-action primary" data-workspace-action="launch-skill">${escapeHtml(skill.cta)}</button>
                      </div>
                    </article>
                  `).join("")}
                </div>
              </section>
            `).join("")}
          </div>
        `;
      }

      return {
        renderSkillExploreWorkspace
      };
    }
  };
})();