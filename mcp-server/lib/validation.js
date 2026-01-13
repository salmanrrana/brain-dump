/**
 * Validation helpers for Brain Dump MCP server.
 * Simple validation utilities for tool arguments.
 * @module lib/validation
 */

/**
 * Validate that required fields are present and non-empty.
 * @param {object} args - Arguments object to validate
 * @param {string[]} fields - List of required field names
 * @returns {string|null} Error message or null if valid
 */
export function validateRequired(args, fields) {
  const missing = fields.filter(f => !args[f] || (typeof args[f] === "string" && !args[f].trim()));
  if (missing.length > 0) {
    return `Missing required fields: ${missing.join(", ")}`;
  }
  return null;
}

/**
 * Validate that a value is one of the allowed enum values.
 * @param {*} value - Value to validate
 * @param {*[]} allowed - Array of allowed values
 * @param {string} fieldName - Name of the field for error message
 * @returns {string|null} Error message or null if valid
 */
export function validateEnum(value, allowed, fieldName) {
  if (value && !allowed.includes(value)) {
    return `Invalid ${fieldName}: "${value}". Must be one of: ${allowed.join(", ")}`;
  }
  return null;
}
