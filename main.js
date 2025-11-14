require('dotenv').config();

const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron');
const logger = require('./src/core/logger').createServiceLogger('MAIN');
const config = require('./src/core/config');
const windowManager = require('./src/managers/window.manager');
const sessionManager = require('./src/managers/session.manager');
const openrouterService = require('./src/services/openrouter.service');
const aiService = require('./src/services/ai.service');

class ApplicationController {
  constructor() {
    this.isReady = false;
    this.setupStealth();
    this.setupEventHandlers();
  }

  setupStealth() {
    if (config.get('stealth.enabled')) {
      process.title = config.get('app.processTitle');
      app.setName(config.get('app.processTitle'));
    }
  }

  setupEventHandlers() {
    app.whenReady().then(() => this.onAppReady());
    app.on('window-all-closed', () => this.onWindowAllClosed());
    app.on('activate', () => this.onActivate());
    app.on('will-quit', () => this.onWillQuit());
    this.setupIPCHandlers();
  }

  async onAppReady() {
    logger.info('Application starting', {
      version: config.get('app.version'),
      stealth: config.get('stealth.enabled')
    });

    try {
      await windowManager.initializeWindows();
      this.setupGlobalShortcuts();
      this.isReady = true;

      logger.info('Application initialized successfully');
      sessionManager.addEvent('Application started');
    } catch (error) {
      logger.error('Application initialization failed', { error: error.message });
      app.quit();
    }
  }

  setupGlobalShortcuts() {
    const shortcuts = {
      'CommandOrControl+Shift+V': () => windowManager.toggleVisibility(),
      'CommandOrControl+Shift+I': () => windowManager.toggleInteraction(),
      'CommandOrControl+Shift+C': () => windowManager.showVisualChat(),
      'Alt+A': () => windowManager.toggleInteraction()
    };

    Object.entries(shortcuts).forEach(([accelerator, handler]) => {
      const success = globalShortcut.register(accelerator, handler);
      logger.debug('Global shortcut registered', { accelerator, success });
    });
  }

  setupIPCHandlers() {
    // Chat message handling
    ipcMain.handle('send-chat-message', async (event, text) => {
      sessionManager.addUserInput(text, 'chat');
      
      try {
        const history = sessionManager.getOptimizedHistory();
        const response = await openrouterService.chat(text, history.recent);
        
        sessionManager.addModelResponse(response.content, {
          model: response.model,
          tokens: response.usage
        });

        return { success: true, response: response.content };
      } catch (error) {
        logger.error('Chat message failed', { error: error.message });
        return { success: false, error: error.message };
      }
    });

    // Streaming chat with AI SDK tools
    ipcMain.handle('send-chat-stream', async (event, text) => {
      sessionManager.addUserInput(text, 'chat');
      
      try {
        const history = sessionManager.getOptimizedHistory();
        const stream = aiService.streamChat(text, history.recent);
        
        let fullText = '';
        let toolResults = [];
        const generatedTypes = new Set(); // Track what has been generated
        
        for await (const chunk of stream) {
          if (chunk.type === 'text') {
            fullText += chunk.content;
            event.sender.send('chat-stream-chunk', { chunk: chunk.content });
          } else if (chunk.type === 'tool-call') {
            event.sender.send('tool-call', { 
              toolName: chunk.toolName, 
              args: chunk.args 
            });
          } else if (chunk.type === 'tool-result') {
            toolResults.push({
              toolName: chunk.toolName,
              result: chunk.result
            });
            
            // Track generated types
            if (chunk.toolName === 'generateText') generatedTypes.add('text');
            if (chunk.toolName === 'generateMermaidDiagram') generatedTypes.add('diagram');
            if (chunk.toolName === 'generateImage') generatedTypes.add('image');
            
            logger.info('Sending tool result', { 
              toolName: chunk.toolName, 
              resultType: typeof chunk.result,
              resultKeys: chunk.result ? Object.keys(chunk.result) : null,
              result: chunk.result ? JSON.stringify(chunk.result).substring(0, 200) : 'null or undefined'
            });
            event.sender.send('tool-result', { 
              toolName: chunk.toolName, 
              result: chunk.result 
            });
          }
        }
        
        // Ensure all three outputs are generated (Jarvis requirement)
        // If any are missing, generate them automatically
        const tools = aiService.getTools();
        const missingTypes = [];
        
        // Always require positioned text element (even if text was streamed)
        if (!generatedTypes.has('text')) {
          missingTypes.push('text');
        }
        if (!generatedTypes.has('diagram')) {
          missingTypes.push('diagram');
        }
        if (!generatedTypes.has('image')) {
          missingTypes.push('image');
        }
        
        if (missingTypes.length > 0) {
          logger.info('Generating missing outputs for Jarvis requirement', { missingTypes, hasStreamedText: !!fullText });
          
          // Generate missing outputs with non-overlapping positions
          // Track positions to prevent overlap
          const usedPositions = [];
          const getNonOverlappingPosition = () => {
            let attempts = 0;
            let x, y;
            do {
              // Keep Y between 5% and 60% to avoid being cut off
              x = 10 + Math.random() * 80;
              y = 5 + Math.random() * 55;
              attempts++;
            } while (attempts < 50 && usedPositions.some(pos => 
              Math.abs(pos.x - x) < 25 || Math.abs(pos.y - y) < 25
            ));
            usedPositions.push({ x, y });
            return { x, y };
          };
          
          // Pre-define positions for each type to ensure good spacing
          const positionMap = {
            text: { x: 15, y: 15 },
            diagram: { x: 60, y: 20 },
            image: { x: 35, y: 45 }
          };
          
          for (const type of missingTypes) {
            try {
              let result;
              // Use predefined position or generate non-overlapping one
              const pos = positionMap[type] || getNonOverlappingPosition();
              
              if (type === 'text') {
                // Use streamed text if available, otherwise create a summary
                // This ensures text is always positioned on screen as a Jarvis element
                const textContent = fullText.trim() || `Response to: ${text}`;
                result = await tools.generateText.execute({ 
                  text: textContent, 
                  positionX: pos.x, 
                  positionY: pos.y 
                });
                event.sender.send('tool-result', { toolName: 'generateText', result });
                toolResults.push({ toolName: 'generateText', result });
              } else if (type === 'diagram') {
                // Create a diagram related to the user's request
                const diagramPrompt = fullText 
                  ? `Create a visual diagram representing: ${fullText.substring(0, 200)}` 
                  : `Visual representation of: ${text}`;
                result = await tools.generateMermaidDiagram.execute({ 
                  description: diagramPrompt, 
                  positionX: pos.x, 
                  positionY: pos.y 
                });
                event.sender.send('tool-result', { toolName: 'generateMermaidDiagram', result });
                toolResults.push({ toolName: 'generateMermaidDiagram', result });
              } else if (type === 'image') {
                // Create an image related to the user's request
                const imagePrompt = fullText 
                  ? `Visual image related to: ${fullText.substring(0, 200)}` 
                  : `Visual image related to: ${text}`;
                result = await tools.generateImage.execute({ 
                  prompt: imagePrompt, 
                  positionX: pos.x, 
                  positionY: pos.y 
                });
                event.sender.send('tool-result', { toolName: 'generateImage', result });
                toolResults.push({ toolName: 'generateImage', result });
              }
            } catch (error) {
              logger.error(`Failed to generate missing ${type}`, { error: error.message });
            }
          }
        }
        
        // Save response to session
        if (fullText || toolResults.length > 0) {
          sessionManager.addModelResponse(fullText || 'Tool execution completed', {
            model: aiService.modelId,
            tools: toolResults
          });
        }
        
        event.sender.send('chat-stream-complete');
        return { success: true };
      } catch (error) {
        logger.error('Chat stream failed', { error: error.message });
        return { success: false, error: error.message };
      }
    });

    // Generate mermaid diagram
    ipcMain.handle('generate-diagram', async (event, prompt) => {
      try {
        const diagram = await openrouterService.generateDiagram(prompt);
        return { success: true, diagram };
      } catch (error) {
        logger.error('Diagram generation failed', { error: error.message });
        return { success: false, error: error.message };
      }
    });

    // Generate image
    ipcMain.handle('generate-image', async (event, prompt) => {
      try {
        const imageUrl = await openrouterService.generateImage(prompt);
        return { success: true, imageUrl };
      } catch (error) {
        logger.error('Image generation failed', { error: error.message });
        return { success: false, error: error.message };
      }
    });

    // Window management
    ipcMain.handle('toggle-visibility', () => {
      windowManager.toggleVisibility();
      return { success: true };
    });

    ipcMain.handle('toggle-interaction', () => {
      windowManager.toggleInteraction();
      return { success: true };
    });

    ipcMain.handle('show-visual-chat', () => {
      windowManager.showVisualChat();
      return { success: true };
    });

    ipcMain.handle('hide-visual-chat', () => {
      windowManager.hideVisualChat();
      return { success: true };
    });

    // Session management
    ipcMain.handle('get-session-history', () => {
      return sessionManager.getOptimizedHistory();
    });

    ipcMain.handle('clear-session', () => {
      sessionManager.clear();
      windowManager.broadcastToAllWindows('session-cleared');
      return { success: true };
    });
  }

  onWindowAllClosed() {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  }

  onActivate() {
    if (!this.isReady) {
      this.onAppReady();
    }
  }

  onWillQuit() {
    globalShortcut.unregisterAll();
    windowManager.destroyAllWindows();
    logger.info('Application shutting down');
  }
}

new ApplicationController();
