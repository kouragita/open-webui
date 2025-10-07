// Enhanced voice interface with wake word detection
// Implements multiple approaches for "Hey Tractor" detection

class TractorVoiceInterface {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.mediaRecorder = null;
        this.audioStream = null;
        this.isRecording = false;
        this.voiceEnabled = false;
        this.wakeWordDetection = false;
        
        // Wake word detection
        this.recognition = null;
        this.wakeWords = ['hey tractor', 'tractor', 'hey tracker'];
        
        // Audio processing
        this.audioChunks = [];
        this.silenceThreshold = 0.01;
        this.silenceTimeout = 2000; // 2 seconds of silence
        this.maxRecordingTime = 10000; // 10 seconds max
        
        this.init();
    }
    
    async init() {
        try {
            await this.initAudioContext();
            this.initSpeechRecognition();
            this.addVoiceButton();
            this.setupKeyboardShortcuts();
            
            console.log('Tractor Voice Interface initialized');
        } catch (error) {
            console.error('Failed to initialize voice interface:', error);
        }
    }
    
    async initAudioContext() {
        try {
            this.audioStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            
            const source = this.audioContext.createMediaStreamSource(this.audioStream);
            source.connect(this.analyser);
            
            this.analyser.fftSize = 256;
            
        } catch (error) {
            console.error('Error accessing microphone:', error);
            throw new Error('Microphone access denied');
        }
    }
    
    initSpeechRecognition() {
        // Use browser's built-in speech recognition for wake word detection
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SpeechRecognition();
            
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.lang = 'en-US'; // Wake word is in English
            
            this.recognition.onresult = (event) => {
                const transcript = Array.from(event.results)
                    .map(result => result[0].transcript)
                    .join('')
                    .toLowerCase();
                
                // Check for wake words
                if (this.wakeWordDetection && this.containsWakeWord(transcript)) {
                    console.log('Wake word detected:', transcript);
                    this.onWakeWordDetected();
                }
            };
            
            this.recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
            };
            
            this.recognition.onend = () => {
                // Restart recognition if wake word detection is enabled
                if (this.wakeWordDetection) {
                    setTimeout(() => {
                        try {
                            this.recognition.start();
                        } catch (e) {
                            // Ignore errors from restarting
                        }
                    }, 100);
                }
            };
        }
    }
    
    containsWakeWord(transcript) {
        return this.wakeWords.some(wakeWord => 
            transcript.includes(wakeWord)
        );
    }
    
    onWakeWordDetected() {
        // Visual feedback
        this.showWakeWordFeedback();
        
        // Start recording after a short delay
        setTimeout(() => {
            this.startRecording();
        }, 500);
    }
    
    showWakeWordFeedback() {
        // Create a visual indicator that wake word was detected
        const indicator = document.createElement('div');
        indicator.className = 'wake-word-indicator';
        indicator.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #28a745;
            color: white;
            padding: 10px 20px;
            border-radius: 20px;
            z-index: 10000;
            animation: fadeInOut 2s ease-in-out;
        `;
        indicator.textContent = '👂 Wake word detected!';
        
        // Add CSS animation
        if (!document.getElementById('wake-word-styles')) {
            const style = document.createElement('style');
            style.id = 'wake-word-styles';
            style.textContent = `
                @keyframes fadeInOut {
                    0% { opacity: 0; transform: translateY(-20px); }
                    20% { opacity: 1; transform: translateY(0); }
                    80% { opacity: 1; transform: translateY(0); }
                    100% { opacity: 0; transform: translateY(-20px); }
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(indicator);
        
        setTimeout(() => {
            if (indicator.parentNode) {
                indicator.parentNode.removeChild(indicator);
            }
        }, 2000);
    }
    
    toggleWakeWordDetection() {
        this.wakeWordDetection = !this.wakeWordDetection;
        
        if (this.wakeWordDetection && this.recognition) {
            try {
                this.recognition.start();
                console.log('Wake word detection enabled');
            } catch (error) {
                console.error('Failed to start wake word detection:', error);
            }
        } else if (this.recognition) {
            this.recognition.stop();
            console.log('Wake word detection disabled');
        }
        
        this.updateUI();
    }
    
    async startRecording() {
        if (this.isRecording) {
            this.stopRecording();
            return;
        }
        
        try {
            this.audioChunks = [];
            this.mediaRecorder = new MediaRecorder(this.audioStream, {
                mimeType: 'audio/webm;codecs=opus'
            });
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.onstop = async () => {
                await this.processRecording();
            };
            
            this.mediaRecorder.start(100); // Collect data every 100ms
            this.isRecording = true;
            
            this.updateRecordingUI(true);
            
            // Auto-stop recording based on silence or max time
            this.startSilenceDetection();
            
            // Maximum recording time safety
            setTimeout(() => {
                if (this.isRecording) {
                    this.stopRecording();
                }
            }, this.maxRecordingTime);
            
        } catch (error) {
            console.error('Error starting recording:', error);
            this.showError('Failed to start recording');
        }
    }
    
    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            this.updateRecordingUI(false);
        }
    }
    
    startSilenceDetection() {
        if (!this.analyser) return;
        
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        let silenceStart = null;
        
        const checkSilence = () => {
            if (!this.isRecording) return;
            
            this.analyser.getByteFrequencyData(dataArray);
            
            // Calculate average volume
            const average = dataArray.reduce((sum, value) => sum + value, 0) / bufferLength;
            const normalizedVolume = average / 255;
            
            if (normalizedVolume < this.silenceThreshold) {
                if (silenceStart === null) {
                    silenceStart = Date.now();
                } else if (Date.now() - silenceStart > this.silenceTimeout) {
                    console.log('Silence detected, stopping recording');
                    this.stopRecording();
                    return;
                }
            } else {
                silenceStart = null;
            }
            
            requestAnimationFrame(checkSilence);
        };
        
        checkSilence();
    }
    
    async processRecording() {
        try {
            this.showProcessingMessage();
            
            const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
            
            // Convert to WAV if needed
            const wavBlob = await this.convertToWav(audioBlob);
            
            await this.sendAudioToAPI(wavBlob);
            
        } catch (error) {
            console.error('Error processing recording:', error);
            this.showError('Failed to process recording');
        }
    }
    
    async convertToWav(audioBlob) {
        // Simple conversion - in production, you might want to use a library like lamejs
        return audioBlob;
    }
    
    async sendAudioToAPI(audioBlob) {
        try {
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
            
            await this.displayResult(result);
            
        } catch (error) {
            console.error('Error sending audio to API:', error);
            this.showError('Failed to process audio. Please check if the API server is running.');
        } finally {
            this.removeProcessingMessage();
        }
    }
    
    async displayResult(result) {
        // Display user's transcript
        this.addChatMessage(result.transcript || 'Audio processed', true);
        
        // Display AI response
        this.addChatMessage(result.response || 'No response generated', false);
        
        // Play audio response if available
        if (result.audio_url) {
            await this.playAudio(result.audio_url);
        }
    }
    
    async playAudio(audioUrl) {
        try {
            const audio = new Audio();
            audio.src = audioUrl.startsWith('http') ? audioUrl : `http://localhost:8000${audioUrl}`;
            
            audio.onloadeddata = () => {
                console.log('Audio loaded, playing...');
            };
            
            audio.onerror = (error) => {
                console.error('Audio playback error:', error);
            };
            
            await audio.play();
            
        } catch (error) {
            console.error('Error playing audio:', error);
        }
    }
    
    showProcessingMessage() {
        this.removeProcessingMessage(); // Remove any existing message
        
        const chatContainer = this.getChatContainer();
        if (!chatContainer) return;
        
        const processingMsg = document.createElement('div');
        processingMsg.id = 'processing-message';
        processingMsg.className = 'flex gap-3 py-2 px-4 bg-blue-50 dark:bg-blue-900/10';
        processingMsg.innerHTML = `
            <div class="flex items-center justify-center w-8 h-8 rounded-full bg-blue-500 text-white text-sm font-medium">
                🎤
            </div>
            <div class="flex-1">
                <div class="flex items-center gap-2">
                    <div class="animate-pulse w-2 h-2 bg-blue-500 rounded-full"></div>
                    <div class="animate-pulse w-2 h-2 bg-blue-500 rounded-full" style="animation-delay: 0.2s"></div>
                    <div class="animate-pulse w-2 h-2 bg-blue-500 rounded-full" style="animation-delay: 0.4s"></div>
                    <span class="text-sm text-blue-600 dark:text-blue-300">Processing audio...</span>
                </div>
            </div>
        `;
        
        chatContainer.appendChild(processingMsg);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
    
    removeProcessingMessage() {
        const processingMsg = document.getElementById('processing-message');
        if (processingMsg) {
            processingMsg.remove();
        }
    }
    
    addChatMessage(content, isUser) {
        const chatContainer = this.getChatContainer();
        if (!chatContainer) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `flex gap-3 py-2 px-4 ${isUser ? 'bg-blue-50 dark:bg-blue-900/10' : 'bg-gray-50 dark:bg-gray-800/50'}`;
        
        const avatar = document.createElement('div');
        avatar.className = 'flex items-center justify-center w-8 h-8 rounded-full text-white text-sm font-medium';
        avatar.style.backgroundColor = isUser ? '#3b82f6' : '#8b5cf6';
        avatar.textContent = isUser ? 'U' : 'T';
        
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
    
    showError(message) {
        this.removeProcessingMessage();
        
        const chatContainer = this.getChatContainer();
        if (!chatContainer) {
            alert(message);
            return;
        }
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'flex gap-3 py-2 px-4 bg-red-50 dark:bg-red-900/10';
        
        const avatar = document.createElement('div');
        avatar.className = 'flex items-center justify-center w-8 h-8 rounded-full bg-red-500 text-white text-sm font-medium';
        avatar.textContent = '!';
        
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
    
    getChatContainer() {
        return document.querySelector('.chat-messages') || 
               document.querySelector('.flex-1.overflow-y-auto') || 
               document.querySelector('#chat-messages') ||
               document.querySelector('[class*="chat"]');
    }
    
    updateRecordingUI(isRecording) {
        const recordButton = document.getElementById('voiceRecordButton');
        if (recordButton) {
            if (isRecording) {
                recordButton.style.backgroundColor = '#dc3545';
                recordButton.title = 'Stop Recording (Ctrl+Shift+V)';
                recordButton.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="6" width="12" height="12" rx="2"/>
                    </svg>
                `;
            } else {
                recordButton.style.backgroundColor = '';
                recordButton.title = 'Voice Input (Ctrl+Shift+V)';
                recordButton.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                        <line x1="12" x2="12" y1="19" y2="22"/>
                    </svg>
                `;
            }
        }
        
        // Update wake word button
        const wakeWordButton = document.getElementById('wakeWordButton');
        if (wakeWordButton) {
            wakeWordButton.style.backgroundColor = this.wakeWordDetection ? '#28a745' : '';
            wakeWordButton.title = this.wakeWordDetection ? 'Disable Wake Word' : 'Enable Wake Word';
        }
    }
    
    updateUI() {
        this.updateRecordingUI(this.isRecording);
    }
    
    addVoiceButton() {
        const observer = new MutationObserver(() => {
            const inputArea = document.querySelector('form') || 
                             document.querySelector('[id*="chat"] form');
            
            if (inputArea && !document.getElementById('voiceRecordButton')) {
                this.createVoiceButtons(inputArea);
                observer.disconnect();
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
    
    createVoiceButtons(inputArea) {
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'flex gap-2';
        
        // Record button
        const recordButton = document.createElement('button');
        recordButton.id = 'voiceRecordButton';
        recordButton.type = 'button';
        recordButton.className = 'p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center justify-center';
        recordButton.title = 'Voice Input (Ctrl+Shift+V)';
        recordButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" x2="12" y1="19" y2="22"/>
            </svg>
        `;
        
        recordButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.startRecording();
        });
        
        // Wake word button
        const wakeWordButton = document.createElement('button');
        wakeWordButton.id = 'wakeWordButton';
        wakeWordButton.type = 'button';
        wakeWordButton.className = 'p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center justify-center';
        wakeWordButton.title = 'Toggle Wake Word Detection';
        wakeWordButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 12l2 2 4-4"/>
                <path d="M21 12c.552 0 1-.448 1-1V8c0-.552-.448-1-1-1h-1V6a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1H2c-.552 0-1 .448-1 1v3c0 .552.448 1 1 1h1v1a4 4 0 0 0 4 4h10a4 4 0 0 0 4-4v-1h1z"/>
            </svg>
        `;
        
        wakeWordButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleWakeWordDetection();
        });
        
        buttonContainer.appendChild(recordButton);
        buttonContainer.appendChild(wakeWordButton);
        
        // Find the best place to insert the buttons
        const targetArea = inputArea.querySelector('.flex.items-center') || 
                          inputArea.querySelector('.flex') || 
                          inputArea;
        
        if (targetArea) {
            const sendButton = targetArea.querySelector('button[type="submit"]');
            if (sendButton) {
                targetArea.insertBefore(buttonContainer, sendButton);
            } else {
                targetArea.appendChild(buttonContainer);
            }
        }
    }
    
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (event) => {
            // Ctrl+Shift+V for voice recording
            if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'v') {
                event.preventDefault();
                this.startRecording();
            }
            
            // Ctrl+Shift+W for wake word toggle
            if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'w') {
                event.preventDefault();
                this.toggleWakeWordDetection();
            }
        });
    }
}

// Initialize the voice interface when the page loads
let tractorVoice = null;

document.addEventListener('DOMContentLoaded', () => {
    tractorVoice = new TractorVoiceInterface();
});

// Expose to window for debugging
window.tractorVoice = tractorVoice;
