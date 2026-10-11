// YAML のコメント (# の行や値の後ろ) があるか。エディタで直して保存すると消えるので、先に知らせるのに使う (05)
import { isNode, parseDocument, visit } from "yaml";

export function hasComments(text: string, format: "yaml" | "json"): boolean {
  if (format === "json") return false;
  const doc = parseDocument(text, { schema: "core" });
  if (doc.commentBefore || doc.comment) return true;
  let found = false;
  visit(doc, (_key, node) => {
    if (isNode(node) && (node.commentBefore || node.comment)) {
      found = true;
      return visit.BREAK;
    }
    return undefined;
  });
  return found;
}
