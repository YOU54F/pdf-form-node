import { readFileSync, writeFileSync } from "fs";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { fillInField, getAcroFields, lockField } from "./utils";

(async () => {
  const pdfDoc = await PDFDocument.load(readFileSync("./test.pdf"));
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  console.log('Filling in a PDF form field by name, where single fields exist with the same name')

  var formValuesSingle = {
    single: "text to apply to a single field",
  };

  Object.entries(formValuesSingle).forEach((entry) => {
    fillInField(pdfDoc, entry[0], entry[1], helveticaFont);
  });
  const acroFieldsSingle = getAcroFields(pdfDoc);
  acroFieldsSingle.forEach((field) => lockField(field));

  const pdfBytesSingle = await pdfDoc.save();

  writeFileSync("filled_single.pdf", pdfBytesSingle);

})();
