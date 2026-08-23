export type BrowserVoiceOption = {
  name: string;
  lang: string;
  voiceURI: string;
};

export const ELEGANT_VOICE_HINTS = [
  "aria",
  "ava",
  "allison",
  "hazel",
  "jenny",
  "karen",
  "moira",
  "samantha",
  "serena",
  "susan",
  "tessa",
  "victoria",
  "zira",
];

export function choosePreferredVoice<T extends BrowserVoiceOption>(voices: T[]) {
  const englishVoices = voices.filter(voice => voice.lang.toLowerCase().startsWith("en"));
  const elegantEnglishVoice = englishVoices.find(voice =>
    ELEGANT_VOICE_HINTS.some(hint => voice.name.toLowerCase().includes(hint)),
  );
  return elegantEnglishVoice || englishVoices[0] || voices[0];
}
