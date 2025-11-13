const logger = require('../core/logger').createServiceLogger('SESSION_MANAGER');
const config = require('../core/config');

class SessionManager {
  constructor() {
    this.conversationHistory = [];
    this.events = [];
    this.maxHistoryItems = config.get('session.maxHistoryItems');
    this.maxRecentItems = config.get('session.maxRecentItems');
  }

  addUserInput(text, source = 'chat') {
    const entry = {
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
      source
    };

    this.conversationHistory.push(entry);
    this.trimHistory();
    
    logger.debug('User input added', { source, length: text.length });
  }

  addModelResponse(text, metadata = {}) {
    const entry = {
      role: 'assistant',
      content: text,
      timestamp: new Date().toISOString(),
      metadata
    };

    this.conversationHistory.push(entry);
    this.trimHistory();
    
    logger.debug('Model response added', { length: text.length });
  }

  addEvent(eventDescription) {
    this.events.push({
      description: eventDescription,
      timestamp: new Date().toISOString()
    });
  }

  getOptimizedHistory() {
    const recentCount = Math.min(this.maxRecentItems, this.conversationHistory.length);
    const recent = this.conversationHistory.slice(-recentCount);

    return {
      recent,
      full: this.conversationHistory,
      count: this.conversationHistory.length
    };
  }

  trimHistory() {
    if (this.conversationHistory.length > this.maxHistoryItems) {
      const excess = this.conversationHistory.length - this.maxHistoryItems;
      this.conversationHistory.splice(0, excess);
      logger.debug('History trimmed', { removed: excess });
    }
  }

  clear() {
    this.conversationHistory = [];
    this.events = [];
    logger.info('Session cleared');
  }

  getMemoryUsage() {
    const size = JSON.stringify(this.conversationHistory).length;
    return {
      conversationCount: this.conversationHistory.length,
      eventCount: this.events.length,
      approximateSize: `${(size / 1024).toFixed(2)} KB`
    };
  }
}

module.exports = new SessionManager();
