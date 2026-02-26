# 服务端核心 (Server Core) 技术归纳文档

## 1. 概述
`server/index.js` 是整个后端的入口文件，集成了数据库连接、API 路由、认证鉴权、阿里云服务（OSS/SMS）、定时任务及全局错误处理。采用 Node.js + Express 框架构建，支持高并发的异步操作与事务管理。

## 2. 核心功能模块

### 2.1 基础架构
- **Express 服务器**: 监听 3000 端口，配置了 `cors` 跨域支持和 `express.json()` 解析。
- **MySQL 连接池**: 使用 `mysql2` 创建连接池，支持 `Promise` 包装 (`dbPromise`)，便于 `async/await` 调用。启动时自动检测连接状态。
- **环境配置**: 依赖 `dotenv` 加载 `.env` 文件，支持自定义端口、数据库凭证、JWT 密钥及阿里云 AK/SK。

### 2.2 认证与鉴权
- **JWT 认证**:
  - `authMiddleware`: 解析 Bearer Token，验证通过后将用户信息挂载到 `req.user`。
  - `adminMiddleware`: 在 `authMiddleware` 基础上校验 `role === 'admin'`。
- **注册/登录**:
  - 支持手机验证码登录/注册（自动创建临时账号）。
  - 支持用户名/密码登录。
  - 密码使用 `bcryptjs` 进行哈希加密存储。
- **短信服务**: 集成阿里云短信服务 (`@alicloud/dypnsapi20170525`)，发送验证码并支持频控（60s）和有效期（5min）。

### 2.3 业务逻辑

#### 2.3.1 酒店管理
- **发布/编辑**: 商户可发布酒店及房型。
  - **事务支持**: 插入酒店、房型、初始化库存都在一个事务中完成。
  - **库存补齐**: `ensureRoomStockRows` 函数会自动为未来 N 天（默认 180 天）补齐库存记录。
- **查询**: 支持按城市、关键字、日期范围搜索。
  - **库存计算**: 搜索时动态计算每家酒店在指定日期范围内的“最小剩余库存” (`minRemain`)，过滤掉无房酒店。
- **审核流**: 管理员可对商户发布的酒店进行通过 (`approve`)、拒绝 (`reject`) 或下线 (`offline`) 操作。

#### 2.3.2 订单系统
- **创建订单**:
  - 开启事务，行级锁 (`FOR UPDATE`) 锁定对应日期的库存行。
  - 校验库存充足后扣减库存（预占），生成订单状态为 `0` (待支付)。
  - **注意**: 当前逻辑是下单即校验库存，支付成功才正式扣减（或者下单扣减、超时回滚，具体看 `releaseRoomStockForBooking` 逻辑）。
  - *修正*: 代码中 `create_order` 只是校验库存，**未扣减**。`pay` 接口才执行 `booked_count + room_count`。
- **支付**:
  - 再次校验库存（防止并发超卖）。
  - 更新 `room_stock.booked_count`（增加占用）。
  - 更新订单状态为 `1` (已支付)。
- **取消**:
  - 若已支付，释放库存（`booked_count` 递减）。
  - 更新订单状态为 `2` (已取消)。
- **自动完成**:
  - 查询接口触发时，自动检测 `check_out_date < CURDATE()` 的已支付订单，流转为 `3` (已完成) 并释放库存（*注：代码逻辑似乎是完成后也释放了库存？需确认业务逻辑，通常完成后不释放，或者是释放了“预订占用”转为“历史占用”*）。
  - *代码确认*: `syncCompletedBookingsAndReleaseStock` 函数确实执行了 `releaseRoomStockForBooking`，这意味着库存设计是“可售库存 = 总库存 - 预订占用”，入住结束后释放预订占用，库存恢复？这可能是一个特殊的业务设计（如钟点房或循环利用），或者是一个 Bug（通常入住后库存不应恢复，除非是“未入住”）。**经再次检查，代码确实在订单完成后释放了库存，这在酒店业务中通常是不对的（除非是当天离店后房间又可卖），此处可能是一个为了演示方便的简化逻辑。**

### 2.4 文件服务
- **阿里云 OSS**:
  - `upload` 接口接收 `multer` 处理的内存文件流。
  - 使用 `ali-oss` SDK 上传至 Bucket，返回公网 URL。
  - 实现了 URL 到 ObjectKey 的解析逻辑，便于后续删除文件。

## 3. 接口列表概览

| 模块 | 方法 | 路径 | 描述 |
| :--- | :--- | :--- | :--- |
| **Auth** | POST | `/api/auth/sms/send` | 发送短信验证码 |
| | POST | `/api/auth/login` | 登录（密码/验证码） |
| | POST | `/api/auth/register` | 注册 |
| | GET | `/api/auth/me` | 获取个人信息 |
| **Hotel** | GET | `/api/hotels` | 搜索酒店 |
| | POST | `/api/hotels` | 发布酒店（商户） |
| | GET | `/api/hotels/:id` | 获取详情 |
| **Order** | POST | `/api/bookings/create` | 创建订单 |
| | POST | `/api/bookings/:id/pay` | 支付订单 |
| | POST | `/api/bookings/:id/cancel` | 取消订单 |
| **Admin** | GET | `/api/admin/hotels/pending` | 待审核列表 |
| | POST | `/api/admin/hotels/:id/approve` | 审核通过 |

## 4. 代码亮点与处理

### 4.1 健壮的库存管理
- **自动补齐**: 启动时 (`backfillRoomStockForAllHotels`) 和查询详情时，都会检查并补齐未来日期的库存行，防止因数据缺失导致的查询错误。
- **并发控制**: 关键的库存操作（下单、支付）均使用了数据库事务 (`beginTransaction`) 和行锁 (`FOR UPDATE`)，有效防止超卖。

### 4.2 灵活的 SQL 构建
- **动态查询**: 酒店搜索接口使用了数组拼接 `whereClauses` 的方式，灵活支持城市、关键字的多条件组合。
- **Schema 自适应**: `ensureBookingFeatureColumns` 函数在启动时检查表结构，自动添加缺失字段（如 `status`, `room_count`），极大地简化了部署和升级流程。

### 4.3 安全性
- **密码加密**: 强制使用 `bcrypt` 哈希。
- **参数清洗**: 手机号自动去除 `+86` 和非数字字符。
- **权限分级**: 严格区分普通用户、商户、管理员的接口权限。

## 5. 待优化点
- **库存释放逻辑**: 订单完成后释放库存的逻辑可能不符合常规酒店业务（过去日期的库存释放没有意义，但如果释放了会导致历史数据查询库存量变大）。
- **硬编码**: 部分配置（如默认库存 1）硬编码在文件中。

## 6. 文件依赖
- `package.json`: 依赖 `express`, `mysql2`, `ali-oss`, `jsonwebtoken` 等核心库。
- `.env`: 环境变量配置文件。
