const API_BASE_URL = 'http://127.0.0.1:8080';

let messageId = 0;

function formatTime() {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

Page({
  data: {
    messages: [],
    inputValue: '',
    loading: false,
    scrollTop: '',
    scrollIntoView: '',
    studentData: null,
    username: '',
    showScrollControls: false,
    showScrollToTop: false,
    showScrollToBottom: false,
    enableRefresher: false,
    refresherTriggered: false,
    userScrolled: false
  },

   onShow() {
    const ui = wx.getStorageSync('userInfo');
    if (!ui && this.data.messages.length > 0) {
      this.setData({ messages: [], studentData: null, username: '' });
    }
  },

  onLoad(options) {
     const initialQuestion = options && options.question ? decodeURIComponent(options.question) : '';
 
    const userInfo = wx.getStorageSync('userInfo');

    this.setData({
      studentData: userInfo.data,
      username: userInfo.username
    });

    // 添加欢迎消息
    const welcomeMessage = {
      id: ++messageId,
      type: 'bot',
      content: '您好！我是校园信息智能查询助手。我可以帮您：查课表/成绩/考试、浏览校园通知、校园导航、图书馆查询等。请随时问我任何问题！',
      time: formatTime()
    };
     const msgList = [welcomeMessage];
 
      if (initialQuestion) {
        this.setData({
          messages: msgList,
          inputValue: initialQuestion
        });
        setTimeout(() => {
          this.onSend();
        }, 500);
      } else {
        this.setData({
          messages: msgList
        });
      }
   },

  goBack() {
    wx.navigateBack();
  },

  onInput(e) {
    this.setData({
      inputValue: e.detail.value
    });
  },

  // 滚动事件 - 控制浮动按钮的显示
  onScroll(e) {
    const { scrollTop, scrollHeight, deltaY } = e.detail;
    const containerHeight = 600; // 估算容器高度

    const isAtTop = scrollTop <= 50;
    const isAtBottom = (scrollTop + containerHeight) >= (scrollHeight - 50);

    // 用户向上滚动超过200rpx时显示回到底部按钮
    const showScrollToBottom = scrollTop > 200 && !isAtBottom;
    // 距离顶部超过500rpx时显示回到顶部按钮
    const showScrollToTop = scrollTop > 500;
    const showScrollControls = showScrollToBottom || showScrollToTop;

    // 检测用户主动向上滚动（deltaY < 0）
    if (deltaY < -10) {
      this.setData({ userScrolled: true });
    }
    // 用户主动向下滚动到接近底部时重置
    if (isAtBottom) {
      this.setData({ userScrolled: false });
    }

    this.setData({
      showScrollControls,
      showScrollToTop,
      showScrollToBottom
    });
  },

  onScrollToUpper() {
    // 滚动到顶部，可用于加载历史消息
    // console.log('到达顶部');
  },

  onScrollToLower() {
    // 滚动到底部
    this.setData({ userScrolled: false });
  },

  scrollToTop() {
    this.setData({
      scrollTop: 0,
      scrollIntoView: '',
      showScrollToTop: false
    });
  },

  scrollToBottom() {
    const messages = this.data.messages;
    if (messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    this.setData({
      scrollIntoView: 'bottom-anchor',
      showScrollToBottom: false,
      userScrolled: false
    });
  },

  onRefresherRefresh() {
    // 下拉刷新 - 可加载更多历史消息
    this.setData({ refresherTriggered: true });
    setTimeout(() => {
      this.setData({ refresherTriggered: false });
    }, 1000);
  },

  // 长按消息气泡
  onLongPressMessage(e) {
    const { id, content } = e.currentTarget.dataset;
    wx.showActionSheet({
      itemList: ['复制内容'],
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.setClipboardData({
            data: content,
            success: () => {
              wx.showToast({ title: '已复制', icon: 'success' });
            }
          });
        }
      }
    });
  },

  async onSend() {
    const { inputValue, studentData, username, userScrolled } = this.data;

    if (!inputValue.trim()) {
      return;
    }

    if (!username && !studentData) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }

    const userMessage = {
      id: ++messageId,
      type: 'user',
      content: inputValue.trim(),
      time: formatTime()
    };

    const newMessages = [...this.data.messages, userMessage];
    this.setData({
      messages: newMessages,
      inputValue: '',
      loading: true
    }, () => {
      if (!userScrolled) {
        this.scrollToBottom();
      }
    });

    try {
      const response = await this.requestPromise({
        url: `${API_BASE_URL}/api/ai/qa`,
        method: 'POST',
        data: {
          question: userMessage.content,
          username: username,
          knowledge_base: studentData
        },
        header: {
          'Content-Type': 'application/json'
        },
        timeout: 120000
      });

      let botMessage;
      if (response && response.data && response.data.success) {
        botMessage = {
          id: ++messageId,
          type: 'bot',
          content: response.data.answer || '',
          time: formatTime()
        };
      } else {
        const errorText = (response && response.data && response.data.message) || '抱歉，AI暂时无法回答。';
        botMessage = {
          id: ++messageId,
          type: 'bot',
          content: errorText,
          time: formatTime()
        };
      }

      this.setData({
        messages: [...this.data.messages, botMessage],
        loading: false
      }, () => {
        this.scrollToBottom();
      });
    } catch (error) {
      console.error('请求失败:', error);

      const errorMessage = {
        id: ++messageId,
        type: 'bot',
        content: `网络错误: ${error.errMsg || '请稍后重试'}`,
        time: formatTime()
      };

      this.setData({
        messages: [...this.data.messages, errorMessage],
        loading: false
      }, () => {
        this.scrollToBottom();
      });
    }
  },

  requestPromise(options) {
    return new Promise((resolve, reject) => {
      wx.request({
        ...options,
        success: (res) => resolve(res),
        fail: (err) => reject(err)
      });
    });
  },

  // 智能滚动到底部 - 使用bottom-anchor确保滚动到最底部
  smartScrollToBottom() {
    const that = this;
    const delays = [100, 300, 600];
    delays.forEach((delay) => {
      setTimeout(() => {
        that.setData({ scrollIntoView: 'bottom-anchor' });
      }, delay);
    });
  }
});
