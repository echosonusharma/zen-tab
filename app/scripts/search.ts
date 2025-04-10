import emojiRegex from "emoji-regex";
import browser from "webextension-polyfill";

const stopWords = new Set([
  "a",
  "about",
  "above",
  "after",
  "again",
  "against",
  "all",
  "am",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "be",
  "because",
  "been",
  "before",
  "being",
  "below",
  "between",
  "both",
  "but",
  "by",
  "could",
  "did",
  "do",
  "does",
  "doing",
  "down",
  "during",
  "each",
  "few",
  "for",
  "from",
  "further",
  "had",
  "has",
  "have",
  "having",
  "he",
  "her",
  "here",
  "hers",
  "herself",
  "him",
  "himself",
  "his",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "itself",
  "me",
  "more",
  "most",
  "my",
  "myself",
  "no",
  "nor",
  "not",
  "of",
  "off",
  "on",
  "once",
  "only",
  "or",
  "other",
  "our",
  "ours",
  "ourselves",
  "out",
  "over",
  "own",
  "same",
  "she",
  "should",
  "so",
  "some",
  "such",
  "than",
  "that",
  "the",
  "their",
  "theirs",
  "them",
  "themselves",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "to",
  "too",
  "under",
  "until",
  "up",
  "very",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "whom",
  "why",
  "will",
  "with",
  "you",
  "your",
  "yours",
  "yourself",
  "yourselves",
]);

function removeEmojis(text: string): string {
  const regex = emojiRegex();
  return text.replace(regex, "");
}

// todo: convert accented words into normal words for better search
function cleanText(text: string): Array<string> {
  let cleaned = removeEmojis(text);
  cleaned = cleaned.toLowerCase();

  // split on non-word characters or spaces
  const tokens = cleaned.split(/[^a-zA-Z0-9]+/).filter(Boolean);

  const relevantWords = tokens.filter((word) => {
    return word.length > 1 && !stopWords.has(word);
  });

  return relevantWords;
}

function parseTabData(tabData: browser.Tabs.Tab) {
  if (!tabData.title || !tabData.url) {
    return;
  }

  const byTitle = cleanText(tabData.title);
  const byUrl = new URL(tabData.url).hostname.split(".").slice(0, -1);
  const data = [...new Set(byTitle.concat(byUrl))];

  console.log(data);
}

export { parseTabData };
