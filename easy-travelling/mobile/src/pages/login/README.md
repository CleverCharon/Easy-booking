# 登录与账号设置模块 (Login & Setup) 技术归纳文档

## 1. 概述
登录模块是用户进入系统的身份验证入口，支持多端（H5/小程序）适配。包含登录主页 (`login/index`) 和新用户账号设置页 (`login/setup/index`) 两个核心页面。

## 2. 功能模块与实现

### 2.1 登录页 (`login/index`)
- **双模式登录**:
  - **验证码登录**: 输入手机号 -> 获取验证码 -> 登录/自动注册。
  - **密码登录**: 手机号 + 密码登录。
- **微信一键登录 (小程序特有)**:
  - 通过 `Taro.getEnv()` 判断当前环境。
  - 若为微信小程序，显示“微信一键登录”按钮。
  - 调用 `Taro.login()` 获取 `code`，后端换取 `openid` 完成登录。
- **验证码倒计时**:
  - 前端维护 60s 倒计时状态 (`setInterval`)，防止重复发送。
- **协议勾选**:
  - 强制用户勾选《用户协议》与《隐私条款》后方可进行登录操作。
- **新用户引导**:
  - 登录接口返回 `is_new: true` 时，自动跳转至 `setup` 页面完善资料。

### 2.2 账号设置页 (`login/setup/index`)
- **场景**: 仅针对首次通过验证码登录的新用户。
- **功能**:
  - 设置用户名 (2-10位)。
  - 设置登录密码 (6-20位) 并确认。
  - 展示当前绑定的手机号（脱敏处理 `138****8888`）。
- **流程**:
  - 提交成功后自动执行登录逻辑 (`login(res.user)`)。
  - 延迟 1.5s 后回退两步 (`navigateBack({ delta: 2 })`)，确保用户直接返回到触发登录的页面（如详情页或个人中心）。

## 3. 接口调用

| 接口路径 | 方法 | 描述 | 参数示例 |
| :--- | :--- | :--- | :--- |
| `/sms/send` | POST | 发送短信验证码 | `{ phone: '138...' }` |
| `/auth/login` | POST | 登录/注册 | `{ phone, code, password, method: 'code'\|'password' }` |
| `/user/wx-login` | POST | 微信小程序登录 | `{ code: '...' }` |
| `/user/setup-account` | POST | 新用户完善资料 | `{ userId, username, password }` |

## 4. 样式亮点与处理

### 4.1 视觉设计 (SCSS)
- **全屏背景**:
  - 使用高质量摄影图作为背景，叠加半透明遮罩 (`rgba(37, 37, 95, 0.3)`) 和渐变层 (`gradient-overlay`)，保证文字清晰度。
- **毛玻璃卡片**:
  - 表单区域采用 `backdrop-filter: blur(10px)` 实现磨砂玻璃质感，配合半透明边框，极具现代感。
- **输入框交互**:
  - 自定义 Input 样式，聚焦时高亮边框 (`border-color: rgba(51, 199, 247, 0.5)`)。
  - 验证码按钮在倒计时期间置灰不可点。

### 4.2 兼容性处理
- **Z-Index 层级管理**:
  - 为了解决背景遮罩可能挡住点击事件的问题，显式设置了 `.content-wrap` 为 `pointer-events: none`，并对内部交互元素（输入框、按钮）恢复 `pointer-events: auto`。
- **安全区域**:
  - 顶部导航栏适配了刘海屏 (`env(safe-area-inset-top)`)。

## 5. 核心逻辑代码片段

### 5.1 登录成功后的跳转逻辑
```typescript
if (res.is_new) {
  // 新用户 -> 跳转设置页
  Taro.navigateTo({ url: `/pages/login/setup/index?userId=${res.id}&phone=${res.phone}` })
} else {
  // 老用户 -> 存状态 -> 返回上一页
  login(userInfo)
  Taro.navigateBack()
}
```

### 5.2 微信环境判断
```typescript
useEffect(() => {
  if (Taro.getEnv() === Taro.ENV_TYPE.WEAPP) {
    setIsWeapp(true)
  }
}, [])
```

## 6. 文件结构
- `index.tsx`: 登录主逻辑。
- `setup/index.tsx`: 账号设置页逻辑。
- `index.scss` / `setup/index.scss`: 样式文件，复用了背景图和毛玻璃卡片的设计语言。
