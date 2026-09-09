export interface MarkdownNode {
  type: string;
  content?: string;
  level?: number;
  href?: string;
  title?: string;
  alt?: string;
  language?: string;
  ordered?: boolean;
  start?: number;
  checked?: boolean;
  isHeader?: boolean;
  align?: string;
  children: MarkdownNode[];
}
export const parse: (text: string) => MarkdownNode;
