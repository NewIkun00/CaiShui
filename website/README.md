# 账税通宣传官网

该目录是与 `ledgerly/` 业务平台完全解耦的静态官网，不依赖平台源码、Node.js 或数据库。可整个复制到独立仓库，或部署到 OSS、CDN、Nginx 等任意静态托管环境。

## 本地预览

```bash
cd website
python3 -m http.server 3080
```

访问 `http://127.0.0.1:3080/`。

## 配置平台地址

部署前修改 `config.js`：

```js
window.LEDGERLY_SITE_CONFIG = {
  platformUrl: 'https://app.example.com/login',
};
```

官网与业务平台可使用不同域名，“进入平台”只执行标准跨域页面跳转，不共享 Cookie、会话或运行时依赖。
