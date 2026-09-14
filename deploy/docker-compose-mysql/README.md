# DodoGuard 远程镜像仓库部署

本目录用于从 Docker Hub 拉取 DodoGuard 镜像，并通过 Docker Compose 与 MySQL 一起部署。它与 `zhian-offline/` 的离线交付流程相互独立。

## 交付内容

```text
deploy/docker-compose-mysql/
├── .env.example                    # 密钥模板，复制后填写
├── .gitignore                       # 防止本地密钥与日志被误提交
├── docker-compose.yml              # 生产 Compose 配置
├── dodoguard.sql                   # 已清理的首次初始化数据库
└── README.md
```

`dodoguard.sql` 只会在 MySQL 使用**全新空数据卷**时执行一次；应用随后执行镜像内置迁移。它不应替换正在使用中的生产数据库。

## 前置条件

- Linux 服务器已安装 Docker 与 Docker Compose 插件；
- 服务器可访问 Docker Hub；
- 仅需对用户或反向代理开放 TCP `3000`；MySQL 不会暴露到公网；
- 将整个目录上传到服务器，例如 `/data/dodoguard/docker-compose-mysql`。

检查 Docker：

```sh
docker version
docker compose version
```

## 1. 创建部署密钥

在部署目录复制模板：

```sh
cd /data/dodoguard/docker-compose-mysql
cp .env.example .env
```

编辑 `.env`，为每个变量设置不同的随机值。可用以下命令生成：

```sh
openssl rand -base64 48
```

必须填写：

- `JWT_SECRET` 与 `JWT_REFRESH_SECRET`：不同、至少 32 位的随机值；
- `MYSQL_PASSWORD`：DodoGuard 数据库用户密码；
- `MYSQL_ROOT_PASSWORD`：MySQL root 密码。

`.env` 包含凭据，必须限制访问权限，不能提交 Git 或通过公开渠道分发：

```sh
chmod 600 .env
```

## 2. 启动

镜像引用使用不可变 digest，确保拉取到经过验证的相同应用版本。MySQL 固定为 `8.0.43`。

```sh
docker compose pull
docker compose up -d
```

检查状态与日志：

```sh
docker compose ps
docker compose logs -f dodoguard
```

`docker compose ps` 中两个服务都应显示为 `healthy`。Compose 已为容器日志设置轮转：每个服务最多保留 3 个、每个最大 10MB 的本地日志文件。

访问：

```text
http://服务器IP:3000
```

首次登录后，应立即更新默认管理员账户的凭据，并按实际环境配置模型 Provider。

## 3. 停止、重启与升级

停止容器但保留数据：

```sh
docker compose down
```

重启：

```sh
docker compose up -d
```

升级时，先在受控环境验证新镜像 digest，再修改 `docker-compose.yml` 中 DodoGuard 镜像引用：

```sh
docker compose pull dodoguard
docker compose up -d dodoguard
```

不要执行 `docker compose down -v`，除非你明确要删除所有 MySQL、应用数据、报告和用户配置卷。

## 数据库重置

只有在已经备份且确认可以销毁数据时，才可重置数据库。先停止 Compose，再通过 `docker volume ls` 查找本项目对应的 MySQL 卷；默认名称通常包含当前 Compose 项目名。删除该卷后重新启动，MySQL 才会再次执行 `dodoguard.sql`。

## 安全边界

- MySQL 未映射宿主机端口，只允许 Compose 内部网络访问；如确有维护需求，应另行添加仅绑定 `127.0.0.1` 的端口映射。
- 不要将 `.env`、带业务数据的 SQL、镜像 tar 包或运行日志发送到公开仓库。
- 建议在 `3000` 前部署 HTTPS 反向代理，并通过防火墙仅开放必要端口。
- 每次发布镜像时，从干净 Git 提交构建并记录版本标签与 digest。
