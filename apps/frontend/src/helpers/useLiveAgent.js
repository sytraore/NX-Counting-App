import { useCallback, useEffect, useRef, useState } from 'react';
import {
  closePlayback,
  pcm16ToBase64,
  playPcm24kBase64,
  resetPlaybackSchedule,
  startMicCapture,
  stopAgentPlayback,
} from './liveAudio';
import { unlockAudioOutput } from './playCorrectionSpeech';

function liveWebSocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/live`;
}

export function useLiveAgent({
  targetCount,
  soundEnabled,
  onCookieCounted,
  onCountingComplete,
}) {
  const wsRef = useRef(null);
  const micRef = useRef(null);
  const hasErrorRef = useRef(false);
  const handlersRef = useRef({ onCookieCounted, onCountingComplete });

  const [status, setStatus] = useState('disconnected');
  const [error, setError] = useState(null);
  const [agentTranscript, setAgentTranscript] = useState('');

  useEffect(() => {
    handlersRef.current = { onCookieCounted, onCountingComplete };
  }, [onCookieCounted, onCountingComplete]);

  const disconnect = useCallback(() => {
    micRef.current?.stop();
    micRef.current = null;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    closePlayback();
    setStatus('disconnected');
  }, []);

  const connect = useCallback(async () => {
    if (!soundEnabled) {
      setError('Turn on sound in settings to use the voice agent.');
      setStatus('error');
      return;
    }

    hasErrorRef.current = false;
    setError(null);
    setAgentTranscript('');
    resetPlaybackSchedule();
    disconnect();
    setStatus('connecting');

    try {
      await unlockAudioOutput();
      const ws = new WebSocket(liveWebSocketUrl());
      wsRef.current = ws;

      const startMic = async () => {
        if (micRef.current) return;
        try {
          micRef.current = await startMicCapture((pcm16) => {
            if (ws.readyState !== WebSocket.OPEN) return;
            ws.send(
              JSON.stringify({
                type: 'audio',
                data: pcm16ToBase64(pcm16),
              })
            );
          });
        } catch (micErr) {
          hasErrorRef.current = true;
          setError(
            micErr?.message ||
              'Microphone access failed. Please allow mic access and try again.'
          );
          setStatus('error');
          ws.close();
        }
      };

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'start',
            targetCount,
            expectedNumber: 1,
          })
        );
      };

      ws.onmessage = (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }

        if (msg.type === 'status') {
          if (msg.status === 'connected') {
            setStatus('connected');
            setError(null);
            startMic();
          } else if (msg.status === 'disconnected') {
            setStatus('disconnected');
          } else if (msg.status === 'connecting') {
            setStatus('connecting');
          }
          return;
        }

        if (msg.type === 'error') {
          hasErrorRef.current = true;
          setError(msg.message || 'Voice agent error');
          setStatus('error');
          return;
        }

        if (msg.type === 'audioFlush') {
          stopAgentPlayback();
          return;
        }

        if (msg.type === 'audio' && msg.data) {
          playPcm24kBase64(msg.data);
          return;
        }

        if (msg.type === 'transcript' && msg.role === 'agent' && msg.text) {
          setAgentTranscript(msg.text);
          return;
        }

        if (msg.type === 'ui') {
          if (msg.action === 'highlightCookie' && msg.number) {
            handlersRef.current.onCookieCounted?.(msg.number);
          }
          if (msg.action === 'countingComplete') {
            handlersRef.current.onCountingComplete?.();
          }
        }
      };

      ws.onerror = () => {
        hasErrorRef.current = true;
        setError('Could not connect to the voice agent.');
        setStatus('error');
      };

      ws.onclose = () => {
        micRef.current?.stop();
        micRef.current = null;
        if (!hasErrorRef.current) {
          setStatus('disconnected');
        }
      };
    } catch (err) {
      hasErrorRef.current = true;
      setError(err?.message || 'Failed to connect to voice agent');
      setStatus('error');
    }
  }, [disconnect, soundEnabled, targetCount]);

  useEffect(() => () => disconnect(), [disconnect]);

  return {
    connect,
    disconnect,
    status,
    error,
    agentTranscript,
    isConnected: status === 'connected',
    isConnecting: status === 'connecting',
  };
}
