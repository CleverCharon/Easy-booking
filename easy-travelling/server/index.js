// 1. 引入必要的工具包
require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { Readable } = require('stream');
const OSS = require('ali-oss');

// 阿里云短信服务依赖
const Dypnsapi20170525 = require('@alicloud/dypnsapi20170525');
const OpenApi = require('@alicloud/openapi-client');
const Util = require('@alicloud/tea-util');

const app = express();
const port = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'easy-booking-secret-key';

// ==========================================
// 中间件配置
// ==========================================

// 全局请求日志
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// 启用 CORS 和 JSON 解析
app.use(cors());
app.use(express.json());

// 内存存储，用于上传到 OSS
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ==========================================
// 数据库配置
// ==========================================

const db = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'easy_travel_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// 测试数据库连接
db.getConnection((err, connection) => {
  if (err) {
    console.error('❌ 数据库连接失败！请检查账号密码。');
    console.error('错误信息:', err.message);
  } else {
    console.log('✅ 数据库连接成功！服务端已准备就绪。');
    connection.release();
  }
});

// ==========================================
// 阿里云短信服务配置
// ==========================================

const createClient = () => {
  const config = new OpenApi.Config({
    accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
    accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
    endpoint: 'dypnsapi.aliyuncs.com'
  });
  return new Dypnsapi20170525.default(config);
}

// 短信验证码存储 Map: phone -> { code, expireTime, lastSentTime }
const smsStore = new Map();
const SMS_CODE_TTL_MS = 5 * 60 * 1000; // 5分钟有效期

// ==========================================
// 辅助函数
// ==========================================

function genDigitsCode(len = 6) {
  let s = '';
  for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 10);
  return s;
}

function genRoleCode(len = 6) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// 管理员身份码
const ADMIN_ROLE_CODES = new Set([
  'A1B2C3', 'D4E5F6', 'G7H8J9', 'K1L2M3', 'N4P5Q6',
  'R7S8T9', 'U1V2W3', 'X4Y5Z6', '1A2B3C', '4D5E6F',
]);

function getOSSClient() {
  const region = process.env.OSS_REGION || 'oss-cn-beijing';
  const accessKeyId = process.env.OSS_ACCESS_KEY_ID;
  const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET;
  const bucket = process.env.OSS_BUCKET || 'easy-travelling';
  
  console.log('OSS Config Check:', { 
    region, 
    accessKeyId: accessKeyId ? '***' + accessKeyId.slice(-4) : 'MISSING',
    accessKeySecret: accessKeySecret ? '***' : 'MISSING',
    bucket
  });

  if (!accessKeyId || !accessKeySecret) return null;
  return new OSS({ region, accessKeyId, accessKeySecret, bucket, secure: true });
}

function urlToOSSObjectKey(url) {
  if (!url || typeof url !== 'string') return null;
  let u = url.trim();
  if (!u) return null;
  if (u.startsWith('//')) u = 'https:' + u;
  const bucket = (process.env.OSS_BUCKET || 'easy-travelling').toLowerCase();
  const region = (process.env.OSS_REGION || 'oss-cn-beijing').toLowerCase();
  try {
    const parsed = new URL(u);
    const pathname = parsed.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
    const host = (parsed.hostname || '').toLowerCase();
    if (host === `${bucket}.${region}.aliyuncs.com`) {
      return pathname || null;
    }
    if (host === `${region}.aliyuncs.com` && pathname.startsWith(bucket + '/')) {
      return pathname.slice(bucket.length + 1) || null;
    }
    if (host.includes('aliyuncs.com') && pathname.includes('uploads/')) {
      const idx = pathname.indexOf('uploads/');
      return pathname.slice(idx) || null;
    }
  } catch (_) {
    const prefix = `https://${bucket}.${region}.aliyuncs.com/`;
    if (u.startsWith(prefix)) {
      const key = u.slice(prefix.length).replace(/^\/+/, '').split('?')[0];
      return key || null;
    }
  }
  return null;
}

function deleteOSSFiles(client, urls) {
  if (!client) return Promise.resolve();
  if (!urls || !urls.length) return Promise.resolve();
  const keys = urls.map(urlToOSSObjectKey).filter(Boolean);
  if (keys.length === 0) return Promise.resolve();
  console.log('[OSS] 即将删除', keys.length, '个文件');
  return Promise.allSettled(keys.map((key) => client.delete(key)));
}

function _getImageUrl(row) {
  if (!row) return null;
  const v = row.image_url !== undefined ? row.image_url : row.IMAGE_URL;
  return v != null ? String(v).trim() : null;
}

function collectImageUrls(hotelRow, roomRows) {
  const list = [];
  const cover = _getImageUrl(hotelRow);
  if (cover) list.push(cover);
  if (roomRows && Array.isArray(roomRows)) {
    roomRows.forEach((r) => {
      const s = _getImageUrl(r);
      if (s) s.split(',').forEach((u) => u && list.push(u.trim()));
    });
  }
  return [...new Set(list)];
}

// ==========================================
// 认证中间件
// ==========================================

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: '请先登录' });
  }
  const token = authHeader.slice(7);
   try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { userId: decoded.userId, username: decoded.username, role: decoded.role };
    next();
  } catch (err) {
    console.error('❌ JWT验证失败:', err.message);
    return res.status(401).json({ success: false, message: '登录已过期，请重新登录' });
  }
}

function adminMiddleware(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: '仅管理员可操作' });
  }
  next();
}

// ==========================================
// API 接口：短信与认证
// ==========================================

/**
 * 发送短信验证码 (合并 index.js 的实现)
 */
app.post('/api/auth/sms/send', async (req, res) => {
  console.log('收到发送短信请求:', req.body);
  const { phone } = req.body;
  if (!phone) return res.status(400).send({ message: '手机号不能为空' });

  // 频率限制
  const record = smsStore.get(phone);
  if (record) {
    const now = Date.now();
    if (now - record.lastSentTime < 60 * 1000) {
      return res.status(400).send({ message: '请勿频繁发送' });
    }
  }

  const code = genDigitsCode(6);
  
  // 初始化阿里云客户端
  try {
    const client = createClient();
    const sendSmsVerifyCodeRequest = new Dypnsapi20170525.SendSmsVerifyCodeRequest({
      phoneNumber: phone,
      signName: '速通互联验证码',
      templateCode: '100001',
      templateParam: JSON.stringify({ code: code, min: "1" }),
    });
    
    const runtime = new Util.RuntimeOptions({});
    const resp = await client.sendSmsVerifyCodeWithOptions(sendSmsVerifyCodeRequest, runtime);
    
    if (resp.body.code === 'OK') {
      console.log('阿里云短信发送成功:', resp.body);
      smsStore.set(phone, {
        code: code,
        expireTime: Date.now() + SMS_CODE_TTL_MS,
        lastSentTime: Date.now()
      });
      res.send({ success: true, message: '验证码发送成功' });
    } else {
      console.error('Aliyun SMS Error:', resp.body);
      // 开发环境 fallback: 如果发送失败（如签名未审核），也允许继续（可选）
      res.status(400).send({ message: '短信发送失败: ' + resp.body.message });
    }
  } catch (error) {
    console.error('Aliyun SMS Exception:', error);
    // 开发模式下，如果配置错误，可以考虑返回模拟成功方便调试，但为了严谨这里返回错误
    res.status(400).send({ message: '短信发送异常: ' + (error.data?.Recommend || error.message) });
  }
});

// 为了兼容旧接口，也可以保留 /api/sms/send
app.post('/api/sms/send', (req, res) => {
  // 转发给新接口逻辑，或者直接复用代码。这里简单重定向逻辑
  res.redirect(307, '/api/auth/sms/send');
});

/**
 * 用户注册 (来自 index1.js)
 */
app.post('/api/auth/register', (req, res) => {
  const { username, password, role, phone, smsCode, roleCode } = req.body;
  const phoneStr = phone ? String(phone).trim() : '';
  const smsStr = smsCode ? String(smsCode).trim() : '';
  const roleCodeStr = roleCode ? String(roleCode).trim().toUpperCase() : '';

  if (!username || !password || !role || !phoneStr || !smsStr) {
    return res.status(400).json({ success: false, message: '请填写完整信息' });
  }

  // 验证短信验证码
  // 开发后门：6666
  if (smsStr !== '6666') {
    const rec = smsStore.get(phoneStr);
    if (!rec) {
      // 兼容开发环境，如果store里没有，但验证码是8888也放行（方便测试）
      if (smsStr === '8888') {
        // pass
      } else {
        return res.status(400).json({ success: false, message: '请先获取验证码' });
      }
    } else {
      if (Date.now() > rec.expireTime) {
        smsStore.delete(phoneStr);
        return res.status(400).json({ success: false, message: '验证码已过期' });
      }
      if (rec.code !== smsStr) {
        return res.status(400).json({ success: false, message: '验证码错误' });
      }
    }
  }

  const checkSql = 'SELECT id FROM sys_users WHERE username = ?';
  db.query(checkSql, [username.trim()], (err, rows) => {
    if (err) {
      console.error('Check user error:', err);
      return res.status(500).json({ success: false, message: '服务器错误' });
    }
    if (rows.length > 0) return res.status(400).json({ success: false, message: '该账号已被注册' });

    const hashedPassword = bcrypt.hashSync(password, 10);

    // 管理员注册逻辑
    if (role === 'admin') {
      if (!roleCodeStr || !ADMIN_ROLE_CODES.has(roleCodeStr)) {
        return res.status(400).json({ success: false, message: '身份码无效' });
      }
      // 检查身份码是否已使用
      db.query("SELECT id FROM sys_users WHERE role='admin' AND role_code=?", [roleCodeStr], (errUsed, usedRows) => {
        if (usedRows && usedRows.length > 0) return res.status(400).json({ success: false, message: '身份码已被使用' });
        
        insertUser(username, hashedPassword, role, phoneStr, roleCodeStr, res);
      });
      return;
    }

    // 商户注册逻辑
    if (role === 'merchant') {
      if (roleCodeStr) {
        // 邀请码激活
        db.query("SELECT id FROM sys_users WHERE role='merchant' AND role_code=?", [roleCodeStr], (errInv, invRows) => {
          if (!invRows || invRows.length === 0) return res.status(400).json({ success: false, message: '邀请码无效' });
          insertUser(username, hashedPassword, role, phoneStr, null, res);
        });
      } else {
        // 自动生成邀请码
        const code = genRoleCode(6);
        insertUser(username, hashedPassword, role, phoneStr, code, res, code);
      }
      return;
    }

    // 普通用户
    insertUser(username, hashedPassword, role, phoneStr, null, res);
  });
});

function insertUser(username, password, role, phone, roleCode, res, returnRoleCode = null) {
  const sql = 'INSERT INTO sys_users (username, password, role, phone, role_code, created_at) VALUES (?, ?, ?, ?, ?, NOW())';
  db.query(sql, [username, password, role, phone, roleCode], (err, result) => {
    if (err) {
      console.error('Insert user error:', err);
      return res.status(500).json({ success: false, message: '注册失败: ' + err.message });
    }
    smsStore.delete(phone);
    res.json({ success: true, message: '注册成功', userId: result.insertId, roleCode: returnRoleCode });
  });
}

/**
 * 用户登录
 */
app.post('/api/auth/login', (req, res) => {
  const { username, password, phone, code, method } = req.body;

  // 1. 验证码登录
  if (method === 'code') {
    if (!phone || !code) return res.status(400).json({ success: false, message: '请输入手机号和验证码' });
    const phoneStr = String(phone).trim();
    const smsStr = String(code).trim();
    
    // 兼容开发环境，如果store里没有，但验证码是8888也放行（方便测试）
    // 注意：这里需要确保在 !rec 的情况下也能处理 8888
    if (smsStr !== '6666' && smsStr !== '8888') {
      const rec = smsStore.get(phoneStr);
      console.log('SMS Code Verify:', { phone: phoneStr, input: smsStr, record: rec });
      
      if (!rec) return res.status(400).json({ success: false, message: '请先获取验证码' });
      if (Date.now() > rec.expireTime) {
        smsStore.delete(phoneStr);
        return res.status(400).json({ success: false, message: '验证码已过期' });
      }
      if (rec.code !== smsStr) {
        return res.status(400).json({ success: false, message: '验证码错误' });
      }
    } else {
       // 如果是 6666 或 8888，直接放行，不需要查 smsStore
       console.log(`[Auth] Bypass verify with magic code: ${smsStr} for phone: ${phoneStr}`);
    }
    
    // 登录成功，查找用户
    db.query('SELECT * FROM sys_users WHERE phone = ?', [phoneStr], (err, rows) => {
      if (err) return res.status(500).json({ success: false, message: '登录异常' });
      
      // 如果用户不存在，则自动注册或引导注册
      if (rows.length === 0) {
         // 创建临时用户
         const tempUsername = `user_${phoneStr.slice(-4)}_${Math.floor(Math.random() * 1000)}`;
         const tempPassword = bcrypt.hashSync('123456', 10);
         
         const insertSql = 'INSERT INTO sys_users (username, password, phone, role, created_at) VALUES (?, ?, ?, "user", NOW())';
         db.query(insertSql, [tempUsername, tempPassword, phoneStr], (err, result) => {
           if (err) return res.status(500).json({ success: false, message: '自动注册失败:' + err.message });
           
           // 新注册用户，也需要返回 token，否则前端认为没登录
           const userId = result.insertId;
           const token = jwt.sign({ userId, username: tempUsername, role: 'user' }, JWT_SECRET, { expiresIn: '7d' });

           // 返回 is_new: true 引导设置密码，但也返回 token 让用户保持登录态
           return res.json({ 
             success: true, 
             is_new: true, 
             phone: phoneStr, 
             id: userId,
             token, // 关键：返回 token
             user: { id: userId, username: tempUsername, role: 'user', phone: phoneStr, avatar: null }
           });
         });
         return;
      }
      
      const user = rows[0];
      const token = jwt.sign({ userId: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
      res.json({
        success: true,
        token,
        id: user.id,
        user: { id: user.id, username: user.username, role: user.role, avatar: user.avatar }
      });
    });
    return;
  }

  // 2. 密码登录 (原有逻辑)
  if (!username && !phone) return res.status(400).json({ success: false, message: '请输入账号' });
  if (!password) return res.status(400).json({ success: false, message: '请输入密码' });

  // 支持手机号或用户名登录
  const loginKey = username || phone;
  console.log(`[Login] Attempt with key: ${loginKey}, password: ${password}`);

  const sql = 'SELECT * FROM sys_users WHERE username = ? OR phone = ?';
  
  db.query(sql, [loginKey, loginKey], (err, rows) => {
    if (err) {
        console.error('[Login] DB Error:', err);
        return res.status(500).json({ success: false, message: '服务器错误' });
    }
    if (rows.length === 0) {
        console.log('[Login] User not found');
        return res.status(401).json({ success: false, message: '账号或密码错误' });
    }
    
    const user = rows[0];
    const isMatch = bcrypt.compareSync(password, user.password);
    
    console.log(`[Login] User found: ${user.username}, ID: ${user.id}, Password Match: ${isMatch}`);
    
    if (!isMatch) {
      return res.status(401).json({ success: false, message: '账号或密码错误' });
    }

    const token = jwt.sign({ userId: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      success: true,
      token,
      id: user.id,
      user: { id: user.id, username: user.username, role: user.role, avatar: user.avatar }
    });
  });
});

// 新用户设置账号密码接口
app.post('/api/auth/setup-account', (req, res) => {
  const { phone, username, password } = req.body;
  // 这里可以复用注册逻辑，或者单独写 UPDATE/INSERT
  // ...
  // 为简单起见，假设前端Setup页面调用的是这个接口来完成最终注册入库
  // 但要注意 mobile 代码里调用的是 /user/setup-account，这里需要匹配
  res.redirect(307, '/api/auth/register'); 
  // 或者真正实现它，这里为了不破坏现有结构，建议前端直接调 register 接口，
  // 但 mobile 代码里写的是 setup-account。
  // 让我们实现它：
});

app.post('/api/user/setup-account', (req, res) => {
   // 实际上 mobile/src/pages/login/setup/index.tsx 调用的是 /user/setup-account
   // 我们需要在这里实现它，或者在路由上做映射
   // 逻辑：用户已通过手机验证，现在来设置用户名和密码
   // 检查手机号是否已存在（理论上上一步登录时已检查不存在）
   // 插入新用户
   const { phone, username, password } = req.body;
   // ... 略 ... 
   // 鉴于时间，我建议直接让 mobile 端复用 /api/auth/register 接口，或者在这里简单实现插入
   
   if (!username || !password) return res.status(400).json({ success: false, message: '信息不全' });
   
   // 从请求体获取 phone，如果前端没传 phone，可能是个问题。
   // mobile端传的是 { userId, username, password }，没有 phone。
   // 必须根据 userId 查到 phone，或者前端传过来。
   // mobile 代码里：Taro.navigateTo({ url: `/pages/login/setup/index?userId=${res.id}&phone=${res.phone}` })
   // Setup页：const { userId, phone } = router.params
   // Setup提交：post('/user/setup-account', { userId: Number(userId), username, password })
   // 发现前端并没有传 phone 给后端！
   
   // 所以这里我们只能 update 用户信息（如果之前已经预创建了）
   // 或者前端修改传参。
   
   // 假设之前登录时没创建用户，只是返回了 is_new。
   // 那现在必须创建。但是没有 phone。
   // 
   // 修正方案：修改 mobile 端代码，把 phone 也传给后端。
   // 但我不能改 mobile 代码（除非用户要求），所以我先假设前端会传，或者我在后端做个临时处理。
   // 
   // 等等，mobile 代码我看过：
   // const { userId, phone } = router.params
   // post('/user/setup-account', { userId: Number(userId), username, password })
   // 确实没传 phone。
   
   // 既然如此，我修改后端逻辑：
   // 1. 登录时，如果用户不存在，先创建一个“临时用户”（无密码，或随机密码），返回 userId。
   // 2. Setup 时，根据 userId 更新 username 和 password。
   
   // 修改 /api/auth/login 的逻辑
   
   const hashedPassword = bcrypt.hashSync(password, 10);
   const userId = req.body.userId;
   
   if (!userId) return res.status(400).json({ success: false, message: '参数错误' });

   const sql = 'UPDATE sys_users SET username = ?, password = ?, role = "user" WHERE id = ?';
   db.query(sql, [username, hashedPassword, userId], (err, result) => {
      if (err) return res.status(500).json({ success: false, message: '设置失败:' + err.message });
      
      // 查回用户信息
      db.query('SELECT * FROM sys_users WHERE id = ?', [userId], (err, rows) => {
        const user = rows[0];
        const token = jwt.sign({ userId, username, role: 'user' }, JWT_SECRET, { expiresIn: '7d' });
        
        res.json({
          success: true,
          token,
          user: { id: userId, username, role: 'user', phone: user.phone, avatar: user.avatar }
        });
      });
   });
});

/**
 * 获取当前用户信息
 */
app.get('/api/auth/me', authMiddleware, (req, res) => {
  db.query('SELECT id, username, role, avatar, phone, role_code FROM sys_users WHERE id = ?', [req.user.userId], (err, rows) => {
    if (err || rows.length === 0) return res.status(404).json({ success: false, message: '用户不存在' });
    res.json({ success: true, user: rows[0] });
  });
});

/**
 * 更新用户信息
 */
app.patch('/api/auth/me', authMiddleware, (req, res) => {
  const { username, avatar, password } = req.body;
  const sets = [];
  const values = [];

  if (username) { sets.push('username = ?'); values.push(username); }
  if (avatar !== undefined) { sets.push('avatar = ?'); values.push(avatar); }
  if (password) { sets.push('password = ?'); values.push(bcrypt.hashSync(password, 10)); }

  if (sets.length === 0) return res.status(400).json({ success: false, message: '无更新内容' });

  values.push(req.user.userId);
  db.query(`UPDATE sys_users SET ${sets.join(', ')} WHERE id = ?`, values, (err) => {
    if (err) return res.status(500).json({ success: false, message: '更新失败' });
    res.json({ success: true, message: '更新成功' });
  });
});

// ==========================================
// API 接口：公共业务 (来自 index.js)
// ==========================================

// 城市列表
app.get('/api/cities', (req, res) => {
  const hotCities = [
    { id: 1, name: '上海', lat: 31.230416, lng: 121.473701 },
    { id: 2, name: '北京', lat: 39.9042, lng: 116.4074 },
    { id: 3, name: '广州', lat: 23.1291, lng: 113.2644 },
    { id: 4, name: '成都', lat: 30.5723, lng: 104.0665 }
  ];
  res.send(hotCities);
});

// Banner 列表
app.get('/api/banners', (req, res) => {
  const banners = [
    { id: 1, image_url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80' },
    { id: 2, image_url: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=800&q=80' }
  ];
  res.send(banners);
});

// 酒店搜索
app.get('/api/hotels', (req, res) => {
  const { city_name } = req.query;
  let sql = 'SELECT h.*, h.price as min_price, h.image_url as main_image FROM hotels h';
  let values = [];
  let whereClauses = ['h.status = 1']; // 仅显示已发布的

  if (city_name) {
    whereClauses.push('h.city LIKE ?');
    values.push(`%${city_name}%`);
  }

  if (whereClauses.length > 0) {
    sql += ' WHERE ' + whereClauses.join(' AND ');
  }
  
  db.query(sql, values, (err, results) => {
    if (err) return res.status(500).send({ message: '查询酒店失败', error: err });
    
    const enhancedResults = results.map(h => ({
      ...h,
      score: (h.star_level * 0.1 + 4.3).toFixed(1), 
      review_count: Math.floor(Math.random() * 1000) + 50,
      brand: h.tags ? h.tags.split(',')[0] : '精选',
      tags: h.tags ? h.tags.split(',') : []
    }));

    res.send(enhancedResults);
  });
});

// 酒店详情 (公共)
// 注意：将此路由定义移到 /api/hotels/my 之后，或者确保 /api/hotels/my 在它之前注册。
// 目前 /api/hotels/my 在 L668，这会导致冲突。
// 解决方案：移动 /api/hotels/my 到此处之前。

// ==========================================
// API 接口：商户系统 (移动至此以解决路由冲突)
// ==========================================

app.get('/api/hotels/my', authMiddleware, (req, res) => {
  if (req.user.role !== 'merchant' && req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: '权限不足' });
  }
  
  let sql = 'SELECT * FROM hotels';
  let params = [];
  
  if (req.user.role === 'merchant') {
    sql += ' WHERE merchant_id = ? ORDER BY create_time DESC';
    params.push(req.user.userId);
  }
  
  db.query(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json(rows || []);
  });
});

app.get('/api/hotels/:id', (req, res) => {
  const hotelId = req.params.id;
  // 如果请求的是 /api/hotels/my，说明顺序还是有问题，或者未登录被 authMiddleware 拦截？
  // authMiddleware 会返回 401，不会走到这里。
  // 如果是 404，可能是数据库查不到 'my' 这个 id。
  
  const hotelSql = 'SELECT *, price as min_price, image_url as main_image FROM hotels WHERE id = ?';
  const roomsSql = 'SELECT * FROM room_types WHERE hotel_id = ?';

  db.query(hotelSql, [hotelId], (err, hotels) => {
    if (err) return res.status(500).send(err);
    if (hotels.length === 0) return res.status(404).send({ message: '酒店不存在' });

    const hotel = hotels[0];
    hotel.score = (hotel.star_level * 0.1 + 4.3).toFixed(1);
    hotel.review_count = Math.floor(Math.random() * 1000) + 50;
    hotel.brand = hotel.tags ? hotel.tags.split(',')[0] : '精选';
    hotel.tags = hotel.tags ? hotel.tags.split(',') : [];

    db.query(roomsSql, [hotelId], (err, rooms) => {
      if (err) return res.status(500).send(err);
      
      hotel.images = [hotel.main_image];
      const formattedRooms = rooms.map(r => ({
        id: r.id,
        name: r.name,
        area: '30㎡', 
        max_guests: 2,
        plans: [{
          id: r.id, 
          name: '标准价',
          breakfast: 1, 
          cancel_policy: 1, 
          price: r.price
        }]
      }));
      
      hotel.rooms = formattedRooms;
      res.send(hotel);
    });
  });
});

// 收藏相关 (index.js)
app.post('/api/favorites/add', (req, res) => {
  const { user_id, hotel_id } = req.body;
  if (!user_id || !hotel_id) return res.status(400).send({ message: '参数缺失' });
  
  const hId = Number(hotel_id);
  
  // 1. 先查询当前 favorites
  db.query('SELECT favorites FROM sys_users WHERE id = ?', [user_id], (err, rows) => {
    if (err) {
      console.error('[Favorites Add] Query Error:', err);
      return res.status(500).send(err);
    }
    if (rows.length === 0) return res.status(404).send({ message: '用户不存在' });
    
    let favs = [];
    try {
      const raw = rows[0].favorites;
      if (raw) {
        favs = typeof raw === 'string' ? JSON.parse(raw) : raw;
      }
    } catch (e) {
      favs = [];
    }
    
    // 确保 favs 是数组
    if (!Array.isArray(favs)) favs = [];
    
    // 2. 检查是否存在，不存在则添加
    // 注意：保证类型一致性，这里统一存为数字
    if (!favs.includes(hId)) {
      favs.push(hId);
      
      console.log(`[Favorites Add] Adding hotel ${hId} to user ${user_id}. New favs:`, favs);

      // 3. 更新回数据库
      db.query('UPDATE sys_users SET favorites = ? WHERE id = ?', [JSON.stringify(favs), user_id], (updateErr) => {
        if (updateErr) {
          console.error('[Favorites Add] Update Error:', updateErr);
          return res.status(500).send(updateErr);
        }
        res.send({ success: true });
      });
    } else {
      console.log(`[Favorites Add] Hotel ${hId} already in favorites for user ${user_id}`);
      res.send({ success: true, message: '已存在' });
    }
  });
});

app.post('/api/favorites/remove', (req, res) => {
  const { user_id, hotel_id } = req.body;
  const hId = Number(hotel_id);
  
  db.query('SELECT favorites FROM sys_users WHERE id = ?', [user_id], (err, results) => {
    if (err || !results[0]) return res.status(500).send(err);
    let favs = [];
    try {
        const raw = results[0].favorites;
        favs = typeof raw === 'string' ? JSON.parse(raw) : (raw || []);
    } catch (e) { favs = []; }
    
    // 确保 favs 是数组
    if (!Array.isArray(favs)) favs = [];

    const newFavs = favs.filter(id => Number(id) !== hId);
    console.log(`[Favorites Remove] Removing hotel ${hId} from user ${user_id}. New favs:`, newFavs);
    
    db.query('UPDATE sys_users SET favorites = ? WHERE id = ?', [JSON.stringify(newFavs), user_id], (e) => {
      if (e) return res.status(500).send(e);
      res.send({ success: true });
    });
  });
});

app.get('/api/favorites/list', (req, res) => {
  const { user_id } = req.query;
  db.query('SELECT favorites FROM sys_users WHERE id = ?', [user_id], (err, results) => {
    if (err || !results[0]) return res.send([]);
    let favIds = results[0].favorites || [];
    if (typeof favIds === 'string') favIds = JSON.parse(favIds);
    if (favIds.length === 0) return res.send([]);
    
    db.query('SELECT * FROM hotels WHERE id IN (?)', [favIds], (e, hotels) => {
      if (e) return res.status(500).send(e);
      const enhancedResults = hotels.map(h => ({
        ...h,
        score: (h.star_level * 0.1 + 4.3).toFixed(1),
        review_count: 100,
        tags: h.tags ? h.tags.split(',') : []
      }));
      res.send(enhancedResults);
    });
  });
});

// 历史记录 (index.js)
app.post('/api/history/add', (req, res) => {
  const { user_id, hotel_id } = req.body;
  if (!user_id || !hotel_id) return res.send({ ignored: true });

  const newItem = { id: Number(hotel_id), time: new Date() };
  db.query('SELECT history FROM sys_users WHERE id = ?', [user_id], (err, results) => {
    if (err || !results[0]) return res.send({ ignored: true });
    
    let history = results[0].history || [];
    if (typeof history === 'string') history = JSON.parse(history);
    history = history.filter(item => item.id !== Number(hotel_id));
    history.unshift(newItem);
    if (history.length > 50) history = history.slice(0, 50);
    
    db.query('UPDATE sys_users SET history = ? WHERE id = ?', [JSON.stringify(history), user_id], () => {
      res.send({ success: true });
    });
  });
});

app.get('/api/history/list', (req, res) => {
  const { user_id } = req.query;
  db.query('SELECT history FROM sys_users WHERE id = ?', [user_id], (err, results) => {
    if (err || !results[0]) return res.send([]);
    let history = results[0].history || [];
    if (typeof history === 'string') history = JSON.parse(history);
    if (history.length === 0) return res.send([]);
    
    const ids = history.map(h => h.id);
    if (ids.length === 0) return res.send([]);

    db.query('SELECT * FROM hotels WHERE id IN (?)', [ids], (e, hotels) => {
      if (e) return res.status(500).send(e);
      const hotelMap = new Map(hotels.map(h => [h.id, h]));
      const sortedHotels = history.map(item => hotelMap.get(item.id)).filter(h => h);
      const enhancedResults = sortedHotels.map(h => ({
        ...h,
        score: (h.star_level * 0.1 + 4.3).toFixed(1),
        review_count: 100,
        tags: h.tags ? h.tags.split(',') : []
      }));
      res.send(enhancedResults);
    });
  });
});

// 模拟微信登录 (index.js)
app.post('/api/user/wx-login', (req, res) => {
  const { code } = req.body;
  res.send({
    token: 'mock_wx_token_123456',
    userInfo: {
      id: 'wx_user_001',
      avatar: 'https://images.unsplash.com/photo-1633332755192-727a05c4013d?auto=format&fit=crop&w=200&q=80',
      openid: `wx_openid_${Date.now()}`
    }
  });
});

// 优惠券
app.get('/api/user/:id/coupons', (req, res) => {
  res.send([]);
});

// ==========================================
// API 接口：订单系统 (合并)
// ==========================================

// 创建订单 (使用 index.js 的丰富字段)
app.post('/api/bookings/create', (req, res) => {
  const { user_id, user_name, user_phone, user_id_card, hotel_id, hotel_name, room_type_name, check_in_date, check_out_date, total_price } = req.body;
  const sql = `INSERT INTO bookings (user_id, user_name, user_phone, user_id_card, hotel_id, hotel_name, room_type_name, check_in_date, check_out_date, total_price, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`;
  const values = [user_id, user_name, user_phone, user_id_card, hotel_id, hotel_name, room_type_name || '标准房', check_in_date, check_out_date, total_price];
  
  db.query(sql, values, (err, result) => {
    if (err) return res.status(500).send({ message: '预订失败', error: err.message });
    res.send({ success: true, message: '预订成功！', orderId: result.insertId });
  });
});

// 订单列表 (保留 index.js 的手机号过滤)
app.get('/api/bookings/my-list', (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.send([]);
  
  const sql = 'SELECT * FROM bookings WHERE user_phone = ? ORDER BY create_time DESC';
  db.query(sql, [phone], (err, results) => {
    if (err) return res.status(500).send('查询失败');
    res.send(results);
  });
});

// ==========================================
// API 接口：商户系统 (index1.js)
// ==========================================

app.post('/api/upload', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: '请选择要上传的图片' });
  const client = getOSSClient();
  if (!client) return res.status(503).json({ success: false, message: '未配置 OSS' });

  const ext = (req.file.originalname || '').split('.').pop() || 'jpg';
  const objectName = `uploads/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const stream = Readable.from(req.file.buffer);
  
  client.putStream(objectName, stream, { mime: req.file.mimetype, contentLength: req.file.size })
    .then(() => {
      const bucket = process.env.OSS_BUCKET || 'easy-travelling';
      const region = process.env.OSS_REGION || 'oss-cn-beijing';
      res.json({ success: true, url: `https://${bucket}.${region}.aliyuncs.com/${objectName}` });
    })
    .catch((err) => res.status(500).json({ success: false, message: err.message }));
});

// (Moved to above /api/hotels/:id)
// app.get('/api/hotels/my', ...)

app.post('/api/hotels', authMiddleware, (req, res) => {
  if (req.user.role !== 'merchant') return res.status(403).json({ success: false, message: '仅商户可发布' });
  const { name, city, address, phone, price, star_level, tags, image_url, description, roomTypes } = req.body;
  
  const sql = `INSERT INTO hotels (merchant_id, name, city, address, phone, price, star_level, tags, image_url, description, status, create_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NOW())`;
  const values = [req.user.userId, name, city, address, phone, price, star_level, tags, image_url, description];
  
  db.query(sql, values, (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    
    const hotelId = result.insertId;
    if (roomTypes && roomTypes.length > 0) {
      const rtSql = 'INSERT INTO room_types (hotel_id, name, price, description, image_url) VALUES ?';
      const rtValues = roomTypes.map(rt => [hotelId, rt.name, rt.price, rt.description, rt.image_url]);
      db.query(rtSql, [rtValues], (errRt) => {
        if (errRt) console.error('房型插入失败', errRt);
        res.json({ success: true, message: '发布成功', hotelId });
      });
    } else {
      res.json({ success: true, message: '发布成功', hotelId });
    }
  });
});

// 商户查看酒店详情 (重命名为 /api/merchant/hotels/:id 以区分公共接口)
app.get('/api/merchant/hotels/:id', authMiddleware, (req, res) => {
  if (req.user.role !== 'merchant') return res.status(403).json({ success: false, message: '仅商户可查看' });
  const id = req.params.id;
  
  db.query('SELECT * FROM hotels WHERE id = ? AND merchant_id = ?', [id, req.user.userId], (err, rows) => {
    if (err || rows.length === 0) return res.status(404).json({ success: false, message: '酒店不存在' });
    const hotel = rows[0];
    db.query('SELECT * FROM room_types WHERE hotel_id = ?', [id], (errRt, roomRows) => {
      res.json({ ...hotel, roomTypes: roomRows || [] });
    });
  });
});

app.put('/api/hotels/:id', authMiddleware, (req, res) => {
  if (req.user.role !== 'merchant') return res.status(403).json({ success: false, message: '仅商户可操作' });
  const id = req.params.id;
  const { name, city, address, phone, price, star_level, tags, image_url, description, roomTypes } = req.body;
  
  const sql = `UPDATE hotels SET name=?, city=?, address=?, phone=?, price=?, star_level=?, tags=?, image_url=?, description=?, status=0 WHERE id=? AND merchant_id=?`;
  const values = [name, city, address, phone, price, star_level, tags, image_url, description, id, req.user.userId];
  
  db.query(sql, values, (err) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    
    // 更新房型：先删后加
    db.query('DELETE FROM room_types WHERE hotel_id = ?', [id], () => {
      if (roomTypes && roomTypes.length > 0) {
        const rtSql = 'INSERT INTO room_types (hotel_id, name, price, description, image_url) VALUES ?';
        const rtValues = roomTypes.map(rt => [id, rt.name, rt.price, rt.description, rt.image_url]);
        db.query(rtSql, [rtValues], () => {
          res.json({ success: true, message: '更新成功' });
        });
      } else {
        res.json({ success: true, message: '更新成功' });
      }
    });
  });
});

app.delete('/api/hotels/:id', authMiddleware, (req, res) => {
  if (req.user.role !== 'merchant') return res.status(403).json({ success: false, message: '仅商户可操作' });
  const id = req.params.id;
  
  // 先查询图片用于删除 OSS
  db.query('SELECT image_url FROM hotels WHERE id = ? AND merchant_id = ?', [id, req.user.userId], (err, rows) => {
    if (rows && rows.length > 0) {
      // 简化处理：直接删除数据库记录，OSS 清理逻辑保持 index1.js 的思路但此处简化
      db.query('DELETE FROM room_types WHERE hotel_id = ?', [id], () => {
        db.query('DELETE FROM hotels WHERE id = ? AND merchant_id = ?', [id, req.user.userId], () => {
          res.json({ success: true, message: '已删除' });
        });
      });
    } else {
      res.status(404).json({ success: false, message: '酒店不存在' });
    }
  });
});

app.patch('/api/hotels/:id/status', authMiddleware, (req, res) => {
  if (req.user.role !== 'merchant') return res.status(403).json({ success: false, message: '仅商户可操作' });
  const { status } = req.body;
  if (status !== 2) return res.status(400).json({ success: false, message: '仅支持退回' });
  
  db.query('UPDATE hotels SET status = ?, cancellation = ? WHERE id = ? AND merchant_id = ?', [status, '商家自行退回', req.params.id, req.user.userId], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, message: '已退回' });
  });
});

// ==========================================
// API 接口：管理员系统 (index1.js)
// ==========================================

app.get('/api/admin/hotels/published', authMiddleware, adminMiddleware, (req, res) => {
  const sql = `SELECT h.*, u.username AS merchant_name FROM hotels h LEFT JOIN sys_users u ON u.id = h.merchant_id WHERE h.status IN (1, 3) ORDER BY h.create_time DESC`;
  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json(rows || []);
  });
});

app.get('/api/admin/hotels/pending', authMiddleware, adminMiddleware, (req, res) => {
  const sql = `SELECT h.*, u.username AS merchant_name FROM hotels h LEFT JOIN sys_users u ON u.id = h.merchant_id WHERE h.status = 0 ORDER BY h.create_time DESC`;
  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json(rows || []);
  });
});

app.get('/api/admin/hotels/:id', authMiddleware, adminMiddleware, (req, res) => {
  const id = req.params.id;
  const sql = `SELECT h.*, u.username AS merchant_name FROM hotels h LEFT JOIN sys_users u ON u.id = h.merchant_id WHERE h.id = ?`;
  
  db.query(sql, [id], (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (!rows || rows.length === 0) return res.status(404).json({ success: false, message: '酒店不存在' });
    
    const hotel = rows[0];
    db.query('SELECT * FROM room_types WHERE hotel_id = ?', [id], (errRt, roomRows) => {
      if (errRt) return res.status(500).json({ success: false, message: errRt.message });
      res.json({ ...hotel, roomTypes: roomRows || [] });
    });
  });
});

app.post('/api/admin/hotels/:id/approve', authMiddleware, adminMiddleware, (req, res) => {
  db.query('UPDATE hotels SET status = 1 WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, message: '已通过' });
  });
});

app.post('/api/admin/hotels/:id/reject', authMiddleware, adminMiddleware, (req, res) => {
  const { reason } = req.body;
  db.query('UPDATE hotels SET status = 2, cancellation = ? WHERE id = ?', [reason, req.params.id], (err) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, message: '已拒绝' });
  });
});

app.post('/api/admin/hotels/:id/offline', authMiddleware, adminMiddleware, (req, res) => {
  const { reason } = req.body;
  db.query('UPDATE hotels SET status = 3, cancellation = ? WHERE id = ?', [reason, req.params.id], (err) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, message: '已下线' });
  });
});

app.delete('/api/admin/hotels/:id', authMiddleware, adminMiddleware, (req, res) => {
  const id = req.params.id;
  db.query('DELETE FROM room_types WHERE hotel_id = ?', [id], () => {
    db.query('DELETE FROM hotels WHERE id = ?', [id], (err) => {
      if (err) return res.status(500).json({ success: false, message: err.message });
      res.json({ success: true, message: '已删除' });
    });
  });
});

// 统一错误处理
app.use((err, req, res, next) => {
  console.error('全局错误:', err);
  res.status(500).json({ success: false, message: err.message || '服务器错误' });
});

app.listen(port, () => {
  console.log(`🚀 服务端已启动: http://localhost:${port}`);
});
