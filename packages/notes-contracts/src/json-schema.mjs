export function validate(schema, value) {
  const errors = [];
  check(schema, value, "$", errors);
  return errors;
}

export function parameterDescriptions(schema, found = []) {
  if (!schema || typeof schema !== "object") return found;
  if (typeof schema.description === "string") found.push(schema.description);
  for (const child of Object.values(schema.properties ?? {})) parameterDescriptions(child, found);
  if (schema.items) parameterDescriptions(schema.items, found);
  for (const option of schema.oneOf ?? []) parameterDescriptions(option, found);
  return found;
}

function check(schema, value, path, errors) {
  if (!schema || typeof schema !== "object") return;
  if (Object.prototype.hasOwnProperty.call(schema, "const") && !same(schema.const, value)) {
    errors.push(`${path} must be ${JSON.stringify(schema.const)}`);
    return;
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => same(item, value))) {
    errors.push(`${path} must be one of ${schema.enum.join("|")}`);
    return;
  }
  if (Array.isArray(schema.oneOf)) {
    const matched = schema.oneOf.filter((option) => check(option, value, path, []).length === 0);
    if (matched.length !== 1) errors.push(`${path} must match one schema`);
    return;
  }
  const types = schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.length > 0 && !types.some((type) => matchesType(type, value))) {
    errors.push(`${path} must be ${types.join("|")}`);
    return;
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path} below minimum`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path} above maximum`);
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path} too short`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path} too long`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path} too few items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path} too many items`);
    if (schema.items) {
      value.forEach((item, index) => check(schema.items, item, `${path}[${index}]`, errors));
    }
  }
  if (isObject(value)) {
    const properties = schema.properties ?? {};
    for (const key of schema.required ?? []) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) errors.push(`${path}.${key} is required`);
    }
    for (const [key, child] of Object.entries(value)) {
      if (properties[key]) check(properties[key], child, `${path}.${key}`, errors);
      else if (schema.additionalProperties === false) errors.push(`${path}.${key} is not allowed`);
    }
  }
}

function matchesType(type, value) {
  switch (type) {
    case "null":
      return value === null;
    case "string":
      return typeof value === "string";
    case "boolean":
      return typeof value === "boolean";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "number":
      return typeof value === "number" && !Number.isNaN(value);
    case "array":
      return Array.isArray(value);
    case "object":
      return isObject(value);
    default:
      return false;
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
