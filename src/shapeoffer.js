// SHAPE JOBS (itemShape), docs/product/ITEM33-BUILD.md "Addendum 2026-11-18: shape jobs", clause 1 "Offer": what the row-edit turn is OFFERED for a job line whose answer is a list of items with named fields.
//   - `shapeSuggestProp`  the row-edit reply's optional `itemShape` property: one suggestion per job line (an enum of the lines a shape can be offered for), its fields (kind an enum of the menu), the extra fields, the input labels
//                         that give one item each (an enum of the job's REAL labels) and the typed yes/no "the rules could also be checked as separate facts";
//   - `shapeOfferRules`   the plain words of what the build enforces (src/shapebuild.js), the menu (src/shapemenu.js, the one place it is named) and the way a list field is written.
// Code builds or refuses every field (src/shapebuild.js): the AI only SUGGESTS; a bound it invents is dropped there. The offer's words are a prompt register (src/promptregisters.js).
// Modelled on src/sheetoffer.js (`sheetSuggestProp`, `sheetOfferRules`) and on the proven POC prompt (docs/product/ITEM33-BUILD.md "POC results and code rules", rounds 2-3).
import { SHAPE_KINDS, NAME_MAX_CHARS } from './shapemenu.js';

/** the menu as the drafter reads it, one line per kind of src/shapemenu.js (the one place it is named): `  boolean: bounds equals` @returns {string[]} */
export function shapeMenuLines() {
  return Object.entries(SHAPE_KINDS).map(([k, b]) => `  ${k}: bounds ${b.length ? b.join(', ') : '(none)'}`);
}

/** at most this many fields in one suggestion (bareguard allows 50 per `fields` object; a person's rule list is far shorter) */
export const MAX_SHAPE_FIELDS = 20;

/**
 * One suggested field: name, kind (an enum of the menu), required, bounds, and the number of the `~` rule it comes from (null for an extra field).
 * @returns {Record<string, any>}
 */
function fieldProp() {
  return {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1, maxLength: NAME_MAX_CHARS, description: 'the field\'s name; none of . : [ ]' },
      kind: { enum: Object.keys(SHAPE_KINDS), description: 'the kind of value (the menu in the system prompt)' },
      required: { type: 'boolean', description: 'true when every item must carry the field' },
      bounds: { type: 'object', description: 'only the bounds the person\'s words say, and only bounds the kind accepts; {} when they say none' },
      fromRule: { type: ['integer', 'null'], minimum: 1, description: 'the number of the line\'s ~ rule this field comes from (1 is its first); null for an extra field' },
    },
    required: ['name', 'kind', 'required', 'bounds', 'fromRule'],
    additionalProperties: false,
  };
}

/**
 * The row-edit reply's `itemShape` property.
 * @param {number[]} lineNums the job lines a shape can be offered for (a line with a ~ rule that is no sheet line) @param {string[]} labels the real labels of the job's inputs
 * @returns {Record<string, any>|null} null when there is no line to offer it for
 */
export function shapeSuggestProp(lineNums, labels) {
  if (lineNums.length === 0) return null;
  return {
    type: 'array',
    maxItems: lineNums.length,
    description: 'the shape of the answer of a job line whose answer is a list of items with named fields; code builds or refuses each field, you never write a check into the plan',
    items: {
      type: 'object',
      properties: {
        line: { type: 'integer', enum: lineNums, description: 'the number of the job line this shape is for' },
        fields: { type: 'array', maxItems: MAX_SHAPE_FIELDS, items: fieldProp(), description: 'one field for each ~ rule of the line that names something an item has; fromRule is that rule\'s number' },
        extraFields: { type: 'array', maxItems: MAX_SHAPE_FIELDS, items: fieldProp(), description: 'any other field you think would help (none is fine); fromRule is null' },
        itemCountFrom: { type: 'array', items: labels.length ? { enum: labels } : { type: 'string' }, description: 'the labels of the inputs that give exactly one item each ("one blurb per resume"); [] when the answer is not one item per input' },
        alsoFitsRules: { type: 'boolean', description: 'true only when the person\'s rules could just as well be checked as separate facts instead of as fields of a list of items' },
      },
      required: ['line', 'fields', 'extraFields', 'itemCountFrom', 'alsoFitsRules'],
      additionalProperties: false,
    },
  };
}

/**
 * The rules the build enforces on a suggestion, as lines for the drafter (every one of them is a refusal or a drop at $0 in src/shapebuild.js), then the menu.
 * @param {number[]} lineNums the job's lines a shape can be offered for @param {string[]} labels the inputs' labels
 * @returns {string[]}
 */
export function shapeOfferRules(lineNums, labels) {
  return [
    `- A job line whose answer is a LIST OF ITEMS with named fields (for example one item per flight, per resume or per research topic) gets its shape from "itemShape" in your reply: one suggestion with "line" = the line's number, one of ${lineNums.join(', ')}. A line whose answer is not such a list gets none.`,
    '- "fields": one field for each ~ rule of the line that names something an item has; "fromRule" is that rule\'s number on the line (1 is its first rule). "extraFields": any other field that would help, none is fine; its "fromRule" is null and code shows it to the person as a suggestion.',
    '- "kind" is one of the kinds below, and "bounds" holds only the bounds that kind accepts. Put in "bounds" only what the person wrote in that field\'s own rule; code drops every bound the person did not write. A yes/no rule ("the flight is nonstop") is kind boolean with "equals": true or false.',
    `- "itemCountFrom": the labels of the inputs (${labels.join(', ') || 'none'}) that give exactly one item each, only when the person wrote it ("one blurb per resume"); otherwise [].`,
    '- "alsoFitsRules": true only if the person\'s rules could just as well be checked as separate facts instead of as fields of a list of items.',
    `- A field name is at most ${NAME_MAX_CHARS} characters and holds none of . : [ ] ; a list field writes its entries as "of": {"kind": "text", ...bounds}.`,
    'The field kinds (and the bounds each kind accepts):',
    ...shapeMenuLines(),
  ];
}
