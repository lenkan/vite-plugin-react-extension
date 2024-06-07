export function findScripts(doc: string): string[] {
  const regex = /<script\s+src=\"(.*)\">\s*<\/script>/;
  const match = regex.exec(doc);

  if (match) {
    return [match[1]];
  }

  return [];
}
