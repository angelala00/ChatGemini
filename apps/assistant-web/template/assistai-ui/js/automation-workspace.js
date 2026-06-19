(function () {
  const {
    automationTaskGroups
  } = window.AssistAiPrototypeData;

  window.AssistAiPrototypeWorkspaces = window.AssistAiPrototypeWorkspaces || {};
  window.AssistAiPrototypeWorkspaces.automation = {
    createRendererSet(deps) {
      const {
        workspaceView,
        escapeHtml,
        updateTopbarRight
      } = deps;

      function renderAutomationWorkspace() {
        if (!workspaceView) return;
        updateTopbarRight(`
          <button class="topbar-nav-btn" data-workspace-action="create-automation">
            <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 5v14"></path>
              <path d="M5 12h14"></path>
            </svg>
            新建任务
          </button>
          <button class="topbar-nav-btn primary" data-workspace-action="automation-log">
            查看执行日志
          </button>
        `);
        workspaceView.innerHTML = `
          <div class="workspace-shell">
            <section class="workspace-hero automation-hero">
              <div class="workspace-hero-top automation-hero-top">
                <div>
                  <div class="workspace-kicker">
                    <svg class="icon" viewBox="0 0 24 24">
                      <rect x="4.5" y="5" width="15" height="15" rx="3"></rect>
                      <path d="M8 3.5v3"></path>
                      <path d="M16 3.5v3"></path>
                      <path d="M7.5 11h9"></path>
                    </svg>
                    定时任务
                  </div>
                  <h1 class="workspace-title">自动化日程工作台</h1>
                  <p class="workspace-subtitle">这里先用一个静态首页 mock 定时任务能力，重点展示任务列表、执行时间、归属人和触达渠道。后续如果继续细化，可以再补 cron 配置、启停、日志和失败告警。</p>
                </div>
                <div class="automation-metrics">
                  <div class="automation-metric-card">
                    <span class="automation-metric-label">运行中</span>
                    <strong class="automation-metric-value">6</strong>
                    <span class="automation-metric-note">含 2 个今日待触发</span>
                  </div>
                  <div class="automation-metric-card">
                    <span class="automation-metric-label">平均节省</span>
                    <strong class="automation-metric-value">4.5h</strong>
                    <span class="automation-metric-note">按周估算人工整理时间</span>
                  </div>
                </div>
              </div>
            </section>
            ${automationTaskGroups.map((group) => `
              <section class="workspace-section">
                <div class="workspace-section-head">
                  <div>
                    <h2 class="workspace-section-title">${escapeHtml(group.title)}</h2>
                    <p class="workspace-section-desc">${escapeHtml(group.desc)}</p>
                  </div>
                  <span class="workspace-section-count">${group.tasks.length}</span>
                </div>
                <div class="automation-grid">
                  ${group.tasks.map((task) => `
                    <article class="automation-card">
                      <div class="automation-card-top">
                        <div>
                          <h3 class="automation-card-title">${escapeHtml(task.name)}</h3>
                          <p class="automation-card-summary">${escapeHtml(task.summary)}</p>
                        </div>
                        <span class="automation-status-badge">${escapeHtml(task.status)}</span>
                      </div>
                      <dl class="automation-meta">
                        <div class="automation-meta-item">
                          <dt>执行时间</dt>
                          <dd>${escapeHtml(task.schedule)}</dd>
                        </div>
                        <div class="automation-meta-item">
                          <dt>负责人</dt>
                          <dd>${escapeHtml(task.owner)}</dd>
                        </div>
                        <div class="automation-meta-item is-wide">
                          <dt>触达渠道</dt>
                          <dd>${escapeHtml(task.channel)}</dd>
                        </div>
                      </dl>
                      <div class="automation-actions">
                        <button class="workspace-action" data-workspace-action="edit-automation">编辑规则</button>
                        <button class="workspace-action primary" data-workspace-action="run-automation">立即执行</button>
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
        renderAutomationWorkspace
      };
    }
  };
})();