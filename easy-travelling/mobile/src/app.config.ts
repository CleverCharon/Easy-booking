export default defineAppConfig({
  pages: [
    'pages/home/index',
    'pages/list/index',
    'pages/detail/index',
    'pages/favorite/index',
    'pages/my/index',
    'pages/order/create/index',
    'pages/order/list/index',
    'pages/login/index'
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#fff',
    navigationBarTitleText: '易宿',
    navigationBarTextStyle: 'black'
  },
  tabBar: {
    color: '#666',
    selectedColor: '#fa2c19',
    backgroundColor: '#fff',
    borderStyle: 'black',
    list: [
      {
        pagePath: 'pages/home/index',
        text: '首页',
        iconPath: 'assets/images/home.png',
        selectedIconPath: 'assets/images/home-active.png'
      },
      {
        pagePath: 'pages/list/index',
        text: '搜索',
        iconPath: 'assets/images/search.png',
        selectedIconPath: 'assets/images/search-active.png'
      },
      {
        pagePath: 'pages/favorite/index',
        text: '收藏',
        iconPath: 'assets/images/star.png',
        selectedIconPath: 'assets/images/star-active.png'
      },
      {
        pagePath: 'pages/my/index',
        text: '我的',
        iconPath: 'assets/images/my.png',
        selectedIconPath: 'assets/images/my-active.png'
      }
    ]
  }
})
