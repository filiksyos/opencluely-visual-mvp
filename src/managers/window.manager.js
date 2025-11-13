const { BrowserWindow, screen } = require('electron');
const path = require('path');
const logger = require('../core/logger').createServiceLogger('WINDOW_MANAGER');
const config = require('../core/config');

class WindowManager {
  constructor() {
    this.windows = new Map();
    this.isVisible = true;
    this.isInteractive = true;
  }

  async initializeWindows() {
    await this.createOverlayWindow();
    await this.createVisualChatWindow();
    logger.info('All windows initialized');
  }

  async createOverlayWindow() {
    const windowConfig = config.get('windows.overlay');
    
    const window = new BrowserWindow({
      ...windowConfig,
      webPreferences: {
        preload: path.join(__dirname, '../../preload.js'),
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    window.setIgnoreMouseEvents(!this.isInteractive, { forward: true });
    window.loadFile('src/ui/main-overlay.html');

    this.windows.set('overlay', window);
    logger.info('Overlay window created');
  }

  async createVisualChatWindow() {
    const windowConfig = config.get('windows.visualChat');
    const display = screen.getPrimaryDisplay();
    const { width, height } = display.workAreaSize;

    const window = new BrowserWindow({
      ...windowConfig,
      width: Math.min(windowConfig.width, width),
      height: Math.min(windowConfig.height, height),
      webPreferences: {
        preload: path.join(__dirname, '../../preload.js'),
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    window.loadFile('src/ui/visual-chat.html');
    window.hide(); // Hidden by default

    this.windows.set('visualChat', window);
    logger.info('Visual chat window created');
  }

  toggleVisibility() {
    this.isVisible = !this.isVisible;
    
    this.windows.forEach((window, name) => {
      if (this.isVisible) {
        window.show();
      } else {
        window.hide();
      }
    });

    logger.info('Visibility toggled', { isVisible: this.isVisible });
  }

  toggleInteraction() {
    this.isInteractive = !this.isInteractive;
    
    this.windows.forEach((window, name) => {
      window.setIgnoreMouseEvents(!this.isInteractive, { forward: true });
      window.webContents.send('interaction-mode-changed', { isInteractive: this.isInteractive });
    });

    logger.info('Interaction toggled', { isInteractive: this.isInteractive });
  }

  showVisualChat() {
    const chatWindow = this.windows.get('visualChat');
    if (chatWindow) {
      chatWindow.show();
      chatWindow.focus();
      logger.info('Visual chat shown');
    }
  }

  hideVisualChat() {
    const chatWindow = this.windows.get('visualChat');
    if (chatWindow) {
      chatWindow.hide();
      logger.info('Visual chat hidden');
    }
  }

  broadcastToAllWindows(channel, data) {
    this.windows.forEach((window, name) => {
      if (!window.isDestroyed()) {
        window.webContents.send(channel, data);
      }
    });
  }

  destroyAllWindows() {
    this.windows.forEach((window, name) => {
      if (!window.isDestroyed()) {
        window.destroy();
      }
    });
    this.windows.clear();
    logger.info('All windows destroyed');
  }

  getWindow(name) {
    return this.windows.get(name);
  }
}

module.exports = new WindowManager();
