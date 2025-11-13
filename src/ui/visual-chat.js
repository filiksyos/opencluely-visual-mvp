// Initialize mermaid
mermaid.initialize({ startOnLoad: false, theme: 'dark' });

const messagesArea = document.getElementById('messagesArea');
const inputField = document.getElementById('inputField');
const sendBtn = document.getElementById('sendBtn');
const closeBtn = document.getElementById('closeBtn');
const diagramBtn = document.getElementById('diagramBtn');
const imageBtn = document.getElementById('imageBtn');

let currentStreamingMessage = null;

// Close button handler
closeBtn.addEventListener('click', () => {
  window.electronAPI.hideVisualChat();
});

// Send message
sendBtn.addEventListener('click', sendMessage);
inputField.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

async function sendMessage() {
  const text = inputField.value.trim();
  if (!text) return;

  // Add user message
  addMessage(text, 'user');
  inputField.value = '';

  // Create streaming assistant message
  currentStreamingMessage = addMessage('', 'assistant', true);

  try {
    // Send message and stream response
    await window.electronAPI.sendChatStream(text);
  } catch (error) {
    updateMessage(currentStreamingMessage, `Error: ${error.message}`);
  }
}

// Listen for stream chunks
if (window.electronAPI.onChatStreamChunk) {
  window.electronAPI.onChatStreamChunk((data) => {
    if (currentStreamingMessage) {
      const currentText = currentStreamingMessage.querySelector('.message-text').textContent;
      updateMessage(currentStreamingMessage, currentText + data.chunk);
    }
  });
}

// Listen for stream completion
if (window.electronAPI.onChatStreamComplete) {
  window.electronAPI.onChatStreamComplete(() => {
    if (currentStreamingMessage) {
      currentStreamingMessage.classList.remove('streaming');
      currentStreamingMessage = null;
    }
  });
}

// Generate diagram
diagramBtn.addEventListener('click', async () => {
  const prompt = inputField.value.trim();
  if (!prompt) {
    alert('Please enter a diagram description');
    return;
  }

  addMessage(`Generate diagram: ${prompt}`, 'user');
  inputField.value = '';

  const loadingMsg = addMessage('Generating diagram...', 'assistant', true);

  try {
    const result = await window.electronAPI.generateDiagram(prompt);
    
    if (result.success) {
      // Remove loading message
      loadingMsg.remove();
      
      // Add diagram
      const diagramMsg = addMessage('Here\'s your diagram:', 'assistant');
      await renderMermaidDiagram(diagramMsg, result.diagram);
    } else {
      updateMessage(loadingMsg, `Error: ${result.error}`);
      loadingMsg.classList.remove('streaming');
    }
  } catch (error) {
    updateMessage(loadingMsg, `Error: ${error.message}`);
    loadingMsg.classList.remove('streaming');
  }
});

// Generate image
imageBtn.addEventListener('click', async () => {
  const prompt = inputField.value.trim();
  if (!prompt) {
    alert('Please enter an image description');
    return;
  }

  addMessage(`Generate image: ${prompt}`, 'user');
  inputField.value = '';

  const loadingMsg = addMessage('Generating image...', 'assistant', true);

  try {
    const result = await window.electronAPI.generateImage(prompt);
    
    if (result.success) {
      // Remove loading message
      loadingMsg.remove();
      
      // Add image
      const imageMsg = addMessage('Here\'s your image:', 'assistant');
      addImageToMessage(imageMsg, result.imageUrl);
    } else {
      updateMessage(loadingMsg, `Error: ${result.error}`);
      loadingMsg.classList.remove('streaming');
    }
  } catch (error) {
    updateMessage(loadingMsg, `Error: ${error.message}`);
    loadingMsg.classList.remove('streaming');
  }
});

// Helper functions
function addMessage(text, role, isStreaming = false) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${role}${isStreaming ? ' streaming' : ''}`;
  
  const textDiv = document.createElement('div');
  textDiv.className = 'message-text';
  textDiv.textContent = text;
  
  messageDiv.appendChild(textDiv);
  messagesArea.appendChild(messageDiv);
  
  // Auto-scroll to bottom
  messagesArea.scrollTop = messagesArea.scrollHeight;
  
  return messageDiv;
}

function updateMessage(messageElement, newText) {
  const textDiv = messageElement.querySelector('.message-text');
  if (textDiv) {
    textDiv.textContent = newText;
  }
  
  // Auto-scroll to bottom
  messagesArea.scrollTop = messagesArea.scrollHeight;
}

async function renderMermaidDiagram(messageElement, mermaidCode) {
  const diagramContainer = document.createElement('div');
  diagramContainer.className = 'diagram-container';
  
  try {
    const { svg } = await mermaid.render('mermaid-diagram-' + Date.now(), mermaidCode);
    diagramContainer.innerHTML = svg;
    messageElement.appendChild(diagramContainer);
  } catch (error) {
    diagramContainer.textContent = `Failed to render diagram: ${error.message}`;
    messageElement.appendChild(diagramContainer);
  }
  
  // Auto-scroll to bottom
  messagesArea.scrollTop = messagesArea.scrollHeight;
}

function addImageToMessage(messageElement, imageUrl) {
  const imageContainer = document.createElement('div');
  imageContainer.className = 'image-container';
  
  const img = document.createElement('img');
  img.src = imageUrl;
  img.alt = 'Generated image';
  img.onload = () => {
    // Auto-scroll when image loads
    messagesArea.scrollTop = messagesArea.scrollHeight;
  };
  
  imageContainer.appendChild(img);
  messageElement.appendChild(imageContainer);
}

// Listen for session cleared
if (window.electronAPI.onSessionCleared) {
  window.electronAPI.onSessionCleared(() => {
    messagesArea.innerHTML = '';
  });
}
