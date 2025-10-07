// web_ui/static/voice.js - Voice mode with wake word
// Note: Using a simplified wake word detection approach since Picovoice requires an API key
// This implementation uses Web Audio API for basic keyword spotting

let audioContext = null;
let analyser = null;
let processor = null;
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let voiceEnabled = false;
let recognition = null;
let originalChatInput = null;

// Audio recording variables
let audioStream = null;

// Initialize voice functionality
async function initVoice() {
  try {
    // Request microphone access
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    
    // Create audio context
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    console.log('Voice functionality initialized');
  } catch (error) {
    console.error('Error accessing microphone:', error);
    alert('Microphone access denied. Please enable microphone access in browser settings.');
  }
}

// Start recording when wake word is detected or button is pressed
async function startRecording() {
  if (!audioStream) {
    await initVoice();
  }
  
  if (isRecording) {
    stopRecording();
    return;
  }
  
  // Hide the text input and show recording UI if possible
  updateRecordingUI(true);
  
  // Create media recorder
  mediaRecorder = new MediaRecorder(audioStream);
  audioChunks = [];
  
  mediaRecorder.ondataavailable = function(event) {
    audioChunks.push(event.data);
  };
  
  mediaRecorder.onstop = async function() {
    const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
    await sendAudioToAPI(audioBlob);
    updateRecordingUI(false);
  };
  
  mediaRecorder.start();
  isRecording = true;
  
  // Stop recording after 5 seconds if still recording
  setTimeout(() => {
    if (isRecording) {
      stopRecording();
    }
  }, 5000);
}

// Stop recording
function stopRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
  }
}

// Send recorded audio to API server
async function sendAudioToAPI(audioBlob) {
  try {
    // Show processing message in chat
    showProcessingMessage();
    
    const formData = new FormData();
    formData.append('audio', audioBlob, 'input.wav');
    
    const response = await fetch('http://localhost:8000/process_audio/', {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }
    
    const result = await response.json();
    console.log('API Response:', result);
    
    // Display the user's transcript and AI response in the chat
    await displayChatMessage(result.transcript, result.response, result.audio);
    
  } catch (error) {
    console.error('Error sending audio to API:', error);
    addErrorMessage('Error processing audio. Please try again.');
  }
}

// Show processing message in chat
function showProcessingMessage() {
  // Find the chat container and add a processing message
  const chatContainer = document.querySelector('.chat-messages') || 
                       document.querySelector('.flex-1.overflow-y-auto') || 
                       document.querySelector('#chat-messages');
  
  if (chatContainer) {
    const processingMsg = document.createElement('div');
    processingMsg.className = 'message ai-message flex gap-3 py-2 px-4';
    processingMsg.id = 'processing-message';
    processingMsg.innerHTML = `
      <div class="flex flex-col gap-1 flex-1">
        <div class="flex flex-row gap-2">
          <div class="animate-pulse w-2 h-2 rounded-full mt-1.5"></div>
          <div class="animate-pulse w-2 h-2 rounded-full mt-1.5"></div>
          <div class="animate-pulse w-2 h-2 rounded-full mt-1.5"></div>
        </div>
        <div class="text-xs opacity-50">Processing audio...</div>
      </div>
    `;
    
    chatContainer.appendChild(processingMsg);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
}

// Remove processing message
function removeProcessingMessage() {
  const processingMsg = document.getElementById('processing-message');
  if (processingMsg) {
    processingMsg.remove();
  }
}

// Display transcript and response in chat
async function displayChatMessage(transcript, response, audioPath) {
  // Remove processing message first
  removeProcessingMessage();
  
  // Add user message to chat
  addChatMessage(transcript, true); // isUser = true
  
  // Add AI response to chat
  addChatMessage(response, false); // isUser = false
  
  // Play audio response if available
  if (audioPath) {
    await playResponseAudio(audioPath);
  }
}

// Add a message to the chat interface
function addChatMessage(content, isUser) {
  const chatContainer = document.querySelector('.chat-messages') || 
                       document.querySelector('.flex-1.overflow-y-auto') || 
                       document.querySelector('#chat-messages');
  
  if (!chatContainer) {
    console.error('Chat container not found');
    return;
  }
  
  const messageDiv = document.createElement('div');
  messageDiv.className = `flex gap-3 py-2 px-4 ${isUser ? 'bg-blue-50 dark:bg-blue-900/10' : 'bg-gray-50 dark:bg-gray-800/50'}`;
  
  // Determine if this is user or AI message
  const avatar = document.createElement('div');
  avatar.className = 'flex flex-col items-center';
  
  // Add avatar based on message type
  if (isUser) {
    avatar.innerHTML = `
      <div class="flex items-center justify-center w-8 h-8 rounded-full bg-blue-500 text-white text-sm font-medium">
        Y
      </div>
    `;
  } else {
    avatar.innerHTML = `
      <div class="flex items-center justify-center w-8 h-8 rounded-full bg-purple-500 text-white text-sm font-medium">
        AI
      </div>
    `;
  }
  
  const contentDiv = document.createElement('div');
  contentDiv.className = 'flex-1';
  
  const textDiv = document.createElement('div');
  textDiv.className = 'text-sm whitespace-pre-wrap';
  textDiv.textContent = content;
  
  contentDiv.appendChild(textDiv);
  messageDiv.appendChild(avatar);
  messageDiv.appendChild(contentDiv);
  
  chatContainer.appendChild(messageDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Add error message to chat
function addErrorMessage(message) {
  // Remove processing message first
  removeProcessingMessage();
  
  const chatContainer = document.querySelector('.chat-messages') || 
                       document.querySelector('.flex-1.overflow-y-auto') || 
                       document.querySelector('#chat-messages');
  
  if (!chatContainer) {
    console.error('Chat container not found');
    return;
  }
  
  const errorDiv = document.createElement('div');
  errorDiv.className = 'flex gap-3 py-2 px-4 bg-red-50 dark:bg-red-900/10';
  
  const avatar = document.createElement('div');
  avatar.className = 'flex flex-col items-center';
  avatar.innerHTML = `
    <div class="flex items-center justify-center w-8 h-8 rounded-full bg-red-500 text-white text-sm font-medium">
      !
    </div>
  `;
  
  const contentDiv = document.createElement('div');
  contentDiv.className = 'flex-1';
  
  const textDiv = document.createElement('div');
  textDiv.className = 'text-sm text-red-600 dark:text-red-300';
  textDiv.textContent = message;
  
  contentDiv.appendChild(textDiv);
  errorDiv.appendChild(avatar);
  errorDiv.appendChild(contentDiv);
  
  chatContainer.appendChild(errorDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Play response audio
async function playResponseAudio(audioUrl) {
  try {
    if (!audioUrl) {
      console.log('No audio URL provided');
      return;
    }
    
    // Create an audio element to play the response
    const audio = new Audio();
    
    // Construct the full URL if it's a relative path
    let fullUrl;
    if (audioUrl.startsWith('/')) {
      fullUrl = `http://localhost:8000${audioUrl}`;
    } else if (audioUrl.startsWith('http')) {
      fullUrl = audioUrl;
    } else {
      fullUrl = `http://localhost:8000/${audioUrl}`;
    }
    
    audio.src = fullUrl;
    audio.type = 'audio/wav';
    
    // Play the audio
    await audio.play().catch(error => {
      console.error('Error playing audio:', error);
    });
    
    console.log('Playing audio from:', fullUrl);
  } catch (error) {
    console.error('Error in playResponseAudio:', error);
  }
}

// Update UI during recording
function updateRecordingUI(started) {
  // Find the chat input area and update its appearance
  const inputContainer = document.querySelector('.chat-input-form') || 
                        document.querySelector('#chat-input-container') || 
                        document.querySelector('form');
  
  if (inputContainer) {
    // Add visual indication that recording is in progress
    if (started) {
      inputContainer.style.border = '2px solid #28a745';
      inputContainer.style.backgroundColor = 'rgba(40, 167, 69, 0.1)';
    } else {
      inputContainer.style.border = '';
      inputContainer.style.backgroundColor = '';
    }
  }
  
  // Update any recording button that might exist
  const recordButton = document.querySelector('#recordButton') || 
                      document.querySelector('.record-button') || 
                      document.querySelector('[data-testid="record-btn"]');
  
  if (recordButton) {
    recordButton.textContent = started ? 'Stop Recording' : 'Start Recording';
    recordButton.style.backgroundColor = started ? '#dc3545' : '#28a745';
  }
}

// Toggle voice mode
function toggleVoice() {
  voiceEnabled = !voiceEnabled;
  
  if (voiceEnabled && !audioContext) {
    initVoice();
  }
  
  console.log(`Voice mode ${voiceEnabled ? 'enabled' : 'disabled'}`);
  
  // Update UI to reflect voice mode state
  updateVoiceModeUI();
}

// Update UI elements to reflect voice mode
function updateVoiceModeUI() {
  // Change the chat input UI to show voice mode is active
  const inputField = document.querySelector('#chat-input') || 
                    document.querySelector('textarea[placeholder*="Message"]') || 
                    document.querySelector('textarea');
  
  if (inputField) {
    if (voiceEnabled) {
      // Show some visual indication that voice mode is active
      inputField.placeholder = 'Voice mode active - click mic to record';
    } else {
      inputField.placeholder = 'Message Tractor AI...';
    }
  }
}

// Function to manually trigger recording
function manualTriggerRecording() {
  if (!voiceEnabled) {
    // Auto-enable voice mode if not already enabled
    toggleVoice();
  }
  
  if (!isRecording) {
    startRecording();
  } else {
    stopRecording();
  }
}

// Create a voice recording button and add it to the chat interface
function addVoiceButton() {
  // Since the Open WebUI layout might not be fully loaded when DOMContentLoaded fires,
  // we'll use a MutationObserver to wait for the chat input to appear
  const observer = new MutationObserver(function(mutations) {
    // Look for the chat input area
    const inputArea = document.querySelector('form') || 
                     document.querySelector('[id*="chat"] form') || 
                     document.querySelector('.chat-input-form');
    
    if (inputArea) {
      // Check if we've already added the button
      if (document.getElementById('voiceRecordButton')) {
        observer.disconnect(); // Stop observing once button is added
        return;
      }
      
      // Look for the specific input field area
      let targetArea = inputArea.querySelector('.flex.items-center') || 
                      inputArea.querySelector('.flex') || 
                      inputArea;
      
      // If we can't find a specific target area, try to find the textarea and add next to it
      if (!targetArea) {
        const textArea = inputArea.querySelector('textarea') || 
                        inputArea.querySelector('input');
        if (textArea && textArea.parentNode) {
          targetArea = textArea.parentNode;
        } else {
          targetArea = inputArea;
        }
      }
      
      // Create a microphone button
      const micButton = document.createElement('button');
      micButton.id = 'voiceRecordButton';
      micButton.type = 'button';
      micButton.className = 'p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center justify-center';
      micButton.title = 'Voice Input (Ctrl+Shift+V)';
      micButton.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-mic">
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" x2="12" y1="19" y2="22"/>
        </svg>
      `;
      
      // Add click event listener
      micButton.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        manualTriggerRecording();
      });
      
      // Add the button to the target area
      if (targetArea) {
        // Try to insert before the send button if it exists
        const sendButton = targetArea.querySelector('button[type="submit"]') || 
                          targetArea.querySelector('button[aria-label*="send" i]') ||
                          targetArea.querySelector('.btn');
        
        if (sendButton && sendButton.parentNode === targetArea) {
          targetArea.insertBefore(micButton, sendButton);
        } else {
          targetArea.appendChild(micButton);
        }
      } else {
        inputArea.appendChild(micButton);
      }
      
      observer.disconnect(); // Stop observing once button is added
    }
  });
  
  // Start observing
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Initialize the voice interface when the page is loaded
document.addEventListener('DOMContentLoaded', function() {
  // Add the voice button
  addVoiceButton();
  
  // Also add a keyboard shortcut for voice recording
  document.addEventListener('keydown', function(event) {
    // Use Ctrl+Shift+V as the shortcut for voice recording
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'v') {
      event.preventDefault();
      manualTriggerRecording();
    }
  });
});

// Expose functions to window object for use in HTML
window.toggleVoice = toggleVoice;
window.manualTriggerRecording = manualTriggerRecording;
window.startRecording = startRecording;
window.stopRecording = stopRecording;
window.voiceEnabled = voiceEnabled;