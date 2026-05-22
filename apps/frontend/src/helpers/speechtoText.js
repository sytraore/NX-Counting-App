// Sends audio to backend and returns transcript string.
export const speechToText = async (audioBlob, expectedNumber) => {
  const formData = new FormData();
  // The field name 'audio' must match backend upload.single('audio')
  formData.append('audio', audioBlob, 'recording.webm');
  if (expectedNumber) {
    formData.append('expectedNumber', String(expectedNumber));
  }

  const response = await fetch('/transcribe', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Server responded with ${response.status}`);
  }

  const data = await response.json();
  return data.transcript || '';
};