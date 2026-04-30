# ChatGemini 模版接入方案

## 目标

把当前 `assistai-ui` 这套企业 AI 助手页面，落成 `ChatGemini/apps/assistant-web` 可复用的企业版聊天模版。

目标不是直接复制静态页，而是把它拆成可维护、可替换、可逐步接入的前端组件壳。

## 接入项目

- 项目根目录：`/Users/xinpeilu/common/workspace/AI/ChatGemini`
- 目标应用：`/Users/xinpeilu/common/workspace/AI/ChatGemini/apps/assistant-web`

## 当前项目结构判断

`assistant-web` 当前是：

- React 18
- Vite
- TypeScript
- Tailwind 风格 class
- 现有核心文件：
  - `src/views/Chat.tsx`
  - `src/components/Sidebar.tsx`
  - `src/components/Session.tsx`
  - `src/components/InputArea.tsx`

结论：

- 不适合把当前静态 `index.html` 整页直接塞进去
- 适合把当前页面拆成一套 `ChatV2 Shell`

## 总体原则

- 不先动业务逻辑
- 不先改 Redux / session 数据结构
- 不先改上传、刷新、导出、SSE 链路
- 先做新壳，再接旧数据
- 先并存，再替换
- 现阶段只改 UI
- 交互逻辑只做支撑 UI 所需的最小调整
- 新版必须与旧版并行，不影响旧页面、旧组件、旧路由

## 本轮改造边界

这次改造的定位很明确：

- 是一轮前端 UI 改版
- 不是一轮前后端联动改造
- 不是一轮交互逻辑重构
- 不是一轮默认页替换

因此所有改动都要满足下面 4 条硬约束：

### 1. 不改后台

这里的“不改后台”包括：

- 不改接口
- 不改请求参数结构
- 不改响应结构
- 不改会话存储结构
- 不改模型真实切换能力
- 不改上传链路
- 不改 SSE / 流式返回链路

### 2. 只为 UI 做最小交互补线

允许做的交互调整，只能是为了让新版 UI 壳正常工作。

例如：

- 把当前模型名透传给 `InputAreaV2`
- 给历史项菜单补一个开关状态
- 给顶部栏补 sidebar toggle
- 给用户菜单补打开 / 关闭状态

不允许做的事情：

- 顺手重写旧交互逻辑
- 顺手重构 session 行为
- 顺手统一旧版和新版的内部事件流

### 3. 新版必须完全并行

新版要单独拎出来，不得影响旧版。

具体要求：

- 新增 `ChatV2`，不替换 `Chat`
- 新增 `InputAreaV2`，不覆盖 `InputArea`
- 新增 `SessionV2`，不覆盖 `Session`
- 新增 `SidebarV2`，不直接重写 `Sidebar`
- 新增路由，不改旧路由入口

### 4. 旧版必须零回归

只要旧版页面还能访问，就不能因为这轮改造出现回退。

最低要求：

- 旧页面路由不变
- 旧页面功能不变
- 旧页面样式不变
- 旧组件对现有调用方无 breaking change

## 功能差异处理规则

在 `assistai-ui` 静态页与 `ChatGemini assistant-web` 现有能力之间，必然会出现功能差异。后续执行时，不允许临场拍脑袋处理，统一按下面规则判断。

### 1. 旧工程已有、静态页未体现的功能

默认：

- 保留逻辑
- 不因为 V2 UI 改版而删除

V2 中的处理方式只允许三选一：

- 隐藏入口
- 弱化呈现
- 最小补齐

判断原则：

- 如果该功能不是当前企业助手主流程的核心能力，优先隐藏或弱化
- 如果该功能影响主流程，即使静态页没画，也不能直接丢掉
- 但它的 UI 呈现必须服从 V2 风格，不允许把旧 UI 原样搬进来

### 2. 静态页体现、旧工程没有承接能力的功能

默认：

- 不扩展后台
- 不新增接口
- 不新增数据结构依赖

当前阶段只允许：

- 做纯前端 UI
- 做假交互
- 或暂不接入

禁止：

- 为了还原静态页而顺手增加后端能力
- 为了补齐视觉而发明新的业务链路

### 3. 主流程必须能力的优先级

如果某项能力虽然没有在静态页上明确体现，但它属于当前页面主流程必须项，例如：

- 会话切换
- 消息发送 / 中断
- 当前会话上下文识别
- 基本用户入口

那么：

- 不能删除
- 不能仅因为静态页没画而忽略
- 必须以符合 V2 风格的方式重新设计入口

### 4. 差异项必须登记

后续每遇到一项差异，都要记录到方案或执行清单中，至少写明：

- 差异项名称
- 它属于哪一类
- 当前处理决定

允许的处理决定只有：

- 保留并弱化
- 重新设计入口
- 做纯 UI 占位
- 暂不接入

### 5. 总判断原则

一句话总结：

- 以静态页为视觉蓝本
- 以旧工程能力为功能边界

这意味着：

- 视觉尽量向静态页靠
- 功能不超出旧工程承接范围
- 旧能力不乱删
- 静态页新增能力不乱造

## 推荐落地方式

新增一套企业版聊天壳，而不是直接覆盖旧页面：

- `src/views/ChatV2.tsx`
- `src/components/chat-v2/SidebarV2.tsx`
- `src/components/chat-v2/SessionV2.tsx`
- `src/components/chat-v2/InputAreaV2.tsx`
- `src/components/chat-v2/TopbarV2.tsx`
- `src/components/chat-v2/menus/HistoryItemMenu.tsx`
- `src/components/chat-v2/menus/ProfileMenu.tsx`
- `src/components/chat-v2/chat-v2.css`

## 为什么这样拆

### 1. Sidebar

现有 `Sidebar.tsx` 逻辑较重，包含：

- 会话列表
- 菜单操作
- GPTs 相关能力
- locale 切换
- 版本信息

直接硬改风险大，建议先做 `SidebarV2.tsx`。

### 2. Session

现有 `Session.tsx` 已经绑定了：

- 编辑
- 刷新
- 删除
- 导出
- 用户 / 模型角色区分

适合保留行为层，只换渲染壳。

### 3. InputArea

`InputArea.tsx` 独立性最高，最适合第一步替换，因为：

- 改动收益最大
- 风险最小
- 最能快速拉开新旧页面观感

### 4. Chat

`Chat.tsx` 最适合最后统一：

- 页面壳层
- 固定高度
- 滚动关系
- 左右区域布局

## 推荐实施顺序

### 第一阶段：抽设计 token

建议先落在：

- `src/index.css`
  或
- `src/components/chat-v2/chat-v2.css`

至少先抽这些变量：

- `--c-bg`
- `--c-panel`
- `--c-sidebar`
- `--c-line`
- `--c-text`
- `--c-text-soft`
- `--c-accent`
- `--c-accent-strong`
- `--radius-sm`
- `--radius-md`
- `--radius-lg`
- `--radius-xl`
- `--shadow-sm`
- `--shadow-md`
- `--layout-sidebar-width`
- `--layout-content-max`
- `--layout-composer-max`

### 第二阶段：做 InputAreaV2

目标：

- 替换成当前企业版大输入框
- 保留原提交逻辑
- 保留上传逻辑
- 保留中断逻辑
- 接入轻量模型选择

不改：

- `InputAreaProps`
- 提交行为
- 上传行为

### 第三阶段：做 SessionV2

目标：

- 用户气泡样式
- 助手头像样式
- 助手回复结构化排版
- 底部操作按钮风格统一

不改：

- `SessionHistory`
- `onDelete`
- `onRefresh`
- `onEdit`
- `onExport`

### 第四阶段：做 SidebarV2

目标：

- 左侧导航样式
- 历史会话样式
- 历史会话菜单
- 底部账号菜单

不改：

- session 切换机制
- 删除 / 重命名等现有行为入口

### 第五阶段：做 ChatV2

目标：

- 固定 `100vh`
- 左侧固定
- 顶部固定
- 主内容独立滚动
- 输入区固定底部
- 避免双滚动条

负责总装：

- `SidebarV2`
- `TopbarV2`
- `SessionV2`
- `InputAreaV2`

## 建议路由策略

不要直接替换现有聊天页。

建议新增一路：

- 现有：`/chat/:id`
- 新版：`/chat-v2/:id`

这样可以：

- 复用同一份 session 数据
- 对照旧版和新版
- 降低切换风险

补充约束：

- 旧路由继续保留，不做跳转替换
- 新路由只作为企业版 UI 壳入口
- 旧页面默认入口、旧分享路径、旧内部引用路径都不调整

建议最终并行路由为：

- 旧：
  - `/chat/:id`
  - `/g/:gid/chat/:id`
- 新：
  - `/chat-v2/:id`
  - `/g/:gid/chat-v2/:id`

## 文件级改造清单

这部分作为后续执行时的直接清单使用。原则是：

- 优先新增文件
- 只在必要时最小改动旧文件
- 不对旧组件做侵入式重构

### 一、新增文件

#### 1. 页面壳

- `apps/assistant-web/src/views/ChatV2.tsx`

职责：

- 承接 V2 路由入口
- 组装 `SidebarV2 / TopbarV2 / SessionV2 / InputAreaV2`
- 负责 V2 页面级布局、滚动、宽度轨道

不负责：

- 改后台逻辑
- 改消息数据结构
- 改旧页面行为

#### 2. 左侧 UI

- `apps/assistant-web/src/components/chat-v2/SidebarV2.tsx`
- `apps/assistant-web/src/components/chat-v2/menus/HistoryItemMenuV2.tsx`
- `apps/assistant-web/src/components/chat-v2/menus/ProfileMenuV2.tsx`

职责：

- 左侧品牌区
- 新建会话
- 历史会话折叠区
- 历史项三点菜单
- 底部用户菜单

不负责：

- 改原 `Sidebar.tsx`
- 改会话数据源

#### 3. 右侧 UI

- `apps/assistant-web/src/components/chat-v2/TopbarV2.tsx`
- `apps/assistant-web/src/components/chat-v2/SessionV2.tsx`
- `apps/assistant-web/src/components/chat-v2/InputAreaV2.tsx`

职责：

- 顶部标题栏
- 用户气泡和助手回复壳
- 输入框、模型按钮、发送按钮、版本号

不负责：

- 重写消息流逻辑
- 重写上传链路
- 重写模型切换链路

#### 4. 样式文件

- `apps/assistant-web/src/components/chat-v2/chat-v2.css`

职责：

- 承载 V2 独立样式体系
- 承载 token、布局、组件、状态样式

原则：

- 不污染旧组件样式
- 不把 V2 样式散落到旧页面 CSS 中

### 二、允许最小改动的旧文件

#### 1. 路由配置

- `apps/assistant-web/src/config/router.tsx`

允许改动：

- 新增 `chat-v2` 并行路由

禁止改动：

- 替换旧 `chat` 路由
- 改已有路由含义

#### 2. 应用总装

- `apps/assistant-web/src/App.tsx`

允许改动：

- 在命中 `chat-v2` 路由时切换到 `ChatV2` 入口
- 做最小的 V2 路由判断

禁止改动：

- 改旧页面总装逻辑
- 改旧侧栏/旧输入框默认渲染逻辑

#### 3. 设计 token 挂载点

- `apps/assistant-web/src/index.css` 或 `chat-v2.css`

允许改动：

- 注入 V2 所需 token

建议：

- 优先落在 `chat-v2.css`
- 只有真正全局共享的 token 才进 `index.css`

### 三、不建议改动的旧文件

后续除非单独评审确认，否则不改：

- `apps/assistant-web/src/views/Chat.tsx`
- `apps/assistant-web/src/components/Sidebar.tsx`
- `apps/assistant-web/src/components/Session.tsx`
- `apps/assistant-web/src/components/InputArea.tsx`

原因：

- 这些是旧页面核心组件
- 直接改它们会放大回归风险
- 与“并行 V2，不影响旧版”的原则冲突

## 组件职责与边界

### `ChatV2`

负责：

- 路由级容器
- 会话内容装配
- 页面壳布局
- V2 宽度和滚动关系

不负责：

- 具体消息排版细节
- 侧栏菜单内部逻辑细节
- 输入框局部状态细节

### `SidebarV2`

负责：

- 左侧结构
- 历史会话视觉和交互壳
- 用户菜单视觉和交互壳

复用：

- 旧会话列表数据
- 旧会话切换行为
- 旧重命名/删除行为

### `SessionV2`

负责：

- 用户消息气泡
- 助手回复容器
- 底部工具行

复用：

- 旧消息内容
- 旧复制/刷新/删除/导出能力

注意：

- 不默认做自动内容重排
- 助手回复先按自然文本流承接

### `InputAreaV2`

负责：

- V2 输入框结构
- 左下加号
- 模型按钮和下拉
- 发送按钮
- 版本号

复用：

- 旧提交能力
- 旧上传能力
- 旧中断能力

注意：

- 不新发明输入行为
- 不增加新的消息发送协议

## 基线映射规则

执行时统一遵守：

### 左侧

以 [LEFT_SIDEBAR_BASELINE.md](/Users/xinpeilu/common/workspace/AI/assistai-ui/LEFT_SIDEBAR_BASELINE.md) 为唯一标尺。

必须优先对齐：

- 宽度
- padding
- 字号
- hover / active
- 图标颜色层级
- 用户区和菜单结构

### 右侧

会话态右侧以 [RIGHT_CHAT_BASELINE.md](/Users/xinpeilu/common/workspace/AI/assistai-ui/RIGHT_CHAT_BASELINE.md) 为唯一标尺；新建会话空状态单独以 [NEW_CHAT_EMPTY_STATE_BASELINE.md](/Users/xinpeilu/common/workspace/AI/assistai-ui/NEW_CHAT_EMPTY_STATE_BASELINE.md) 为唯一标尺。

必须优先对齐：

- 顶栏高度和宽度轨道
- 用户气泡
- 助手回复区
- 输入框
- 模型按钮
- 发送按钮
- 图标颜色层级

### 执行顺序规则

一律：

- 先抄值
- 后微调

禁止：

- 先看图猜值
- 没有抄基线就直接调样式

## 差异登记表模板

后续执行中，每遇到一项差异，都按下面格式登记。

### 模板字段

- 差异项：
- 差异类型：
  - 旧工程已有、静态页未体现
  - 静态页体现、旧工程无承接能力
  - 主流程必须能力但静态页未明确表达
- 影响范围：
  - 左侧
  - 右侧
  - 路由
  - 交互
- 当前决策：
  - 保留并弱化
  - 重新设计入口
  - 做纯 UI 占位
  - 暂不接入
- 是否需要后台支持：
  - 是 / 否
- 本轮是否处理：
  - 是 / 否
- 备注：

### 初始差异登记

#### 1. 历史会话三点菜单

- 差异项：历史会话右侧三点菜单
- 差异类型：静态页体现、旧工程部分已有承接能力
- 影响范围：左侧
- 当前决策：重新设计入口
- 是否需要后台支持：否
- 本轮是否处理：是
- 备注：保留旧重命名/删除能力，只换 V2 外观和开合方式

#### 2. 用户菜单

- 差异项：底部用户区菜单
- 差异类型：静态页体现、旧工程已有相关入口
- 影响范围：左侧
- 当前决策：保留并弱化
- 是否需要后台支持：否
- 本轮是否处理：是
- 备注：V2 中仅保留 `设置 / 退出` 这类最小入口

#### 3. 模型切换下拉

- 差异项：输入框模型切换
- 差异类型：静态页体现、旧工程已有承接能力
- 影响范围：右侧
- 当前决策：重新设计入口
- 是否需要后台支持：否
- 本轮是否处理：是
- 备注：只换 UI，不扩模型能力

#### 4. 静态页中不存在但旧页可能存在的高级能力

- 差异项：旧页面中的额外高级操作或配置能力
- 差异类型：旧工程已有、静态页未体现
- 影响范围：左侧 / 右侧
- 当前决策：保留并弱化
- 是否需要后台支持：否
- 本轮是否处理：视具体项决定
- 备注：不因为 V2 改版直接删除

## 执行前检查清单

正式开工前必须先确认：

- `ChatGemini` 工作区干净
- 旧页面可正常访问
- 路由策略已确认是并行 V2
- 左右基线文档已作为本轮唯一标尺
- 本轮是否处理的差异项已经先登记

## 阶段验收清单

### 第一阶段验收：壳体接入

- V2 路由可访问
- 旧路由不受影响
- V2 页面能渲染基础壳体

### 第二阶段验收：左侧对齐

- 左侧宽度、品牌区、新建会话、历史会话、底部用户区与基线一致
- 菜单开合正常
- 旧会话行为不坏

### 第三阶段验收：右侧对齐

- 顶栏、用户气泡、助手回复、输入框与右侧基线一致
- 模型切换、发送、中断、上传行为不坏

### 第四阶段验收：整页验收

- 新旧路由并行存在
- 旧页面零回归
- V2 可以作为企业版 UI 模版继续演进

## Sprint 1 执行清单

本节只定义第一轮实际开工范围。原则是：

- 不铺太大
- 先把并行 V2 壳跑起来
- 先验证“按基线抄值”的方法
- 只做右侧主入口，不在第一轮铺满左侧细节

### Sprint 1 目标

完成一个可访问、可对照、可继续迭代的 `ChatV2` 最小企业版聊天壳。

达成后应满足：

- 可以通过新路由访问 V2 页面
- 旧页面不受影响
- V2 右侧主区已切入静态页基线体系
- 输入框已用独立 `InputAreaV2`
- 页面可以开始进入下一轮精修

### Sprint 1 范围

#### 1. 新增并行路由

本轮必须完成：

- `/chat-v2/:id`
- `/g/:gid/chat-v2/:id`

要求：

- 旧路由不动
- 旧默认入口不动
- 只新增，不替换

#### 2. 新建 `ChatV2` 页面壳

本轮必须完成：

- `apps/assistant-web/src/views/ChatV2.tsx`

要求：

- 固定 `100vh`
- 左右区域结构成立
- 顶部栏、消息区、输入区在壳层上分区明确
- 先不追求所有细节完全还原

#### 3. 新建 V2 样式文件与基础 token

本轮必须完成：

- `apps/assistant-web/src/components/chat-v2/chat-v2.css`

要求：

- 落下 V2 独立样式命名空间
- 先建立基础 token
- 至少覆盖：
  - 主区背景
  - 内容宽度轨道
  - 输入框高度
  - 基础文字色
  - 主要圆角和边框

#### 4. 新建 `InputAreaV2`

本轮必须完成：

- `apps/assistant-web/src/components/chat-v2/InputAreaV2.tsx`

要求：

- 会话态输入框以 [RIGHT_CHAT_BASELINE.md](/Users/xinpeilu/common/workspace/AI/assistai-ui/RIGHT_CHAT_BASELINE.md) 为唯一标尺；新建会话空状态输入框同时以 [NEW_CHAT_EMPTY_STATE_BASELINE.md](/Users/xinpeilu/common/workspace/AI/assistai-ui/NEW_CHAT_EMPTY_STATE_BASELINE.md) 为唯一标尺
- 先严格对齐：
  - 输入框高度
  - 内边距
  - placeholder
  - 加号按钮
  - 模型按钮
  - 发送按钮
  - 版本号

复用：

- 原提交逻辑
- 原上传逻辑
- 原中断逻辑

禁止：

- 新增发送协议
- 改后端能力

#### 5. 最小接线

本轮只允许做以下最小接线：

- `App.tsx` 中增加 V2 路由判断
- `router.tsx` 中增加 V2 路由
- 将旧页面已有的数据和行为透传给 `ChatV2 / InputAreaV2`

禁止：

- 改旧 `Chat.tsx` 的渲染逻辑
- 改旧 `InputArea.tsx`
- 顺手改旧样式

### Sprint 1 明确不做

本轮不做：

- `SidebarV2` 全量还原
- 历史会话三点菜单
- 底部用户菜单
- 助手回复重排
- 空白态完整还原
- 高级功能差异项处理

这些全部留到后续 Sprint。

### Sprint 1 交付物

交付结果应该包括：

- 新增 V2 路由
- 新增 `ChatV2.tsx`
- 新增 `InputAreaV2.tsx`
- 新增 `chat-v2.css`
- 保证旧页面零回归

### Sprint 1 验收标准

验收时至少检查这几项：

- `chat-v2` 路由能访问
- 旧 `chat` 路由不受影响
- 右侧主区不是旧页面视觉
- 输入框已明显进入静态页基线体系
- 模型按钮、发送按钮、版本号都按 V2 样式渲染
- 不出现后台、接口、数据结构改动

### Sprint 1 完成后的下一步

Sprint 1 完成后，再进入下一轮：

- `SessionV2`
- `SidebarV2`
- 左右基线逐项对齐
- 差异登记项逐项消化

## Sprint 2 执行清单

本节定义第二轮实际开工范围。原则是：

- 先收右侧消息区
- 不展开左侧重做
- 不做助手回复内容重排
- 继续只做 UI 壳，不动后台

### Sprint 2 目标

完成 `ChatV2` 右侧消息区的第一轮基线对齐，使其从“能用的新壳”进入“开始接近静态页”的状态。

达成后应满足：

- 用户气泡进入静态页宽度和视觉体系
- 助手头像、正文起点、正文宽度进入静态页基线
- 顶栏高度、宽度轨道、标题样式进入静态页基线
- 底部操作行被弱化，不再明显像旧页面功能按钮

### Sprint 2 范围

#### 1. 新建 `SessionV2`

本轮必须完成：

- `apps/assistant-web/src/components/chat-v2/SessionV2.tsx`

要求：

- 不直接复用旧 `Session.tsx` 的视觉结构
- 复用旧行为：
  - 复制
  - 编辑
  - 刷新
  - 删除
  - 导出
- 会话态消息区以 [RIGHT_CHAT_BASELINE.md](/Users/xinpeilu/common/workspace/AI/assistai-ui/RIGHT_CHAT_BASELINE.md) 为唯一标尺对齐；新建会话空状态单独以 [NEW_CHAT_EMPTY_STATE_BASELINE.md](/Users/xinpeilu/common/workspace/AI/assistai-ui/NEW_CHAT_EMPTY_STATE_BASELINE.md) 对齐：
  - 用户气泡
  - 助手头像
  - 助手正文容器
  - 底部操作行

注意：

- 本轮不做“关键结论 / 核心思路 / 下一步建议”这类内容重排
- 助手回复保持自然文本流

#### 2. 调整 `ChatV2` 主内容轨道

本轮必须完成：

- `apps/assistant-web/src/views/ChatV2.tsx`

要求：

- 右侧消息区使用独立内容轨道
- 顶栏、消息流、输入框三者站在同一套宽度逻辑上
- 滚动区、消息区和输入框之间关系更接近静态页

#### 3. 落 `TopbarV2`

本轮必须完成：

- `apps/assistant-web/src/components/chat-v2/TopbarV2.tsx`

要求：

- 高度：`62px`
- 标题字号：`14px`
- 下边线和半透明白底进入静态页体系
- 只保留最小标题信息，不扩展额外操作

#### 4. 扩充 `chat-v2.css`

本轮必须完成：

- 为 `SessionV2` 和 `TopbarV2` 补齐样式

要求：

- 严格按右侧基线抄值
- 不再靠看图猜值
- 图标颜色层级、字号、宽度、padding 全部来自基线文档

### Sprint 2 明确不做

本轮不做：

- `SidebarV2`
- 历史会话三点菜单
- 底部用户菜单
- 空白态完整还原
- 助手回复内容重排
- 新功能扩展

### Sprint 2 交付物

交付结果应该包括：

- 新增 `SessionV2.tsx`
- `ChatV2.tsx` 使用新的消息区壳
- `TopbarV2.tsx` 对齐静态页
- `chat-v2.css` 补齐消息区和顶栏样式

### Sprint 2 验收标准

验收时至少检查这几项：

- 用户气泡不再是旧 `Session` 那套样式
- 助手头像和正文起点已进入静态页轨道
- 助手正文宽度、字号、行高明显不同于旧页面
- 顶栏高度和宽度轨道与输入框一致
- `chat-v2` 发消息、刷新、删除、导出链路仍然正常
- 不影响旧 `chat` 页面

### Sprint 2 完成后的下一步

Sprint 2 完成后，再进入下一轮：

- `SidebarV2`
- 左侧菜单与用户区
- 差异登记项继续消化

## Sprint 3 执行清单

### Sprint 3 目标

把 `ChatV2` 的左侧壳从旧 `Sidebar` 的默认观感里脱开，按静态页左侧基线完成企业版侧栏。

这一轮只解决左侧 5 个核心块：

- 顶部品牌区
- 新建会话入口
- 历史会话标题与列表
- 历史项三点菜单
- 底部用户区与用户菜单

### Sprint 3 范围

本轮只做左侧，不再调整右侧消息区、输入框和顶栏正文密度。

#### 1. 顶部品牌区

按 [LEFT_SIDEBAR_BASELINE.md](/Users/xinpeilu/common/workspace/AI/assistai-ui/LEFT_SIDEBAR_BASELINE.md) 对齐：

- logo
- 产品名
- 收起按钮

要求：

- 顶部区整体密度接近静态页
- logo 尺寸、文字字号、收起按钮尺寸按基线硬值对齐

#### 2. 新建会话入口

按基线完成：

- 按钮外框
- 左侧加号图标
- hover / active

约束：

- 不再做快捷键小块
- 只保留 V2 确认过的轻量入口形态

#### 3. 历史会话区

按基线完成：

- `历史会话` 标题行
- 折叠 / 展开箭头
- 历史列表缩进
- 历史项层级
- hover / active

约束：

- 只复用旧会话列表数据和切换逻辑
- 不改会话结构

#### 4. 历史项三点菜单

本轮菜单只保留三项：

- 编辑标题
- 置顶
- 删除

要求：

- 菜单样式向静态页对齐
- 保证开合、hover、关闭逻辑稳定

约束：

- 位置自适应不做复杂增强
- 先保证样式、内容、开合正确

#### 5. 底部用户区

按静态页对齐：

- 用户行
- 展开箭头
- 弹出菜单

菜单项只保留：

- 设置
- 退出

### Sprint 3 建议实现方式

这一轮不建议继续在旧 `Sidebar.tsx` 上堆样式分支，而是单独做 V2 左侧组件：

- `src/components/chat-v2/SidebarV2.tsx`
- `src/components/chat-v2/menus/HistoryItemMenuV2.tsx`
- `src/components/chat-v2/menus/ProfileMenuV2.tsx`

同时：

- `ChatV2` 路由下单独渲染 `SidebarV2`
- 旧 `Sidebar.tsx` 继续留给旧页面

### Sprint 3 明确不做

本轮不做这些内容：

- 不调整右侧聊天内容区
- 不调整 `InputAreaV2`
- 不做空白态
- 不补“表格 / Agent / Code / Claw”这类静态参考项
- 不扩展后台能力
- 不改会话数据结构
- 不做复杂菜单动画
- 不做移动端抽屉重构

### Sprint 3 数据与逻辑边界

`SidebarV2` 只复用旧能力，不改后台和数据结构。

允许复用：

- 会话列表数据
- 当前会话高亮判断
- 新建会话
- 会话切换
- 重命名
- 删除
- 退出逻辑

关于置顶：

- 如果旧工程已有稳定逻辑，直接复用
- 如果旧工程没有承接能力，按“功能差异处理规则”登记，当前阶段只允许做前端排序演示或暂不接入

### Sprint 3 基线来源

本轮左侧所有尺寸、字级、图标、间距，都以：

- [LEFT_SIDEBAR_BASELINE.md](/Users/xinpeilu/common/workspace/AI/assistai-ui/LEFT_SIDEBAR_BASELINE.md)

为唯一对齐标准。

优先对齐这些硬值：

- 侧栏宽度：`272px`
- 顶部品牌区尺寸
- 新建会话高度：`48px`
- 历史会话标题行：`40px`
- 历史项高度 / 字级：`32px / 13px`
- 列表左缩进：`26px`
- 三点按钮尺寸：`24px`
- 底部用户菜单的宽度与背景关系

### Sprint 3 交付物

本轮至少交付：

- `SidebarV2.tsx`
- `HistoryItemMenuV2.tsx`
- `ProfileMenuV2.tsx`
- `chat-v2.css` 左侧相关样式
- `ChatV2` 或 `App.tsx` 的最小接线

### Sprint 3 验收标准

这一轮只验左侧，不验右侧。

至少确认这 6 条：

1. 左侧总宽与静态页接近
2. 顶部品牌区不再像旧侧栏
3. 新建会话按钮外观接近静态页
4. 历史列表层级清楚
5. 三点菜单样式、内容、开合正确
6. 底部用户区和用户菜单风格一致

### Sprint 3 建议实施顺序

按下面顺序执行：

1. 先立 `SidebarV2` 外壳
2. 再做历史列表
3. 再做三点菜单
4. 最后做底部用户区和用户菜单

原因：

- 底部用户菜单最不影响主流程
- 历史会话列表是左侧最关键的主路径
- 先把主壳立住，再补附属菜单，返工最少

## Sprint 4 执行清单

### Sprint 4 目标

把 `ChatV2` 从“左右两侧已经分出新壳”推进到“左右视觉关系稳定、可以进入最终对照微调”的状态。

这一轮不再加新功能，只做统一与收尾。

### Sprint 4 范围

本轮只做 3 块：

1. 左侧收尾
2. 右侧中轴统一
3. 全局视觉 token 统一

#### 1. 左侧收尾

只做精修，不再改结构。

范围：

- 底部用户区再压一轮
  - 用户行高度
  - 头像颜色和文字深浅
  - 展开箭头存在感
- 用户菜单再统一
  - 背景和侧栏完全一致
  - 菜单项间距、字距、危险项颜色
- 历史列表最后一轮统一
  - 默认态
  - hover
  - active
  - menu-open

目标：

- 左侧从顶部到用户区形成同一套视觉语言
- 历史列表 4 种状态层级关系锁死，不再来回调整

#### 2. 右侧中轴统一

这是 `Sprint 4` 的重点。

要锁定 4 条线：

- 顶部标题起点
- 用户气泡轨道
- 助手回复正文起点
- 输入框起点

本轮要做的：

- `TopbarV2`
  - 高度
  - 标题字号
  - 左内边距
  - 下边线
- 用户气泡
  - 最大宽度
  - 右对齐落点
  - 上下距离
- 助手回复
  - 头像和正文起点关系
  - 正文最大宽度
  - 操作行位置
- `InputAreaV2`
  - 外框宽度
  - 内部按钮落点
  - 版本号位置
  - 与消息区的垂直关系

目标：

- 顶部标题、消息流、输入框进入同一条阅读轨道
- 用户消息和助手消息看起来属于同一套聊天系统

#### 3. 全局视觉 token 统一

这一块不改结构，只做一致性收口。

统一范围：

- 左右文字深浅
- 圆角弧度
- 弱边框颜色
- 小图标颜色层级
- 阴影力度

目标：

- 不再出现“某一块像静态页，另一块像旧系统”的割裂感

### Sprint 4 明确不做

本轮不做这些内容：

- 不新增功能
- 不改后台
- 不改旧页面
- 不做移动端专项
- 不重排回复内容结构
- 不加空白态新模块
- 不改 GPT 助手首页 `/g/:gid`

### Sprint 4 建议实施顺序

按下面顺序执行：

1. 先收左侧底部用户区
2. 再统一左侧状态层级
3. 再打 `TopbarV2`
4. 再锁右侧四条中轴
5. 最后统一 token

原因：

- 左侧收尾成本最低，先做完最稳
- 右侧中轴一旦开始调，最好连续做完
- token 统一放最后，避免前面反复返工

### Sprint 4 交付物

本轮至少交付：

- `chat-v2.css` 左右统一后的最终视觉基线
- `TopbarV2` 的对齐收口
- `InputAreaV2` 的中轴和落位收口
- `SidebarV2` 底部用户区和历史状态收口

### Sprint 4 验收标准

这轮验收只看整体关系，不再逐点抠单个控件。

至少确认这 6 条：

1. 左侧从顶部到用户区是同一套语言
2. 历史列表 4 种状态关系清楚，不抢右侧
3. 顶部标题、消息流、输入框在同一条中轴上
4. 用户气泡和助手回复像同一套聊天系统
5. 输入框不再显得过高、过空或过重
6. 左右字色、图标色、圆角、阴影不再打架

- 新路由只作为并行预览入口
- 第一阶段不允许把旧入口 redirect 到 V2
- 第一阶段不允许通过改默认路由来“偷替换”

## 第一阶段不要做的事

- 不改国际化结构
- 不改消息数据模型
- 不改上传链路
- 不改导出逻辑
- 不改会话存储结构
- 不改模型真实切换逻辑
- 不改默认主路由
- 不改任何后端接口
- 不改任何旧组件对外 props 契约
- 不改旧页面样式和 DOM 结构

## 推荐先改的文件

第一批：

- `apps/assistant-web/src/index.css`
- `apps/assistant-web/src/components/InputArea.tsx`
- `apps/assistant-web/src/components/chat-v2/chat-v2.css`

第二批：

- `apps/assistant-web/src/components/Session.tsx`
  或新增：
- `apps/assistant-web/src/components/chat-v2/SessionV2.tsx`

第三批：

- `apps/assistant-web/src/components/Sidebar.tsx`
  或新增：
- `apps/assistant-web/src/components/chat-v2/SidebarV2.tsx`

第四批：

- `apps/assistant-web/src/views/Chat.tsx`
  或新增：
- `apps/assistant-web/src/views/ChatV2.tsx`

## 最优路线

最稳的顺序：

1. `InputAreaV2`
2. `SessionV2`
3. `SidebarV2`
4. `ChatV2`

原因：

- 输入区和消息区最能决定页面观感
- 左侧复杂度更高，适合后改
- `Chat.tsx` 总装应最后做，避免前期频繁返工

## 验收标准

第一阶段完成后至少满足：

- 新版页面与当前静态原型有 80% 以上观感一致度
- 发消息、刷新、删除、导出、上传能力不坏
- 页面固定高度和单滚动区成立
- 左侧、消息区、输入区视觉统一

## 结论

这份页面适合做 `assistant-web` 的企业版聊天模版。

正确方式不是“把静态页翻译成 React 页面”，而是：

- 用这份页面做视觉蓝本
- 在 `assistant-web` 里做一套 `ChatV2` 组件壳
- 逐步替换 `InputArea -> Session -> Sidebar -> Chat`

## 下一步建议

下一步直接开始：

1. 出 `InputAreaV2` 组件方案
2. 或直接在 `ChatGemini/apps/assistant-web` 里开干第一步

---

## 进一步细化

下面是基于 `assistant-web` 现有代码结构补充的可执行细化方案。

## 现有文件职责映射

### 1. `src/components/InputArea.tsx`

当前职责：

- 输入框内容管理
- 上传附件
- 提交消息
- 中断回答
- 推理开关

判断：

- 这是最适合最先改造的组件
- 现有 props 边界比较清晰
- 只要保留行为接口，就可以安全换壳

### 2. `src/components/Session.tsx`

当前职责：

- 渲染用户 / 模型消息
- 模型消息复制 / 刷新 / 删除 / 导出
- 用户消息编辑

判断：

- 行为重，但边界清楚
- 最适合做“结构换壳，不改能力”

### 3. `src/components/Sidebar.tsx`

当前职责：

- Logo / 版本
- 会话列表
- 会话操作
- locale 切换
- GPTs / 权限等扩展逻辑

判断：

- 复杂度最高
- 不建议第一步直接硬改
- 适合先平移逻辑，再换样式壳

### 4. `src/views/Chat.tsx`

当前职责：

- 会话级业务编排
- 绑定 Session / InputArea
- 处理 refresh / edit / delete / export
- 标题和数据联动

判断：

- 最适合最后做总装
- 前面三个组件准备好以后，再改它最稳

## 组件级接入策略

## A. InputAreaV2

建议新增：

- `src/components/chat-v2/InputAreaV2.tsx`

### 目标

- 还原当前 `assistai-ui` 的大输入框样式
- 保留现有 `InputArea` 的行为接口
- 模型切换改成轻量下拉

### 建议 props

沿用现有 `InputAreaProps`，不要重新发明一套：

- `busy`
- `fileUploadEnabled`
- `minHeight`
- `maxHeight`
- `showReasoningToggle`
- `reasoningEnabled`
- `reasoningAvailable`
- `onSubmit`
- `onUpload`
- `onAbort`
- `onReasoningChange`
- `allowedFileTypes`

### 需要补的能力

- `selectedModel`
- `modelOptions`
- `onChangeModel`

这里有两种做法：

#### 做法 1，最稳

直接在 `InputAreaV2` 新增：

- `selectedModel?: string`
- `modelOptions?: Array<{ label: string; value: string }>`
- `onChangeModel?: (value: string) => void`

优点：

- 组件边界清晰
- 不污染别的业务组件

缺点：

- 需要在 `App.tsx / Chat.tsx` 补透传

#### 做法 2，先兼容

先在 `InputAreaV2` 内部只做静态两档：

- `GLM-5.0`
- `GLM-4.7`

等页面壳稳定后，再接真实模型列表。

优点：

- 上线快

缺点：

- 临时逻辑要补一次

建议：第一阶段用做法 2，第二阶段再切做法 1。

### 验收

- 提交消息行为不变
- 附件上传行为不变
- 中断行为不变
- 模型下拉展开 / 收起 / 选中正常

## B. SessionV2

建议新增：

- `src/components/chat-v2/SessionV2.tsx`

### 目标

- 还原当前模版里的：
  - 用户气泡
  - 助手头像
  - 助手结构化答复
  - 底部轻操作按钮

### 数据映射原则

保留 `Session.tsx` 当前输入接口，不改：

- `index`
- `prompt`
- `postscript`
- `role`
- `children`
- `editState`
- `onDelete`
- `onRefresh`
- `onEdit`
- `onExport`

### 实现建议

#### 用户消息

直接渲染成：

- 右对齐气泡
- 浅灰底
- 中宽最大宽度

#### 助手消息

结构建议：

- 左侧头像
- 右侧正文块
- 正文不依赖颜色分层，靠：
  - 小标题
  - 分段
  - 编号
  - 短分隔

#### children 的处理

当前 `Chat.tsx` 里 `children` 很可能是 markdown 渲染后的节点。

所以 `SessionV2` 不要试图重写 markdown parser，只做：

- 外层布局壳
- markdown 内容容器样式

### 验收

- `复制 / 刷新 / 删除 / 导出 / 编辑` 能力不坏
- 用户和助手消息视觉上明显区分
- 回复区更像企业工具，不像默认聊天泡泡

## C. SidebarV2

建议新增：

- `src/components/chat-v2/SidebarV2.tsx`

### 目标

- 还原当前模版左侧：
  - Logo 区
  - 新建会话
  - 历史会话分组
  - 历史项菜单
  - 底部账号区

### 现有 Sidebar 的处理建议

不建议直接在旧 `Sidebar.tsx` 里大改，因为它现在掺了：

- 版本信息
- GPTs 相关逻辑
- locale
- 额外产品入口

建议策略：

1. 先复制逻辑结构
2. 保留：
   - session list
   - rename
   - delete
   - export
3. 第一阶段屏蔽：
   - 不属于当前企业版模版的多余入口

### 历史项菜单建议

第一阶段只保留：

- 编辑标题
- 置顶
- 删除

这和你当前静态页已经对齐。

### 底部用户区建议

保留轻量账号菜单：

- 设置
- 退出

### 验收

- 会话切换不坏
- 菜单定位正常
- hover / active / menu-open 三种状态统一

## D. TopbarV2

建议新增：

- `src/components/chat-v2/TopbarV2.tsx`

### 目标

- 固定顶部
- 只保留当前会话标题
- 去掉多余图标和说明

### 输入建议

- `title: string`
- `onToggleSidebar?: () => void`
- `showSidebarTrigger?: boolean`

这层不要承载业务逻辑，只管视觉和基础回调。

## E. ChatV2

建议新增：

- `src/views/ChatV2.tsx`

### 目标

- 作为企业版聊天壳的总装页面

### 负责内容

- 固定 `100vh`
- 左侧固定
- 顶部固定
- 中间消息区独立滚动
- 输入区固定底部

### 复用现有逻辑

优先从现有 `Chat.tsx` 复制这些逻辑：

- `handleRefresh`
- `handleEdit`
- `handleDelete`
- `handleExport`
- `chat` 数据绑定
- `sessionExtensions` 读取

### 不建议第一阶段做的事情

- 不把 `Chat.tsx` 直接删掉
- 不直接替换默认路由

## 路由接入建议

在 `src/config/router.tsx` 增加一路：

- `g_chat_v2`
- 或 `chat_v2`

例如：

- `/g/:gid/chat-v2/:id`
或
- `/chat-v2/:id`

推荐：

- `g_chat_v2`

因为当前项目有：

- `g_chat`
- `chat`

企业版模版更像 GPT Assistant / 企业助手专属视图，挂在 `g` 路径下更合理。

## 样式策略建议

`assistant-web` 现有是 Tailwind + 局部 class。

最稳的方式不是把所有样式都翻成超长 Tailwind class，而是：

### 方案

- 在 `src/components/chat-v2/chat-v2.css` 写结构样式
- 在 `src/index.css` 写共享 token

### 好处

- 容易从当前静态页迁移
- 方便后面继续微调
- 不会让 JSX 里 className 过长失控

## 推荐第一批最小提交

第一批只做这些：

1. 新增 `chat-v2.css`
2. 新增 `InputAreaV2.tsx`
3. 新增 `SessionV2.tsx`
4. 新增 `ChatV2.tsx`
5. 新增一条 `chat-v2` 路由

先不要动：

- `Sidebar.tsx`

原因：

- 左侧你现在已经抠得比较细
- 但业务逻辑复杂度比消息区和输入区高
- 第一批不碰它，最容易快速验证新壳是否成立

## 第二批提交

第二批再做：

1. `SidebarV2.tsx`
2. `HistoryItemMenu.tsx`
3. `ProfileMenu.tsx`

## 第三批提交

第三批再考虑：

- 是否把 `ChatV2` 升成默认聊天页
- 是否把旧 `Chat.tsx` / `Sidebar.tsx` 合并或下线

## 风险点

### 1. Session markdown 容器

如果 `SessionV2` 包裹方式不对，容易把现有 markdown、附件、代码块样式打坏。

解决：

- 第一阶段只换消息壳，不重写 markdown 内容树

### 2. InputArea 模型切换

现有项目真实模型逻辑在 `App.tsx` 有：

- `models`
- `selectedModel`
- cookie 持久化

所以第一阶段若先用静态两档模型，后面要补一次真实接线。

### 3. Sidebar 权限逻辑

现有 `Sidebar.tsx` 混了不少权限 / GPTs 逻辑，直接替换风险高。

解决：

- 先做 V2 壳并行，不碰旧侧栏

## 推荐下一步

最合理的下一步不是继续写文档，而是直接开始第一批。

优先顺序：

1. `InputAreaV2.tsx`
2. `SessionV2.tsx`
3. `ChatV2.tsx`

这样最快能看到一个“右侧主工作区”已经接近现在静态模版的版本。

## 开工级细化

下面这部分不是设计说明，而是按 `assistant-web` 当前代码结构整理出来的实施清单。

目标是后面可以直接按文件开工，不再二次判断。

## 现有文件到 V2 的映射

### `src/App.tsx`

当前这里已经持有的关键状态：

- 当前模型
- 默认模型
- 登录态 / 退出逻辑
- 会话级回调透传

V2 阶段建议：

- 不改这里的数据来源
- 只补一层 `selectedModel / setSelectedModel` 的透传
- `logout` 继续复用旧逻辑
- 不在这里做旧版组件替换

也就是说，`App.tsx` 在第一阶段只做“透传补线”，不做视觉改造。

### `src/config/router.tsx`

第一阶段只增加一条新路由，不替换旧路由。

建议新增：

- `/g/:gid/chat-v2/:id`

原因：

- 现有 `g_chat` 路径语义已经存在
- 企业版助手更像 `g` 体系下的新壳
- 对比旧路由更方便

第一阶段不要做：

- 不改 `/chat/:id`
- 不改 `/g/:gid/chat/:id`
- 不做默认跳转
- 不删旧 route

### `src/views/Chat.tsx`

它是最值得复用业务逻辑的地方。

建议处理方式：

1. 复制一份业务编排逻辑到 `ChatV2.tsx`
2. 保留：
   - 拉取消息
   - 当前 session 标题
   - refresh / edit / delete / export
   - 滚动与会话联动
3. 替换：
   - 页面布局壳
   - 顶部栏
   - 消息区容器
   - 底部输入区容器

第一阶段不要做：

- 不重写消息生成逻辑
- 不重写 markdown 渲染逻辑
- 不重写 session 数据组装逻辑
- 不把旧 `Chat.tsx` 改成 V2 壳

### `src/components/InputArea.tsx`

这里不建议硬改旧组件。

更好的方式是：

- 新建 `InputAreaV2.tsx`
- 行为接口尽量贴近旧 `InputArea`
- 由 `ChatV2.tsx` 选择渲染旧版还是新版

这样如果 V2 样式有问题，不会反向拖坏旧页面。

补充约束：

- 不在旧 `InputArea.tsx` 里塞大量 V2 分支
- 不为了 V2 去破坏旧 props 兼容性

### `src/components/Session.tsx`

这里也建议新建：

- `SessionV2.tsx`

原因：

- 当前 `Session.tsx` 很可能已经耦合了较多现有 class 和辅助节点
- 直接在原组件里改壳，风险高
- V2 更适合包一层“消息视觉壳”

补充约束：

- 不在旧 `Session.tsx` 上直接翻新样式
- 不在旧消息组件里硬塞 V2 DOM 结构

### `src/components/Sidebar.tsx`

这是最后再碰的组件。

建议：

- 第一阶段不要动
- 第二阶段新增 `SidebarV2.tsx`
- 最开始甚至可以让 `ChatV2` 暂时继续吃旧 `Sidebar`

这样右侧主工作区可以先验证成功。

补充约束：

- 旧 `Sidebar.tsx` 只允许被复用，不允许第一阶段被改成半新半旧状态

## 第一批最小落地范围

如果目标是最快跑出一个“可看、可用、不破坏旧逻辑”的 V2，第一批只做这几个文件：

- `src/components/chat-v2/chat-v2.css`
- `src/components/chat-v2/InputAreaV2.tsx`
- `src/components/chat-v2/SessionV2.tsx`
- `src/components/chat-v2/TopbarV2.tsx`
- `src/views/ChatV2.tsx`
- `src/config/router.tsx`

这批完成以后，页面应该达到：

- 有新布局壳
- 有企业版输入框
- 有企业版消息区
- 有顶部标题栏
- 路由可访问
- 旧页面不受影响

补充说明：

- 第一批的目标是“新壳能跑”
- 不是“把旧系统替换掉”

## 第一批每个文件该做什么

### 1. `src/components/chat-v2/chat-v2.css`

只做三类东西：

- 共享 token
- 布局骨架
- 组件壳样式

建议不要把这里写成全局 reset。

建议结构：

- `:root` 或 `.chat-v2`
- shell
- sidebar area
- topbar
- thread
- composer
- menu

最低限度先落这些 token：

- `--chatv2-bg`
- `--chatv2-sidebar-bg`
- `--chatv2-panel-bg`
- `--chatv2-line`
- `--chatv2-text`
- `--chatv2-text-soft`
- `--chatv2-accent`
- `--chatv2-accent-strong`
- `--chatv2-radius-sm`
- `--chatv2-radius-md`
- `--chatv2-radius-lg`
- `--chatv2-shadow-sm`
- `--chatv2-shadow-md`
- `--chatv2-sidebar-width`
- `--chatv2-content-max`
- `--chatv2-composer-max`

### 2. `src/components/chat-v2/InputAreaV2.tsx`

第一版建议做到：

- 大输入框壳
- 附件按钮
- 模型切换
- 发送按钮
- `busy` 时按钮状态
- `abort` 状态保留

不需要第一版就做得很满：

- 不先补语音
- 不先补复杂工具按钮
- 不先补额外模式切换

第一版 props 建议：

- 完全兼容旧 `InputArea` 的提交和上传能力
- 额外只补：
  - `selectedModel?: string`
  - `modelOptions?: { label: string; value: string }[]`
  - `onChangeModel?: (value: string) => void`

如果接线阻力太大，第一版先把：

- `GLM-5.0`
- `GLM-4.7`

写成临时本地选项也可以，但文档里要标注为临时方案。

### 3. `src/components/chat-v2/SessionV2.tsx`

第一版目标不是重做消息系统，只是换消息表现层。

建议结构：

- 用户消息：
  - 右对齐
  - 浅灰气泡
  - 中等最大宽度
- 助手消息：
  - 左侧头像
  - 右侧正文容器
  - 正文内部允许标题、分段、列表、引用
- 底部工具行：
  - 复制
  - 刷新
  - 导出

关键原则：

- 不重写 markdown parser
- 不改 children 来源
- 只包容器 class

如果现有 `Session.tsx` 已经把很多动作按钮写死在内部，第一版可以考虑：

- `SessionV2` 内部直接复用现有动作回调
- 但重新排版按钮位置

### 4. `src/components/chat-v2/TopbarV2.tsx`

第一版只做一件事：

- 显示当前会话标题

不做：

- 搜索
- 面包屑
- 多余图标

可选补充：

- 在窄屏时加一个 sidebar toggle

### 5. `src/views/ChatV2.tsx`

这是第一批最关键的总装文件。

它要解决的是“壳”，不是“业务”。

建议布局职责：

- 外层 `100vh`
- 左侧区域
- 右侧主区
- 顶部固定
- 消息区滚动
- 输入区固定

第一版可以暂时这样接：

- 左侧先复用旧 `Sidebar`
- 右侧用 `TopbarV2 + SessionV2 + InputAreaV2`

这会让第一批难度显著降低。

### 6. `src/config/router.tsx`

第一批只补 route。

不要顺手做这些：

- 不做旧 route 替换
- 不做 redirect
- 不做 feature flag

除非后面要灰度切换，否则第一批 route 越简单越好。

## 第二批范围

第二批再处理左侧。

文件建议：

- `src/components/chat-v2/SidebarV2.tsx`
- `src/components/chat-v2/menus/HistoryItemMenu.tsx`
- `src/components/chat-v2/menus/ProfileMenu.tsx`

### SidebarV2 的最小目标

- 左上品牌区
- 新建会话
- 历史会话标题
- 历史会话列表
- 历史项 hover / active / menu-open
- 底部用户区

### 第一版先不要带进来的内容

- GPTs 多入口
- locale 配置堆叠
- 额外产品入口
- 复杂版本信息

这些都应该在第二阶段以后再评估是否回加。

## 第三批范围

第三批才考虑“收口”和“替换”。

包括：

- 是否把 `ChatV2` 变成默认聊天页
- 是否让旧 `Sidebar` 下线
- 是否把旧 `InputArea` / `Session` 合并到 V2
- 是否把 token 提升为全站共享变量

第三批之前，不建议做组件替换合并。

## 每阶段验收清单

### 第一批验收

- `ChatV2` 路由可进入
- 旧聊天页不坏
- 输入可提交
- 消息能正常渲染
- 消息滚动和输入区固定关系成立
- 模型名可切换
- 上传和中断不坏

### 第二批验收

- 会话切换正常
- 历史菜单定位正常
- 删除 / 置顶 / 编辑标题不坏
- 用户菜单可开关
- 左侧滚动和底部用户区关系正常

### 第三批验收

- 新旧壳切换无核心能力回退
- 主要交互行为与旧版一致
- 视觉一致性达到可替换标准

## 明确的边界约束

后面真正开工时，优先遵守这几个边界：

### 第一阶段可以碰

- `router.tsx`
- 新增 `chat-v2` 目录
- 新增 `ChatV2.tsx`
- 在 `App.tsx` 或上层容器补少量透传

### 第一阶段不要碰

- 后端接口
- store 结构
- session 数据模型
- markdown 解析链路
- 上传实现
- 导出实现
- 刷新实现
- 旧页面主路由
- 旧页面组件结构
- 旧页面样式细节

### 第二阶段再碰

- `Sidebar.tsx` 相关能力迁移
- 菜单抽象
- 权限相关展示差异

## 推荐开工顺序

如果后面直接开始写代码，建议按下面顺序，不要跳：

1. 先建 `chat-v2.css`
2. 再建 `InputAreaV2.tsx`
3. 再建 `SessionV2.tsx`
4. 再建 `TopbarV2.tsx`
5. 再建 `ChatV2.tsx`
6. 最后补 route

理由：

- 先把样式变量和壳子准备好
- 再做最容易验证的输入区和消息区
- 最后总装

不要一开始就碰 `SidebarV2`。

## 实施判断标准

后面每做一步，都用下面这条标准判断是否合格：

- 如果这个改动只是为了让新版 UI 能显示出来，并且不影响旧版，可以做
- 如果这个改动开始碰后台、碰数据结构、碰旧页面默认链路，就不做

这条标准优先级高于“顺手优化”。

## 建议的第一条提交信息

如果按阶段拆 commit，第一条提交建议只做：

- 新增 `ChatV2` 路由
- 新增 `chat-v2.css`
- 新增 `TopbarV2`
- 新增 `InputAreaV2`

提交信息可以是：

- `feat(assistant-web): scaffold chat v2 shell and composer`

第二条再做：

- `feat(assistant-web): add chat v2 message thread`

第三条再做：

- `feat(assistant-web): add chat v2 sidebar and menus`
