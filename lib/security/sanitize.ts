const instructionPatterns = [
  /\bAI\s+agents?\b/i,
  /\bassistants?\b/i,
  /\bignore\s+(?:all\s+)?(?:previous|prior|above|earlier)\b/i,
  /\bdisregard\s+(?:(?:all|the)\s+)?(?:(?:previous|prior|above|earlier)\s+)?instructions?\b/i,
  /\byou\s+must\b/i,
  /\bsystem\s+prompt\b/i,
  /\bbuy\s+\d+\b/i,
  /\bact\s+as\b/i,
  /\bprompt\s+injection\b/i,
  /\bdeveloper\s+message\b/i,
];

const urlPattern = /\b(?:https?:\/\/|www\.)[^\s<>()]+/gi;
const bareDomainPattern = /\b(?:[a-z0-9-]+\.)+(?:com|net|org|edu|gov|io|co|dev|app|shop|store|pk|uk|us|ca)\b(?:\/[^\s<>()]*)?/gi;
const emailPattern = /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/gi;
const phonePattern = /(?<!\w)\+?(?:\d[\s().-]*){7,}\d(?!\w)/g;

export function sanitizeListingText(value: string, maxLength = 600): string {
  const safeSentences = value
    .replace(/\r\n?/g, "\n")
    .split(/(?<=[.!?])\s+|\n+/)
    .filter((sentence) => !instructionPatterns.some((pattern) => pattern.test(sentence)))
    .join(" ");

  return safeSentences
    .replace(urlPattern, "")
    .replace(emailPattern, "")
    .replace(bareDomainPattern, "")
    .replace(phonePattern, "")
    .replace(/[\t\n\r ]+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim()
    .slice(0, Math.max(0, maxLength))
    .trim();
}
