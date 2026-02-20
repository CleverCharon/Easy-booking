export default defineAppConfig({
  pages: [
    'pages/home/index',
    'pages/list/index',
    'pages/detail/index',
    'pages/favorite/index',
    'pages/my/index',
    'pages/order/create/index',
    'pages/order/list/index',
    'pages/login/index',
    'pages/login/setup/index'
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#fff',
    navigationBarTitleText: '易宿',
    navigationBarTextStyle: 'black'
  },
  animation: false, // Disable default page transition animation to avoid conflicts
  tabBar: {
    color: '#666',
    selectedColor: '#fa2c19',
    backgroundColor: '#fff',
    borderStyle: 'black',
    list: [
      {
        pagePath: 'pages/home/index',
        text: '首页',
        iconPath: '/assets/images/tabbar/tab-home.png',
        selectedIconPath: '/assets/images/tabbar/tab-home.png'
      },
      {
        pagePath: 'pages/list/index',
        text: '搜索',
        iconPath: '/assets/images/tabbar/tab-search.png',
        selectedIconPath: '/assets/images/tabbar/tab-search.png'
      },
      {
        pagePath: 'pages/favorite/index',
        text: '收藏',
        iconPath: '/assets/images/tabbar/tab-data.png',
        selectedIconPath: '/assets/images/tabbar/tab-data.png'
      },
      {
        pagePath: 'pages/my/index',
        text: '我的',
        iconPath: '/assets/images/tabbar/tab-profile.png',
        selectedIconPath: '/assets/images/tabbar/tab-profile.png'
      }
    ]
  }
})
