// 1. 引入必要的工具包（dotenv 需最先加载以便读取 .env）
require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { Readable } = require('stream');
const OSS = require('ali-oss');

const app = express();
const port = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'easy-booking-secret-key';

// 2. 开启中间件 (允许跨域 + 允许读取 JSON 数据)
app.use(cors());
app.use(express.json());

// 内存存储，不落盘，直接上传到 OSS（单张图片最大 20MB）
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ==========================================
// 短信验证码（占位实现：后续接入「速通互联」短信 REST API）
// ==========================================
const SMS_CODE_TTL_MS = 5 * 60 * 1000; // 5分钟
const smsStore = new Map(); // phone -> { code, expireAt }

function genDigitsCode(len = 6) {
  let s = '';
  for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 10);
  return s;
}

// 6 位字母/数字的邀请码/身份码
function genRoleCode(len = 6) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// 管理员身份码：写死 10 个，仅可使用一次（通过查表 role_code 是否已存在来限制）
const ADMIN_ROLE_CODES = new Set([
  'A1B2C3',
  'D4E5F6',
  'G7H8J9',
  'K1L2M3',
  'N4P5Q6',
  'R7S8T9',
  'U1V2W3',
  'X4Y5Z6',
  '1A2B3C',
  '4D5E6F',
]);

// ==========================================
// 核心步骤：创建数据库连接池
// ==========================================
const db = mysql.createPool({
  host: 'localhost',      // 数据库地址 (本机)
  user: 'root',           // 账号 (phpStudy默认是root)
  password: 'clever',       // 密码 (phpStudy默认是root，如果改过请填你的)
  database: 'easy_travel_db', // 刚才我们建的数据库名字
  waitForConnections: true,
  connectionLimit: 10,    // 最多允许10个人同时连，多了排队
  queueLimit: 0
});

// 测试一下连接是否成功
db.getConnection((err, connection) => {
  if (err) {
    console.error('❌ 数据库连接失败！请检查账号密码或phpStudy是否启动。');
    console.error('错误信息:', err.message);
  } else {
    console.log('✅ 数据库连接成功！服务端已准备就绪。');
    connection.release();
  }
});

// ==========================================
// 发送短信验证码：POST /api/auth/sms/send（占位：暂不真实发送）
// ==========================================
app.post('/api/auth/sms/send', (req, res) => {
  const { phone } = req.body || {};
  const p = phone ? String(phone).trim() : '';
  if (!p || !p.startsWith('+') || p.length < 6) {
    return res.status(400).json({ success: false, message: '请输入正确的手机号（含区号，如 +8613800138000）' });
  }
  const code = genDigitsCode(6);
  const expireAt = Date.now() + SMS_CODE_TTL_MS;
  smsStore.set(p, { code, expireAt });
  // TODO: 后续在这里接入「速通互联」短信 REST API 发送 code
  console.log('[SMS] 验证码(占位，仅日志输出):', p, code, 'expireAt:', new Date(expireAt).toISOString());
  res.json({ success: true, message: '验证码已发送（当前为占位实现，后端日志可见验证码）' });
});

// ==========================================
// 注册接口：POST /api/auth/register
// ==========================================
app.post('/api/auth/register', (req, res) => {
  const { username, password, role, phone, smsCode, roleCode } = req.body;

  const phoneStr = phone ? String(phone).trim() : '';
  const smsStr = smsCode ? String(smsCode).trim() : '';
  const roleCodeStr = roleCode ? String(roleCode).trim().toUpperCase() : '';

  if (!username || !password || !role || !phoneStr || !smsStr) {
    return res.status(400).json({ success: false, message: '请填写账号、密码、手机号、验证码并选择角色' });
  }
  if (!['admin', 'merchant'].includes(role)) {
    return res.status(400).json({ success: false, message: '角色只能是 admin 或 merchant' });
  }
  if (String(username).trim().length < 2) {
    return res.status(400).json({ success: false, message: '账号长度至少 2 个字符' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ success: false, message: '密码长度至少 6 位' });
  }

  // 先校验短信验证码（占位：来自 /api/auth/sms/send）
  // 开发阶段提供通用验证码“6666”，后续接入短信服务后可删除该分支
  if (smsStr !== '6666') {
    const rec = smsStore.get(phoneStr);
    if (!rec) return res.status(400).json({ success: false, message: '请先获取验证码' });
    if (Date.now() > rec.expireAt) {
      smsStore.delete(phoneStr);
      return res.status(400).json({ success: false, message: '验证码已过期，请重新获取' });
    }
    if (rec.code !== smsStr) {
      return res.status(400).json({ success: false, message: '验证码错误' });
    }
  }

  const checkSql = 'SELECT id FROM sys_users WHERE username = ?';
  const checkParams = [username.trim()];
  
  // ✅【修改】添加详细错误日志
  db.query(checkSql, checkParams, (err, rows) => {
    if (err) {
      console.error('❌ 注册-查询用户失败:');
      console.error('   错误代码:', err.code);
      console.error('   错误信息:', err.message);
      console.error('   SQL语句:', checkSql);
      console.error('   参数:', checkParams);
      console.error('   完整错误:', err);
      return res.status(500).json({ success: false, message: '服务器错误' });
    }
    if (rows && rows.length > 0) {
      return res.status(400).json({ success: false, message: '该账号已被注册' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);

    // 管理员：身份码必须匹配写死集合，且只能使用一次（查表 role_code 是否已存在）
    if (role === 'admin') {
      if (!roleCodeStr || roleCodeStr.length !== 6) {
        return res.status(400).json({ success: false, message: '请输入 6 位身份码' });
      }
      if (!ADMIN_ROLE_CODES.has(roleCodeStr)) {
        return res.status(400).json({ success: false, message: '身份码不正确，无法注册管理员' });
      }
      const usedSql = "SELECT id FROM sys_users WHERE role = 'admin' AND role_code = ? LIMIT 1";
      db.query(usedSql, [roleCodeStr], (errUsed, usedRows) => {
        if (errUsed) return res.status(500).json({ success: false, message: '服务器错误' });
        if (usedRows && usedRows.length > 0) {
          return res.status(400).json({ success: false, message: '该账号已被注册' });
        }
        const insertSql = 'INSERT INTO sys_users (username, password, role, phone, role_code, created_at) VALUES (?, ?, ?, ?, ?, NOW())';
        const insertParams = [username.trim(), hashedPassword, role, phoneStr, roleCodeStr];
        db.query(insertSql, insertParams, (errIns, result) => {
          if (errIns) return res.status(500).json({ success: false, message: '服务器错误，注册失败' });
          smsStore.delete(phoneStr);
          res.json({ success: true, message: '注册成功，请登录', userId: result.insertId });
        });
      });
      return;
    }

    // 商户：邀请码可选
    if (role === 'merchant') {
      // 有邀请码：查表存在则激活成功，不写入新用户 role_code；不存在则失败
      if (roleCodeStr) {
        if (roleCodeStr.length !== 6) {
          return res.status(400).json({ success: false, message: '邀请码必须为 6 位字母或数字' });
        }
        const inviteSql = "SELECT id FROM sys_users WHERE role = 'merchant' AND role_code = ? LIMIT 1";
        db.query(inviteSql, [roleCodeStr], (errInv, invRows) => {
          if (errInv) return res.status(500).json({ success: false, message: '服务器错误' });
          if (!invRows || invRows.length === 0) {
            return res.status(400).json({ success: false, message: '邀请码激活失败请重试' });
          }
          const insertSql = 'INSERT INTO sys_users (username, password, role, phone, role_code, created_at) VALUES (?, ?, ?, ?, ?, NOW())';
          const insertParams = [username.trim(), hashedPassword, role, phoneStr, null];
          db.query(insertSql, insertParams, (errIns, result) => {
            if (errIns) return res.status(500).json({ success: false, message: '服务器错误，注册失败' });
            smsStore.delete(phoneStr);
            res.json({ success: true, message: '邀请码激活成功，注册成功，请登录', userId: result.insertId });
          });
        });
        return;
      }

      // 无邀请码：生成一个 6 位码写入 role_code，可被他人反复使用
      const tryGen = (timesLeft) => {
        if (timesLeft <= 0) return res.status(500).json({ success: false, message: '生成邀请码失败，请重试' });
        const code = genRoleCode(6);
        const existSql = 'SELECT id FROM sys_users WHERE role_code = ? LIMIT 1';
        db.query(existSql, [code], (errEx, exRows) => {
          if (errEx) return res.status(500).json({ success: false, message: '服务器错误' });
          if (exRows && exRows.length > 0) return tryGen(timesLeft - 1);
          const insertSql = 'INSERT INTO sys_users (username, password, role, phone, role_code, created_at) VALUES (?, ?, ?, ?, ?, NOW())';
          const insertParams = [username.trim(), hashedPassword, role, phoneStr, code];
          db.query(insertSql, insertParams, (errIns, result) => {
            if (errIns) return res.status(500).json({ success: false, message: '服务器错误，注册失败' });
            smsStore.delete(phoneStr);
            res.json({ success: true, message: '注册成功，请登录', userId: result.insertId, roleCode: code });
          });
        });
      };
      tryGen(10);
      return;
    }

    const insertSql = 'INSERT INTO sys_users (username, password, role, phone, role_code, created_at) VALUES (?, ?, ?, ?, ?, NOW())';
    const insertParams = [username.trim(), hashedPassword, role, phoneStr, roleCodeStr || null];
    db.query(insertSql, insertParams, (err, result) => {
      if (err) return res.status(500).json({ success: false, message: '服务器错误，注册失败' });
      smsStore.delete(phoneStr);
      res.json({ success: true, message: '注册成功，请登录', userId: result.insertId });
    });
  });
  
});

// ==========================================
// 登录接口：POST /api/auth/login
// ==========================================
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: '请输入账号和密码' });
  }

  const sql = 'SELECT id, username, password, role, avatar, created_at FROM sys_users WHERE username = ?';
  const params = [username.trim()];
  
  db.query(sql, params, (err, rows) => {
    if (err) {
      console.error('❌ 登录-查询失败:');
      console.error('   错误代码:', err.code);
      console.error('   错误信息:', err.message);
      console.error('   SQL语句:', sql);
      console.error('   参数:', params);
      console.error('   完整错误:', err);
      return res.status(500).json({ success: false, message: '服务器错误' });
    }
    if (!rows || rows.length === 0) {
      return res.status(401).json({ success: false, message: '账号或密码错误' });
    }

    const user = rows[0];
    const isMatch = bcrypt.compareSync(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: '账号或密码错误' });
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({
      success: true,
      message: '登录成功',
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        avatar: user.avatar || null,
      },
    });
  });
});

// ==========================================
// JWT 鉴权中间件（需要登录的接口使用）
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

// ==========================================
// 当前登录用户信息：GET /api/auth/me
// ==========================================
app.get('/api/auth/me', authMiddleware, (req, res) => {
  const sql = 'SELECT id, username, role, avatar, phone, created_at, role_code FROM sys_users WHERE id = ? LIMIT 1';
  db.query(sql, [req.user.userId], (err, rows) => {
    if (err) {
      console.error('❌ 查询当前用户信息失败:', err);
      return res.status(500).json({ success: false, message: '服务器错误' });
    }
    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }
    res.json({ success: true, user: rows[0] });
  });
});

// ==========================================
// 更新当前登录用户信息：PATCH /api/auth/me
// ==========================================
app.patch('/api/auth/me', authMiddleware, (req, res) => {
  const body = req.body || {};
  const hasUsername = Object.prototype.hasOwnProperty.call(body, 'username');
  const hasAvatar = Object.prototype.hasOwnProperty.call(body, 'avatar');
  const hasPassword = Object.prototype.hasOwnProperty.call(body, 'password');

  if (!hasUsername && !hasAvatar && !hasPassword) {
    return res.status(400).json({ success: false, message: '至少提交一个可更新字段' });
  }

  const username = hasUsername ? String(body.username || '').trim() : '';
  if (hasUsername && username.length < 2) {
    return res.status(400).json({ success: false, message: '用户名长度至少 2 个字符' });
  }
  const password = hasPassword ? String(body.password || '') : '';
  if (hasPassword && password.length < 6) {
    return res.status(400).json({ success: false, message: '新密码长度至少 6 位' });
  }

  let avatarValue = null;
  if (hasAvatar) {
    if (body.avatar === null) {
      avatarValue = null;
    } else if (typeof body.avatar === 'string') {
      avatarValue = String(body.avatar).trim() || null;
    } else {
      return res.status(400).json({ success: false, message: '头像参数格式错误' });
    }
  }

  const doUpdate = () => {
    const sets = [];
    const values = [];

    if (hasUsername) {
      sets.push('username = ?');
      values.push(username);
    }
    if (hasAvatar) {
      sets.push('avatar = ?');
      values.push(avatarValue);
    }
    if (hasPassword) {
      sets.push('password = ?');
      values.push(bcrypt.hashSync(password, 10));
    }

    if (sets.length === 0) {
      return res.status(400).json({ success: false, message: '没有可更新字段' });
    }

    values.push(req.user.userId);
    const updateSql = `UPDATE sys_users SET ${sets.join(', ')} WHERE id = ?`;
    db.query(updateSql, values, (errUpdate) => {
      if (errUpdate) {
        if (errUpdate.code === 'ER_DUP_ENTRY') {
          return res.status(400).json({ success: false, message: '该名称已有人使用' });
        }
        console.error('❌ 更新用户信息失败:', errUpdate);
        return res.status(500).json({ success: false, message: '服务器错误' });
      }

      const querySql = 'SELECT id, username, role, avatar, phone, created_at, role_code FROM sys_users WHERE id = ? LIMIT 1';
      db.query(querySql, [req.user.userId], (errQuery, rows) => {
        if (errQuery) {
          console.error('❌ 查询更新后的用户信息失败:', errQuery);
          return res.status(500).json({ success: false, message: '服务器错误' });
        }
        if (!rows || rows.length === 0) {
          return res.status(404).json({ success: false, message: '用户不存在' });
        }
        res.json({ success: true, message: '更新成功', user: rows[0] });
      });
    });
  };

  if (!hasUsername) return doUpdate();

  const checkSql = req.user.role === 'merchant'
    ? "SELECT id FROM sys_users WHERE role = 'merchant' AND username = ? AND id <> ? LIMIT 1"
    : 'SELECT id FROM sys_users WHERE username = ? AND id <> ? LIMIT 1';
  db.query(checkSql, [username, req.user.userId], (errCheck, rows) => {
    if (errCheck) {
      console.error('❌ 校验用户名是否重复失败:', errCheck);
      return res.status(500).json({ success: false, message: '服务器错误' });
    }
    if (rows && rows.length > 0) {
      return res.status(400).json({ success: false, message: '该名称已有人使用' });
    }
    doUpdate();
  });
});

/** 仅管理员可访问 */
function adminMiddleware(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: '仅管理员可操作' });
  }
  next();
}

function getOSSClient() {
  const region = process.env.OSS_REGION || 'oss-cn-beijing';
  const accessKeyId = process.env.OSS_ACCESS_KEY_ID;
  const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET;
  const bucket = process.env.OSS_BUCKET || 'easy-travelling';
  if (!accessKeyId || !accessKeySecret) return null;
  return new OSS({ region, accessKeyId, accessKeySecret, bucket, secure: true });
}

// 从 OSS 完整 URL 解析出 objectKey（支持虚拟主机风格与路径风格，仅本 bucket 才解析）
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
    // 虚拟主机风格: https://bucket.oss-cn-beijing.aliyuncs.com/uploads/xxx
    if (host === `${bucket}.${region}.aliyuncs.com`) {
      return pathname || null;
    }
    // 路径风格: https://oss-cn-beijing.aliyuncs.com/bucket/uploads/xxx
    if (host === `${region}.aliyuncs.com` && pathname.startsWith(bucket + '/')) {
      return pathname.slice(bucket.length + 1) || null;
    }
    // 兼容：只要路径里包含 uploads/ 且域名含 aliyuncs，尝试取最后一截作为 key（兜底）
    if (host.includes('aliyuncs.com') && pathname.includes('uploads/')) {
      const idx = pathname.indexOf('uploads/');
      return pathname.slice(idx) || null;
    }
  } catch (_) {
    // 非合法 URL，尝试简单前缀匹配
    const prefix = `https://${bucket}.${region}.aliyuncs.com/`;
    if (u.startsWith(prefix)) {
      const key = u.slice(prefix.length).replace(/^\/+/, '').split('?')[0];
      return key || null;
    }
  }
  return null;
}

// 批量从 OSS 删除文件（按 URL）；忽略非本 bucket 的 URL 和删除失败
function deleteOSSFiles(client, urls) {
  if (!client) {
    console.warn('[OSS] 未配置 OSS 客户端，跳过删除');
    return Promise.resolve();
  }
  if (!urls || !urls.length) return Promise.resolve();
  const keys = urls.map(urlToOSSObjectKey).filter(Boolean);
  if (keys.length === 0) {
    console.warn('[OSS] 未解析出任何 objectKey，原始 URL 数量:', urls.length, '示例:', urls[0]);
    return Promise.resolve();
  }
  console.log('[OSS] 即将删除', keys.length, '个文件:', keys.slice(0, 3).join(', '), keys.length > 3 ? '...' : '');
  return Promise.allSettled(keys.map((key) => client.delete(key)))
    .then((results) => {
      results.forEach((r, i) => {
        if (r.status === 'rejected') console.error('[OSS] 删除失败:', keys[i], r.reason?.message || r.reason);
      });
    });
}

function _getImageUrl(row) {
  if (!row) return null;
  const v = row.image_url !== undefined ? row.image_url : row.IMAGE_URL;
  return v != null ? String(v).trim() : null;
}

// 从酒店 + 房型行中收集所有图片 URL（封面 + 房型多图逗号分隔）
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
// 图片上传到 OSS：POST /api/upload（需登录，单文件，返回 url）
// ==========================================
app.post('/api/upload', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: '请选择要上传的图片' });
  }
  const client = getOSSClient();
  if (!client) {
    return res.status(503).json({ success: false, message: '未配置 OSS，请设置 .env 中的 OSS_ACCESS_KEY_ID 与 OSS_ACCESS_KEY_SECRET' });
  }
  const ext = (req.file.originalname || '').split('.').pop() || 'jpg';
  const safeExt = /^[a-z0-9]+$/i.test(ext) ? ext : 'jpg';
  const objectName = `uploads/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${safeExt}`;
  const stream = Readable.from(req.file.buffer);
  const opts = { mime: req.file.mimetype, contentLength: req.file.size };
  client.putStream(objectName, stream, opts)
    .then(() => {
      const bucket = process.env.OSS_BUCKET || 'easy-travelling';
      const region = process.env.OSS_REGION || 'oss-cn-beijing';
      const url = `https://${bucket}.${region}.aliyuncs.com/${objectName}`;
      res.json({ success: true, url });
    })
    .catch((err) => {
      console.error('OSS 上传失败:', err);
      const msg = (err && (err.message || err.code)) ? String(err.message || err.code) : '上传失败';
      res.status(500).json({ success: false, message: msg });
    });
});

// ==========================================
// 我的酒店列表：GET /api/hotels/my（仅商户）
// ==========================================
app.get('/api/hotels/my', authMiddleware, (req, res) => {
  if (req.user.role !== 'merchant') {
    return res.status(403).json({ success: false, message: '仅商户可查看' });
  }
  const sql = `SELECT id, merchant_id, name, city, address, phone, price, star_level, tags, image_url, description, status, create_time 
    FROM hotels WHERE merchant_id = ? ORDER BY create_time DESC`;
   const params = [req.user.userId];
  
  // ✅【修改】添加详细错误日志
  db.query(sql, params, (err, rows) => {
    if (err) {
      console.error('❌ 查询我的酒店失败:');
      console.error('   错误代码:', err.code);
      console.error('   错误信息:', err.message);
      console.error('   SQL语句:', sql);
      console.error('   参数:', params);
      console.error('   完整错误:', err);
      return res.status(500).json({ 
        success: false, 
        message: '查询酒店列表失败',
        error: err.message 
      });
    }
    res.json(rows || []);
  });
});

// ==========================================
// 发布酒店：POST /api/hotels（仅商户，写入 hotels + room_types）
// ==========================================
app.post('/api/hotels', authMiddleware, (req, res) => {
  if (req.user.role !== 'merchant') {
    return res.status(403).json({ success: false, message: '仅商户可发布酒店' });
  }
  const { name, city, address, phone, price, star_level, tags, image_url, description, roomTypes } = req.body;
  if (!name || !city || !address) {
    return res.status(400).json({ success: false, message: '请填写酒店名称、城市、地址' });
  }
  if (!roomTypes || !Array.isArray(roomTypes) || roomTypes.length === 0) {
    return res.status(400).json({ success: false, message: '请至少添加一个房型' });
  }
  for (const rt of roomTypes) {
    if (!rt.name || rt.price == null || rt.price === '') {
      return res.status(400).json({ success: false, message: '房型名称和价格必填' });
    }
  }

  const priceNum = price != null && price !== '' ? Number(price) : null;
  const starNum = star_level != null && star_level !== '' ? Number(star_level) : null;
  const tagsStr = Array.isArray(tags)
    ? tags.map((t) => String(t).trim()).filter(Boolean).join('\uFF0C')
    : (typeof tags === 'string'
      ? tags.split(/[\uFF0C,]/).map((t) => String(t).trim()).filter(Boolean).join('\uFF0C')
      : null);
  const insSql = `INSERT INTO hotels (merchant_id, name, city, address, phone, price, star_level, tags, image_url, description, status, create_time) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NOW())`;
  const insValues = [req.user.userId, String(name).trim(), String(city).trim(), String(address).trim(), phone ? String(phone).trim() : null, priceNum, starNum, tagsStr || null, image_url ? String(image_url).trim() : null, description ? String(description).trim() : null];

  // ✅【修改】添加详细错误日志
  db.query(insSql, insValues, (err, result) => {
    if (err) {
      console.error('❌ 发布酒店-插入hotels失败:');
      console.error('   错误代码:', err.code);
      console.error('   错误信息:', err.message);
      console.error('   SQL语句:', insSql);
      console.error('   参数:', insValues);
      console.error('   完整错误:', err);
      return res.status(500).json({ 
        success: false, 
        message: '发布酒店失败',
        error: err.message 
      });
    }
    
    const hotelId = result.insertId;
    const rtSql = 'INSERT INTO room_types (hotel_id, name, price, description, image_url) VALUES (?, ?, ?, ?, ?)';
    let done = 0;
    let hasError = false;
    const total = roomTypes.length;
    
    if (total === 0) {
      return res.json({ success: true, message: '发布成功', hotelId });
    }
    
    for (const rt of roomTypes) {
      const rtDesc = rt.description ? String(rt.description).trim() : null;
      const rtImg = rt.image_url ? String(rt.image_url).trim() : null;
      const rtValues = [hotelId, String(rt.name).trim(), Number(rt.price), rtDesc, rtImg];
      
      // ✅【修改】添加详细错误日志
      db.query(rtSql, rtValues, (errRt) => {
        if (errRt) {
          console.error('❌ 插入房型失败:');
          console.error('   错误代码:', errRt.code);
          console.error('   错误信息:', errRt.message);
          console.error('   SQL语句:', rtSql);
          console.error('   参数:', rtValues);
          console.error('   完整错误:', errRt);
          hasError = true;
        }
        
        done += 1;
        if (done === total) {
          if (hasError) {
            return res.status(500).json({ 
              success: false, 
              message: '部分房型插入失败，请检查数据',
              hotelId: hotelId 
            });
          }
          res.json({ success: true, message: '发布成功', hotelId });
        }
      });
    }
  });
});

// ==========================================
// 酒店详情（含房型）：GET /api/hotels/:id（仅商户本人）
// ==========================================
app.get('/api/hotels/:id', authMiddleware, (req, res) => {
  if (req.user.role !== 'merchant') {
    return res.status(403).json({ success: false, message: '仅商户可查看' });
  }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ success: false, message: '无效的酒店ID' });

  const sql = 'SELECT * FROM hotels WHERE id = ? AND merchant_id = ?';
  const params = [id, req.user.userId];
  
  // ✅【修改】添加详细错误日志
  db.query(sql, params, (err, rows) => {
    if (err) {
      console.error('❌ 查询酒店详情失败:');
      console.error('   错误代码:', err.code);
      console.error('   错误信息:', err.message);
      console.error('   SQL语句:', sql);
      console.error('   参数:', params);
      console.error('   完整错误:', err);
      return res.status(500).json({ 
        success: false, 
        message: '查询酒店详情失败',
        error: err.message 
      });
    }
    if (!rows || rows.length === 0) return res.status(404).json({ success: false, message: '酒店不存在' });
    
    const hotel = rows[0];
    const cancellation = hotel.cancellation != null ? hotel.cancellation : (hotel.Cancellation != null ? hotel.Cancellation : null);
    
    const rtSql = 'SELECT id, name, price, description, image_url FROM room_types WHERE hotel_id = ?';
    db.query(rtSql, [id], (errRt, roomRows) => {
      if (errRt) {
        console.error('❌ 查询房型失败:', errRt);
        return res.status(500).json({ 
          success: false, 
          message: '查询房型失败',
          error: errRt.message 
        });
      }
      res.json({ ...hotel, cancellation, roomTypes: roomRows || [] });
    });
  });
});

// ==========================================
// 退回申请：PATCH /api/hotels/:id/status（status=2，cancellation 写为「商家自行退回申请」）
// ==========================================
app.patch('/api/hotels/:id/status', authMiddleware, (req, res) => {
  if (req.user.role !== 'merchant') {
    return res.status(403).json({ success: false, message: '仅商户可操作' });
  }
  const id = parseInt(req.params.id, 10);
  const { status } = req.body;
  if (isNaN(id)) return res.status(400).json({ success: false, message: '无效的酒店ID' });
  if (status !== 2) return res.status(400).json({ success: false, message: '仅支持退回为已拒绝' });
  const sql = 'UPDATE hotels SET status = ?, cancellation = ? WHERE id = ? AND merchant_id = ?';
  const params = [status, '商家自行退回申请', id, req.user.userId];
  
  // ✅【修改】添加详细错误日志
  db.query(sql, params, (err, result) => {
    if (err) {
      console.error('❌ 酒店退回申请失败:');
      console.error('   错误代码:', err.code);
      console.error('   错误信息:', err.message);
      console.error('   SQL语句:', sql);
      console.error('   参数:', params);
      console.error('   完整错误:', err);
      return res.status(500).json({ 
        success: false, 
        message: '退回申请失败',
        error: err.message 
      });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false, 
        message: '酒店不存在或无权限操作' 
      });
    }
    res.json({ success: true, message: '已退回申请' });
  });
});

// ==========================================
// 删除/下架酒店：DELETE /api/hotels/:id（物理删除酒店及房型，并删除 OSS 中对应图片）
// ==========================================
app.delete('/api/hotels/:id', authMiddleware, (req, res) => {
  if (req.user.role !== 'merchant') {
    return res.status(403).json({ success: false, message: '仅商户可操作' });
  }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ success: false, message: '无效的酒店ID' });
  
  const selectHotelSql = 'SELECT id, image_url FROM hotels WHERE id = ? AND merchant_id = ?';
  db.query(selectHotelSql, [id, req.user.userId], (err, rows) => {
    if (err) {
      console.error('❌ 删除-查询酒店失败:', err);
      return res.status(500).json({ success: false, message: '服务器错误' });
    }
    if (!rows || rows.length === 0) return res.status(404).json({ success: false, message: '酒店不存在' });
    
    const hotel = rows[0];
    const selectRoomSql = 'SELECT id, image_url FROM room_types WHERE hotel_id = ?';
    db.query(selectRoomSql, [id], (errRt, roomRows) => {
      if (errRt) {
        console.error('❌ 删除-查询房型失败:', errRt);
        return res.status(500).json({ success: false, message: '服务器错误' });
      }
      
      const urls = collectImageUrls(hotel, roomRows || []);
      if (urls.length) console.log('[OSS] 删除酒店: 共', urls.length, '个图片 URL');
      
      const client = getOSSClient();
      const afterOSS = client ? deleteOSSFiles(client, urls) : Promise.resolve();
      
      afterOSS.finally(() => {
        const deleteRoomSql = 'DELETE FROM room_types WHERE hotel_id = ?';
        db.query(deleteRoomSql, [id], (err1) => {
          if (err1) {
            console.error('❌ 删除-删除房型失败:', err1);
            return res.status(500).json({ success: false, message: '服务器错误' });
          }
          
          const deleteHotelSql = 'DELETE FROM hotels WHERE id = ? AND merchant_id = ?';
          db.query(deleteHotelSql, [id, req.user.userId], (err2, result) => {
            if (err2) {
              console.error('❌ 删除-删除酒店失败:', err2);
              return res.status(500).json({ success: false, message: '服务器错误' });
            }
            if (result.affectedRows === 0) return res.status(404).json({ success: false, message: '酒店不存在' });
            res.json({ success: true, message: '已删除' });
          });
        });
      });
    });
  });

});

// ==========================================
// 更新酒店：PUT /api/hotels/:id（商户本人，更新酒店+房型；删除被替换的 OSS 图片）
// ==========================================
app.put('/api/hotels/:id', authMiddleware, (req, res) => {
  if (req.user.role !== 'merchant') {
    return res.status(403).json({ success: false, message: '仅商户可操作' });
  }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ success: false, message: '无效的酒店ID' });
  const { name, city, address, phone, price, star_level, tags, image_url, description, roomTypes } = req.body;
  if (!name || !city || !address) {
    return res.status(400).json({ success: false, message: '请填写酒店名称、城市、地址' });
  }
  if (!roomTypes || !Array.isArray(roomTypes) || roomTypes.length === 0) {
    return res.status(400).json({ success: false, message: '请至少添加一个房型' });
  }
  
   // 先查出当前酒店与房型的图片 URL，用于更新后删除不再使用的 OSS 文件
  const selectHotelSql = 'SELECT id, image_url FROM hotels WHERE id = ? AND merchant_id = ?';
  db.query(selectHotelSql, [id, req.user.userId], (err, rows) => {
    if (err) {
      console.error('❌ 更新-查询酒店失败:', err);
      return res.status(500).json({ success: false, message: '服务器错误' });
    }
    if (!rows || rows.length === 0) return res.status(404).json({ success: false, message: '酒店不存在' });
    
    const oldHotel = rows[0];
    const selectRoomSql = 'SELECT id, image_url FROM room_types WHERE hotel_id = ?';
    db.query(selectRoomSql, [id], (errRt, roomRows) => {
      if (errRt) {
        console.error('❌ 更新-查询房型失败:', errRt);
        return res.status(500).json({ success: false, message: '服务器错误' });
      }
      
      const oldUrls = collectImageUrls(oldHotel, roomRows || []);
      const newUrls = [];
      if (image_url && String(image_url).trim()) newUrls.push(String(image_url).trim());
      roomTypes.forEach((rt) => {
        if (rt.image_url) String(rt.image_url).trim().split(',').forEach((u) => u && newUrls.push(u.trim()));
      });
      const newSet = new Set(newUrls);
      const toDelete = oldUrls.filter((u) => !newSet.has(u));
      if (toDelete.length) console.log('[OSS] 更新酒店: 需删除', toDelete.length, '个已替换的图片');

      const priceNum = price != null && price !== '' ? Number(price) : null;
      const starNum = star_level != null && star_level !== '' ? Number(star_level) : null;
      const tagsStr = Array.isArray(tags)
        ? tags.map((t) => String(t).trim()).filter(Boolean).join('\uFF0C')
        : (typeof tags === 'string'
          ? tags.split(/[\uFF0C,]/).map((t) => String(t).trim()).filter(Boolean).join('\uFF0C')
          : null);
      const upSql = `UPDATE hotels SET name=?, city=?, address=?, phone=?, price=?, star_level=?, tags=?, image_url=?, description=?, status=0, create_time=create_time WHERE id=? AND merchant_id=?`;
      const upValues = [String(name).trim(), String(city).trim(), String(address).trim(), phone ? String(phone).trim() : null, priceNum, starNum, tagsStr || null, image_url ? String(image_url).trim() : null, description ? String(description).trim() : null, id, req.user.userId];
      
      db.query(upSql, upValues, (errUp) => {
        if (errUp) {
          console.error('❌ 更新-更新酒店失败:', errUp);
          return res.status(500).json({ success: false, message: '更新失败' });
        }
        
        const deleteRoomSql = 'DELETE FROM room_types WHERE hotel_id = ?';
        db.query(deleteRoomSql, [id], () => {
          const rtSql = 'INSERT INTO room_types (hotel_id, name, price, description, image_url) VALUES (?, ?, ?, ?, ?)';
          let done = 0;
          let hasError = false;
          const total = roomTypes.length;
          
          const finish = () => {
            const client = getOSSClient();
            if (client && toDelete.length) {
              deleteOSSFiles(client, toDelete).finally(() => {
                if (hasError) {
                  res.status(500).json({ success: false, message: '部分房型插入失败' });
                } else {
                  res.json({ success: true, message: '更新成功' });
                }
              });
            } else {
              if (hasError) {
                res.status(500).json({ success: false, message: '部分房型插入失败' });
              } else {
                res.json({ success: true, message: '更新成功' });
              }
            }
          };
          
          if (total === 0) return finish();
          
          for (const rt of roomTypes) {
            const rtDesc = rt.description ? String(rt.description).trim() : null;
            const rtImg = rt.image_url ? String(rt.image_url).trim() : null;
            const rtValues = [id, String(rt.name).trim(), Number(rt.price), rtDesc, rtImg];
            
            db.query(rtSql, rtValues, (errRt) => {
              if (errRt) {
                console.error('❌ 更新-插入房型失败:', errRt);
                hasError = true;
              }
              done += 1;
              if (done === total) finish();
            });
          }
        });
      });
    });
  });

});

// ==========================================
// 管理员接口（需登录且 role=admin）
// ==========================================

// 已发布列表：status IN (1 已发布, 3 已下线)，关联商户名称，按创建时间倒序
app.get('/api/admin/hotels/published', authMiddleware, adminMiddleware, (req, res) => {
  const sql = `SELECT h.id, h.merchant_id, h.name, h.city, h.address, h.phone, h.price, h.star_level, h.tags, h.image_url, h.description, h.status, h.cancellation, h.create_time, h.update_time,
    u.username AS merchant_name
    FROM hotels h
    LEFT JOIN sys_users u ON u.id = h.merchant_id
    WHERE h.status IN (1, 3) ORDER BY h.create_time DESC`;
  
  // ✅【修改】添加详细错误日志
  db.query(sql, [], (err, rows) => {
    if (err) {
      console.error('❌ 管理员-已发布列表失败:');
      console.error('   错误代码:', err.code);
      console.error('   错误信息:', err.message);
      console.error('   SQL语句:', sql);
      console.error('   完整错误:', err);
      return res.status(500).json({ 
        success: false, 
        message: '查询已发布列表失败',
        error: err.message 
      });
    }
    res.json(rows || []);
  });

});

// 待审核列表：status=0，关联商户名称
app.get('/api/admin/hotels/pending', authMiddleware, adminMiddleware, (req, res) => {
  const sql = `SELECT h.id, h.merchant_id, h.name, h.city, h.address, h.phone, h.price, h.star_level, h.tags, h.image_url, h.description, h.status, h.create_time,
    u.username AS merchant_name
    FROM hotels h
    LEFT JOIN sys_users u ON u.id = h.merchant_id
    WHERE h.status = 0
    ORDER BY h.create_time DESC`;
  
  // ✅【修改】添加详细错误日志
  db.query(sql, [], (err, rows) => {
    if (err) {
      console.error('❌ 管理员-待审核列表失败:');
      console.error('   错误代码:', err.code);
      console.error('   错误信息:', err.message);
      console.error('   SQL语句:', sql);
      console.error('   完整错误:', err);
      return res.status(500).json({ 
        success: false, 
        message: '查询待审核列表失败',
        error: err.message 
      });
    }
    res.json(rows || []);
  });

});

// 管理员查看酒店详情（任意酒店，用于「查看信息」）
app.get('/api/admin/hotels/:id', authMiddleware, adminMiddleware, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ success: false, message: '无效的酒店ID' });
  const sql = 'SELECT * FROM hotels WHERE id = ?';
  const params = [id];
  
  // ✅【修改】添加详细错误日志
  db.query(sql, params, (err, rows) => {
    if (err) {
      console.error('❌ 管理员-查询酒店详情失败:');
      console.error('   错误代码:', err.code);
      console.error('   错误信息:', err.message);
      console.error('   SQL语句:', sql);
      console.error('   参数:', params);
      console.error('   完整错误:', err);
      return res.status(500).json({ 
        success: false, 
        message: '查询酒店详情失败',
        error: err.message 
      });
    }
    if (!rows || rows.length === 0) return res.status(404).json({ success: false, message: '酒店不存在' });
    
    const hotel = rows[0];
    const rtSql = 'SELECT id, name, price, description, image_url FROM room_types WHERE hotel_id = ?';
    db.query(rtSql, [id], (errRt, roomRows) => {
      if (errRt) {
        console.error('❌ 管理员-查询房型失败:', errRt);
        return res.status(500).json({ 
          success: false, 
          message: '查询房型失败',
          error: errRt.message 
        });
      }
      res.json({ ...hotel, roomTypes: roomRows || [] });
    });
  });

});

// 通过审核：status=1
app.post('/api/admin/hotels/:id/approve', authMiddleware, adminMiddleware, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ success: false, message: '无效的酒店ID' });
  const sql = 'UPDATE hotels SET status = 1 WHERE id = ? AND status = 0';
   const params = [id];
  
  // ✅【修改】添加详细错误日志
  db.query(sql, params, (err, result) => {
    if (err) {
      console.error('❌ 管理员-通过审核失败:');
      console.error('   错误代码:', err.code);
      console.error('   错误信息:', err.message);
      console.error('   SQL语句:', sql);
      console.error('   参数:', params);
      console.error('   完整错误:', err);
      return res.status(500).json({ 
        success: false, 
        message: '通过审核失败',
        error: err.message 
      });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false, 
        message: '酒店不存在或非待审核状态' 
      });
    }
    res.json({ success: true, message: '已通过' });
  });
});

// 拒绝：status=2，写入 cancellation
app.post('/api/admin/hotels/:id/reject', authMiddleware, adminMiddleware, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { reason } = req.body || {};
  if (isNaN(id)) return res.status(400).json({ success: false, message: '无效的酒店ID' });
  const sql = 'UPDATE hotels SET status = 2, cancellation = ? WHERE id = ? AND status = 0';
  const params = [reason ? String(reason).trim() : null, id];
  
  // ✅【修改】添加详细错误日志
  db.query(sql, params, (err, result) => {
    if (err) {
      console.error('❌ 管理员-拒绝审核失败:');
      console.error('   错误代码:', err.code);
      console.error('   错误信息:', err.message);
      console.error('   SQL语句:', sql);
      console.error('   参数:', params);
      console.error('   完整错误:', err);
      return res.status(500).json({ 
        success: false, 
        message: '拒绝审核失败',
        error: err.message 
      });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false, 
        message: '酒店不存在或非待审核状态' 
      });
    }
    res.json({ success: true, message: '已拒绝' });
  });

});

// 下线：仅将 status 置为 3、写入 cancellation、update_time 置为当前时间，不删除数据库与 OSS
app.post('/api/admin/hotels/:id/offline', authMiddleware, adminMiddleware, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { reason } = req.body || {};
  if (isNaN(id)) return res.status(400).json({ success: false, message: '无效的酒店ID' });
  const upSql = 'UPDATE hotels SET status = 3, cancellation = ?, update_time = CURRENT_TIMESTAMP WHERE id = ? AND status = 1';
  const params = [reason ? String(reason).trim() : null, id];
  
  // ✅【修改】添加详细错误日志
  db.query(upSql, params, (err, result) => {
    if (err) {
      console.error('❌ 管理员-下线酒店失败:');
      console.error('   错误代码:', err.code);
      console.error('   错误信息:', err.message);
      console.error('   SQL语句:', upSql);
      console.error('   参数:', params);
      console.error('   完整错误:', err);
      return res.status(500).json({ 
        success: false, 
        message: '下线酒店失败',
        error: err.message 
      });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false, 
        message: '酒店不存在或非已发布状态' 
      });
    }
    res.json({ success: true, message: '已下线' });
  });

});

// 管理员物理删除酒店（已下线或任意状态均可删）
app.delete('/api/admin/hotels/:id', authMiddleware, adminMiddleware, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ success: false, message: '无效的酒店ID' });
  
  const selectHotelSql = 'SELECT id, image_url FROM hotels WHERE id = ?';
  db.query(selectHotelSql, [id], (err, rows) => {
    if (err) {
      console.error('❌ 管理员删除-查询酒店失败:', err);
      return res.status(500).json({ success: false, message: '服务器错误' });
    }
    if (!rows || rows.length === 0) return res.status(404).json({ success: false, message: '酒店不存在' });
    
    const hotel = rows[0];
    const selectRoomSql = 'SELECT id, image_url FROM room_types WHERE hotel_id = ?';
    db.query(selectRoomSql, [id], (errRt, roomRows) => {
      if (errRt) {
        console.error('❌ 管理员删除-查询房型失败:', errRt);
        return res.status(500).json({ success: false, message: '服务器错误' });
      }
      
      const urls = collectImageUrls(hotel, roomRows || []);
      const client = getOSSClient();
      const afterOSS = client ? deleteOSSFiles(client, urls) : Promise.resolve();
      
      afterOSS.finally(() => {
        const deleteRoomSql = 'DELETE FROM room_types WHERE hotel_id = ?';
        db.query(deleteRoomSql, [id], (err1) => {
          if (err1) {
            console.error('❌ 管理员删除-删除房型失败:', err1);
            return res.status(500).json({ success: false, message: '服务器错误' });
          }
          
          const deleteHotelSql = 'DELETE FROM hotels WHERE id = ?';
          db.query(deleteHotelSql, [id], (err2, result) => {
            if (err2) {
              console.error('❌ 管理员删除-删除酒店失败:', err2);
              return res.status(500).json({ success: false, message: '服务器错误' });
            }
            if (result.affectedRows === 0) return res.status(404).json({ success: false, message: '酒店不存在' });
            res.json({ success: true, message: '已删除' });
          });
        });
      });
    });
  });

});

// ==========================================
// 写一个接口：创建新订单 (前端点"立即预订"时调这个)
// ==========================================
app.post('/api/bookings/create', (req, res) => {
  // 1. 从前端发来的数据里，把这些信息拿出来
  const { user_name, user_phone, user_id_card, hotel_id, hotel_name, check_in_date, check_out_date, total_price } = req.body;

  // 2. 准备 SQL 语句 (问号是占位符，防止黑客攻击)
  const sql = `
    INSERT INTO bookings 
    (user_name, user_phone, user_id_card, hotel_id, hotel_name, check_in_date, check_out_date, total_price) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  // 3. 执行 SQL
  const values = [user_name, user_phone, user_id_card, hotel_id, hotel_name, check_in_date, check_out_date, total_price];
  
  // ✅【修改】添加详细错误日志
  db.query(sql, values, (err, result) => {
    if (err) {
      console.error('❌ 插入订单失败:');
      console.error('   错误代码:', err.code);
      console.error('   错误信息:', err.message);
      console.error('   SQL语句:', sql);
      console.error('   参数:', values);
      console.error('   完整错误:', err);
      return res.status(500).json({ 
        success: false, 
        message: '预订失败',
        error: err.message 
      });
    }
    res.json({ 
      success: true, 
      message: '预订成功！', 
      orderId: result.insertId
    });
  });

});

// ==========================================
// 写一个接口：查询我的订单列表
// ==========================================
app.get('/api/bookings/my-list', (req, res) => {
  // 简单起见，这里先查出所有订单 (实际项目中会根据用户ID查)
  const sql = 'SELECT * FROM bookings ORDER BY create_time DESC';

  // ✅【修改】添加详细错误日志
  db.query(sql, (err, results) => {
    if (err) {
      console.error('❌ 查询订单列表失败:', err);
      return res.status(500).json({ 
        success: false, 
        message: '查询失败',
        error: err.message 
      });
    }
    res.json(results || []);
  });

});

// 统一错误处理（如 MulterError: File too large）返回 JSON，避免返回 HTML
app.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, message: '图片不能超过 20MB，请压缩后重试' });
  }
  if (err && err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ success: false, message: '请使用字段名 file 上传图片' });
  }
  console.error('请求错误:', err);
  res.status(500).json({ success: false, message: err.message || '服务器错误' });
});

// 启动服务器
app.listen(port, () => {
  console.log(`🚀 服务端正在运行: http://localhost:${port}`);
});
