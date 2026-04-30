# Left Sidebar Baseline

静态页来源：
- [index.html](/Users/xinpeilu/common/workspace/AI/assistai-ui/index.html)
- [logo.svg](/Users/xinpeilu/common/workspace/AI/assistai-ui/logo.svg)

用途：
- 作为 `ChatGemini/apps/assistant-web` 里 `SidebarV2` 的左侧对齐基线
- 后续不再靠肉眼逼近，先按这份清单逐项匹配
- 只有旧工程结构无法直接承接的地方，再单独讨论

## 1. 全局基线

### 布局尺寸
- 侧栏宽度：`272px`
- 侧栏内边距：`14px 14px 12px`
- 侧栏行间主节奏：`14px`
- 顶部品牌区和新建会话之间的距离：
  - `sidebar-top` 自身无下边距
  - `new-chat` 的 `margin-top: 8px`

### 背景与分隔
- 侧栏背景：
  - `linear-gradient(180deg, rgba(246, 248, 250, 0.98), rgba(241, 244, 247, 0.98))`
- 右侧分隔线：
  - `border-right: 1px solid rgba(216, 224, 230, 0.92)`

### 文字颜色层级
- 一级主文字：
  - `rgba(47, 58, 70, 0.98)`
- 二级历史列表文字：
  - `rgba(84, 95, 107, 0.96)`
- 二级历史 hover/active 后文字：
  - `rgba(72, 84, 96, 0.98)`
- 辅助浅灰：
  - `rgba(118, 129, 141, 0.88)` 到 `rgba(128, 138, 148, 0.9)`

## 2. 顶部品牌区

DOM：
- `.sidebar-top`
- `.sidebar-brand`
- `.brand`
- `.brand-title`
- `.collapse-btn`

### 容器
- `.sidebar-top`
  - `display: flex`
  - `align-items: center`
  - `justify-content: space-between`
  - `padding: 0 4px`

### Logo
- `.brand`
  - `34px * 34px`
  - `border-radius: 0`
  - `background: transparent`
  - `box-shadow: none`
- `.brand img`
  - `28px * 28px`
  - `object-fit: contain`
- 资源文件：
  - 使用外部 [logo.svg](/Users/xinpeilu/common/workspace/AI/assistai-ui/logo.svg)
- 主色：
  - `#54BED5`
- 说明：
  - 若 `logo.svg` 资源本身更新，以资源实际 `fill` 为准

### 标题
- 文案：`企业 AI 助手`
- `.brand-title`
  - `font-size: 15px`
  - `font-weight: 400`
  - `letter-spacing: -0.01em`
  - `line-height: 1.2`
  - `transform: translateY(1px)`

### 收起按钮
- `.collapse-btn`
  - `30px * 30px`
  - `border-radius: 9px`
  - `color: var(--text-faint)`，实际来自浅灰体系
- hover
  - `background: rgba(255, 255, 255, 0.92)`
  - `color: var(--text-soft)`

## 3. 新建会话

DOM：
- `.new-chat`
- `.new-chat-main`
- `.new-chat-side`

### 外框
- 高度：`min-height: 48px`
- 内边距：`0 13px`
- 圆角：`14px`
- 边框：
  - `1px solid rgba(220, 227, 233, 0.94)`
- 背景：
  - `rgba(251, 252, 253, 0.92)`
- 阴影：
  - `0 5px 14px rgba(23, 28, 38, 0.025)`
  - `0 0 0 1px rgba(133, 210, 226, 0.02)`

### 主文案
- `.new-chat-main`
  - `gap: 10px`
  - `font-size: 14px`
  - `font-weight: 400`
  - `color: rgba(47, 58, 70, 0.98)`

### 主图标
- 使用通用 `.icon`
- 颜色：
  - `.new-chat-main .icon { color: rgba(89, 180, 199, 0.92); }`

### hover
- `transform: translateY(-1px)`
- `border-color: rgba(194, 208, 216, 0.98)`
- `background: rgba(252, 253, 254, 0.98)`
- 阴影：
  - `0 7px 16px rgba(23, 28, 38, 0.032)`
  - `0 0 0 1px rgba(133, 210, 226, 0.028)`

### active / selected
- `border-color: rgba(184, 204, 213, 0.98)`
- `background: rgba(252, 253, 254, 0.98)`
- 阴影：
  - `inset 0 0 0 1px rgba(225, 232, 237, 0.92)`
  - `0 6px 14px rgba(23, 28, 38, 0.028)`

### 快捷键块（静态页里当前已移除，但历史基线保留）
- `.keycap`
  - 最小宽：`24px`
  - 高：`24px`
  - `padding: 0 6px`
  - 圆角：`8px`
  - 字号：`11px`
  - 字重：`600`

## 4. 侧栏滚动区

- `.sidebar-scroll`
  - `display: grid`
  - `align-content: start`
  - `gap: 14px`
  - `padding-right: 2px`
  - `overflow-y: auto`
- 滚动条
  - 宽：`8px`
  - thumb：
    - `background: rgba(197, 203, 213, 0.8)`
    - `border-radius: 999px`

## 5. 历史会话标题

DOM：
- `.history-group`
- `.section-title`
- `.section-title-main`
- `.section-toggle-icon`

### 容器
- `.section-title`
  - 高：`40px`
  - `padding: 0 14px`
  - `border-radius: 10px`
  - `font-size: 14px`
  - `font-weight: 400`
  - `letter-spacing: -0.01em`
  - `color: rgba(47, 58, 70, 0.98)`

### 内部
- `.section-title-main`
  - `gap: 10px`
- 左侧时钟图标：
  - 使用通用 `.icon`
- 右侧箭头：
  - `.icon.icon-sm.section-toggle-icon`
  - 颜色：`rgba(128, 138, 148, 0.9)`
- 折叠态：
  - `.history-group.is-collapsed .section-toggle-icon { transform: rotate(-90deg); }`

### hover
- `background: rgba(255, 255, 255, 0.62)`

## 6. 历史列表

DOM：
- `.history-list`
- `.history-entry`
- `.history-item`
- `.history-more`

### 列表整体
- `.history-list`
  - `display: grid`
  - `gap: 4px`
  - `padding: 0 6px 0 26px`

### 单项尺寸
- `.history-item`
  - 高：`32px`
  - `padding: 0 38px 0 12px`
  - 圆角：`10px`
  - 字号：`13px`
  - 字重：`400`
  - 默认文字色：`rgba(84, 95, 107, 0.96)`

### hover
- 自身位移：
  - `.history-item:hover { transform: translateX(2px); }`
- 整条 hover 背景：
  - `background: rgba(255, 255, 255, 0.88)`
  - `color: rgba(72, 84, 96, 0.98)`

### active
- 背景：
  - `rgba(255, 255, 255, 0.98)`
- 文字：
  - `rgba(72, 84, 96, 0.98)`
- 阴影：
  - `inset 0 0 0 1px rgba(228, 233, 238, 0.98)`
  - `0 6px 14px rgba(24, 31, 41, 0.03)`

### “查看全部”
- 复用 `.history-item`
- 额外类：
  - `.more`
- 颜色：
  - `var(--text-soft)`

## 7. 历史项三点按钮

DOM：
- `.history-more`
- 内部图标为 3 个圆点 `circle`

### 按钮容器
- 位置：
  - `position: absolute`
  - `top: 50%`
  - `right: 6px`
  - `transform: translateY(-50%)`
- 尺寸：
  - `24px * 24px`
- 圆角：
  - `6px`
- 默认颜色：
  - `rgba(118, 129, 141, 0.88)`
- 默认状态：
  - `opacity: 0`
  - `pointer-events: none`

### 显示时机
- `history-entry:hover`
- `history-entry:focus-within`
- `history-entry.is-menu-open`

### hover / menu-open
- 背景：
  - `rgba(255, 255, 255, 0.9)`
- 颜色：
  - `rgba(72, 84, 96, 0.94)`

### 图标细节
- SVG 使用 `.icon.icon-sm`
- 3 个圆点：
  - `cx: 7 / 12 / 17`
  - `cy: 12`
  - `r: 1.25`

## 8. 历史菜单浮层

DOM：
- `.history-menu`
- `.history-menu-item`

### 浮层
- 宽：`156px`
- `padding: 6px`
- `gap: 1px`
- 圆角：`16px`
- 边框：
  - `1px solid rgba(232, 236, 240, 0.98)`
- 背景：
  - `rgba(253, 253, 254, 0.99)`
- 阴影：
  - `0 18px 36px rgba(23, 28, 38, 0.08)`
  - `0 2px 8px rgba(23, 28, 38, 0.035)`

### 菜单项
- 高：`36px`
- `padding: 0 9px`
- `gap: 8px`
- 圆角：`10px`
- 字号：`14px`
- 字重：`400`
- 默认颜色：
  - `rgba(56, 67, 79, 0.96)`

### hover
- `background: rgba(244, 247, 250, 0.96)`

### danger
- 颜色：
  - `rgba(184, 72, 72, 0.96)`

### 菜单内容（当前静态页）
- `编辑标题`
- `置顶`
- `删除`

## 9. 底部用户区

DOM：
- `.sidebar-footer`
- `.profile`
- `.profile-main`
- `.avatar`
- `.profile-name`

### 容器
- `.sidebar-footer`
  - `padding-top: 10px`
  - `gap: 3px`
  - 顶部分隔线：
    - `1px solid rgba(220, 227, 232, 0.92)`

### 用户主行
- `.profile`
  - 高：`44px`
  - `padding: 0 8px 0 10px`
  - 圆角：`12px`
  - `background: transparent`
  - `border: 0`
  - `box-shadow: none`

### 用户名区域
- `.profile-main`
  - `gap: 9px`
- `.profile-name`
  - `font-size: 14px`
  - `font-weight: 400`
  - `color: rgba(47, 58, 70, 0.98)`

### 头像
- `.avatar`
  - `30px * 30px`
  - 圆形
  - 字号：`12px`
  - 字重：`600`
  - 背景渐变：
    - `linear-gradient(180deg, rgba(212, 146, 114, 0.96), rgba(190, 124, 95, 0.96))`

## 10. 用户菜单浮层

DOM：
- `.profile-menu`
- `.profile-menu-item`

### 浮层
- 定位：
  - `left: -14px`
  - `right: -14px`
  - `bottom: calc(100% + 6px)`
- `padding: 10px 14px 8px`
- `gap: 2px`
- 圆角：`0`
- 边框：`0`
- 背景：
  - 与侧栏相同
  - `linear-gradient(180deg, rgba(246, 248, 250, 0.98), rgba(241, 244, 247, 0.98))`
- 阴影：`none`

### 菜单项
- 高：`36px`
- `padding: 0 10px`
- `gap: 8px`
- 圆角：`10px`
- 字号：`13px`
- 字重：`400`
- 默认颜色：
  - `rgba(56, 67, 79, 0.96)`

### hover
- `background: rgba(244, 247, 250, 0.96)`

### danger
- 颜色：
  - `rgba(184, 72, 72, 0.96)`

### 菜单内容（当前静态页）
- `设置`
- `退出`

## 11. 通用图标基线

### 默认图标 `.icon`
- 尺寸：
  - `18px * 18px`
- 颜色：
  - `stroke: currentColor`
- 描边：
  - `stroke-width: 1.8`
- 填充：
  - `fill: none`
- 端点：
  - `stroke-linecap: round`
  - `stroke-linejoin: round`

### 小图标 `.icon-sm`
- 尺寸：
  - `16px * 16px`

### 左侧图标使用策略
- 一级标题、按钮、折叠箭头、菜单项图标几乎都复用 `.icon` 或 `.icon-sm`
- 左侧没有独立多色图标系统，基本都是单色线框图标
- 唯一例外是：
  - 顶部品牌 logo 用外部 `logo.svg`
  - 底部头像是字母圆形块，不是 SVG

## 12. 图标清单

### 顶部
- 品牌：`logo.svg`
- 收起侧栏：
  - 外框矩形 + 中间竖分隔线

### 新建会话
- 圆环加号：
  - `circle + vertical line + horizontal line`

### 历史会话标题
- 时钟：
  - 外圆 + 竖针 + 斜针

### 历史项更多
- 横向三点：
  - 3 个 `circle`

### 历史菜单
- 编辑标题：斜笔/编辑路径
- 置顶：上箭头钉住结构
- 删除：垃圾桶

### 用户菜单
- 设置：齿轮
- 退出：门外箭头
- 用户菜单触发器：向下箭头

## 13. 交互基线

### 左侧整体原则
- 默认安静
- hover 只提一层浅白
- active 不上品牌色，只做浅白面和轻阴影
- 品牌色只在：
  - logo
  - 新建会话左侧加号
  - 极少数强调点位

### 不应轻易改变的点
- 历史会话默认和 active 都不要改成青色底
- 用户区不要恢复成白卡按钮感
- 历史菜单不要再加粗大边框和重阴影
- 三点按钮不要变成英文 `...`

## 14. 与 ChatV2 对齐时的优先顺序

先对齐这些硬值：
1. 侧栏总宽：`272px`
2. 顶部品牌区尺寸：`34 / 28 / 15`
3. 新建会话：`48px` 高，`14px` 字
4. 历史标题：`40px / 14px`
5. 历史项：`32px / 13px / padding-right 38px`
6. 三点按钮：`24px`
7. 底部用户行：`44px`
8. 用户菜单：满侧栏宽、无边框、零圆角

再对齐这些软值：
1. 文字颜色层级
2. hover / active 背景透明度
3. 阴影强弱
4. 图标描边味道

## 15. 待确认 / 原页面可能匹配不到的点

这些后续需要单独看旧工程结构是否能直接承接：
- `history-menu` 的固定定位展开方向逻辑
- `profile-menu` 贴满整条侧栏宽度的实现方式
- 历史项三点按钮的 hover 出现时机与事件穿透
- `translateX(2px)` 这种 hover 微位移是否要完全保留
- 侧栏背景渐变与旧工程整页背景叠加后的真实观感

如果旧工程结构无法 1:1 承接，优先保留：
- 尺寸
- 间距
- 字重
- 图标风格

而不是优先保留动画和细小 hover 效果。
