# ChatGemini

## Deploy Scripts

### 部署

```bash
./deploy.sh
./deploy.sh dev
./deploy.sh dev --install
./deploy.sh dev --backends
./deploy.sh dev --frontends
./deploy.sh dev --backend assistant-bff
./deploy.sh dev --frontend assistant-web
```

- 可选参数：环境名（例如 `dev`）会复制 `.env.dev` → `.env`
- 不指定部署范围时，保持原有行为，部署全部后端和前端
- `--backends` / `--all-backends`：部署全部后端
- `--frontends` / `--all-frontends`：部署全部前端
- `--backend <名称>`：部署指定后端，可重复传入
- `--frontend <名称>`：部署指定前端，可重复传入
- 后端名称：`assistant-bff`、`assistant-metrics-api`
- 前端名称：`assistant-web`、`assistant-dashboard`、`llm-platform`
- 不同范围参数可以组合，例如 `./deploy.sh dev --backend assistant-bff --frontend assistant-web`
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



## 远端同步

仓库可配置 GitHub 以外的镜像远端（例如 ModelScope）用于发布同步。

- 远端 URL 与访问凭据应通过本地 git remote、环境变量或安全凭据管理工具维护。
- 同步时优先使用已配置好的 remote 名称，例如将当前分支推送到目标镜像分支。

示例：

```bash
git remote add modelscope <modelscope-repository-url>
git push --set-upstream modelscope main:refs/for/github
git push modelscope master:github-master
git push modelscope HEAD:github-master
```
