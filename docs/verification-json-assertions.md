# API JSON assertions

Use a separate `path` and a typed `expected` value in API demo steps. The runner
compares JSON values without converting numbers, booleans, arrays, objects, or
null to strings. Object property order does not affect equality.

```json
{
  "kind": "api",
  "request": {
    "method": "GET",
    "path": "/api/purchasing-power?amount=1000&annualRate=-20&years=1"
  },
  "assert": [
    { "type": "status", "expected": 200 },
    { "type": "jsonPath", "path": "$.futureCost", "expected": 800 },
    { "type": "jsonPath", "path": "annual.1.purchasingPower", "expected": 1250 },
    {
      "type": "jsonPath",
      "path": "inputs",
      "expected": { "amount": 1000, "annualRate": -20, "years": 1 }
    }
  ]
}
```

Paths use dot-separated keys and numeric array indexes. An optional `$.` prefix
is supported; `$` selects the entire response. This is a small path reader, not
a full JSONPath expression engine. Missing values fail assertions, including
when the expected value is null. Numbers compare exactly; use project tests
for approximate floating-point comparisons.

Existing demos may keep the previously documented object form:
`{ "type": "jsonPath", "expected": { "path": "$.enabled", "value": true } }`.
The older string form, such as `"expected": "status=ok"`, still compares a string
value. Use the explicit path form for typed data. Invalid or missing paths are
rejected during demo generation instead of becoming opaque verification failures.
