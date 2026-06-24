const API_BASE_URL = 'http://127.0.0.1:8080';

Page({
  data: {
    activeTab: 'notice',
    notices: [],
    noticeKeyword: ''
  },

  onShow() {
    if (this.data.activeTab === 'notice' && this.data.notices.length === 0) {
      this.loadNotices();
    }
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
    if (tab === 'notice' && this.data.notices.length === 0) this.loadNotices();
  },

  loadNotices() {
    wx.request({
      url: `${API_BASE_URL}/api/notices`,
      method: 'GET',
      timeout: 10000,
      success: (res) => {
        if (res.data && res.data.success) {
          this.setData({ notices: res.data.notices || [] });
        }
      }
    });
  },

  onNoticeSearch(e) {
    this.setData({ noticeKeyword: e.detail.value });
  },

  searchNotices() {
    const kw = this.data.noticeKeyword.trim();
    if (!kw) { this.loadNotices(); return; }
    wx.request({
      url: `${API_BASE_URL}/api/notices/search?keyword=${encodeURIComponent(kw)}`,
      method: 'GET',
      timeout: 10000,
      success: (res) => {
        if (res.data && res.data.success) {
          this.setData({ notices: res.data.notices || [] });
        }
      }
    });
  },

  viewNoticeDetail(e) {
    const id = e.currentTarget.dataset.id;
    const notices = this.data.notices;
    const notice = notices.find(n => n.id == id);
    if (notice && notice.url) {
      wx.showActionSheet({
        itemList: ['在微信内查看', '复制链接'],
        success: (res) => {
          if (res.tapIndex === 0) {
            wx.navigateTo({
              url: `/pages/webview/webview?url=${encodeURIComponent(notice.url)}`
            });
          } else if (res.tapIndex === 1) {
            wx.setClipboardData({
              data: notice.url,
              success: () => { wx.showToast({ title: '链接已复制', icon: 'success' }); }
            });
          }
        }
      });
    } else {
      wx.showToast({ title: '无法获取详情', icon: 'none' });
    }
  },

  openLibrary(e) {
    const url = e.currentTarget.dataset.url;
    wx.navigateTo({
      url: `/pages/webview/webview?url=${encodeURIComponent(url)}`
    });
  }
});
