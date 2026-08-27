# DodoGuard Security Platform

## 🎯 概述

DodoGuard 是一个企业级的 AI 安全测试平台，专门用于检测和评估 AI 系统的安全漏洞。通过模拟各种攻击场景，帮助组织识别和修复 AI 系统的安全风险。

## ✨ 主要功能

### 🔐 用户认证与权限管理
- JWT 认证系统
- 角色-based 权限控制
- 多租户组织支持
- 用户邀请和激活流程

### 🎯 攻击任务管理
- 创建和配置安全测试任务
- 支持多种攻击模式（简单攻击、多轮对话、组合攻击）
- 实时任务执行监控
- 详细的结果分析和报告

### 🤖 智能体管理
- 注册和管理目标 AI 代理
- 支持多种 AI 平台（Dify, OpenAI, Anthropic等）
- 健康状态监控
- 攻击历史追踪

### 📊 实时监控 Dashboard
- 安全统计概览
- 实时任务状态更新
- 风险分布图表
- 系统健康监控

### 🛡️ 漏洞管理
- 漏洞库管理
- 攻击指令配置
- 检测规则设置
- 解决方案关联

### 📋 报告系统
- 自动生成安全报告
- 支持多种格式（PDF、HTML、Markdown）
- 可定制报告模板
- 报告下载和分享

### ⚙️ 系统配置
- 功能开关管理
- 集成配置（LLM、支付、通知等）
- 安全策略设置
- 系统参数调整

## 🚀 快速开始

### 环境要求

- Node.js 22.12+
- MySQL 8.0+ (默认，推荐) 或 PostgreSQL 12+ 或 SQLite
- npm 或 yarn

### 安装步骤

1. **克隆项目**
   ```bash
   git clone https://github.com/your-org/dodoguard.git
   cd dodoguard
   ```

2. **配置环境变量**
   ```bash
   # 创建本地环境配置文件
   cp .env.example .env
   # 编辑 .env 文件设置数据库连接等
   nano .env
   ```

   主要配置项：
   ```env
   # 数据库配置 (MySQL 为默认)
   DB_TYPE=mysql  # mysql (默认), postgres, 或 sqlite
   DATABASE_URL=mysql://USER:PASSWORD@localhost:3306/dodoguard

   # JWT 配置
   JWT_SECRET=your-super-secret-jwt-key
   JWT_REFRESH_SECRET=your-super-secret-refresh-key

   # 其他配置
   NODE_ENV=development
   ```

3. **启动系统**
   ```bash
   # 一键启动（推荐）
   ./start-with-mysql.sh

   # 或使用 MySQL 管理器
   ./mysql-manager.sh full

   # 或手动管理 MySQL
   ./mysql-manager.sh status    # 检查状态
   ./mysql-manager.sh status    # 检查状态
   ./mysql-manager.sh start     # 启动系统服务
   ./mysql-manager.sh direct    # 直接启动 MySQL
   ./mysql-manager.sh setup     # 设置数据库

   # 如果遇到问题，可以运行诊断脚本
   ./diagnose-mysql.sh

   # 然后启动应用
   npm install
   npm run db:migrate
   npm run dev
   ```

4. **访问应用**
   - 前端界面: http://localhost:3000
   - 后端 API: http://localhost:15500
   - API 文档: http://localhost:15500/api/v1/health

### 数据库初始化

系统会在首次启动时自动创建数据库表和初始数据。如果需要手动初始化：

```bash
# 运行数据库迁移
npm run db:migrate
```

## 📖 使用指南

### 创建组织管理员账户

首次部署时，请使用应用提供的初始化流程创建管理员账户，并设置唯一的强密码。请勿使用固定管理员账号、示例密码或将密码哈希写入部署脚本。

### 配置目标代理

1. 在前端界面进入 "Agents" 页面
2. 点击 "Add Agent" 按钮
3. 填写代理信息：
   - 名称和描述
   - 代理类型（agent, llm, mcp等）
   - API 配置信息

### 执行安全测试

1. 创建攻击任务：
   - 选择目标代理
   - 选择测试漏洞
   - 配置检测选项
   - 启动任务执行

2. 监控任务进度：
   - 实时查看执行状态
   - 查看详细的攻击对话
   - 分析检测结果

3. 生成报告：
   - 任务完成后自动生成报告
   - 支持 PDF/HTML 格式下载
   - 可定制报告内容

## 🔧 API 文档

### 认证接口

```bash
# 用户登录
POST /api/v1/auth/login
{
  "email": "user@example.com",
  "password": "password"
}

# 刷新令牌
POST /api/v1/auth/refresh
{
  "refreshToken": "refresh_token_here"
}
```

### 攻击任务接口

```bash
# 创建任务
POST /api/v1/attack-tasks
{
  "name": "Security Test",
  "targetType": "agent",
  "targetConfig": {...},
  "vulnerabilities": ["vuln-id-1", "vuln-id-2"],
  "attackMode": "conversation",
  "detectionConfig": {...}
}

# 执行任务
POST /api/v1/attack-tasks/{taskId}/run

# 获取结果
GET /api/v1/attack-tasks/{taskId}/results
```

### WebSocket 实时通信

```javascript
// 连接 WebSocket
const socket = io('http://localhost:15500', {
  auth: { token: 'your-jwt-token' }
});

// 订阅任务更新
socket.emit('subscribe:task', taskId);

// 订阅代理更新
socket.emit('subscribe:agent', agentId);

// 监听消息
socket.on('message', (data) => {
  console.log('Real-time update:', data);
});
```

## 🔒 安全注意事项

1. **生产环境配置**
   - 使用强密码的 JWT 密钥
   - 配置 HTTPS
   - 设置适当的数据库连接限制
   - 启用审计日志

2. **权限管理**
   - 定期审查用户权限
   - 使用最小权限原则
   - 监控敏感操作

3. **数据保护**
   - 定期备份数据库
   - 加密敏感数据
   - 遵守数据保留政策

## 🐛 故障排除

### 常见问题

1. **数据库连接失败**
   ```bash
   # 检查 PostgreSQL 状态
   sudo systemctl status postgresql

   # 测试连接
   psql -h localhost -U postgres -d dodoguard
   ```

2. **WebSocket 连接问题**
   - 确保防火墙允许相应端口
   - 检查 JWT token 有效性
   - 查看服务器日志

3. **权限错误**
   - 检查用户角色配置
   - 验证 JWT token
   - 查看审计日志

### 日志位置

- 应用日志: `logs/app.log`
- 错误日志: `logs/error.log`
- 审计日志: 存储在数据库中

## 🤝 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 📞 支持

- 📧 邮箱: support@dogoguard.com
- 📚 文档: [docs.dodoguard.com](https://docs.dodoguard.com)
- 🐛 问题反馈: [GitHub Issues](https://github.com/your-org/dodoguard/issues)

---

**DodoGuard** - 让 AI 安全测试变得简单而强大！ 🛡️🤖
