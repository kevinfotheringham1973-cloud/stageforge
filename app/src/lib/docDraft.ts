// Shared generic .docx block renderer, extracted from pciDraft.ts (27
// Aug 2026) when constructionPhasePlanDraft.ts became the second
// document to need it — nothing in the block model or the renderer was
// ever PCI-specific, only its name. pciDraft.ts re-exports these under
// their original PciBlock/renderPciDocx names so its own route needs
// no changes; new callers should import DraftBlock/renderDraftDocx
// directly.
import { Document, Packer, Paragraph, HeadingLevel, Table, TableRow, TableCell, WidthType, TextRun } from "docx";

export type DraftBlock =
  | { type: "heading1"; text: string }
  | { type: "heading2"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "placeholder"; text: string }
  | { type: "table"; header?: string[]; rows: string[][] };

export async function renderDraftDocx(blocks: DraftBlock[]): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];

  for (const block of blocks) {
    if (block.type === "heading1") {
      children.push(new Paragraph({ text: block.text, heading: HeadingLevel.HEADING_1 }));
    } else if (block.type === "heading2") {
      children.push(new Paragraph({ text: block.text, heading: HeadingLevel.HEADING_2 }));
    } else if (block.type === "paragraph") {
      children.push(new Paragraph({ text: block.text, spacing: { after: 200 } }));
    } else if (block.type === "placeholder") {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: block.text, italics: true, color: "B45309" })],
          spacing: { after: 200 },
        })
      );
    } else if (block.type === "table") {
      const headerRow = block.header
        ? new TableRow({
            children: block.header.map(
              (h) =>
                new TableCell({
                  children: [new Paragraph({ text: h })],
                  width: { size: 100 / block.header!.length, type: WidthType.PERCENTAGE },
                })
            ),
          })
        : null;
      const dataRows = block.rows.map(
        (row) =>
          new TableRow({
            children: row.map(
              (cell) =>
                new TableCell({
                  children: [new Paragraph({ text: cell })],
                })
            ),
          })
      );
      children.push(
        new Table({
          rows: headerRow ? [headerRow, ...dataRows] : dataRows,
          width: { size: 100, type: WidthType.PERCENTAGE },
        })
      );
    }
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}
