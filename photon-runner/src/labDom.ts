/**
 * Tiny DOM builder, ported from CyberRange's frontend/js/ui.js `el()`. Lab
 * modules are plain vanilla functions (no React) that build DOM nodes with
 * this helper and get mounted into a container by LabRunner.
 */
export type ElAttrs = Record<string, string | ((e: Event) => void) | undefined>;
export type ElChild = Node | string | number | null | undefined;

export function el(tag: string, attrs: ElAttrs = {}, ...children: (ElChild | ElChild[])[]): HTMLElement {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined) continue;
    if (k === 'class') {
      node.className = v as string;
    } else if (k === 'html') {
      node.innerHTML = v as string;
    } else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else {
      node.setAttribute(k, v as string);
    }
  }
  for (const c of children.flat()) {
    if (c == null) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}
