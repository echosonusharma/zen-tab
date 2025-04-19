import emojiRegex from "emoji-regex";
import browser from "webextension-polyfill";
import { TabInfo } from "./types";
import { ld } from "./lev";
import { normalizeString } from "./utils";

let tabsWithKeywords: TabInfo[];

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

const wordsToIgnore = new Set(["www"]);

function removeEmojis(text: string): string {
  const regex = emojiRegex();
  return text.replace(regex, "");
}

function cleanText(text: string): Array<string> {
  let cleaned = removeEmojis(text);
  cleaned = normalizeString(text);
  cleaned = cleaned.toLowerCase();

  // split on non-word characters or spaces
  const tokens = cleaned.split(/[^a-zA-Z0-9]+/).filter(Boolean);

  const relevantWords = tokens.filter((word) => {
    return word.length > 1 && !stopWords.has(word);
  });

  return relevantWords;
}

function parseTabData(tabData: browser.Tabs.Tab): string[] {
  if (!tabData.title || !tabData.url) {
    return [];
  }

  const byTitle = cleanText(tabData.title);
  const byUrl = new URL(tabData.url).hostname
    .split(".")
    .slice(0, -1)
    .filter((word) => !stopWords.has(word) && !wordsToIgnore.has(word));
  const data = [...new Set(byTitle.concat(byUrl))];

  return data;
}

function generateKeywordsForTabs(tabs: TabInfo[]): TabInfo[] {
  const tabsClone = structuredClone(tabs);

  tabsClone.forEach((tab) => {
    tab.keywords = parseTabData(tab);
  });

  tabsWithKeywords = tabsClone;
  return tabsClone;
}

function evaluateSearch(searchKeyword: string): TabInfo[] {
  const sk = searchKeyword.toLowerCase();

  for (let idx = 0; idx < tabsWithKeywords.length; idx++) {
    const item = tabsWithKeywords[idx];
    const keywords = item.keywords || ([] as string[]);
    item.ld = Math.min(...keywords.map((w) => ld(sk, w)));
    item.fts = Math.max(...keywords.map((w) => (w.toLowerCase().includes(sk) ? 1 : 0)));
  }

  tabsWithKeywords.sort((a, z) => {
    const { ld: ldA = Infinity, fts: ftsA = 0 } = a;
    const { ld: ldB = Infinity, fts: ftsB = 0 } = z;

    if (ftsA !== ftsB) {
      return ftsB - ftsA;
    }

    if (ftsA === 0 && ftsB === 0) {
      return ldA - ldB;
    }

    return 0;
  });

  return tabsWithKeywords;
}

export { generateKeywordsForTabs, evaluateSearch };
