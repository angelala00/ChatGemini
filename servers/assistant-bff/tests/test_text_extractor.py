from __future__ import annotations

import os
import tempfile
import unittest

from openpyxl import Workbook

from app.utils.text_extractor import extract_text


class TextExtractorTests(unittest.TestCase):
    def test_extract_xlsx_from_path_without_extension(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workbook_path = os.path.join(temp_dir, "source.xlsx")
            workbook = Workbook()
            sheet = workbook.active
            sheet.title = "Summary"
            sheet["A1"] = "Name"
            sheet["B1"] = "Value"
            sheet["A2"] = "Demo"
            sheet["B2"] = 42
            workbook.save(workbook_path)
            workbook.close()

            suffixless_path = os.path.join(temp_dir, "uploaded-file")
            with open(workbook_path, "rb") as source, open(suffixless_path, "wb") as target:
                target.write(source.read())

            extracted = extract_text(suffixless_path, ".xlsx")

            self.assertIn("[Sheet: Summary]", extracted)
            self.assertIn("Name Value", extracted)
            self.assertIn("Demo 42", extracted)


if __name__ == "__main__":
    unittest.main()
