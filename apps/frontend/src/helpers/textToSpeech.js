let currentAudio = null;

// Function to convert text to speech using the backend
// this will handle timeouts, errors, response processing and setting the audio URL
export const textToSpeech = async (utterance, onSpeechEnd) => {
    try {
      // Create an AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
  
      // Make the POST request to backend's /speak endpoint
      const response = await fetch('/speak', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text:utterance }),
        signal: controller.signal,
      });
  
      clearTimeout(timeoutId);
  
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }
  
      // Get the audio blob from the response
      // what is blob? A Blob object represents a file-like object of immutable, raw data.
      // In this case, the audio data returned from the backend as a binary file.
      // We expect the backend to return audio data in WAV format,
      // blob will be in WAV format as set by the backend
      const audioBlob = await response.blob();
      
      // Create a URL for the audio blob that can be used in an audio element
      const audioUrl = URL.createObjectURL(audioBlob);

      // Stop any currently playing audio
      if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
      }

      const audio = new Audio(audioUrl);
      currentAudio = audio;
      
      // Set up event listeners
        audio.addEventListener('error', (e) => {
            console.error('Audio element error:', e);
            currentAudio = null;
            // Clean up
            if (audioUrl) {
                URL.revokeObjectURL(audioUrl);
            }
        });

        audio.addEventListener('ended', () => {
            currentAudio = null;
            if (typeof onSpeechEnd === 'function') {
                onSpeechEnd();
            }
            // Clean up
            if (audioUrl) {
                URL.revokeObjectURL(audioUrl);
            }
        });

      try {
        await audio.play();
        console.log('Playback started successfully');
      } catch (playError) {
        console.error('Playback failed.', playError);
        // Clean up on play error
        if (audioUrl) {
            URL.revokeObjectURL(audioUrl);
        }
      }

    } catch (err) {
        // Clean up
        if (audioUrl) {
            URL.revokeObjectURL(audioUrl);
        }
        if (err.name === 'AbortError') {
            console.error('Request timed out after 30 seconds');
        } else {
            console.error('Error converting text to speech:', err);
        }
    }
};