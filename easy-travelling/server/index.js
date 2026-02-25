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
  password: process.env.DB_PASSWORD || 'clever',
  database: process.env.DB_NAME || 'easy_travel_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});
const dbPromise = db.promise();

// 测试数据库连接
db.getConnection((err, connection) => {
  if (err) {
    console.error('Database connection failed. Please check DB credentials.');
    console.error('错误信息:', err.message);
  } else {
    console.log('Database connected successfully.');
    connection.release();
    backfillRoomStockForAllHotels().catch((e) => {
      console.error('[Stock] startup backfill failed:', e.message);
    });
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
const STOCK_DAYS_AHEAD = Math.max(7, Number(process.env.STOCK_DAYS_AHEAD || 180));
const DEFAULT_ROOM_TOTAL_COUNT = Math.max(1, Number(process.env.DEFAULT_ROOM_TOTAL_COUNT || 20));

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

function formatDateKey(dateVal) {
  const d = new Date(dateVal);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildStayDates(checkIn, checkOut) {
  const start = new Date(`${checkIn}T00:00:00`);
  const end = new Date(`${checkOut}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return [];
  const dates = [];
  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    dates.push(formatDateKey(d));
  }
  return dates;
}

function buildFutureStockDates(days = STOCK_DAYS_AHEAD) {
  const base = new Date();
  const dates = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    dates.push(formatDateKey(d));
  }
  return dates;
}

async function getRoomTypeIdsByHotel(conn, hotelId) {
  const [rows] = await conn.query('SELECT id FROM room_types WHERE hotel_id = ?', [hotelId]);
  return (rows || []).map((r) => Number(r.id)).filter((id) => Number.isInteger(id) && id > 0);
}

async function ensureRoomStockRows(
  conn,
  hotelId,
  roomTypeIds,
  totalCount = DEFAULT_ROOM_TOTAL_COUNT,
  dateKeys = buildFutureStockDates()
) {
  if (!hotelId || !Array.isArray(roomTypeIds) || roomTypeIds.length === 0 || !Array.isArray(dateKeys) || dateKeys.length === 0) {
    return;
  }

  const uniqueRoomTypeIds = [...new Set(
    roomTypeIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
  )];
  if (uniqueRoomTypeIds.length === 0) return;

  const uniqueDateKeys = [...new Set(dateKeys.map((d) => String(d)).filter(Boolean))].sort();
  if (uniqueDateKeys.length === 0) return;

  const [existingRows] = await conn.query(
    'SELECT room_type_id, date FROM room_stock WHERE hotel_id = ? AND room_type_id IN (?) AND date >= ? AND date <= ?',
    [hotelId, uniqueRoomTypeIds, uniqueDateKeys[0], uniqueDateKeys[uniqueDateKeys.length - 1]]
  );
  const existingSet = new Set((existingRows || []).map((r) => `${Number(r.room_type_id)}_${formatDateKey(r.date)}`));

  const insertRows = [];
  for (const roomTypeId of uniqueRoomTypeIds) {
    for (const date of uniqueDateKeys) {
      const key = `${roomTypeId}_${date}`;
      if (!existingSet.has(key)) {
        insertRows.push([hotelId, roomTypeId, date, totalCount, 0]);
      }
    }
  }

  if (insertRows.length > 0) {
    await conn.query(
      'INSERT INTO room_stock (hotel_id, room_type_id, date, total_count, booked_count) VALUES ?',
      [insertRows]
    );
  }
}

async function backfillRoomStockForAllHotels() {
  const [rows] = await dbPromise.query('SELECT id FROM hotels');
  for (const row of rows || []) {
    const hotelId = Number(row.id);
    if (!hotelId) continue;
    const roomTypeIds = await getRoomTypeIdsByHotel(dbPromise, hotelId);
    await ensureRoomStockRows(dbPromise, hotelId, roomTypeIds);
  }
  console.log('[Stock] startup backfill completed');
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
  console.log('[OSS] files to delete:', keys.length);
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

function normalizeRoomTypesInput(roomTypes) {
  if (!Array.isArray(roomTypes)) return [];
  return roomTypes
    .map((rt) => {
      const name = rt?.name != null ? String(rt.name).trim() : '';
      const price = Number(rt?.price);
      if (!name || !Number.isFinite(price) || price < 0) return null;
      const description = rt?.description != null && String(rt.description).trim() ? String(rt.description).trim() : null;
      const image_url = rt?.image_url != null && String(rt.image_url).trim() ? String(rt.image_url).trim() : null;
      return { name, price, description, image_url };
    })
    .filter(Boolean);
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
    console.error('JWT验证失败:', err.message);
    return res.status(401).json({ success: false, message: 'Login expired, please login again' });
  }
}

function adminMiddleware(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin only' });
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
  console.log('收到发送短信请求', req.body);
  let { phone } = req.body;
  if (!phone) return res.status(400).send({ message: 'Phone is required' });
  
  // 清洗手机号：
  // 1. 如果是 +86 开头的国内号码，去掉 +86
  if (phone.startsWith('+86') && phone.length === 14) {
      phone = phone.slice(3);
  }
  // 2. 如果包含其他非数字字符（如空格、横线），一并去除
  phone = phone.replace(/\D/g, '');
  
  // 3. 再次检查长度，如果不是11位（国内），可能需要根据业务调整
  // 这里暂时假设都是国内号码

  // 频率限制
  const record = smsStore.get(phone);
  if (record) {
    const now = Date.now();
    if (now - record.lastSentTime < 60 * 1000) {
      return res.status(400).send({ message: 'Please do not request SMS too frequently' });
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
      console.log('阿里云短信发送成功', resp.body);
      smsStore.set(phone, {
        code: code,
        expireTime: Date.now() + SMS_CODE_TTL_MS,
        lastSentTime: Date.now()
      });
      res.send({ success: true, message: 'SMS sent successfully' });
    } else {
      console.error('Aliyun SMS Error:', resp.body);
      // 如果发送失败，返回真实错误信息
      res.status(400).send({ message: '短信发送失败: ' + resp.body.message });
    }
  } catch (error) {
    console.error('Aliyun SMS Exception:', error);
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
  let phoneStr = phone ? String(phone).trim() : '';
  const smsStr = smsCode ? String(smsCode).trim() : '';
  const roleCodeStr = roleCode ? String(roleCode).trim().toUpperCase() : '';

  // 清洗手机号：保持与发送短信时一致
  if (phoneStr.startsWith('+86') && phoneStr.length === 14) {
      phoneStr = phoneStr.slice(3);
  }
  phoneStr = phoneStr.replace(/\D/g, '');

  if (!username || !password || !role || !phoneStr || !smsStr) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  // 验证短信验证码
  // 开发后门：6666
  if (smsStr !== '6666') {
    const rec = smsStore.get(phoneStr);
    if (!rec) {
      // 兼容开发环境，如果store里没有，但验证码 8888 也放行（方便测试）
      if (smsStr === '8888') {
        // pass
      } else {
        return res.status(400).json({ success: false, message: 'Please request SMS code first' });
      }
    } else {
      if (Date.now() > rec.expireTime) {
        smsStore.delete(phoneStr);
        return res.status(400).json({ success: false, message: '验证码已过期' });
      }
      if (rec.code !== smsStr) {
        return res.status(400).json({ success: false, message: 'Invalid SMS code' });
      }
    }
  }

  const checkSql = 'SELECT id FROM sys_users WHERE username = ?';
  db.query(checkSql, [username.trim()], (err, rows) => {
    if (err) {
      console.error('Check user error:', err);
      return res.status(500).json({ success: false, message: 'Server error' });
    }
    if (rows.length > 0) return res.status(400).json({ success: false, message: 'Username already exists' });

    const hashedPassword = bcrypt.hashSync(password, 10);

    // 管理员注册逻辑
    if (role === 'admin') {
      if (!roleCodeStr || !ADMIN_ROLE_CODES.has(roleCodeStr)) {
        return res.status(400).json({ success: false, message: 'Invalid role code' });
      }
      // 检查身份码是否已使用
      db.query("SELECT id FROM sys_users WHERE role='admin' AND role_code=?", [roleCodeStr], (errUsed, usedRows) => {
        if (usedRows && usedRows.length > 0) return res.status(400).json({ success: false, message: 'Role code already used' });
        
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
    
    // 兼容开发环境，如果store里没有，但验证码 8888 也放行（方便测试）
    // 注意：这里需要确保在 !rec 的情况下也能处理 8888
    if (smsStr !== '6666' && smsStr !== '8888') {
      const rec = smsStore.get(phoneStr);
      console.log('SMS Code Verify:', { phone: phoneStr, input: smsStr, record: rec });
      
      if (!rec) return res.status(400).json({ success: false, message: 'Please request SMS code first' });
      if (Date.now() > rec.expireTime) {
        smsStore.delete(phoneStr);
        return res.status(400).json({ success: false, message: '验证码已过期' });
      }
      if (rec.code !== smsStr) {
        return res.status(400).json({ success: false, message: 'Invalid SMS code' });
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

           // 返回 is_new: true 引导设置密码，但也返token 让用户保持登录
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
  if (!username && !phone) return res.status(400).json({ success: false, message: 'Username or phone is required' });
  if (!password) return res.status(400).json({ success: false, message: 'Password is required' });

  // 支持手机号或用户名登录
  const loginKey = username || phone;
  console.log(`[Login] Attempt with key: ${loginKey}, password: ${password}`);

  const sql = 'SELECT * FROM sys_users WHERE username = ? OR phone = ?';
  
  db.query(sql, [loginKey, loginKey], (err, rows) => {
    if (err) {
        console.error('[Login] DB Error:', err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
    if (rows.length === 0) {
        console.log('[Login] User not found');
        return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }
    
    const user = rows[0];
    const isMatch = bcrypt.compareSync(password, user.password);
    
    console.log(`[Login] User found: ${user.username}, ID: ${user.id}, Password Match: ${isMatch}`);
    
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
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
  // 为简单起见，假设前端Setup页面调用的是这个接口来完成最终注册入口
  // 但要注意 mobile 代码里调用的是 /user/setup-account，这里需要匹配
  res.redirect(307, '/api/auth/register'); 
  // 或者真正实现它，这里为了不破坏现有结构，建议前端直接调 register 接口
  // 但 mobile 代码里写的是 setup-account
  // 让我们实现它
});

app.post('/api/user/setup-account', (req, res) => {
   // 实际 mobile/src/pages/login/setup/index.tsx 调用的是 /user/setup-account
   // 我们需要在这里实现它，或者在路由上做映射
   // 逻辑：用户已通过手机验证，现在来设置用户名和密码
   // 检查手机号是否已存在（理论上上一步登录时已检查不存在
   // 插入新用户
   const { phone, username, password } = req.body;
   // ...
   // 鉴于时间，我建议直接在 mobile 端复用 /api/auth/register 接口，或者在这里简单实现插入
   
   if (!username || !password) return res.status(400).json({ success: false, message: '信息不全' });
   
   // 从请求体获取 phone，如果前端没传 phone，可能是个问题
   // mobile端传的是 { userId, username, password }，没传 phone
   // 必须根据 userId 查到 phone，或者前端传过来
   // mobile 代码里：Taro.navigateTo({ url: `/pages/login/setup/index?userId=${res.id}&phone=${res.phone}` })
   // Setup页：const { userId, phone } = router.params
   // Setup提交：post('/user/setup-account', { userId: Number(userId), username, password })
   // 发现前端并没有传 phone 给后端！
   
   // 所以这里我们只做 update 用户信息（如果之前已经预创建了）
   // 或者前端修改传参
   
   // 假设之前登录时没创建用户，只是返回了 is_new
   // 那现在必须创建。但是没传 phone
   // 
   // 修正方案：修改 mobile 端代码，把 phone 也传给后端
   // 但我不能改 mobile 代码（除非用户要求），所以我先假设前端会传，或者我在后端做个临时处理
   // 
   // 等等，mobile 代码我看过：
   // const { userId, phone } = router.params
   // post('/user/setup-account', { userId: Number(userId), username, password })
   // 确实没传 phone
   
   // 既然如此，我修改后端逻辑
   // 1. 登录时，如果用户不存在，先创建一个“临时用户”（无密码，或随机密码），返回 userId
   // 2. Setup 时，根据 userId 更新 username 和 password
   
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
 // ✅ 添加 created_at 字段
app.get('/api/auth/me', authMiddleware, (req, res) => {
  db.query(
    'SELECT id, username, role, avatar, phone, role_code, created_at FROM sys_users WHERE id = ?', 
    [req.user.userId], 
    (err, rows) => {
      if (err || rows.length === 0) return res.status(404).json({ success: false, message: '用户不存在' });
      
      const user = rows[0];
      
      // ✅ 显式构建返回对象，确保字段正确
      const userData = {
        id: user.id,
        username: user.username,
        role: user.role,
        avatar: user.avatar,
        phone: user.phone,
        role_code: user.role_code,  // 邀请码
        created_at: user.created_at  // 注册时间
      };
      
      console.log('【后端调试】返回数据:', userData);
      
      res.json({ success: true, user: userData });
    }
  );
  db.query('SELECT id, username, role, avatar, phone, role_code FROM sys_users WHERE id = ?', [req.user.userId], (err, rows) => {
    if (err || rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
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

  if (sets.length === 0) return res.status(400).json({ success: false, message: 'No fields to update' });

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
app.get('/api/hotels', async (req, res) => {
  try {
    const { city_name, keyword, check_in_date, check_out_date } = req.query;
    const whereClauses = ['h.status = 1'];
    const params = [];
    if (city_name) {
      whereClauses.push('h.city LIKE ?');
      params.push(`%${city_name}%`);
    }
    if (keyword) {
      whereClauses.push('(h.name LIKE ? OR h.address LIKE ? OR h.tags LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    const sql = [
      'SELECT h.*, COALESCE(MIN(rt.price), h.price, 0) AS min_price, h.image_url AS main_image',
      'FROM hotels h',
      'LEFT JOIN room_types rt ON rt.hotel_id = h.id',
      `WHERE ${whereClauses.join(' AND ')}`,
      'GROUP BY h.id',
      'ORDER BY h.create_time DESC'
    ].join(' ');

    const [rows] = await dbPromise.query(sql, params);
    let hotels = (rows || []).map((h) => ({
      ...h,
      score: Number((Number(h.star_level || 0) * 0.1 + 4.3).toFixed(1)),
      review_count: Math.floor(Math.random() * 1000) + 50,
      brand: h.tags ? String(h.tags).split(',')[0] : '精选酒店',
      tags: h.tags ? String(h.tags).split(',').map((x) => x.trim()).filter(Boolean) : [],
    }));

    if (check_in_date && check_out_date && hotels.length > 0) {
      const stayDates = buildStayDates(String(check_in_date), String(check_out_date));
      if (stayDates.length > 0) {
        const hotelIds = hotels.map((h) => h.id);
        const [roomRows] = await dbPromise.query(
          'SELECT id, hotel_id, name, price FROM room_types WHERE hotel_id IN (?)',
          [hotelIds]
        );

        if ((roomRows || []).length === 0) return res.send([]);

        const roomByHotel = new Map();
        roomRows.forEach((rt) => {
          if (!roomByHotel.has(rt.hotel_id)) roomByHotel.set(rt.hotel_id, []);
          roomByHotel.get(rt.hotel_id).push(rt);
        });

        for (const hotel of hotels) {
          const roomIds = (roomByHotel.get(hotel.id) || []).map((r) => Number(r.id)).filter(Boolean);
          if (roomIds.length > 0) {
            await ensureRoomStockRows(dbPromise, hotel.id, roomIds, DEFAULT_ROOM_TOTAL_COUNT, stayDates);
          }
        }

        const [stockRows] = await dbPromise.query(
          'SELECT hotel_id, room_type_id, date, total_count, booked_count FROM room_stock WHERE hotel_id IN (?) AND date >= ? AND date < ?',
          [hotelIds, stayDates[0], String(check_out_date)]
        );

        const stockMap = new Map();
        stockRows.forEach((s) => {
          const key = `${s.hotel_id}_${s.room_type_id}_${formatDateKey(s.date)}`;
          stockMap.set(key, s);
        });

        hotels = hotels.filter((hotel) => {
          const rooms = roomByHotel.get(hotel.id) || [];
          let available = false;
          let bestRemain = 0;

          rooms.forEach((room) => {
            let ok = true;
            let minRemain = Number.MAX_SAFE_INTEGER;
            for (const d of stayDates) {
              const stock = stockMap.get(`${hotel.id}_${room.id}_${d}`);
              if (!stock) {
                ok = false;
                break;
              }
              const remain = Number(stock.total_count || 0) - Number(stock.booked_count || 0);
              if (remain <= 0) {
                ok = false;
                break;
              }
              minRemain = Math.min(minRemain, remain);
            }
            if (ok) {
              available = true;
              bestRemain = bestRemain === 0 ? minRemain : Math.min(bestRemain, minRemain);
            }
          });

          hotel.available_stock = available ? bestRemain : 0;
          return available;
        });
      }
    }

    res.send(hotels);
  } catch (err) {
    res.status(500).send({ message: '查询酒店失败', error: err.message });
  }
});
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

app.get('/api/hotels/:id', async (req, res) => {
  try {
    const hotelId = Number(req.params.id);
    const checkIn = String(req.query.check_in_date || formatDateKey(new Date()));
    const checkOut = String(req.query.check_out_date || formatDateKey(new Date(Date.now() + 24 * 3600 * 1000)));
    const stayDates = buildStayDates(checkIn, checkOut);
    const [hotelRows] = await dbPromise.query(
      'SELECT *, price as min_price, image_url as main_image FROM hotels WHERE id = ?',
      [hotelId]
    );
    if (!hotelRows || hotelRows.length === 0) {
      return res.status(404).send({ message: '酒店不存在' });
    }
    const hotel = hotelRows[0];
    hotel.score = Number((Number(hotel.star_level || 0) * 0.1 + 4.3).toFixed(1));
    hotel.review_count = Math.floor(Math.random() * 1000) + 50;
    hotel.brand = hotel.tags ? String(hotel.tags).split(',')[0] : '精选酒店';
    hotel.tags = hotel.tags ? String(hotel.tags).split(',').map((x) => x.trim()).filter(Boolean) : [];
    const [rooms] = await dbPromise.query('SELECT * FROM room_types WHERE hotel_id = ?', [hotelId]);
    const roomIds = (rooms || []).map((r) => r.id);
    let stockRows = [];
    if (roomIds.length > 0 && stayDates.length > 0) {
      await ensureRoomStockRows(dbPromise, hotelId, roomIds, DEFAULT_ROOM_TOTAL_COUNT, stayDates);
      const [stocks] = await dbPromise.query(
        'SELECT hotel_id, room_type_id, date, total_count, booked_count FROM room_stock WHERE hotel_id = ? AND room_type_id IN (?) AND date >= ? AND date < ?',
        [hotelId, roomIds, stayDates[0], checkOut]
      );
      stockRows = stocks || [];
    }
    const stockMap = new Map();
    stockRows.forEach((s) => {
      stockMap.set(`${s.hotel_id}_${s.room_type_id}_${formatDateKey(s.date)}`, s);
    });
    hotel.images = [hotel.main_image].filter(Boolean);
    const formattedRooms = (rooms || []).map((r) => {
      let remainCount = 0;
      if (stayDates.length > 0) {
        let ok = true;
        let minRemain = Number.MAX_SAFE_INTEGER;
        for (const d of stayDates) {
          const stock = stockMap.get(`${hotelId}_${r.id}_${d}`);
          if (!stock) {
            ok = false;
            break;
          }
          const remain = Number(stock.total_count || 0) - Number(stock.booked_count || 0);
          if (remain <= 0) {
            ok = false;
            break;
          }
          minRemain = Math.min(minRemain, remain);
        }
        remainCount = ok ? minRemain : 0;
      }
      return {
        id: r.id,
        name: r.name,
        description: r.description || '',
        image_url: r.image_url || hotel.main_image || '',
        area: '30㎡',
        max_guests: 2,
        remain_count: remainCount,
        sold_out: remainCount <= 0,
        plans: [
          {
            id: r.id,
            name: r.name,
            breakfast: 1,
            cancel_policy: 1,
            price: Number(r.price || 0),
            remain_count: remainCount,
            sold_out: remainCount <= 0,
          },
        ],
      };
    });
    hotel.rooms = formattedRooms;
    hotel.check_in_date = checkIn;
    hotel.check_out_date = checkOut;
    res.send(hotel);
  } catch (err) {
    res.status(500).send({ message: '查询酒店详情失败', error: err.message });
  }
});
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
    if (rows.length === 0) return res.status(404).send({ message: 'User not found' });
    
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
      res.send({ success: true, message: 'Already exists' });
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
  const {
    user_id,
    user_name,
    user_phone,
    user_id_card,
    hotel_id,
    hotel_name,
    room_type_id,
    room_type_name,
    room_count,
    check_in_date,
    check_out_date,
    total_price,
  } = req.body;
  const hotelIdNum = Number(hotel_id);
  const roomTypeIdNum = room_type_id ? Number(room_type_id) : null;
  const roomCountNum = Math.max(1, Number(room_count || 1));
  const stayDates = buildStayDates(String(check_in_date || ''), String(check_out_date || ''));
  const checkOutDateStr = String(check_out_date || '');
  if (!user_name || !user_phone || !user_id_card || !hotelIdNum || stayDates.length === 0) {
    return res.status(400).send({ message: '参数缺失或入住离店日期非法' });
  }
  db.getConnection((connErr, conn) => {
    if (connErr) return res.status(500).send({ message: '数据库连接失败', error: connErr.message });
    const rollbackAndEnd = (status, payload) => {
      conn.rollback(() => {
        conn.release();
        res.status(status).send(payload);
      });
    };
    conn.beginTransaction((txErr) => {
      if (txErr) {
        conn.release();
        return res.status(500).send({ message: '开启事务失败', error: txErr.message });
      }
      const resolveRoomType = (done) => {
        if (roomTypeIdNum) {
          conn.query(
            'SELECT id, name, price FROM room_types WHERE id = ? AND hotel_id = ? LIMIT 1',
            [roomTypeIdNum, hotelIdNum],
            (e, rows) => done(e, rows && rows[0])
          );
          return;
        }
        if (room_type_name) {
          conn.query(
            'SELECT id, name, price FROM room_types WHERE hotel_id = ? AND name = ? LIMIT 1',
            [hotelIdNum, room_type_name],
            (e, rows) => {
              if (e) return done(e);
              if (rows && rows[0]) return done(null, rows[0]);
              conn.query(
                'SELECT id, name, price FROM room_types WHERE hotel_id = ? ORDER BY price ASC LIMIT 1',
                [hotelIdNum],
                (e2, rows2) => done(e2, rows2 && rows2[0])
              );
            }
          );
          return;
        }
        conn.query(
          'SELECT id, name, price FROM room_types WHERE hotel_id = ? ORDER BY price ASC LIMIT 1',
          [hotelIdNum],
          (e, rows) => done(e, rows && rows[0])
        );
      };
      resolveRoomType((roomErr, roomType) => {
        if (roomErr) return rollbackAndEnd(500, { message: '查询房型失败', error: roomErr.message });
        if (!roomType) return rollbackAndEnd(400, { message: '未找到可预订房型' });

        const lockAndBook = () => {
          conn.query(
            'SELECT id, date, total_count, booked_count FROM room_stock WHERE hotel_id = ? AND room_type_id = ? AND date >= ? AND date < ? FOR UPDATE',
            [hotelIdNum, roomType.id, stayDates[0], checkOutDateStr],
            (stockErr, stockRows) => {
              if (stockErr) return rollbackAndEnd(500, { message: '查询库存失败', error: stockErr.message });
              const stockMap = new Map();
              (stockRows || []).forEach((s) => stockMap.set(formatDateKey(s.date), s));
              for (const d of stayDates) {
                const stock = stockMap.get(d);
                if (!stock) {
                  return rollbackAndEnd(400, { message: `日期 ${d} 无可用库存` });
                }
                const remain = Number(stock.total_count || 0) - Number(stock.booked_count || 0);
                if (remain < roomCountNum) {
                  return rollbackAndEnd(400, { message: `日期 ${d} 库存不足` });
                }
              }
              const stockIds = (stockRows || []).map((s) => s.id);
              conn.query(
                'UPDATE room_stock SET booked_count = booked_count + ? WHERE id IN (?)',
                [roomCountNum, stockIds],
                (upErr) => {
                  if (upErr) return rollbackAndEnd(500, { message: '更新库存失败', error: upErr.message });
                  const nights = stayDates.length;
                  const roomPrice = Number(roomType.price || 0);
                  const finalTotal = Number(total_price) > 0 ? Number(total_price) : roomPrice * nights * roomCountNum;
                  const roomTypeNameFinal = room_type_name || roomType.name || '标准间';
                  const insertSql = `
                    INSERT INTO bookings (
                      user_id, user_name, user_phone, user_id_card,
                      hotel_id, hotel_name, room_type_name,
                      check_in_date, check_out_date, total_price, status
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                  `;
                  const insertValues = [
                    user_id || null,
                    user_name,
                    user_phone,
                    user_id_card,
                    hotelIdNum,
                    hotel_name || '',
                    roomTypeNameFinal,
                    check_in_date,
                    check_out_date,
                    finalTotal,
                  ];
                  conn.query(insertSql, insertValues, (insErr, result) => {
                    if (insErr) return rollbackAndEnd(500, { message: '创建订单失败', error: insErr.message });
                    conn.commit((commitErr) => {
                      if (commitErr) return rollbackAndEnd(500, { message: '事务提交失败', error: commitErr.message });
                      conn.release();
                      res.send({
                        success: true,
                        message: '预订成功',
                        orderId: result.insertId,
                        room_type_id: roomType.id,
                        room_type_name: roomTypeNameFinal,
                      });
                    });
                  });
                }
              );
            }
          );
        };

        conn.query(
          'SELECT date FROM room_stock WHERE hotel_id = ? AND room_type_id = ? AND date >= ? AND date < ?',
          [hotelIdNum, roomType.id, stayDates[0], checkOutDateStr],
          (preErr, preRows) => {
            if (preErr) return rollbackAndEnd(500, { message: '查询库存失败', error: preErr.message });
            const existingDateSet = new Set((preRows || []).map((r) => formatDateKey(r.date)));
            const missingRows = stayDates
              .filter((d) => !existingDateSet.has(d))
              .map((d) => [hotelIdNum, roomType.id, d, DEFAULT_ROOM_TOTAL_COUNT, 0]);

            if (missingRows.length === 0) return lockAndBook();
            conn.query(
              'INSERT INTO room_stock (hotel_id, room_type_id, date, total_count, booked_count) VALUES ?',
              [missingRows],
              (insStockErr) => {
                if (insStockErr) return rollbackAndEnd(500, { message: '初始化库存失败', error: insStockErr.message });
                lockAndBook();
              }
            );
          }
        );
      });
    });
  });
});
app.get('/api/bookings/my-list', (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.send([]);

  const sql = `
    SELECT b.*, h.image_url AS hotel_image
    FROM bookings b
    LEFT JOIN hotels h ON h.id = b.hotel_id
    WHERE b.user_phone = ?
    ORDER BY b.create_time DESC, b.id DESC
  `;

  db.query(sql, [phone], (err, results) => {
    if (err) return res.status(500).send({ message: '查询失败', error: err.message });
    res.send(results || []);
  });
});
app.post('/api/bookings/:id/cancel', (req, res) => {
  const bookingId = Number(req.params.id);
  if (!bookingId) return res.status(400).send({ message: '订单ID无效' });
  db.getConnection((connErr, conn) => {
    if (connErr) return res.status(500).send({ message: '数据库连接失败', error: connErr.message });

    const rollbackAndEnd = (status, payload) => {
      conn.rollback(() => {
        conn.release();
        res.status(status).send(payload);
      });
    };

    conn.beginTransaction((txErr) => {
      if (txErr) {
        conn.release();
        return res.status(500).send({ message: '开启事务失败', error: txErr.message });
      }

      conn.query(
        'SELECT id, hotel_id, room_type_name, check_in_date, check_out_date, total_price, status FROM bookings WHERE id = ? FOR UPDATE',
        [bookingId],
        (queryErr, rows) => {
          if (queryErr) return rollbackAndEnd(500, { message: '查询订单失败', error: queryErr.message });
          if (!rows || rows.length === 0) return rollbackAndEnd(404, { message: '订单不存在' });

          const booking = rows[0];
          if (![0, 1].includes(Number(booking.status))) {
            return rollbackAndEnd(400, { message: '当前状态不可取消' });
          }

          const stayDates = buildStayDates(formatDateKey(booking.check_in_date), formatDateKey(booking.check_out_date));
          const checkOut = formatDateKey(booking.check_out_date);

          const finalizeCancel = () => {
            conn.query('UPDATE bookings SET status = 2 WHERE id = ?', [bookingId], (upErr) => {
              if (upErr) return rollbackAndEnd(500, { message: '取消失败', error: upErr.message });
              conn.commit((commitErr) => {
                if (commitErr) return rollbackAndEnd(500, { message: '事务提交失败', error: commitErr.message });
                conn.release();
                res.send({ success: true, message: '订单已取消' });
              });
            });
          };

          if (!booking.room_type_name || stayDates.length === 0) {
            return finalizeCancel();
          }

          conn.query(
            'SELECT id, price FROM room_types WHERE hotel_id = ? AND name = ? ORDER BY id ASC LIMIT 1',
            [booking.hotel_id, booking.room_type_name],
            (rtErr, rtRows) => {
              if (rtErr) return rollbackAndEnd(500, { message: '查询房型失败', error: rtErr.message });
              if (!rtRows || rtRows.length === 0) return finalizeCancel();

              const roomType = rtRows[0];
              const nights = Math.max(1, stayDates.length);
              const roomPrice = Number(roomType.price || 0);
              let restoreCount = 1;
              if (roomPrice > 0 && Number(booking.total_price || 0) > 0) {
                restoreCount = Math.max(1, Math.round(Number(booking.total_price) / (roomPrice * nights)));
              }

              conn.query(
                'SELECT id FROM room_stock WHERE hotel_id = ? AND room_type_id = ? AND date >= ? AND date < ? FOR UPDATE',
                [booking.hotel_id, roomType.id, stayDates[0], checkOut],
                (stockErr, stockRows) => {
                  if (stockErr) return rollbackAndEnd(500, { message: '查询库存失败', error: stockErr.message });
                  const stockIds = (stockRows || []).map((x) => x.id);
                  if (stockIds.length === 0) return finalizeCancel();

                  conn.query(
                    'UPDATE room_stock SET booked_count = GREATEST(booked_count - ?, 0) WHERE id IN (?)',
                    [restoreCount, stockIds],
                    (rbErr) => {
                      if (rbErr) return rollbackAndEnd(500, { message: '回滚库存失败', error: rbErr.message });
                      finalizeCancel();
                    }
                  );
                }
              );
            }
          );
        }
      );
    });
  });
});
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

app.post('/api/hotels', authMiddleware, async (req, res) => {
  if (req.user.role !== 'merchant') return res.status(403).json({ success: false, message: '仅商户可发布' });
  const { name, city, address, phone, price, star_level, tags, image_url, description, roomTypes } = req.body;
  const normalizedRoomTypes = normalizeRoomTypesInput(roomTypes);
  if (normalizedRoomTypes.length === 0) {
    return res.status(400).json({ success: false, message: '请至少提交一个有效房型' });
  }

  const conn = await dbPromise.getConnection();
  try {
    await conn.beginTransaction();
    const sql = `INSERT INTO hotels (merchant_id, name, city, address, phone, price, star_level, tags, image_url, description, status, create_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NOW())`;
    const values = [req.user.userId, name, city, address, phone, price, star_level, tags, image_url, description];
    const [result] = await conn.query(sql, values);
    const hotelId = result.insertId;

    const rtSql = 'INSERT INTO room_types (hotel_id, name, price, description, image_url) VALUES ?';
    const rtValues = normalizedRoomTypes.map((rt) => [hotelId, rt.name, rt.price, rt.description, rt.image_url]);
    await conn.query(rtSql, [rtValues]);

    const roomTypeIds = await getRoomTypeIdsByHotel(conn, hotelId);
    await ensureRoomStockRows(conn, hotelId, roomTypeIds);

    await conn.commit();
    res.json({ success: true, message: '发布成功', hotelId });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

// 商户查看酒店详情 (重命名为 /api/merchant/hotels/:id 以区分公共接口
app.get('/api/merchant/hotels/:id', authMiddleware, (req, res) => {
  if (req.user.role !== 'merchant') return res.status(403).json({ success: false, message: '仅商户可查看' });
  const id = req.params.id;
  
  db.query('SELECT * FROM hotels WHERE id = ? AND merchant_id = ?', [id, req.user.userId], (err, rows) => {
    if (err || rows.length === 0) return res.status(404).json({ success: false, message: 'Hotel not found' });
    const hotel = rows[0];
    db.query('SELECT * FROM room_types WHERE hotel_id = ?', [id], (errRt, roomRows) => {
      res.json({ ...hotel, roomTypes: roomRows || [] });
    });
  });
});

app.put('/api/hotels/:id', authMiddleware, async (req, res) => {
  if (req.user.role !== 'merchant') return res.status(403).json({ success: false, message: '仅商户可操作' });
  const id = Number(req.params.id);
  const { name, city, address, phone, price, star_level, tags, image_url, description, roomTypes } = req.body;
  const normalizedRoomTypes = normalizeRoomTypesInput(roomTypes);
  if (normalizedRoomTypes.length === 0) {
    return res.status(400).json({ success: false, message: '请至少提交一个有效房型' });
  }

  const conn = await dbPromise.getConnection();
  try {
    await conn.beginTransaction();
    const oldRoomTypeIds = await getRoomTypeIdsByHotel(conn, id);

    const sql = `UPDATE hotels SET name=?, city=?, address=?, phone=?, price=?, star_level=?, tags=?, image_url=?, description=?, status=0 WHERE id=? AND merchant_id=?`;
    const values = [name, city, address, phone, price, star_level, tags, image_url, description, id, req.user.userId];
    const [updateResult] = await conn.query(sql, values);
    if (!updateResult || updateResult.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Hotel not found' });
    }

    const today = formatDateKey(new Date());
    if (oldRoomTypeIds.length > 0) {
      await conn.query(
        'DELETE FROM room_stock WHERE hotel_id = ? AND room_type_id IN (?) AND date >= ?',
        [id, oldRoomTypeIds, today]
      );
    }

    await conn.query('DELETE FROM room_types WHERE hotel_id = ?', [id]);
    const rtSql = 'INSERT INTO room_types (hotel_id, name, price, description, image_url) VALUES ?';
    const rtValues = normalizedRoomTypes.map((rt) => [id, rt.name, rt.price, rt.description, rt.image_url]);
    await conn.query(rtSql, [rtValues]);

    const newRoomTypeIds = await getRoomTypeIdsByHotel(conn, id);
    await ensureRoomStockRows(conn, id, newRoomTypeIds);

    await conn.commit();
    res.json({ success: true, message: '更新成功' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

app.delete('/api/hotels/:id', authMiddleware, async (req, res) => {
  if (req.user.role !== 'merchant') return res.status(403).json({ success: false, message: '仅商户可操作' });
  const id = Number(req.params.id);

  const conn = await dbPromise.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT id FROM hotels WHERE id = ? AND merchant_id = ?', [id, req.user.userId]);
    if (!rows || rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Hotel not found' });
    }

    await conn.query('DELETE FROM room_stock WHERE hotel_id = ?', [id]);
    await conn.query('DELETE FROM room_types WHERE hotel_id = ?', [id]);
    await conn.query('DELETE FROM hotels WHERE id = ? AND merchant_id = ?', [id, req.user.userId]);

    await conn.commit();
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

app.patch('/api/hotels/:id/status', authMiddleware, (req, res) => {
  if (req.user.role !== 'merchant') return res.status(403).json({ success: false, message: '仅商户可操作' });
  const { status } = req.body;
  if (status !== 2) return res.status(400).json({ success: false, message: 'Only status=2 is supported' });
  
  db.query('UPDATE hotels SET status = ?, cancellation = ? WHERE id = ? AND merchant_id = ?', [status, 'Merchant requested offline', req.params.id, req.user.userId], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, message: 'Offline success' });
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
    if (!rows || rows.length === 0) return res.status(404).json({ success: false, message: 'Hotel not found' });
    
    const hotel = rows[0];
    db.query('SELECT * FROM room_types WHERE hotel_id = ?', [id], (errRt, roomRows) => {
      if (errRt) return res.status(500).json({ success: false, message: errRt.message });
      res.json({ ...hotel, roomTypes: roomRows || [] });
    });
  });
});

app.post('/api/admin/hotels/:id/approve', authMiddleware, adminMiddleware, async (req, res) => {
  const hotelId = Number(req.params.id);
  const conn = await dbPromise.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query('UPDATE hotels SET status = 1 WHERE id = ?', [hotelId]);
    if (!result || result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Hotel not found' });
    }

    const roomTypeIds = await getRoomTypeIdsByHotel(conn, hotelId);
    await ensureRoomStockRows(conn, hotelId, roomTypeIds);

    await conn.commit();
    res.json({ success: true, message: '已通过' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

app.post('/api/admin/hotels/:id/reject', authMiddleware, adminMiddleware, (req, res) => {
  const { reason } = req.body;
  db.query('UPDATE hotels SET status = 2, cancellation = ? WHERE id = ?', [reason, req.params.id], (err) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, message: 'Rejected' });
  });
});

app.post('/api/admin/hotels/:id/offline', authMiddleware, adminMiddleware, (req, res) => {
  const { reason } = req.body;
  db.query('UPDATE hotels SET status = 3, cancellation = ? WHERE id = ?', [reason, req.params.id], (err) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, message: 'Offline success' });
  });
});

app.delete('/api/admin/hotels/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  const conn = await dbPromise.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM room_stock WHERE hotel_id = ?', [id]);
    await conn.query('DELETE FROM room_types WHERE hotel_id = ?', [id]);
    const [result] = await conn.query('DELETE FROM hotels WHERE id = ?', [id]);
    if (!result || result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Hotel not found' });
    }
    await conn.commit();
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

// 统一错误处理
app.use((err, req, res, next) => {
  console.error('全局错误:', err);
  res.status(500).json({ success: false, message: err.message || 'Server error' });
});

app.listen(port, () => {
  console.log(`🚀 服务端已启动: http://localhost:${port}`);
});






