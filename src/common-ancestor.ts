import { parse, sep, normalize as norm } from "node:path";

function* commonArrayMembers(a: string[], b: string[]) {
  const [l, s] = a.length > b.length ? [a, b] : [b, a];
  for (const x of s) {
    if (x === l.shift()) yield x;
    else break;
  }
}

function commonAncestorPath(a: any, b: any) {
  return a === b
    ? a
    : parse(a).root !== parse(b).root
    ? null
    : [...commonArrayMembers(norm(a).split(sep), norm(b).split(sep))].join(sep);
}

export function findCommonAncestor(...paths: string[]) {
  return paths.reduce(commonAncestorPath);
}
