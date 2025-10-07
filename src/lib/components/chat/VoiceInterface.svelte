// web_ui/src/lib/components/chat/VoiceInterface.svelte
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { toast } from 'svelte-sonner';
	
	// Import existing stores and utilities
	import { settings, config } from '$lib/stores';
	import { transcribeAudio } from '$lib/apis/audio';
	
	// Import icons
	import Microphone from '$lib/components/icons/Microphone.svelte';
	import XMark from '$lib/components/icons/XMark.svelte';
	
	// Export properties
	export let onVoiceInput = (text: string) => {};
	export let className = '';
	
	// Reactive variables
	let isListening = false;
	let isRecording = false;
	let isLoading = false;
	let recognition;
	let mediaRecorder;
	let audioChunks = [];
	let stream;
	let visualizerData = Array(100).fill(0);
	let durationSeconds = 0;
	let durationInterval;
	
	// Format time for display
	const formatTime = (seconds) => {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
	};
	
	// Initialize voice recognition
	onMount(async () => {
		// Check for browser support
		if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
			console.warn('Speech recognition not supported in this browser');
		} else {
			const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
			recognition = new SpeechRecognition();
			recognition.continuous = false;
			recognition.interimResults = false;
			
			// Set language based on settings or default to Swahili
			recognition.lang = $settings?.audio?.stt?.language || 'sw-KE';
			
			recognition.onresult = (event) => {
				const transcript = event.results[0][0].transcript.trim();
				if (transcript) {
					onVoiceInput(transcript);
				}
				stopListening();
			};
			
			recognition.onerror = (event) => {
				console.error('Speech recognition error:', event.error);
				toast.error(`Speech recognition error: ${event.error}`);
				stopListening();
			};
			
			recognition.onend = () => {
				isListening = false;
			};
		}
	});
	
	// Cleanup on destroy
	onDestroy(() => {
		stopListening();
		stopRecording();
		if (durationInterval) clearInterval(durationInterval);
	});
	
	// Start listening for voice input
	function startListening() {
		if (!recognition) {
			toast.error('Speech recognition not available');
			return;
		}
		
		try {
			recognition.start();
			isListening = true;
			toast.success('Listening... Say "Hey Tractor" to activate');
		} catch (error) {
			console.error('Error starting speech recognition:', error);
			toast.error('Error starting voice recognition');
		}
	}
	
	// Stop listening
	function stopListening() {
		if (recognition && isListening) {
			recognition.stop();
			isListening = false;
		}
	}
	
	// Toggle listening state
	function toggleListening() {
		if (isListening) {
			stopListening();
		} else {
			startListening();
		}
	}
	
	// Start recording audio
	async function startRecording() {
		try {
			stream = await navigator.mediaDevices.getUserMedia({ 
				audio: {
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true
				} 
			});
			
			// Create media recorder
			const mimeTypes = ['audio/webm; codecs=opus', 'audio/mp4'];
			const mimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));
			
			mediaRecorder = new MediaRecorder(stream, { mimeType });
			audioChunks = [];
			
			mediaRecorder.ondataavailable = (event) => {
				audioChunks.push(event.data);
			};
			
			mediaRecorder.onstop = async () => {
				if (audioChunks.length > 0) {
					const audioBlob = new Blob(audioChunks, { type: mimeType || 'audio/webm' });
					await processAudio(audioBlob);
				}
				cleanupStream();
			};
			
			// Start recording
			mediaRecorder.start();
			isRecording = true;
			isLoading = false;
			
			// Start duration counter
			durationSeconds = 0;
			durationInterval = setInterval(() => {
				durationSeconds++;
			}, 1000);
			
			// Start audio visualization
			analyzeAudio(stream);
			
			toast.success('Recording started...');
		} catch (error) {
			console.error('Error accessing microphone:', error);
			toast.error('Error accessing microphone');
			isLoading = false;
			isRecording = false;
		}
	}
	
	// Stop recording
	function stopRecording() {
		if (mediaRecorder && isRecording) {
			mediaRecorder.stop();
			isRecording = false;
		}
		
		if (durationInterval) {
			clearInterval(durationInterval);
			durationInterval = null;
		}
		
		cleanupStream();
	}
	
	// Cleanup media stream
	function cleanupStream() {
		if (stream) {
			const tracks = stream.getTracks();
			tracks.forEach(track => track.stop());
			stream = null;
		}
	}
	
	// Process recorded audio
	async function processAudio(audioBlob) {
		isLoading = true;
		
		try {
			// Create file from blob
			const fileName = `recording-${Date.now()}.webm`;
			const file = new File([audioBlob], fileName, { type: audioBlob.type });
			
			// Transcribe audio
			const result = await transcribeAudio(
				localStorage.token,
				file,
				$settings?.audio?.stt?.language || 'sw-KE'
			);
			
			if (result && result.text) {
				// Check for wake word
				const transcript = result.text.trim();
				if (transcript.toLowerCase().includes('hey tractor')) {
					toast.success('Wake word detected!');
					// Remove wake word and send the rest
					const cleanText = transcript.replace(/hey tractor/i, '').trim();
					if (cleanText) {
						onVoiceInput(cleanText);
					}
				} else {
					// Send full transcript
					onVoiceInput(transcript);
				}
			} else {
				toast.warning('Could not transcribe audio');
			}
		} catch (error) {
			console.error('Error processing audio:', error);
			toast.error('Error processing audio');
		} finally {
			isLoading = false;
		}
	}
	
	// Analyze audio for visualization
	function analyzeAudio(mediaStream) {
		try {
			const audioContext = new AudioContext();
			const source = audioContext.createMediaStreamSource(mediaStream);
			const analyser = audioContext.createAnalyser();
			analyser.fftSize = 256;
			
			source.connect(analyser);
			
			const bufferLength = analyser.frequencyBinCount;
			const dataArray = new Uint8Array(bufferLength);
			
			const updateVisualization = () => {
				if (!isRecording) return;
				
				analyser.getByteFrequencyData(dataArray);
				
				// Calculate average volume
				let sum = 0;
				for (let i = 0; i < bufferLength; i++) {
					sum += dataArray[i];
				}
				const average = sum / bufferLength;
				
				// Update visualizer data
				visualizerData.push(average / 255);
				if (visualizerData.length > 100) {
					visualizerData.shift();
				}
				visualizerData = visualizerData; // Trigger reactivity
				
				requestAnimationFrame(updateVisualization);
			};
			
			updateVisualization();
		} catch (error) {
			console.warn('Audio visualization not available:', error);
		}
	}
	
	// Toggle recording state
	async function toggleRecording() {
		if (isRecording) {
			stopRecording();
		} else {
			isLoading = true;
			await startRecording();
		}
	}
</script>

<div class="{className} flex flex-col items-center">
	<!-- Voice Control Button -->
	<button
		type="button"
		class="flex items-center justify-center p-3 rounded-full transition-all
			{isRecording 
				? 'bg-red-500 text-white animate-pulse' 
				: 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-800/50'}
			focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50"
		on:click={toggleRecording}
		disabled={isLoading}
		title={isRecording ? 'Stop recording' : 'Start voice recording'}
	>
		{#if isLoading}
			<!-- Loading spinner -->
			<svg class="animate-spin h-5 w-5 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
				<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
				<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
			</svg>
		{:else}
			<Microphone class="h-5 w-5" />
		{/if}
	</button>
	
	<!-- Status indicator -->
	{#if isRecording}
		<div class="mt-2 flex items-center text-xs text-gray-500 dark:text-gray-400">
			<div class="flex space-x-1 mr-2">
				{#each visualizerData as amplitude, i}
					<div 
						class="w-1 bg-indigo-500 rounded-full transition-all duration-75"
						style="height: {Math.max(4, amplitude * 20)}px;"
					></div>
				{/each}
			</div>
			<span>{formatTime(durationSeconds)}</span>
		</div>
	{/if}
	
	<!-- Instructions -->
	{#if !isRecording && !isListening}
		<div class="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center">
			Click to start recording<br/>
			Say "Hey Tractor" to activate
		</div>
	{/if}
</div>

<style>
	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>