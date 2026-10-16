import { useState, useCallback, useEffect } from 'react';

export function useSpeechOutput() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported(typeof window !== 'undefined' && 'speechSynthesis' in window);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!isSupported || !isEnabled || !text) return;

      window.speechSynthesis.cancel(); // Stop any existing speech

      // Clean markdown asterisks and symbols before speaking
      const cleanText = text.replace(/[*_#`]/g, '').trim();
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'en-US';
      utterance.rate = 1.0;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      window.speechSynthesis.speak(utterance);
    },
    [isSupported, isEnabled]
  );

  const stop = useCallback(() => {
    if (isSupported) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  }, [isSupported]);

  const toggleEnabled = useCallback(() => {
    setIsEnabled((prev) => {
      if (prev && isSpeaking) {
        stop();
      }
      return !prev;
    });
  }, [isSpeaking, stop]);

  return {
    isEnabled,
    isSpeaking,
    isSupported,
    speak,
    stop,
    toggleEnabled,
    setIsEnabled,
  };
}
