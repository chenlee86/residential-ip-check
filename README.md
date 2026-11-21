# 住宅 IP 验纯

使用 Cloudflare Pages 和 Pages Functions 的中文查询工具，覆盖美国、英国、德国和香港。查询 RIPEstat 的 BGP 起源、Cloudflare DoH 的 PTR 和 IPWho 的地理元数据。默认使用可复核规则，无需模型密钥。运营商名单是参考配置，运营商可同时服务家庭和企业。用户附加的 WHOIS 或 traceroute 会随报告显示供人工核验。

本地运行 `wrangler pages dev public`，然后打开终端显示的地址。

Cloudflare Pages Git 集成设置：生产分支为 `main`，框架预设为 None，构建命令留空，构建输出目录为 `public`。Pages Functions 会从仓库根目录的 `functions` 加载。
