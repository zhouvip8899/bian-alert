/**
 * 会员授权配置 auth-config.js
 * 由 admin.html 管理页生成，不要手动修改
 *
 * keys: 授权码 SHA-256 哈希数组（全小写hex）
 * 每个条目格式：{ hash: "...", expire: 毫秒时间戳或0表示永久, label: "备注" }
 *
 * 修改后刷新页面即生效，不需要服务器。
 */
window.AUTH_CONFIG = {
    version: 1,
    // 默认内置一个演示授权码：BIANVIP2026（永久有效）
    // 请在 admin.html 生成正式授权码后替换本列表
    keys: [
        // { hash: "sha256hex...", expire: 0, label: "备注" }
    ]
};
