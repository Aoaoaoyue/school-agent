 Page({
   data: {
     userInfo: null
   },
 
   onShow() {
     const userInfo = wx.getStorageSync('userInfo') || null;
     this.setData({ userInfo });
   },
 
   goToLogin() {
     wx.navigateTo({ url: '/pages/login/login' });
   },
 
   goToChat() {
     wx.navigateTo({ url: '/pages/chat/chat' });
   },
 
   goToNotice() {
     wx.navigateTo({ url: '/pages/notice/notice' });
   },
 
   goToNavigation() {
     wx.navigateTo({ url: '/pages/navigation/navigation' });
   },
 
   goToLibrary() {
     wx.navigateTo({ url: '/pages/library/library' });
   },
 
   goToProfile() {
     wx.navigateTo({ url: '/pages/profile/profile' });
   },
 
   goToChatWithQuestion(e) {
     const question = e.currentTarget.dataset.question;
     wx.navigateTo({ url: '/pages/chat/chat?question=' + encodeURIComponent(question) });
   }
 })
