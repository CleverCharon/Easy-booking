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
    'pages/login/setup/index',
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#fff',
    navigationBarTitleText: '\u6613\u5bbf',
    navigationBarTextStyle: 'black',
  },
  animation: false,
  tabBar: {
    color: '#666',
    selectedColor: '#fa2c19',
    backgroundColor: '#fff',
    borderStyle: 'black',
    list: [
      {
        pagePath: 'pages/home/index',
        text: '\u9996\u9875',
        iconPath: 'assets/images/tabbar/tab-home.png',
        selectedIconPath: 'assets/images/tabbar/home-active.png',
      },
      {
        pagePath: 'pages/list/index',
        text: '\u641c\u7d22',
        iconPath: 'assets/images/tabbar/tab-search.png',
        selectedIconPath: 'assets/images/tabbar/tab-search.png',
      },
      {
        pagePath: 'pages/favorite/index',
        text: '\u6536\u85cf',
        iconPath: 'assets/images/tabbar/tab-data.png',
        selectedIconPath: 'assets/images/tabbar/tab-data.png',
      },
      {
        pagePath: 'pages/my/index',
        text: '\u6211\u7684',
        iconPath: 'assets/images/tabbar/tab-profile.png',
        selectedIconPath: 'assets/images/tabbar/tab-profile.png',
      },
    ],
  },
})
