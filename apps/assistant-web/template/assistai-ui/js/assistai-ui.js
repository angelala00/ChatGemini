const assistAiPrototypeRoot = document.getElementById("assistai-root");

if (!assistAiPrototypeRoot) {
  throw new Error("Missing #assistai-root container for AssistAI prototype.");
}

assistAiPrototypeRoot.innerHTML = `
    <div class="app-shell h-screen w-screen p-0 m-0 overflow-hidden bg-[var(--bg)] font-sans">
      <div class="app group peer h-full grid grid-cols-[272px_minmax(0,1fr)] max-[1120px]:grid-cols-[248px_minmax(0,1fr)] max-[900px]:grid-cols-1 [&.is-sidebar-hidden]:grid-cols-[0_minmax(0,1fr)] border-0 rounded-none overflow-hidden bg-[rgba(249,251,252,0.92)] shadow-none transition-all duration-180 ease-out">
        <aside class="sidebar h-full grid grid-rows-[auto_auto_1fr_auto] gap-3.5 p-[14px_14px_12px] bg-gradient-to-b from-[rgba(246,248,250,0.98)] to-[rgba(241,244,247,0.98)] border-r border-[rgba(216,224,230,0.92)] overflow-hidden transition-all duration-180 ease-out max-[900px]:fixed max-[900px]:top-0 max-[900px]:left-0 max-[900px]:bottom-0 max-[900px]:w-[min(82vw,320px)] max-[900px]:z-30 max-[900px]:shadow-[0_18px_48px_rgba(23,28,38,0.16)] max-[900px]:translate-x-[-100%] max-[900px]:opacity-0 max-[900px]:pointer-events-none group-[.is-sidebar-hidden]:!translate-x-[-24px] group-[.is-sidebar-hidden]:!opacity-0 group-[.is-sidebar-hidden]:!pointer-events-none group-[.is-mobile-nav-open]:!translate-x-0 group-[.is-mobile-nav-open]:!opacity-100 group-[.is-mobile-nav-open]:!pointer-events-auto">
          <div class="sidebar-top flex items-center justify-between px-1">
            <div class="sidebar-brand min-w-0 inline-flex items-center gap-2.5">
              <div class="brand w-[34px] h-[34px] flex-none grid place-items-center rounded-none bg-transparent text-white shadow-none" aria-label="AssistAI">
                <img class="w-7 h-7 block object-contain" src="./assets/logo.svg" alt="AssistAI 标志" />
              </div>
              <span class="brand-title min-w-0 text-[rgba(47,58,70,0.98)] text-[15px] font-normal tracking-[-0.01em] whitespace-nowrap translate-y-[1px]">企业 AI 助手</span>
            </div>
            <button class="collapse-btn w-[30px] h-[30px] grid place-items-center rounded-[9px] text-[var(--text-faint)] transition-all duration-160 hover:bg-white/92 hover:text-[var(--text-soft)]" aria-label="收起侧栏">
              <svg class="icon w-[18px] h-[18px] stroke-currentColor stroke-[1.8] fill-none stroke-linecap-round stroke-linejoin-round" viewBox="0 0 24 24">
                <rect x="4" y="5" width="16" height="14" rx="2"></rect>
                <path d="M10 5v14"></path>
              </svg>
            </button>
          </div>

          <button class="new-chat flex items-center justify-between gap-3 mt-2 min-h-[48px] px-3.25 rounded-[14px] border border-[rgba(220,227,233,0.94)] bg-[rgba(251,252,253,0.92)] shadow-[0_5px_14px_rgba(23,28,38,0.025),0_0_0_1px_rgba(133,210,226,0.02)] transition-all duration-160 ease-out hover:-translate-y-0.5 hover:border-[rgba(194,208,216,0.98)] hover:bg-[rgba(252,253,254,0.98)] hover:shadow-[0_7px_16px_rgba(23,28,38,0.032),0_0_0_1px_rgba(133,210,226,0.028)] active:translate-y-0 active:border-[rgba(184,204,213,0.98)] active:bg-[rgba(252,253,254,0.98)] active:shadow-[inset_0_0_0_1px_rgba(225,232,237,0.92),0_6px_14px_rgba(23,28,38,0.028)]">
            <span class="new-chat-main inline-flex items-center gap-2.5 text-sm font-normal text-[rgba(47,58,70,0.98)]">
              <svg class="icon text-[rgba(89,180,199,0.92)] w-[18px] h-[18px] stroke-currentColor stroke-[1.8] fill-none stroke-linecap-round stroke-linejoin-round" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9"></circle>
                <path d="M12 8v8"></path>
                <path d="M8 12h8"></path>
              </svg>
              <span>新建会话</span>
            </span>
          </button>

          <div class="sidebar-scroll min-h-0 overflow-y-auto overflow-x-hidden grid align-content-start gap-3.5 pr-0.5">
            <div class="sidebar-group grid gap-1.5">
              <a class="nav-item w-full min-h-[42px] px-2.5 flex items-center gap-[11px] text-left rounded-[10px] text-[rgba(47,58,70,0.98)] text-[15px] font-normal transition-all duration-160 ease-out hover:bg-white/72 active:bg-white/72 [&.is-active]:bg-white/98 [&.is-active]:text-[rgba(38,49,61,0.98)] [&.is-active]:shadow-[inset_0_0_0_1px_rgba(228,233,238,0.98),0_6px_14px_rgba(24,31,41,0.03)]" data-nav-target="library-workspace" href="./library.html">
                <svg class="icon nav-item-icon w-[22px] h-[22px] text-[#54bed5] flex-none" viewBox="0 0 24 24">
                  <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4H19v16H7.5A2.5 2.5 0 0 0 5 22z"></path>
                  <path d="M8 8h7"></path>
                  <path d="M8 12h7"></path>
                  <path d="M8 16h5"></path>
                </svg>
                <span>资料库</span>
              </a>
              <a class="nav-item w-full min-h-[42px] px-2.5 flex items-center gap-[11px] text-left rounded-[10px] text-[rgba(47,58,70,0.98)] text-[15px] font-normal transition-all duration-160 ease-out hover:bg-white/72 active:bg-white/72 [&.is-active]:bg-white/98 [&.is-active]:text-[rgba(38,49,61,0.98)] [&.is-active]:shadow-[inset_0_0_0_1px_rgba(228,233,238,0.98),0_6px_14px_rgba(24,31,41,0.03)]" data-nav-target="gpts-workspace" href="./gpts.html">
                <img class="nav-item-logo w-[22px] h-[22px] block object-contain flex-none" src="../../src/assets/icons/apps.svg" alt="" />
                <span>智能体广场</span>
              </a>
              <a class="nav-item w-full min-h-[42px] px-2.5 flex items-center gap-[11px] text-left rounded-[10px] text-[rgba(47,58,70,0.98)] text-[15px] font-normal transition-all duration-160 ease-out hover:bg-white/72 active:bg-white/72 [&.is-active]:bg-white/98 [&.is-active]:text-[rgba(38,49,61,0.98)] [&.is-active]:shadow-[inset_0_0_0_1px_rgba(228,233,238,0.98),0_6px_14px_rgba(24,31,41,0.03)]" data-nav-target="regulation-assistant" href="./policy.html">
                <img class="nav-item-logo w-[22px] h-[22px] block object-contain flex-none" src="../../public/gpts/policy.svg" alt="" />
                <span>制度助手</span>
              </a>
            </div>
            <div class="sidebar-group history-group group/history relative grid gap-1.5">
              <button class="section-title history-toggle w-full inline-flex items-center justify-between gap-2.5 min-h-[40px] px-3.5 text-left text-[rgba(47,58,70,0.98)] text-sm font-normal tracking-[-0.01em] rounded-[10px] transition-all duration-160 hover:bg-white/62" aria-expanded="true" aria-controls="historyList">
                <span class="section-title-main inline-flex items-center gap-2.5 min-w-0">
                  <svg class="icon w-[18px] h-[18px] stroke-currentColor stroke-[1.8] fill-none stroke-linecap-round stroke-linejoin-round" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="8"></circle>
                    <path d="M12 8v5"></path>
                    <path d="m12 13 3 2"></path>
                  </svg>
                  <span>历史会话</span>
                </span>
                <svg class="icon icon-sm section-toggle-icon ml-auto text-[rgba(128,138,148,0.9)] transition-transform duration-160 w-[16px] h-[16px] group-[.is-collapsed]/history:-rotate-90" viewBox="0 0 24 24">
                  <path d="m9 6 6 6-6 6"></path>
                </svg>
              </button>
              <div class="history-list grid gap-1 pl-6.5 pr-1.5 group-[.is-collapsed]/history:hidden" id="historyList">
                <div class="history-entry group/entry relative block">
                  <button class="history-item active w-full min-h-[32px] p-[0_38px_0_12px] flex items-center gap-[11px] text-left rounded-[10px] text-[rgba(72,84,96,0.98)] text-[13px] font-normal transition-all duration-160 bg-white/98 shadow-[inset_0_0_0_1px_rgba(228,233,238,0.98),0_6px_14px_rgba(24,31,41,0.03)]">入职 IT 工具使用指南</button>
                  <button class="history-more absolute top-1/2 right-1.5 -translate-y-1/2 w-6 h-6 grid place-items-center rounded-md text-[rgba(118,129,141,0.88)] opacity-0 pointer-events-none transition-all duration-160 hover:bg-white/90 hover:text-[rgba(72,84,96,0.94)] group-hover/entry:!opacity-100 group-hover/entry:!pointer-events-auto group-focus-within/entry:!opacity-100 group-focus-within/entry:!pointer-events-auto group-[.is-menu-open]/entry:!opacity-100 group-[.is-menu-open]/entry:!pointer-events-auto" aria-label="更多操作">
                    <svg class="icon icon-sm w-[16px] h-[16px]" viewBox="0 0 24 24">
                      <circle cx="7" cy="12" r="1.25"></circle>
                      <circle cx="12" cy="12" r="1.25"></circle>
                      <circle cx="17" cy="12" r="1.25"></circle>
                    </svg>
                  </button>
                </div>
                <div class="history-entry group/entry relative block">
                  <button class="history-item w-full min-h-[32px] p-[0_38px_0_12px] flex items-center gap-[11px] text-left rounded-[10px] text-[rgba(84,95,107,0.96)] text-[13px] font-normal transition-all duration-160 hover:translate-x-0.5 hover:bg-white/88 hover:text-[rgba(72,84,96,0.98)]">组织知识库建设节奏</button>
                  <button class="history-more absolute top-1/2 right-1.5 -translate-y-1/2 w-6 h-6 grid place-items-center rounded-md text-[rgba(118,129,141,0.88)] opacity-0 pointer-events-none transition-all duration-160 hover:bg-white/90 hover:text-[rgba(72,84,96,0.94)] group-hover/entry:!opacity-100 group-hover/entry:!pointer-events-auto group-focus-within/entry:!opacity-100 group-focus-within/entry:!pointer-events-auto group-[.is-menu-open]/entry:!opacity-100 group-[.is-menu-open]/entry:!pointer-events-auto" aria-label="更多操作">
                    <svg class="icon icon-sm w-[16px] h-[16px]" viewBox="0 0 24 24">
                      <circle cx="7" cy="12" r="1.25"></circle>
                      <circle cx="12" cy="12" r="1.25"></circle>
                      <circle cx="17" cy="12" r="1.25"></circle>
                    </svg>
                  </button>
                </div>
                <div class="history-entry group/entry relative block">
                  <button class="history-item w-full min-h-[32px] p-[0_38px_0_12px] flex items-center gap-[11px] text-left rounded-[10px] text-[rgba(84,95,107,0.96)] text-[13px] font-normal transition-all duration-160 hover:translate-x-0.5 hover:bg-white/88 hover:text-[rgba(72,84,96,0.98)]">销售周报自动汇总建议</button>
                  <button class="history-more absolute top-1/2 right-1.5 -translate-y-1/2 w-6 h-6 grid place-items-center rounded-md text-[rgba(118,129,141,0.88)] opacity-0 pointer-events-none transition-all duration-160 hover:bg-white/90 hover:text-[rgba(72,84,96,0.94)] group-hover/entry:!opacity-100 group-hover/entry:!pointer-events-auto group-focus-within/entry:!opacity-100 group-focus-within/entry:!pointer-events-auto group-[.is-menu-open]/entry:!opacity-100 group-[.is-menu-open]/entry:!pointer-events-auto" aria-label="更多操作">
                    <svg class="icon icon-sm w-[16px] h-[16px]" viewBox="0 0 24 24">
                      <circle cx="7" cy="12" r="1.25"></circle>
                      <circle cx="12" cy="12" r="1.25"></circle>
                      <circle cx="17" cy="12" r="1.25"></circle>
                    </svg>
                  </button>
                </div>
                <div class="history-entry group/entry relative block">
                  <button class="history-item w-full min-h-[32px] p-[0_38px_0_12px] flex items-center gap-[11px] text-left rounded-[10px] text-[rgba(84,95,107,0.96)] text-[13px] font-normal transition-all duration-160 hover:translate-x-0.5 hover:bg-white/88 hover:text-[rgba(72,84,96,0.98)]">财务共享流程说明整理</button>
                  <button class="history-more absolute top-1/2 right-1.5 -translate-y-1/2 w-6 h-6 grid place-items-center rounded-md text-[rgba(118,129,141,0.88)] opacity-0 pointer-events-none transition-all duration-160 hover:bg-white/90 hover:text-[rgba(72,84,96,0.94)] group-hover/entry:!opacity-100 group-hover/entry:!pointer-events-auto group-focus-within/entry:!opacity-100 group-focus-within/entry:!pointer-events-auto group-[.is-menu-open]/entry:!opacity-100 group-[.is-menu-open]/entry:!pointer-events-auto" aria-label="更多操作">
                    <svg class="icon icon-sm w-[16px] h-[16px]" viewBox="0 0 24 24">
                      <circle cx="7" cy="12" r="1.25"></circle>
                      <circle cx="12" cy="12" r="1.25"></circle>
                      <circle cx="17" cy="12" r="1.25"></circle>
                    </svg>
                  </button>
                </div>
                <div class="history-entry group/entry relative block">
                  <button class="history-item w-full min-h-[32px] p-[0_38px_0_12px] flex items-center gap-[11px] text-left rounded-[10px] text-[rgba(84,95,107,0.96)] text-[13px] font-normal transition-all duration-160 hover:translate-x-0.5 hover:bg-white/88 hover:text-[rgba(72,84,96,0.98)]">合同问答页面信息结构</button>
                  <button class="history-more absolute top-1/2 right-1.5 -translate-y-1/2 w-6 h-6 grid place-items-center rounded-md text-[rgba(118,129,141,0.88)] opacity-0 pointer-events-none transition-all duration-160 hover:bg-white/90 hover:text-[rgba(72,84,96,0.94)] group-hover/entry:!opacity-100 group-hover/entry:!pointer-events-auto group-focus-within/entry:!opacity-100 group-focus-within/entry:!pointer-events-auto group-[.is-menu-open]/entry:!opacity-100 group-[.is-menu-open]/entry:!pointer-events-auto" aria-label="更多操作">
                    <svg class="icon icon-sm w-[16px] h-[16px]" viewBox="0 0 24 24">
                      <circle cx="7" cy="12" r="1.25"></circle>
                      <circle cx="12" cy="12" r="1.25"></circle>
                      <circle cx="17" cy="12" r="1.25"></circle>
                    </svg>
                  </button>
                </div>
                <div class="history-entry group/entry relative block">
                  <button class="history-item w-full min-h-[32px] p-[0_38px_0_12px] flex items-center gap-[11px] text-left rounded-[10px] text-[rgba(84,95,107,0.96)] text-[13px] font-normal transition-all duration-160 hover:translate-x-0.5 hover:bg-white/88 hover:text-[rgba(72,84,96,0.98)]">客服 SOP 优化建议</button>
                  <button class="history-more absolute top-1/2 right-1.5 -translate-y-1/2 w-6 h-6 grid place-items-center rounded-md text-[rgba(118,129,141,0.88)] opacity-0 pointer-events-none transition-all duration-160 hover:bg-white/90 hover:text-[rgba(72,84,96,0.94)] group-hover/entry:!opacity-100 group-hover/entry:!pointer-events-auto group-focus-within/entry:!opacity-100 group-focus-within/entry:!pointer-events-auto group-[.is-menu-open]/entry:!opacity-100 group-[.is-menu-open]/entry:!pointer-events-auto" aria-label="更多操作">
                    <svg class="icon icon-sm w-[16px] h-[16px]" viewBox="0 0 24 24">
                      <circle cx="7" cy="12" r="1.25"></circle>
                      <circle cx="12" cy="12" r="1.25"></circle>
                      <circle cx="17" cy="12" r="1.25"></circle>
                    </svg>
                  </button>
                </div>
                <div class="history-entry group/entry relative block">
                  <button class="history-item w-full min-h-[32px] p-[0_38px_0_12px] flex items-center gap-[11px] text-left rounded-[10px] text-[rgba(84,95,107,0.96)] text-[13px] font-normal transition-all duration-160 hover:translate-x-0.5 hover:bg-white/88 hover:text-[rgba(72,84,96,0.98)]">项目周例会纪要摘要</button>
                  <button class="history-more absolute top-1/2 right-1.5 -translate-y-1/2 w-6 h-6 grid place-items-center rounded-md text-[rgba(118,129,141,0.88)] opacity-0 pointer-events-none transition-all duration-160 hover:bg-white/90 hover:text-[rgba(72,84,96,0.94)] group-hover/entry:!opacity-100 group-hover/entry:!pointer-events-auto group-focus-within/entry:!opacity-100 group-focus-within/entry:!pointer-events-auto group-[.is-menu-open]/entry:!opacity-100 group-[.is-menu-open]/entry:!pointer-events-auto" aria-label="更多操作">
                    <svg class="icon icon-sm w-[16px] h-[16px]" viewBox="0 0 24 24">
                      <circle cx="7" cy="12" r="1.25"></circle>
                      <circle cx="12" cy="12" r="1.25"></circle>
                      <circle cx="17" cy="12" r="1.25"></circle>
                    </svg>
                  </button>
                </div>
                <button class="history-item more w-full min-h-[32px] p-[0_38px_0_12px] flex items-center gap-[11px] text-left rounded-[10px] text-[var(--text-soft)] text-[13px] font-normal transition-all duration-160 hover:bg-white/72">查看全部</button>
              </div>
              <div class="history-menu fixed z-30 w-[156px] p-1.5 hidden [&.is-open]:!grid grid-flow-row gap-0.25 border border-[rgba(232,236,240,0.98)] rounded-2xl bg-[rgba(253,253,254,0.99)] shadow-[0_18px_36px_rgba(23,28,38,0.08),0_2px_8px_rgba(23,28,38,0.035)]" id="historyMenu" aria-hidden="true">
                <button class="history-menu-item min-h-[36px] px-2.25 inline-flex items-center gap-2 rounded-[10px] text-[rgba(56,67,79,0.96)] text-sm font-normal whitespace-nowrap transition-all duration-160 hover:bg-[rgba(244,247,250,0.96)]" data-action="rename">
                  <svg class="icon icon-sm w-[16px] h-[16px]" viewBox="0 0 24 24">
                    <path d="m4 20 4.5-1 9.7-9.7a2.1 2.1 0 0 0-3-3L5.5 16l-1.5 4z"></path>
                  </svg>
                  <span>编辑标题</span>
                </button>
                <button class="history-menu-item min-h-[36px] px-2.25 inline-flex items-center gap-2 rounded-[10px] text-[rgba(56,67,79,0.96)] text-sm font-normal whitespace-nowrap transition-all duration-160 hover:bg-[rgba(244,247,250,0.96)]" data-action="pin">
                  <svg class="icon icon-sm w-[16px] h-[16px]" viewBox="0 0 24 24">
                    <path d="M12 4v10"></path>
                    <path d="m8 8 4-4 4 4"></path>
                    <path d="M8 14h8"></path>
                  </svg>
                  <span>置顶</span>
                </button>
                <button class="history-menu-item is-danger min-h-[36px] px-2.25 inline-flex items-center gap-2 rounded-[10px] text-[rgba(184,72,72,0.96)] text-sm font-normal whitespace-nowrap transition-all duration-160 hover:bg-[rgba(244,247,250,0.96)]" data-action="delete">
                  <svg class="icon icon-sm w-[16px] h-[16px]" viewBox="0 0 24 24">
                    <path d="M4 7h16"></path>
                    <path d="M10 11v6"></path>
                    <path d="M14 11v6"></path>
                    <path d="M6 7l1 11a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-11"></path>
                    <path d="M9 7V4h6v3"></path>
                  </svg>
                  <span>删除</span>
                </button>
              </div>
            </div>
          </div>

          <div class="sidebar-footer relative grid gap-0.75 pt-2.5 border-t border-[rgba(220,227,232,0.92)]">
            <div class="profile-menu absolute left-[-14px] right-[-14px] bottom-[calc(100%+6px)] p-[10px_14px_8px] hidden [&.is-open]:!grid grid-flow-row gap-0.5 border-0 rounded-none bg-gradient-to-b from-[rgba(246,248,250,0.98)] to-[rgba(241,244,247,0.98)] shadow-none" id="profileMenu" aria-hidden="true">
              <button class="profile-menu-item min-h-[36px] px-2.5 inline-flex items-center gap-2 rounded-[10px] text-[rgba(56,67,79,0.96)] text-[13px] font-normal transition-all duration-160 hover:bg-[rgba(244,247,250,0.96)]" data-action="settings">
                <svg class="icon icon-sm w-[16px] h-[16px]" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="3"></circle>
                  <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h0a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 1 1.5h0a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v0a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1z"></path>
                </svg>
                <span>设置</span>
              </button>
              <button class="profile-menu-item is-danger min-h-[36px] px-2.5 inline-flex items-center gap-2 rounded-[10px] text-[rgba(184,72,72,0.96)] text-[13px] font-normal transition-all duration-160 hover:bg-[rgba(244,247,250,0.96)]" data-action="logout">
                <svg class="icon icon-sm w-[16px] h-[16px]" viewBox="0 0 24 24">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                  <path d="m16 17 5-5-5-5"></path>
                  <path d="M21 12H9"></path>
                </svg>
                <span>退出</span>
              </button>
            </div>
            <button class="profile w-full min-h-[44px] p-[0_8px_0_10px] flex items-center justify-between gap-[11px] text-left rounded-xl bg-transparent border-0 shadow-none hover:bg-white/72" aria-label="打开账号菜单">
              <span class="profile-main flex items-center gap-2.25 min-w-0">
                <span class="avatar w-[30px] h-[30px] grid place-items-center rounded-full bg-gradient-to-b from-[rgba(212,146,114,0.96)] to-[rgba(190,124,95,0.96)] text-white text-[12px] font-semibold shadow-none">Z</span>
                <span class="profile-name flex items-center gap-2 min-w-0 text-sm text-[rgba(47,58,70,0.98)] font-normal">zhangsan</span>
              </span>
              <svg class="icon icon-sm w-[16px] h-[16px]" viewBox="0 0 24 24">
                <path d="m6 9 6 6 6-6"></path>
              </svg>
            </button>
          </div>
        </aside>

        <main class="main min-w-0 min-h-0 bg-[rgba(255,255,255,0.98)]">
          <div class="main-layout group/main h-full grid grid-rows-[62px_minmax(0,1fr)_auto] max-[680px]:grid-rows-[54px_minmax(0,1fr)_auto] min-h-0 transition-all duration-180 [&.is-empty]:grid-rows-[62px_minmax(0,1fr)] max-[680px]:[&.is-empty]:grid-rows-[54px_minmax(0,1fr)] [&.is-workspace]:grid-rows-[62px_minmax(0,1fr)] max-[680px]:[&.is-workspace]:grid-rows-[54px_minmax(0,1fr)]">
            <header class="topbar flex items-center justify-between gap-4 px-6.5 max-[900px]:px-4 border-b border-[rgba(232,236,240,0.92)] bg-white/78 backdrop-blur-md">
              <div class="topbar-left inline-flex items-center gap-2.5 min-w-0">
                <button class="top-action sidebar-trigger hidden max-[900px]:inline-grid group-[.is-sidebar-hidden]:!inline-grid w-8 h-8 place-items-center rounded-[9px] text-[var(--text-soft)] bg-white/70 border border-[rgba(233,237,241,0.92)] transition-all duration-160 hover:bg-white/98 hover:text-[var(--text)]" aria-label="打开历史会话">
                  <svg class="icon w-[18px] h-[18px] stroke-currentColor stroke-[1.8] fill-none stroke-linecap-round stroke-linejoin-round" viewBox="0 0 24 24">
                    <path d="M4 7h16"></path>
                    <path d="M4 12h16"></path>
                    <path d="M4 17h16"></path>
                  </svg>
                </button>
                <div class="crumb inline-flex items-center gap-2 min-w-0 max-w-[280px] text-sm font-normal text-[var(--text)] [&.is-hidden]:hidden">
                  <span class="crumb-title truncate" id="crumbTitle">入职 IT 工具使用指南</span>
                </div>
              </div>
              <div class="topbar-right inline-flex items-center gap-2.5 min-w-0">
                <div class="action-feedback max-w-[240px] min-h-[28px] px-2.5 inline-flex items-center rounded-full bg-[rgba(246,249,251,0.96)] border border-[rgba(232,235,239,0.98)] text-[var(--text-soft)] text-[12px] whitespace-nowrap opacity-0 -translate-y-0.5 pointer-events-none transition-all duration-160 [&.is-visible]:opacity-1 [&.is-visible]:translate-y-0" id="actionFeedback" aria-live="polite"></div>
              </div>
            </header>

            <div class="main-scroll min-h-0 overflow-y-auto overflow-x-hidden">
              <div class="content group-[.is-empty]/main:!hidden group-[.is-workspace]/main:!hidden w-[min(100%,calc(830px+52px))] max-[1120px]:w-[min(100%,calc(830px+36px))] max-[1120px]:p-[28px_18px_38px] max-[900px]:w-[min(100%,calc(830px+20px))] max-[900px]:p-[22px_14px_30px] mx-auto p-[14px_26px_56px] transition-all duration-180">
                <article class="article grid gap-4.5 p-[2px_0_18px] max-[900px]:p-[2px_2px_6px]" id="articleThread"></article>
              </div>

              <div class="workspace-view hidden group-[.is-workspace]/main:!block" id="workspaceView"></div>

              <div class="empty-view hidden group-[.is-empty]/main:!flex w-full max-w-[1040px] min-h-full items-center justify-center">
                <div class="empty-shell w-full max-w-[920px] flex flex-col items-center justify-center gap-4.5 max-[680px]:gap-5.5">
                  <div class="empty-hero flex items-center gap-3.5 text-[var(--text)]">
                    <div class="empty-logo w-10 h-10 flex-none grid place-items-center rounded-none bg-transparent text-white shadow-none" aria-hidden="true">
                      <img id="emptyLogo" src="./assets/logo.svg" alt="" />
                    </div>
                    <h1 class="empty-title m-0 text-[28px] font-bold tracking-[-0.03em] max-[680px]:text-[28px]" id="emptyTitle">今天想让我帮你处理什么？</h1>
                  </div>
                  <p class="empty-support max-w-[600px] m-0 text-[var(--text-soft)] text-sm leading-[1.7] text-center max-[680px]:text-sm" id="emptySupport">
                    从制度查询、纪要整理到方案起草，这里更适合处理具体工作任务，而不是泛泛聊天。
                  </p>
                  <div class="suggestion-label mt-2 text-[var(--text-faint)] text-[12px] font-bold tracking-[0.04em]" id="emptySuggestionLabel">建议从这些常见任务开始</div>
                  <div class="suggestion-strip w-full max-w-[760px] flex flex-wrap justify-center gap-3" id="promptChipList">
                    <button class="prompt-chip min-h-[38px] px-4 inline-flex items-center gap-2 rounded-[14px] bg-white/96 border border-[rgba(232,235,239,0.98)] text-[var(--text-soft)] text-[13px] font-semibold transition-all duration-160 hover:-translate-y-0.5 hover:text-[var(--text)] hover:border-[rgba(189,223,230,0.95)] hover:shadow-[0_8px_18px_rgba(23,28,38,0.05)] active:translate-y-0" data-prompt="帮我整理一版新员工入职工具清单">整理入职清单</button>
                    <button class="prompt-chip min-h-[38px] px-4 inline-flex items-center gap-2 rounded-[14px] bg-white/96 border border-[rgba(232,235,239,0.98)] text-[var(--text-soft)] text-[13px] font-semibold transition-all duration-160 hover:-translate-y-0.5 hover:text-[var(--text)] hover:border-[rgba(189,223,230,0.95)] hover:shadow-[0_8px_18px_rgba(23,28,38,0.05)] active:translate-y-0" data-prompt="把这份流程说明改写成面向员工的 FAQ">改写流程 FAQ</button>
                    <button class="prompt-chip min-h-[38px] px-4 inline-flex items-center gap-2 rounded-[14px] bg-white/96 border border-[rgba(232,235,239,0.98)] text-[var(--text-soft)] text-[13px] font-semibold transition-all duration-160 hover:-translate-y-0.5 hover:text-[var(--text)] hover:border-[rgba(189,223,230,0.95)] hover:shadow-[0_8px_18px_rgba(23,28,38,0.05)] active:translate-y-0" data-prompt="根据会议纪要输出一版可执行行动项">提炼行动项</button>
                  </div>

                  <div class="empty-composer-area min-h-[calc(104px+22px)] w-[min(100%,calc(830px+52px))] max-[1120px]:w-[min(100%,calc(830px+36px))] max-[1120px]:p-[12px_18px_10px] max-[900px]:w-[min(100%,calc(830px+20px))] max-[900px]:p-[12px_14px_10px] mx-auto p-[12px_26px_10px] flex flex-col">
                    <div class="composer min-h-[104px] max-[680px]:min-h-[112px] flex-1 rounded-[22px] border border-[rgba(211,221,228,0.96)] bg-white shadow-[0_32px_62px_rgba(23,28,38,0.09),inset_0_1px_0_rgba(255,255,255,0.92)] p-[18px_18px_12px] flex flex-col gap-3 transition-all duration-160 focus-within:border-[rgba(189,223,230,0.98)] focus-within:shadow-[0_36px_72px_rgba(23,28,38,0.1),0_0_0_4px_rgba(71,185,210,0.11)]">
                      <div class="composer-upload hidden [&.is-visible]:!grid gap-3" aria-live="polite">
                        <div class="upload-file-grid flex flex-nowrap gap-3 items-stretch overflow-x-auto overflow-y-hidden"></div>
                      </div>
                      <textarea class="composer-input w-full min-h-[36px] flex-1 resize-none border-0 outline-none p-0 bg-transparent text-[var(--text)] text-[15px] leading-[1.7] overflow-hidden" id="emptyComposerInput" rows="2" placeholder="输入你的问题，我可以帮你查资料、写方案、整理内容"></textarea>
                      <input class="upload-input" type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.ppt,.pptx,image/*" hidden />
                      <div class="composer-bottom flex items-center justify-between gap-3.5 max-[680px]:flex-col max-[680px]:items-stretch">
                        <div class="composer-left inline-flex items-center gap-2.5 max-[680px]:justify-between">
                          <button class="round-btn text-[var(--accent-strong)] border-[rgba(189,223,230,0.95)] bg-[rgba(242,250,252,0.94)] w-10 h-10 rounded-xl inline-flex items-center justify-center transition-all duration-160 hover:-translate-y-0.5 active:translate-y-0" aria-label="添加" data-action="upload">
                            <svg class="icon w-[18px] h-[18px] stroke-currentColor stroke-[1.8] fill-none stroke-linecap-round stroke-linejoin-round" viewBox="0 0 24 24">
                              <path d="M12 5v14"></path>
                              <path d="M5 12h14"></path>
                            </svg>
                          </button>
                        </div>
                        <div class="composer-right inline-flex items-center gap-2.5 max-[680px]:justify-between">
                          <div class="model-select relative">
                            <button class="model-chip group/chip h-10 px-3 rounded-xl text-sm font-semibold text-[var(--accent-strong)] inline-flex items-center justify-center transition-all duration-160 hover:-translate-y-0.5 active:translate-y-0" aria-label="切换模型" aria-expanded="false">
                              <span>GLM-5.0</span>
                              <svg class="icon icon-sm ml-1 w-[16px] h-[16px] stroke-currentColor stroke-[1.8] fill-none stroke-linecap-round stroke-linejoin-round transition-transform duration-160 group-[.is-open]/chip:rotate-180 group-[.is-open]/chip:text-[var(--text-soft)]" viewBox="0 0 24 24">
                                <path d="m6 9 6 6 6-6"></path>
                              </svg>
                            </button>
                            <div class="model-menu absolute right-0 bottom-[calc(100%+8px)] min-w-[116px] p-1.5 hidden [&.is-open]:!grid grid-flow-row gap-0.5 border border-[rgba(232,236,240,0.98)] rounded-[14px] bg-[rgba(253,253,254,0.99)] shadow-[0_14px_28px_rgba(23,28,38,0.08),0_2px_8px_rgba(23,28,38,0.03)]" aria-hidden="true">
                              <button class="model-option min-h-[34px] px-2.5 inline-flex items-center rounded-xl text-[rgba(56,67,79,0.96)] text-[13px] font-normal whitespace-nowrap transition-all duration-160 hover:bg-[rgba(244,247,250,0.96)] is-active" data-model="GLM-5.0">GLM-5.0</button>
                              <button class="model-option min-h-[34px] px-2.5 inline-flex items-center rounded-xl text-[rgba(56,67,79,0.96)] text-[13px] font-normal whitespace-nowrap transition-all duration-160 hover:bg-[rgba(244,247,250,0.96)]" data-model="GLM-4.7">GLM-4.7</button>
                            </div>
                          </div>
                          <button class="send-btn w-9 h-9 rounded-xl bg-gradient-to-b from-[var(--send-start)] to-[var(--send-end)] text-white shadow-[0_8px_18px_rgba(63,170,194,0.24)] inline-flex items-center justify-center transition-all duration-160 hover:-translate-y-0.5 hover:shadow-[0_10px_22px_rgba(63,170,194,0.3)] active:translate-y-0" aria-label="发送">
                            <svg class="icon w-[18px] h-[18px] stroke-currentColor stroke-[1.8] fill-none stroke-linecap-round stroke-linejoin-round" viewBox="0 0 24 24">
                              <path d="M12 19V5"></path>
                              <path d="m6 11 6-6 6 6"></path>
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                    <div class="footnote mt-0.5 text-center text-[rgba(118,129,141,0.92)] text-[11px] flex-none">v1.0.1 XXX公司</div>
                  </div>
                </div>
              </div>
            </div>

            <div class="composer-wrap group-[.is-empty]/main:!hidden group-[.is-workspace]/main:!hidden border-t-0 bg-[rgba(255,255,255,0.98)]">
              <div class="composer-area min-h-[calc(104px+22px)] w-[min(100%,calc(830px+52px))] max-[1120px]:w-[min(100%,calc(830px+36px))] max-[1120px]:p-[12px_18px_10px] max-[900px]:w-[min(100%,calc(830px+20px))] max-[900px]:p-[12px_14px_10px] mx-auto p-[12px_26px_10px] flex flex-col">
                <div class="composer min-h-[104px] max-[680px]:min-h-[112px] flex-1 rounded-[22px] border border-[rgba(211,221,228,0.96)] bg-white shadow-[0_32px_62px_rgba(23,28,38,0.09),inset_0_1px_0_rgba(255,255,255,0.92)] p-[18px_18px_12px] flex flex-col gap-3 transition-all duration-160 focus-within:border-[rgba(189,223,230,0.98)] focus-within:shadow-[0_36px_72px_rgba(23,28,38,0.1),0_0_0_4px_rgba(71,185,210,0.11)]">
                  <div class="composer-upload hidden [&.is-visible]:!grid gap-3" aria-live="polite">
                    <div class="upload-file-grid flex flex-nowrap gap-3 items-stretch overflow-x-auto overflow-y-hidden"></div>
                  </div>
                  <textarea class="composer-input w-full min-h-[36px] flex-1 resize-none border-0 outline-none p-0 bg-transparent text-[var(--text)] text-[15px] leading-[1.7] overflow-hidden" id="articleComposerInput" rows="2" placeholder="继续提问，例如：帮我把这份说明整理成面向员工的 FAQ 版本"></textarea>
                  <input class="upload-input" type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.ppt,.pptx,image/*" hidden />
                  <div class="composer-bottom flex items-center justify-between gap-3.5 max-[680px]:flex-col max-[680px]:items-stretch">
                    <div class="composer-left inline-flex items-center gap-2.5 max-[680px]:justify-between">
                      <button class="round-btn text-[var(--accent-strong)] border-[rgba(189,223,230,0.95)] bg-[rgba(242,250,252,0.94)] w-10 h-10 rounded-xl inline-flex items-center justify-center transition-all duration-160 hover:-translate-y-0.5 active:translate-y-0" aria-label="添加" data-action="upload">
                        <svg class="icon w-[18px] h-[18px] stroke-currentColor stroke-[1.8] fill-none stroke-linecap-round stroke-linejoin-round" viewBox="0 0 24 24">
                          <path d="M12 5v14"></path>
                          <path d="M5 12h14"></path>
                        </svg>
                      </button>
                    </div>
                    <div class="composer-right inline-flex items-center gap-2.5 max-[680px]:justify-between">
                      <div class="model-select relative">
                        <button class="model-chip group/chip h-10 px-3 rounded-xl text-sm font-semibold text-[var(--accent-strong)] inline-flex items-center justify-center transition-all duration-160 hover:-translate-y-0.5 active:translate-y-0" aria-label="切换模型" aria-expanded="false">
                          <span>GLM-5.0</span>
                          <svg class="icon icon-sm ml-1 w-[16px] h-[16px] stroke-currentColor stroke-[1.8] fill-none stroke-linecap-round stroke-linejoin-round" viewBox="0 0 24 24">
                            <path d="m6 9 6 6 6-6"></path>
                          </svg>
                        </button>
                        <div class="model-menu absolute right-0 bottom-[calc(100%+8px)] min-w-[116px] p-1.5 hidden [&.is-open]:!grid grid-flow-row gap-0.5 border border-[rgba(232,236,240,0.98)] rounded-[14px] bg-[rgba(253,253,254,0.99)] shadow-[0_14px_28px_rgba(23,28,38,0.08),0_2px_8px_rgba(23,28,38,0.03)]" aria-hidden="true">
                          <button class="model-option min-h-[34px] px-2.5 inline-flex items-center rounded-xl text-[rgba(56,67,79,0.96)] text-[13px] font-normal whitespace-nowrap transition-all duration-160 hover:bg-[rgba(244,247,250,0.96)] is-active" data-model="GLM-5.0">GLM-5.0</button>
                          <button class="model-option min-h-[34px] px-2.5 inline-flex items-center rounded-xl text-[rgba(56,67,79,0.96)] text-[13px] font-normal whitespace-nowrap transition-all duration-160 hover:bg-[rgba(244,247,250,0.96)]" data-model="GLM-4.7">GLM-4.7</button>
                        </div>
                      </div>
                      <button class="send-btn w-9 h-9 rounded-xl bg-gradient-to-b from-[var(--send-start)] to-[var(--send-end)] text-white shadow-[0_8px_18px_rgba(63,170,194,0.24)] inline-flex items-center justify-center transition-all duration-160 hover:-translate-y-0.5 hover:shadow-[0_10px_22px_rgba(63,170,194,0.3)] active:translate-y-0" aria-label="发送">
                        <svg class="icon w-[18px] h-[18px] stroke-currentColor stroke-[1.8] fill-none stroke-linecap-round stroke-linejoin-round" viewBox="0 0 24 24">
                          <path d="M12 19V5"></path>
                          <path d="m6 11 6-6 6 6"></path>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
                <div class="footnote mt-0.5 text-center text-[rgba(118,129,141,0.92)] text-[11px] flex-none">v1.0.1 XXX公司</div>
              </div>
            </div>
          </div>
        </main>
      </div>
      <div class="mobile-backdrop fixed inset-0 hidden bg-[rgba(12,24,32,0.16)] opacity-0 pointer-events-none transition-all duration-160 z-20 peer-[.is-mobile-nav-open]:!block peer-[.is-mobile-nav-open]:!opacity-100 peer-[.is-mobile-nav-open]:!pointer-events-auto" aria-hidden="true"></div>
    </div>
`;

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
        skillExploreNavButton.className = "nav-item w-full min-h-[42px] px-2.5 flex items-center gap-[11px] text-left rounded-[10px] text-[rgba(47,58,70,0.98)] text-[15px] font-normal transition-all duration-160 ease-out hover:bg-white/72 active:bg-white/72 [&.is-active]:bg-white/98 [&.is-active]:text-[rgba(38,49,61,0.98)] [&.is-active]:shadow-[inset_0_0_0_1px_rgba(228,233,238,0.98),0_6px_14px_rgba(24,31,41,0.03)]";
        skillExploreNavButton.href = "./explore.html";
        skillExploreNavButton.dataset.navTarget = "skill-explore-workspace";
        skillExploreNavButton.innerHTML = `
          <svg class="icon nav-item-icon w-[22px] h-[22px] text-[#54bed5] flex-none" viewBox="0 0 24 24">
            <path d="M12 3.5 14.7 9l5.9.9-4.3 4.2 1 5.9-5.3-2.8-5.3 2.8 1-5.9-4.3-4.2L9.3 9z"></path>
          </svg>
          <span>探索技能</span>
        `;
        primarySidebarGroup.appendChild(skillExploreNavButton);

        const automationNavButton = document.createElement("a");
        automationNavButton.className = "nav-item w-full min-h-[42px] px-2.5 flex items-center gap-[11px] text-left rounded-[10px] text-[rgba(47,58,70,0.98)] text-[15px] font-normal transition-all duration-160 ease-out hover:bg-white/72 active:bg-white/72 [&.is-active]:bg-white/98 [&.is-active]:text-[rgba(38,49,61,0.98)] [&.is-active]:shadow-[inset_0_0_0_1px_rgba(228,233,238,0.98),0_6px_14px_rgba(24,31,41,0.03)]";
        automationNavButton.href = "./automation.html";
        automationNavButton.dataset.navTarget = "automation-workspace";
        automationNavButton.innerHTML = `
          <svg class="icon nav-item-icon w-[22px] h-[22px] text-[#54bed5] flex-none" viewBox="0 0 24 24">
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
              <div class="upload-file-card relative min-w-0 flex-[0_0_320px] w-[320px] p-[12px_42px_12px_12px] flex items-center gap-3 rounded-2xl bg-[rgba(248,249,251,0.98)] border border-[rgba(235,238,242,0.98)] shadow-[inset_0_1px_0_rgba(255,255,255,0.92)]">
                <div class="upload-file-icon w-[34px] h-[34px] flex-none grid place-items-center rounded-xl text-[rgba(255,255,255,0.94)] bg-gradient-to-b from-[var(--send-start)] to-[var(--send-end)] border border-[rgba(171,220,228,0.92)] shadow-[0_4px_10px_rgba(63,170,194,0.1)] ${presentation.iconClass}">
                  ${presentation.icon}
                </div>
                <div class="upload-file-meta min-w-0 grid gap-1">
                  <div class="upload-file-name whitespace-nowrap overflow-hidden text-ellipsis text-[var(--text)] text-sm font-semibold">${escapeHtml(file.name)}</div>
                  <div class="upload-file-subtitle text-[var(--text-faint)] text-xs font-medium">${presentation.typeLabel} · ${sizeLabel}</div>
                </div>
                <button class="upload-file-remove absolute top-2.25 right-2.25 w-6 h-6 grid place-items-center rounded-lg text-[rgba(118,129,141,0.88)] transition-all duration-160 hover:bg-[rgba(238,242,246,0.96)] hover:text-[var(--text-soft)]" type="button" data-upload-remove="${index}" aria-label="移除文件">
                  <svg class="icon icon-sm w-[16px] h-[16px]" viewBox="0 0 24 24">
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
            icon: `<svg class="icon icon-sm w-[16px] h-[16px] stroke-currentColor stroke-[1.8] fill-none stroke-linecap-round stroke-linejoin-round" viewBox="0 0 24 24"><path d="M12 3v11"></path><path d="m8 10 4-7 4 7"></path><path d="M10 18h4"></path><path d="M9 21h6"></path></svg>`,
            paragraphs: [first]
          },
          {
            title: "核心思路",
            icon: `<svg class="icon icon-sm w-[16px] h-[16px] stroke-currentColor stroke-[1.8] fill-none stroke-linecap-round stroke-linejoin-round" viewBox="0 0 24 24"><path d="M4 12h16"></path><path d="M12 4v16"></path><circle cx="12" cy="12" r="8"></circle></svg>`,
            paragraphs: coreParagraphs
          }
        ];

        if (safeParagraphs.length > 1) {
          sections.push({
            title: "下一步建议",
            icon: `<svg class="icon icon-sm w-[16px] h-[16px] stroke-currentColor stroke-[1.8] fill-none stroke-linecap-round stroke-linejoin-round" viewBox="0 0 24 24"><path d="M5 12h14"></path><path d="m13 6 6 6-6 6"></path></svg>`,
            paragraphs: [last]
          });
        }

        return sections
          .map(
            (section) => `
              <section class="response-section grid gap-3 first:pt-0 pt-0.5">
                <div class="response-heading inline-flex items-center gap-2.5 text-[rgba(39,49,61,0.96)] text-[15px] font-medium tracking-[-0.01em]">
                  ${section.icon}
                  <span>${section.title}</span>
                </div>
                <div class="response-divider w-[34px] h-0 border-t-[3px] border-dotted border-[rgba(110,120,132,0.72)]" aria-hidden="true"></div>
                <div class="response-copy grid gap-3.5">
                  ${section.paragraphs.map((text) => `<p class="m-0 text-[var(--text)] text-[15px] leading-[1.86]">${escapeHtml(text)}</p>`).join("")}
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
          <div class="message-row user-row flex items-start gap-2 justify-end">
            <p class="article-intro m-0 max-w-[min(72%,680px)] p-[14px_16px] rounded-2xl bg-gradient-to-b from-[rgba(246,248,250,0.98)] to-[rgba(241,244,247,0.98)] border border-[rgba(233,237,241,0.98)] shadow-[0_4px_12px_rgba(23,28,38,0.02)] text-[var(--text)] text-[15px] leading-[1.85]">${escapeHtml(session.user)}</p>
          </div>
          <div class="message-row agent-row flex items-start gap-3.5 mt-3.5 justify-start">
            <div class="agent-avatar w-[30px] h-[30px] flex-none grid place-items-center rounded-full bg-[var(--brand-mark)] text-white shadow-[0_6px_14px_rgba(84,190,213,0.16)] mt-0" aria-hidden="true">
              <img class="w-3.5 h-3.5 block object-contain opacity-100" src="${currentShell.avatar}" alt="" />
            </div>
            <section class="text-card group/textcard flex-1 w-auto max-w-[860px] relative">
              <div class="response-panel grid gap-[22px] p-0 border-0 rounded-none bg-transparent shadow-none">
                ${assistantSections}
              </div>
              <div class="assistant-actions flex items-center gap-2 mt-2 p-0 border-t-0 opacity-32 transition-opacity duration-160 group-hover/textcard:opacity-100 group-focus-within/textcard:opacity-100">
                <button class="meta-action w-6 h-6 grid place-items-center rounded-md text-[rgba(120,130,141,0.94)] opacity-86 transition-all duration-160 hover:bg-black/5 hover:text-[var(--text)] hover:opacity-100" aria-label="刷新演示结果">
                  <svg class="icon w-[18px] h-[18px] stroke-currentColor stroke-[1.8] fill-none stroke-linecap-round stroke-linejoin-round" viewBox="0 0 24 24">
                    <path d="M7.2 8.3A6.5 6.5 0 0 1 18 10"></path>
                    <path d="M17.5 5.5V10H13"></path>
                    <path d="M16.8 15.7A6.5 6.5 0 0 1 6 14"></path>
                    <path d="M6.5 18.5V14H11"></path>
                  </svg>
                </button>
                <button class="meta-action w-6 h-6 grid place-items-center rounded-md text-[rgba(120,130,141,0.94)] opacity-86 transition-all duration-160 hover:bg-black/5 hover:text-[var(--text)] hover:opacity-100" aria-label="导出内容">
                  <svg class="icon w-[18px] h-[18px] stroke-currentColor stroke-[1.8] fill-none stroke-linecap-round stroke-linejoin-round" viewBox="0 0 24 24">
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
    
