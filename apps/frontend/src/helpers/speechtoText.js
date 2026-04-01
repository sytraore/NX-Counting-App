// Function to send the audio data to the backend
export const speechToText = async (audioBlob, setTranscript, setError) => {
    //console.log('[speechToText] Sending audio to /transcribe. Size:', audioBlob?.size, 'type:', audioBlob?.type);
    // Create a FormData object to send the file
    const formData = new FormData();
    // The field name 'audio' must match the backend's upload.single('audio')
    formData.append('audio', audioBlob, 'recording.webm');
  
    try {
      // Make the POST request to backend's /transcribe endpoint
      const response = await fetch('/transcribe', {
        method: 'POST',
        body: formData,
      });
      //console.log('[speechToText] /transcribe response status:', response.status);
  
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }
  
      const data = await response.json();
      //console.log('[speechToText] /transcribe response data:', data);
      setTranscript(data.transcript);
  
    } catch (err) {
      //console.error('[speechToText] Error sending audio to server:', err);
      setError("Failed to transcribe audio. Please try again.");
    }
}; 