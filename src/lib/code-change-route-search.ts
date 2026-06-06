export interface CodeChangeRouteSearchState {
  open: boolean;
  selectedTicketId?: string | undefined;
  selectedSourceId?: string | undefined;
  selectedFilePath?: string | undefined;
  wordWrap: boolean;
  ignoreWhitespace: boolean;
}

export interface CodeChangeRouteSearchPatch {
  open?: boolean;
  selectedTicketId?: string | null | undefined;
  selectedSourceId?: string | null | undefined;
  selectedFilePath?: string | null | undefined;
  wordWrap?: boolean;
  ignoreWhitespace?: boolean;
}

const OPEN_PARAM = "codeChanges";
const TICKET_PARAM = "changeTicket";
const SOURCE_PARAM = "changeSource";
const FILE_PARAM = "changeFile";
const WRAP_PARAM = "diffWrap";
const WHITESPACE_PARAM = "diffWhitespace";

export const codeChangeSearchParamNames = {
  open: OPEN_PARAM,
  selectedTicketId: TICKET_PARAM,
  selectedSourceId: SOURCE_PARAM,
  selectedFilePath: FILE_PARAM,
  wordWrap: WRAP_PARAM,
  ignoreWhitespace: WHITESPACE_PARAM,
} as const;

function readParam(params: URLSearchParams, name: string): string | undefined {
  const value = params.get(name);
  if (!value) {
    return undefined;
  }

  return value;
}

export function parseCodeChangeRouteSearch(
  input: URLSearchParams | string | Record<string, unknown>
): CodeChangeRouteSearchState {
  const params = input instanceof URLSearchParams ? input : new URLSearchParams();

  if (typeof input === "string") {
    return parseCodeChangeRouteSearch(new URLSearchParams(input));
  }

  if (!(input instanceof URLSearchParams)) {
    for (const [key, value] of Object.entries(input)) {
      if (typeof value === "string") {
        params.set(key, value);
      } else if (typeof value === "boolean" || typeof value === "number") {
        params.set(key, String(value));
      }
    }
  }

  return {
    open: params.get(OPEN_PARAM) === "1" || params.get(OPEN_PARAM) === "true",
    selectedTicketId: readParam(params, TICKET_PARAM),
    selectedSourceId: readParam(params, SOURCE_PARAM),
    selectedFilePath: readParam(params, FILE_PARAM),
    wordWrap: params.get(WRAP_PARAM) !== "0",
    ignoreWhitespace: params.get(WHITESPACE_PARAM) === "ignore",
  };
}

function writeOptionalParam(
  params: URLSearchParams,
  name: string,
  value: string | null | undefined
): void {
  if (value) {
    params.set(name, value);
    return;
  }

  params.delete(name);
}

export function applyCodeChangeRouteSearch(
  current: URLSearchParams | string | Record<string, unknown>,
  patch: CodeChangeRouteSearchPatch
): URLSearchParams {
  let params: URLSearchParams;
  if (current instanceof URLSearchParams) {
    params = new URLSearchParams(current);
  } else if (typeof current === "string") {
    params = new URLSearchParams(current);
  } else {
    params = objectToSearchParams(current);
  }

  if (patch.open === false) {
    clearCodeChangeRouteSearch(params);
    return params;
  }

  if (patch.open === true) {
    params.set(OPEN_PARAM, "1");
  }

  writeOptionalParam(params, TICKET_PARAM, patch.selectedTicketId);
  writeOptionalParam(params, SOURCE_PARAM, patch.selectedSourceId);
  writeOptionalParam(params, FILE_PARAM, patch.selectedFilePath);

  if (patch.wordWrap !== undefined) {
    if (patch.wordWrap) {
      params.delete(WRAP_PARAM);
    } else {
      params.set(WRAP_PARAM, "0");
    }
  }

  if (patch.ignoreWhitespace !== undefined) {
    if (patch.ignoreWhitespace) {
      params.set(WHITESPACE_PARAM, "ignore");
    } else {
      params.delete(WHITESPACE_PARAM);
    }
  }

  return params;
}

export function clearCodeChangeRouteSearch(params: URLSearchParams): URLSearchParams {
  params.delete(OPEN_PARAM);
  params.delete(TICKET_PARAM);
  params.delete(SOURCE_PARAM);
  params.delete(FILE_PARAM);
  params.delete(WRAP_PARAM);
  params.delete(WHITESPACE_PARAM);
  return params;
}

export function serializeCodeChangeRouteSearch(state: CodeChangeRouteSearchState): string {
  return applyCodeChangeRouteSearch(new URLSearchParams(), {
    open: state.open,
    selectedTicketId: state.selectedTicketId,
    selectedSourceId: state.selectedSourceId,
    selectedFilePath: state.selectedFilePath,
    wordWrap: state.wordWrap,
    ignoreWhitespace: state.ignoreWhitespace,
  }).toString();
}

function objectToSearchParams(input: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string") {
      params.set(key, value);
    } else if (typeof value === "boolean" || typeof value === "number") {
      params.set(key, String(value));
    }
  }

  return params;
}
