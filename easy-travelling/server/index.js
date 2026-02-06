// 1. 引入必要的工具包
const express = require('express'); // 搭建服务器的框架
const mysql = require('mysql2');    // 连接数据库的驱动
const cors = require('cors');       // 解决跨域问题的插件

const app = express();
const port = 3000;

// 2. 开启中间件 (允许跨域 + 允许读取 JSON 数据)
app.use(cors());
app.use(express.json());

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
    connection.release(); // 用完记得释放连接
  }
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
  
  db.query(sql, values, (err, result) => {
    if (err) {
      console.error('插入订单失败:', err);
      return res.status(500).send({ message: '服务器错误，预订失败' });
    }
    // 成功了！告诉前端好消息
    res.send({ 
      success: true, 
      message: '预订成功！', 
      orderId: result.insertId // 把生成的订单号返给前端
    });
  });
});

// ==========================================
// 写一个接口：查询我的订单列表
// ==========================================
app.get('/api/bookings/my-list', (req, res) => {
  // 简单起见，这里先查出所有订单 (实际项目中会根据用户ID查)
  const sql = 'SELECT * FROM bookings ORDER BY create_time DESC';

  db.query(sql, (err, results) => {
    if (err) return res.status(500).send('查询失败');
    res.send(results);
  });
});

// 启动服务器
app.listen(port, () => {
  console.log(`🚀 服务端正在运行: http://localhost:${port}`);
});