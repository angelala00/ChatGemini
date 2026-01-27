# ChatGemini

## Deploy Scripts

### 部署

```bash
./deploy.sh
./deploy.sh dev
./deploy.sh dev --install
```

- 可选参数：环境名（例如 `dev`）会复制 `.env.dev` → `.env`
- `--install` 会安装依赖（前端 `npm install` / 后端 `pip install -r requirements.txt`）
- 部署脚本会构建前端：`apps/assistant-web`、`apps/assistant-dashboard`、`apps/llm-platform`

### 状态检查

```bash
./deploy-status.sh
./deploy-status.sh --process
./deploy-status.sh --health
```

- `--process`：检查后端进程与前端构建产物
- `--health`：检查后端健康状态
