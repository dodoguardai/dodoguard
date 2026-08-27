#!/usr/bin/env python3
"""Read first worksheet of .xlsx as JSON array of rows (list of list of strings). No third-party deps."""
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET


def main() -> None:
    if len(sys.argv) < 2:
        print("usage: read_xlsx_sheet1_json.py <file.xlsx>", file=sys.stderr)
        sys.exit(2)
    path = sys.argv[1]
    ns = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

    with zipfile.ZipFile(path) as z:
        shared: dict[int, str] = {}
        try:
            sroot = ET.fromstring(z.read("xl/sharedStrings.xml"))
            for i, si in enumerate(sroot.findall(f".//{ns}si")):
                shared[i] = "".join(si.itertext())
        except KeyError:
            pass

        def col_letter_to_idx(col: str) -> int:
            n = 0
            for c in col:
                n = n * 26 + (ord(c.upper()) - ord("A") + 1)
            return n - 1

        def parse_cell_ref(r: str) -> tuple[int, int]:
            m = re.match(r"^([A-Z]+)(\d+)$", r)
            if not m:
                return 0, 0
            return int(m.group(2)) - 1, col_letter_to_idx(m.group(1))

        sheet = z.read("xl/worksheets/sheet1.xml")
        root = ET.fromstring(sheet)
        max_col = 0
        cells: dict[tuple[int, int], str] = {}
        for row in root.findall(f".//{ns}row"):
            for c in row.findall(f"{ns}c"):
                ref = c.get("r")
                if not ref:
                    continue
                ri, ci = parse_cell_ref(ref)
                v_el = c.find(f"{ns}v")
                val = v_el.text if v_el is not None and v_el.text else ""
                if c.get("t") == "s" and str(val).isdigit():
                    val = shared.get(int(val), val)
                cells[(ri, ci)] = val
                max_col = max(max_col, ci)

        if not cells:
            print(json.dumps([], ensure_ascii=False))
            return

        max_row = max(r for r, _ in cells)
        data_rows: list[list[str]] = []
        for ri in range(max_row + 1):
            row = [cells.get((ri, ci), "") for ci in range(max_col + 1)]
            if any(str(x).strip() for x in row):
                data_rows.append(row)

    print(json.dumps(data_rows, ensure_ascii=False))


if __name__ == "__main__":
    main()
