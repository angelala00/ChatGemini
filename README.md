# 纪检 RAG 案例查询助手（servers/assistant-bff/app）

> **分支**: `feat/RAG`
> **维护者**: 高一丹

##  功能概述
本项目新增了基于 **ChromaDB + BAAI Embedding** 的本地 RAG系统，专用于检索和回答纪检监察相关的法律案例与条例。

##  核心模块说明

### 1. 核心引擎 (`servers/assistant-bff/app/utils/case_rag.py`)
- 封装了 RAG 核心逻辑：数据库初始化、Embedding 模型加载、向量检索接口
- 程序启动时会自动检测 `cases.json` 数据源与本地向量库的一致性。
- 如果本地没有向量库，或者数据源有更新，系统会自动触发重建流程。
- 已配置 `HF_ENDPOINT` 镜像

### 2. 数据源 (`servers/assistant-bff/app/data/`)
- **`cases.json`**: 案例数据的来源。来自纪法在线指导文章以及案例（真实公开数据），如需新增案例，请直接修改此 JSON 文件，重启服务后向量库会自动同步。
- **`chromadb_store/`**: (Git Ignored) 本地自动生成的向量数据库文件，不需要提交到仓库。

### 3.新增gpt (`app/gpts/gpts_legal.py`)	
- 定义了助手的 System Prompt，注册了 search_legal_cases 工具，并指定模型类型为 INSTRUCT。

### 4.修改分发逻辑 (`app/routes/chat_routes.py`)：
- 系统根据配置自动切换思考模式（Thinking/React，5参，纯文本）与指令/Agent模式（Instruct，6参，支持 Tool Calling），实现兼容。
- 本工具采取Instruct模式，调用的llm为"MODEL_NAME_INSTRUCT", "qwen3-30b-a3b-instruct-2507"

## 首次运行注意事项 

当第一次拉取本分支代码并启动服务时，请注意：

1.  **模型下载耗时**：
    初始化阶段会自动下载 `BAAI/bge-large-zh-v1.5` 嵌入模型（约 1.2GB）。
   
