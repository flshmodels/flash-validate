import { fail, record } from './http.mjs';

const types = ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'];
const common = ['type', 'enum'];
const rules = {
  object: ['properties', 'required', 'additionalProperties'],
  array: ['items', 'minItems', 'maxItems'],
  string: ['minLength', 'maxLength'],
  number: ['minimum', 'maximum'],
  integer: ['minimum', 'maximum'],
  boolean: [], null: [],
};
const pointer = (path, name) => `${path}/${String(name).replace(/~/g, '~0').replace(/\//g, '~1')}`;

export function checkSchema(schema) {
  let nodes = 0;
  const invalid = message => fail(422, 'invalid_schema', message);
  function visit(s, depth) {
    if (++nodes > 200 || depth > 8) invalid('Schema exceeds 200 nodes or 8 levels of nesting.');
    if (!record(s) || !types.includes(s.type)) invalid('Each schema must be an object with a supported type.');
    if (Object.keys(s).some(key => ![...common, ...rules[s.type]].includes(key))) invalid(`Unsupported rule for type ${s.type}.`);
    if (Object.hasOwn(s, 'enum')
        && (!Array.isArray(s.enum)
        || !s.enum.length
        || s.enum.length > 100
        || s.enum.some(value => value !== null
        && !['string', 'number', 'boolean'].includes(typeof value)))) invalid('enum must contain 1–100 JSON scalar values.');
    if (s.type === 'object') {
      if (Object.hasOwn(s, 'properties') && !record(s.properties)) invalid('properties must be an object.');
      const properties = s.properties ?? {};
      if (Object.hasOwn(s, 'required')
          && (!Array.isArray(s.required)
          || s.required.some(name => typeof name !== 'string'
          || !Object.hasOwn(properties, name))
          || new Set(s.required).size !== s.required.length)) invalid('required must list distinct declared property names.');
      if (Object.hasOwn(s, 'additionalProperties') && typeof s.additionalProperties !== 'boolean') invalid('additionalProperties must be a boolean.');
      for (const child of Object.values(properties)) visit(child, depth + 1);
    }
    if (s.type === 'array') { if (!Object.hasOwn(s, 'items')) invalid('Array schemas require items.'); visit(s.items, depth + 1); }
    for (const [minimum, maximum, integer] of [['minLength', 'maxLength', true], ['minItems', 'maxItems', true], ['minimum', 'maximum', false]]) {
      for (const key of [minimum, maximum]) if (Object.hasOwn(s, key)
          && (typeof s[key] !== 'number'
          || !Number.isFinite(s[key])
          || (integer
          && (!Number.isSafeInteger(s[key])
          || s[key] < 0)))) invalid(`Invalid ${key}.`);
      if (s[minimum] !== undefined && s[maximum] !== undefined && s[minimum] > s[maximum]) invalid(`${minimum} cannot exceed ${maximum}.`);
    }
  }
  visit(schema, 0);
}

export function validate(schema, data) {
  checkSchema(schema);
  const errors = [];
  const issue = (path, code, message) => { if (errors.length < 100) errors.push({ path, code, message }); };
  function visit(s, value, path) {
    if (errors.length >= 100) return;
    const matches = s.type === 'null' ? value === null
      : s.type === 'object' ? record(value)
      : s.type === 'array' ? Array.isArray(value)
      : s.type === 'integer' ? Number.isSafeInteger(value)
      : s.type === 'number' ? typeof value === 'number'
        && Number.isFinite(value)
      : typeof value === s.type;
    if (!matches) { issue(path, 'type', `Expected ${s.type}.`); return; }
    if (s.enum && !s.enum.some(item => item === value)) issue(path, 'enum', 'Value is not an allowed choice.');
    if (s.type === 'object') {
      const properties = s.properties ?? {};
      for (const name of s.required ?? []) if (!Object.hasOwn(value, name)) issue(pointer(path, name), 'required', 'Required property is missing.');
      for (const name of Object.keys(value)) {
        if (Object.hasOwn(properties, name)) visit(properties[name], value[name], pointer(path, name));
        else if (s.additionalProperties !== true) issue(pointer(path, name), 'additional_property', 'Unexpected property.');
      }
    }
    if (s.type === 'array') {
      if (value.length < (s.minItems ?? 0)) issue(path, 'minItems', `At least ${s.minItems} items are required.`);
      if (s.maxItems !== undefined && value.length > s.maxItems) issue(path, 'maxItems', `At most ${s.maxItems} items are allowed.`);
      for (let i = 0; i < value.length && errors.length < 100; i++) visit(s.items, value[i], pointer(path, i));
    }
    if (s.type === 'string') {
      const length = [...value].length;
      if (length < (s.minLength ?? 0)) issue(path, 'minLength', `At least ${s.minLength} characters are required.`);
      if (s.maxLength !== undefined && length > s.maxLength) issue(path, 'maxLength', `At most ${s.maxLength} characters are allowed.`);
    }
    if (s.type === 'number' || s.type === 'integer') {
      if (s.minimum !== undefined && value < s.minimum) issue(path, 'minimum', `Value must be at least ${s.minimum}.`);
      if (s.maximum !== undefined && value > s.maximum) issue(path, 'maximum', `Value must be at most ${s.maximum}.`);
    }
  }
  visit(schema, data, '');
  return { valid: errors.length === 0, errors, errorLimitReached: errors.length === 100 };
}
