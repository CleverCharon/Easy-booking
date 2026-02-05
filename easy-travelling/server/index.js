// 引入 express 框架
const express = require('express');
const app = express();
const port = 3000;

// 允许跨域 (解决前端请求报错的问题)
const cors = require('cors');
app.use(cors());

// 定义一个简单的接口
app.get('/', (req, res) => {
  res.send('Hello! 智慧出行后台服务已启动！');
});

// 启动服务器
app.listen(port, () => {
  console.log(`服务器正在运行，访问地址: http://localhost:${port}`);
});