# ARCHIVED — old HTML table stitching logic from MistralOCRService.
# Replaced by Gemini Flash merge step (services/gemini_table_merger.py).
# Kept here for reference only.

# from __future__ import annotations
#
# from typing import Any, Dict, List
#
# import httpx
# from bs4 import BeautifulSoup
#
# import logging
# logger = logging.getLogger(__name__)
#
#
# class MistralOCRService:
#
#     @staticmethod
#     def extract_markdown_text(ocr_response: Dict[str, Any]) -> str:
#         """Aggregate OCR output into a single markdown string for the parser.
#
#         When table_format="html" is used, Mistral returns tables as separate
#         HTML objects.  We stitch those tables into one unified pipe table:
#
#           tbl-0 (front 9) | tbl-1 (back 9)        <- player group A
#           tbl-2 (front 9) | tbl-3 (back 9)        <- player group B (if present)
#
#         The stitched table is converted back to markdown so the downstream
#         parser requires no changes.
#         """
#         pages = ocr_response.get("pages")
#         if not isinstance(pages, list):
#             output_text = ocr_response.get("markdown") or ocr_response.get("text")
#             return output_text if isinstance(output_text, str) else ""
#
#         page_chunks: List[str] = []
#         for page in pages:
#             if not isinstance(page, dict):
#                 continue
#
#             tables: List[Dict[str, Any]] = page.get("tables") or []
#             html_tables = [t["content"] for t in tables if isinstance(t.get("content"), str)]
#
#             if html_tables:
#                 # Disable the naive horizontal stitching so the parser receives
#                 # the raw separate tables sequentially and can attempt a smart alignment.
#                 for html in html_tables:
#                     rows = MistralOCRService._parse_html_rows(html)
#                     page_chunks.append(MistralOCRService._rows_to_markdown(rows))
#                 continue
#
#             # Fallback: no HTML tables - use raw markdown text
#             text = page.get("markdown") or page.get("text")
#             if isinstance(text, str) and text.strip():
#                 page_chunks.append(text.strip())
#
#         return "\n\n".join(page_chunks)
#
#     @staticmethod
#     def _parse_html_rows(html: str) -> List[List[str]]:
#         """Parse an HTML table string into a list of row cell-lists."""
#         soup = BeautifulSoup(html, "html.parser")
#         return [
#             [td.get_text(" ", strip=True) for td in tr.find_all("td")]
#             for tr in soup.find_all("tr")
#         ]
#
#     # Known header-row label words that appear in the left (labeled) half-table
#     # but are absent from the right (preprocessed) half-table.
#     _HEADER_LABELS: frozenset = frozenset({"par", "handicap", "hdcp", "hcp", "yardage", "yards"})
#
#     @staticmethod
#     def _count_leading_header_rows(rows: List[List[str]]) -> int:
#         """Count how many leading rows look like course-info header rows (Par, Handicap, etc.)."""
#         count = 0
#         for row in rows:
#             first = row[0].strip().lower() if row else ""
#             if first in MistralOCRService._HEADER_LABELS:
#                 count += 1
#             else:
#                 break
#         return count
#
#     @staticmethod
#     def _hstitch(left: List[List[str]], right: List[List[str]], *, align_offset: int = 0) -> List[List[str]]:
#         """Stitch two half-tables side by side, row by row.
#
#         The right table's first column is a label spillover (e.g. the
#         P/L/A/Y/E/R column in the back-nine section) and is dropped so
#         hole numbers align correctly across the merged row.
#         If the first cell of the right table looks like a data value (digit)
#         rather than a label, we keep all columns instead.
#
#         align_offset: prepend this many empty rows to `right` before stitching
#         so that header rows in `left` stay aligned with the correct data rows.
#         """
#         # Detect whether the right table has a label first column.
#         # If the majority of non-empty first cells are non-numeric, treat as labels.
#         first_cells = [r[0] for r in right if r and r[0].strip()]
#         label_col = sum(1 for c in first_cells if not c.strip().lstrip("-").replace(".", "").isdigit())
#         skip_first = label_col > len(first_cells) / 2
#
#         # Pad right table with empty rows to align with left header rows.
#         if align_offset > 0:
#             right = [[] for _ in range(align_offset)] + list(right)
#
#         rows: List[List[str]] = []
#         for i in range(max(len(left), len(right))):
#             l = left[i] if i < len(left) else []
#             r = right[i] if i < len(right) else []
#             rows.append(l + (r[1:] if skip_first else r))
#         return rows
#
#     @staticmethod
#     def _rows_to_markdown(rows: List[List[str]]) -> str:
#         """Convert a list-of-rows into a markdown pipe table string."""
#         if not rows:
#             return ""
#         lines = []
#         for row in rows:
#             lines.append("| " + " | ".join(cell.replace("|", "/") for cell in row) + " |")
#         return "\n".join(lines)
#
#     @staticmethod
#     def _stitch_html_tables(html_tables: List[str]) -> str:
#         """Stitch 2 or 4 HTML tables into one markdown pipe table.
#
#         Layout expected from Mistral when table_format="html":
#           2 tables:  tbl-0 (front 9)  tbl-1 (back 9)
#           4 tables:  tbl-0 (front 9)  tbl-1 (back 9)   <- group A
#                      tbl-2 (front 9)  tbl-3 (back 9)   <- group B
#
#         For other counts, tables are joined sequentially as markdown.
#         """
#         n = len(html_tables)
#         if n == 2:
#             left = MistralOCRService._parse_html_rows(html_tables[0])
#             right = MistralOCRService._parse_html_rows(html_tables[1])
#             merged = MistralOCRService._hstitch(left, right)
#             logger.info("HTML stitch: 2-table merge -> %d rows", len(merged))
#             return MistralOCRService._rows_to_markdown(merged)
#
#         if n == 4:
#             tl = MistralOCRService._parse_html_rows(html_tables[0])
#             tr_ = MistralOCRService._parse_html_rows(html_tables[1])
#             bl = MistralOCRService._parse_html_rows(html_tables[2])
#             br = MistralOCRService._parse_html_rows(html_tables[3])
#             top = MistralOCRService._hstitch(tl, tr_)
#             bl_headers = MistralOCRService._count_leading_header_rows(bl)
#             br_headers = MistralOCRService._count_leading_header_rows(br)
#             bot_offset = max(0, bl_headers - br_headers)
#             bot = MistralOCRService._hstitch(bl, br, align_offset=bot_offset)
#             merged = top + bot
#             logger.info(
#                 "HTML stitch: 4-table merge -> %d rows (%d top + %d bot, bot_offset=%d)",
#                 len(merged), len(top), len(bot), bot_offset,
#             )
#             return MistralOCRService._rows_to_markdown(merged)
#
#         # Odd number - convert each table individually and stack
#         parts = []
#         for html in html_tables:
#             rows = MistralOCRService._parse_html_rows(html)
#             parts.append(MistralOCRService._rows_to_markdown(rows))
#         return "\n\n".join(parts)
