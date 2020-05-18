import {
  asPDFName,
  degrees,
  drawText,
  PDFArray,
  PDFBool,
  PDFContentStream,
  PDFDict,
  PDFDocument,
  PDFFont,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFString,
  PDFOperator,
  PDFOperatorNames as Ops,
  popGraphicsState,
  pushGraphicsState,
  rgb,
} from "pdf-lib";


export const fillInField = (
  pdfDoc: PDFDocument,
  fieldName: string,
  text: string,
  font: PDFFont
) => {
    const field = findAcroFieldByName(pdfDoc, fieldName);
    if (field) fillAcroTextField(field, text, font);
};

export const lockField = (acroField: PDFDict) => {

    const fieldType = acroField.lookup(PDFName.of("FT"));
    if (fieldType === PDFName.of("Tx")) {
      acroField.set(PDFName.of("Ff"), PDFNumber.of(1 << 0 /* Read Only */));
    }
};

export const getAcroForm = (pdfDoc: PDFDocument) =>
  pdfDoc.catalog.lookupMaybe(PDFName.of("AcroForm"), PDFDict);

export const findAcroFieldByName = (pdfDoc: PDFDocument, name: string) => {
    const acroFields = getAcroFields(pdfDoc);

    return acroFields.find((acroField) => {
      const fieldName = acroField.get(PDFName.of("T"));

      return (
        (fieldName instanceof PDFString || fieldName instanceof PDFHexString) &&
        fieldName.decodeText() === name
      );
    });
};

export const fillAcroTextField = (
  acroField: PDFDict,
  text: string,
  font: PDFFont
) => {
    const rect = acroField.lookup(PDFName.of("Rect"), PDFArray);
    const width =
      rect.lookup(2, PDFNumber).value() - rect.lookup(0, PDFNumber).value();
    const height =
      rect.lookup(3, PDFNumber).value() - rect.lookup(1, PDFNumber).value();

    const MK = acroField.lookupMaybe(PDFName.of("MK"), PDFDict);
    const R = MK && MK.lookupMaybe(PDFName.of("R"), PDFNumber);

    const N = singleLineAppearanceStream(font, text, width, height);

    acroField.set(PDFName.of("AP"), acroField.context.obj({ N }));
    acroField.set(PDFName.of("Ff"), PDFNumber.of(1 /* Read Only */));
    acroField.set(PDFName.of("V"), PDFHexString.fromText(text));
};
export const getAcroFields = (pdfDoc: PDFDocument): PDFDict[] => {
    const acroForm = getAcroForm(pdfDoc);
    // loggio.info({},"getAcroFields - getAcroForm")
    // https://github.com/Hopding/pdf-lib/issues/425#issuecomment-620615779
    // acroForm.set(PDFName.of('NeedAppearances'), PDFBool.True)

    if (!acroForm) return [];

    const rootFields = getRootAcroFields(pdfDoc);

    rootFields.forEach((rootField) => {
      console.log('rootField');
      console.log(String(rootField));
      console.log();
    });
  
    console.log('Total fields:', rootFields.length);

    if (!rootFields) return [];

    const fields: PDFDict[] = [];
    for (let idx = 0, len = rootFields.length; idx < len; idx++) {
      fields.push(...recurseAcroFieldKids(rootFields[idx]));
    }

    fields.forEach((field) => {
      console.log('childField');
      console.log(String(field));
      console.log();
    });
  
    console.log('Total childFields:', fields.length);
  
    return fields;
};

const getRootAcroFields = (pdfDoc: PDFDocument) => {
  if (!pdfDoc.catalog.get(PDFName.of('AcroForm'))) return [];
  const acroForm = pdfDoc.context.lookup(
    pdfDoc.catalog.get(PDFName.of('AcroForm')),
    PDFDict,
  );

  if (!acroForm.get(PDFName.of('Fields'))) return [];
  const acroFieldRefs = acroForm.context.lookup(
    acroForm.get(PDFName.of('Fields')),
    PDFArray,
  );

  const acroFields = new Array<PDFDict>(acroFieldRefs.size());
  for (let idx = 0, len = acroFieldRefs.size(); idx < len; idx++) {
    acroFields[idx] = pdfDoc.context.lookup(acroFieldRefs.get(idx), PDFDict);
  }

  return acroFields;
};

const recurseAcroFieldKids = (field: PDFDict) => {
  const kids = field.lookupMaybe(PDFName.of('Kids'), PDFArray);
  if (!kids) return [field];

  const acroFields = new Array<PDFDict>(kids.size());
  for (let idx = 0, len = kids.size(); idx < len; idx++) {
    acroFields[idx] = field.context.lookup(kids.get(idx), PDFDict);
  }

  const flatKids: PDFDict[] = [];
  for (let idx = 0, len = acroFields.length; idx < len; idx++) {
    flatKids.push(...recurseAcroFieldKids(acroFields[idx]));
  }

  return flatKids;
};

const beginMarkedContent = (tag: string) =>
  PDFOperator.of(Ops.BeginMarkedContent, [asPDFName(tag)]);

const endMarkedContent = () => PDFOperator.of(Ops.EndMarkedContent);

const singleLineAppearanceStream = (
  font: PDFFont,
  text: string,
  width: number,
  height: number
) => {

    // const size = font.sizeAtHeight(height - 5);
    const size = font.sizeAtHeight(15); // set it to 15 temp for example
    const encodedText = font.encodeText(text);
    const x = 0;
    const y = height - size;

    return textFieldAppearanceStream(
      font,
      size,
      encodedText,
      x,
      y,
      width,
      height
    );
};

const textFieldAppearanceStream = (
  font: PDFFont,
  size: number,
  encodedText: PDFHexString,
  x: number,
  y: number,
  width: number,
  height: number
) => {
    const dict = font.doc.context.obj({
      Type: "XObject",
      Subtype: "Form",
      FormType: 1,
      BBox: [0, 0, width, height],
      Resources: { Font: { F0: font.ref } },
    });

    const operators = [
      beginMarkedContent("Tx"),
      pushGraphicsState(),
      ...drawText(encodedText, {
        color: rgb(0, 0, 0),
        font: "F0",
        size,
        rotate: degrees(0),
        xSkew: degrees(0),
        ySkew: degrees(0),
        x,
        y,
      }),
      popGraphicsState(),
      endMarkedContent(),
    ];

    const stream = PDFContentStream.of(dict, operators);

    return font.doc.context.register(stream);
};