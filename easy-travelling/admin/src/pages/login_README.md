# 管理后台登录页 (Admin Login Page) 技术归纳文档

## 1. 概述
管理后台登录页是商户和管理员进入系统的统一入口。采用了左右分栏的卡片式设计，左侧展示品牌形象，右侧提供登录与注册功能。页面集成了角色区分、手机验证码、密码校验等安全机制。

## 2. 功能模块与实现

### 2.1 登录模块 (`activeTab = 'login'`)
- **表单项**: 账号、密码、记住我（Checkbox）。
- **交互**:
  - 提交时调用 `apiLogin` 接口。
  - 登录成功后将 Token 写入 `localStorage` (`setToken`)。
  - 根据返回的角色 (`role`) 自动跳转至对应的工作台：
    - `admin` -> `/admin` (管理员首页)
    - `merchant` -> `/hotels` (商户酒店列表页)

### 2.2 注册模块 (`activeTab = 'register'`)
- **角色选择**: 支持注册为“商户”或“管理员”。
- **表单项**:
  - 基础信息：账号、密码、确认密码。
  - 手机验证：集成 `PhoneFields` 组件（国家区号+手机号），支持发送短信验证码。
  - 身份验证：
    - **管理员**: 必填“身份码” (6位字母/数字)，用于系统内部鉴权。
    - **商户**: 选填“邀请码”，用于追踪推广渠道。
- **交互**:
  - **短信发送**: 包含 60s 倒计时防刷逻辑。
  - **动态校验**: 确认密码需与密码一致；身份码/邀请码正则校验。
  - **注册成功**: 自动清空表单并切换回登录 Tab，回填注册账号。

## 3. 接口调用

| 接口路径 | 方法 | 描述 | 参数示例 |
| :--- | :--- | :--- | :--- |
| `/auth/login` | POST | 用户登录 | `{ username, password }` |
| `/auth/register` | POST | 用户注册 | `{ username, password, role, phone, smsCode, ... }` |
| `/sms/send` | POST | 发送短信验证码 | `{ phone: '+86138...' }` |

## 4. 样式亮点与处理

### 4.1 视觉设计 (Tailwind CSS)
- **品牌展示 (左侧)**:
  - 渐变背景 (`linear-gradient`) 呼应品牌色。
  - 品牌 Logo 使用特殊字体 `"华文新魏"`，增加辨识度。
  - 玻璃拟态卡片 (`backdrop-blur-md`) 展示核心价值点（安全、实时、智能）。
- **表单区域 (右侧)**:
  - 采用 `Tabs` 切换登录/注册视图。
  - 输入框统一使用大圆角 (`rounded-xl`) 和大尺寸 (`size="large"`)，提升操作手感。
  - 登录/注册按钮使用品牌渐变色，Hover 时增加阴影深度。

### 4.2 响应式与细节
- **全屏背景**: 使用 `bg-cover` 铺满屏幕，叠加轻微的渐变蒙版，保证文字可读性。
- **阴影处理**: 登录卡片使用多重阴影 (`shadow-[0_25px_80px_...]`) 营造强烈的悬浮感。

## 5. 核心逻辑代码片段

### 5.1 登录跳转逻辑
```typescript
const onLoginFinish = async (values) => {
  const res = await apiLogin(values)
  setToken(res.token)
  setUser(res.user)
  // 根据角色分流
  const target = res.user?.role === 'admin' ? '/admin' : '/hotels'
  navigate(target, { replace: true })
}
```

### 5.2 动态表单项（角色区分）
```typescript
<Form.Item noStyle shouldUpdate={(prev, curr) => prev.role !== curr.role}>
  {({ getFieldValue }) => {
    const role = getFieldValue('role')
    if (role === 'admin') {
      return <Form.Item name="roleCode" label="身份码" rules={[{ required: true }]} ... />
    }
    return <Form.Item name="roleCode" label="邀请码" extra="选填" ... />
  }}
</Form.Item>
```

## 6. 文件结构
- `login.tsx`: 页面主文件，包含 UI 与逻辑。
- 依赖组件: `antd` (Form, Tabs, Input, Button), `PhoneFields` (手机号输入组件)。
- 依赖 API: `api/auth.ts`.
