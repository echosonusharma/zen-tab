import { Readability } from "@mozilla/readability";

async function main() {
  const clonedDoc = document.cloneNode(true) as Document;
  const reader = new Readability(clonedDoc);
  const article = reader.parse();

  console.log(article);
}

(async () => {
  await main();
})();
