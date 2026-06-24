const API_BASE_URL = 'http://127.0.0.1:8080';

Page({
  data: {
    username: '',
    password: '',
    loading: false,
    savedStudents: [],
    pollingTaskId: null
  },

  onLoad() {
    this.getSavedStudents();
  },

  onUnload() {
    if (this.data.pollingTaskId) {
      clearInterval(this.data.pollingTaskId);
    }
  },

  async getSavedStudents() {
    try {
      const response = await this.requestPromise({
        url: `${API_BASE_URL}/api/students`,
        method: 'GET',
        timeout: 30000
      });
      
      if (response && response.data && response.data.students) {
        this.setData({
          savedStudents: response.data.students
        });
      }
    } catch (error) {
      console.error('获取已保存学生列表失败:', error);
    }
  },

  requestPromise(options) {
    return new Promise((resolve, reject) => {
      wx.request({
        ...options,
        timeout: options.timeout || 30000,
        success: (res) => {
          resolve(res);
        },
        fail: (err) => {
          reject(err);
        }
      });
    });
  },

  onUsernameInput(e) {
    this.setData({
      username: e.detail.value
    });
  },

  onPasswordInput(e) {
    this.setData({
      password: e.detail.value
    });
  },

  async onLogin() {
    const { username, password } = this.data;
    
    if (!username) {
      wx.showToast({
        title: '请输入学号',
        icon: 'none'
      });
      return;
    }

    if (!password) {
      wx.showToast({
        title: '请输入密码',
        icon: 'none'
      });
      return;
    }

    this.setData({ loading: true });

    try {
      console.log('登录中...');
      
      wx.showLoading({
        title: '登录中...',
        mask: true
      });

      const loginResponse = await this.requestPromise({
        url: `${API_BASE_URL}/api/login`,
        method: 'POST',
        data: {
          username,
          password
        },
        header: {
          'Content-Type': 'application/json'
        },
        timeout: 60000
      });

      wx.hideLoading();

      if (loginResponse && loginResponse.data && loginResponse.data.success) {
        const result = loginResponse.data;
        
        if (result.ready) {
          wx.setStorageSync('userInfo', {
            username,
            data: { pages: {}, total_files: result.local_files }
          });

          wx.showToast({
            title: '登录成功',
            icon: 'success'
          });

          setTimeout(() => {
            wx.switchTab({url: '/pages/chat/chat'});
          }, 1500);
        } else if (result.task_id) {
          wx.showLoading({
            title: '正在获取数据...',
            mask: true
          });
          await this.pollTaskStatus(result.task_id, username);
        }
      } else {
        wx.showToast({
          title: loginResponse.data?.message || '登录失败',
          icon: 'none',
          duration: 3000
        });
      }
    } catch (error) {
      console.error('登录失败详情:', error);
      
      wx.hideLoading();
      
      if (error.errMsg) {
        wx.showToast({
          title: `网络错误: ${error.errMsg}`,
          icon: 'none',
          duration: 3000
        });
      } else {
        wx.showToast({
          title: '登录失败，请检查网络',
          icon: 'none',
          duration: 3000
        });
      }
    } finally {
      this.setData({ loading: false });
    }
  },

  async pollTaskStatus(taskId, username) {
    return new Promise((resolve) => {
      const pollingInterval = setInterval(async () => {
        try {
          const response = await this.requestPromise({
            url: `${API_BASE_URL}/api/task/${taskId}`,
            method: 'GET',
            timeout: 30000
          });

          if (response && response.data && response.data.success) {
            const task = response.data;
            
            if (task.status === 'completed') {
              clearInterval(pollingInterval);
              
              const studentResponse = await this.requestPromise({
                url: `${API_BASE_URL}/api/student/${username}`,
                method: 'GET',
                timeout: 30000
              });

              wx.setStorageSync('userInfo', {
                username,
                data: studentResponse.data?.data || { pages: {}, total_files: task.local_files || 0 }
              });

              wx.hideLoading();
              wx.showToast({
                title: '登录成功',
                icon: 'success'
              });

              setTimeout(() => {
                wx.switchTab({url: '/pages/chat/chat'});
              }, 1500);
              
              resolve();
            } else if (task.status === 'failed') {
              clearInterval(pollingInterval);
              
              wx.hideLoading();
              wx.showToast({
                title: task.error || task.message || '获取数据失败',
                icon: 'none',
                duration: 3000
              });
              
              resolve();
            }
          }
        } catch (error) {
          console.error('轮询失败:', error);
          clearInterval(pollingInterval);
          
          wx.hideLoading();
          wx.showToast({
            title: '轮询失败，请稍后重试',
            icon: 'none',
            duration: 3000
          });
          
          resolve();
        }
      }, 5000);

      this.setData({ pollingTaskId: pollingInterval });
    });
  }
});