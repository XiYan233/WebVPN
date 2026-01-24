# WebVPN (Next.js + MySQL + Redis)

WebVPN 提供 OAuth 登录、后台管理和通过 WebSocket 隧道访问内网 HTTP 服务的能力，并提供客户端（Go）实现。

## 功能
- OAuth 登录（可配置通用 OAuth 提供商）+ 角色权限（RBAC）
- MySQL（Prisma）+ Redis（在线状态 / 心跳 / 最近访问）
- 管理功能：用户、角色、权限、客户端、访问日志
- HTTP 反向代理

## 环境要求
- Node.js 20+
- MySQL 8+
- Redis 6+
- Go 1.20+（仅在需要编译客户端时）

## 本地启动
1) 安装依赖
```bash
npm install
```

2) 配置环境
```bash
cp .env.example .env
```

3) 初始化数据库
```bash
npx prisma migrate dev --name init
npm run seed
```

4) 启动服务（开发模式）
```bash
npm run dev
```

## 环境变量
必填（对应 `.env.example`）：
- `DATABASE_URL`（MySQL）
- `REDIS_URL`
- `AUTH_SECRET`
- `AUTH_TRUST_HOST`（true/false）
- `AUTH_CLIENT_ID`
- `AUTH_CLIENT_SECRET`
- `AUTH_AUTHORIZATION_URL`
- `AUTH_TOKEN_URL`
- `AUTH_USERINFO_URL`
- `AUTH_SCOPE`（可选，默认 `openid profile email`）
- `NEXTAUTH_URL` / `AUTH_URL`
- `NEXT_PUBLIC_APP_URL`
- `VPN_SERVER_URL`

## CLI 客户端（Go）
编译并运行：
```bash
cd client
go build -o webvpn-client
./webvpn-client --server http://localhost:3000 --key YOUR_KEY --port 8080
```

可选：
- `--version`（在后台显示客户端版本）

## WebSocket 端点
- `ws://HOST/ws`（客户端隧道）
- `ws://HOST/ws/status`（后台实时状态）

## Docker
构建镜像：
```bash
docker build -t webvpn .
```

运行容器：
```bash
docker run -p 3000:3000 \
  -e DATABASE_URL="mysql://user:pass@db:3306/webvpn" \
  -e REDIS_URL="redis://redis:6379" \
  -e AUTH_SECRET="change-me" \
  -e AUTH_TRUST_HOST="true" \
  -e AUTH_CLIENT_ID="xxx" \
  -e AUTH_CLIENT_SECRET="xxx" \
  -e AUTH_AUTHORIZATION_URL="https://example.com/oauth/authorize" \
  -e AUTH_TOKEN_URL="https://example.com/oauth/token" \
  -e AUTH_USERINFO_URL="https://example.com/oauth/userinfo" \
  -e AUTH_SCOPE="openid profile email" \
  -e NEXTAUTH_URL="http://localhost:3000" \
  -e AUTH_URL="http://localhost:3000" \
  -e NEXT_PUBLIC_APP_URL="http://localhost:3000" \
  -e VPN_SERVER_URL="http://localhost:3000" \
  webvpn
```

## Docker Compose
使用 `docker-compose.yml` 一键启动（包含 MySQL / Redis / WebVPN）：
```bash
docker compose up -d
```

## 备注
- `AUTH_*` 需要和你的 OAuth 提供商配置一致。
- 客户端 Key 在 UI 中只显示一次，请妥善保存。
