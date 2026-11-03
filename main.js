const { app, BrowserWindow } = require('electron');
const path = require('path');

// تشغيل سيرفر الـ Express المحلي في الخلفية
require(path.join(__dirname, 'server.js'));

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "نظام إدارة المركز الطبي العائلي",
    autoHideMenuBar: true, // إخفاء القوائم العلوية لتبدو كبرنامج مستقل
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // انتظار ثانية واحدة حتى يعمل السيرفر ثم تحميل الصفحة
  setTimeout(() => {
    mainWindow.loadURL('http://localhost:4000');
  }, 1000);

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  if (mainWindow === null) createWindow();
});