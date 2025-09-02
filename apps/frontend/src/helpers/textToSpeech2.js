// Function to convert text to speech using the backend
// this will handle timeouts, errors, response processing and setting the audio URL
export const textToSpeech2 = async (utterance, setAudioUrl, setError) => {
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
      setAudioUrl(audioUrl);
  
    } catch (err) {
      if (err.name === 'AbortError') {
        console.error('Request timed out after 30 seconds');
        setError("Request timed out. The TTS service might be slow. Please try again.");
      } else {
        console.error('Error converting text to speech:', err);
        setError("Failed to convert text to speech. Please try again.");
      }
    }
};